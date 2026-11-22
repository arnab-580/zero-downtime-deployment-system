terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# Automatically find the latest official Ubuntu 24.04 LTS AMI in your region
data "aws_ami" "ubuntu_2404" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# Automatically find Availability Zones in ap-south-1 that support m7i-flex.large
data "aws_ec2_instance_type_offerings" "supported_azs" {
  location_type = "availability-zone"

  filter {
    name   = "instance-type"
    values = [var.instance_type]
  }
}

# --- 1. Custom AWS VPC Networking ($0 extra cost) ---
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${var.project_name}-vpc" }
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.project_name}-igw" }
}

resource "aws_subnet" "public" {
  availability_zone = sort(data.aws_ec2_instance_type_offerings.supported_azs.locations)[0]
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  map_public_ip_on_launch = true

  tags = { Name = "${var.project_name}-public-subnet" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }

  tags = { Name = "${var.project_name}-public-rt" }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

# --- 2. Least-Privilege Security Group ---
resource "aws_security_group" "k3s_sg" {
  name        = "${var.project_name}-k3s-sg"
  description = "Only 80/443 public; SSH and K8s API strictly restricted to admin IP"
  vpc_id      = aws_vpc.main.id

  # Public HTTP (needed for ACME HTTP-01 TLS challenge + redirect to HTTPS)
  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Public HTTPS (Envoy Gateway TLS termination)
  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Admin SSH (ONLY your laptop IP!)
  ingress {
    description = "SSH Admin"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.my_ip_cidr]
  }

  # Kubernetes API Server (ONLY your laptop IP for remote kubectl/helm!)
  ingress {
    description = "Kubernetes API"
    from_port   = 6443
    to_port     = 6443
    protocol    = "tcp"
    cidr_blocks = [var.my_ip_cidr]
  }

  # Allow future multi-node k3s workers inside this SG to communicate privately (Flannel/kubelet/API)
  ingress {
    description = "Internal k3s cluster node-to-node traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    self        = true
}

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-k3s-sg" }
}

# --- 3. SSH Key & Elastic IP (Allocated BEFORE EC2 so k3s gets valid TLS-SAN!) ---
resource "aws_key_pair" "admin" {
  key_name   = "${var.project_name}-admin-key"
  public_key = file(var.ssh_public_key_path)
}

resource "aws_eip" "k3s_eip" {
  domain = "vpc"
  tags   = { Name = "${var.project_name}-eip" }
}

# --- 4. Hardened EC2 Node running Production k3s ---
resource "aws_instance" "k3s_node" {
  ami                         = data.aws_ami.ubuntu_2404.id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.k3s_sg.id]
  key_name                    = aws_key_pair.admin.key_name
  associate_public_ip_address = true

  # Enforce IMDSv2 (prevents SSRF credential theft)
  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  root_block_device {
    volume_size = 25
    volume_type = "gp3"
    encrypted   = true
  }

  user_data = <<-EOF
    #!/bin/bash
    set -euo pipefail

    # Install lightweight production Kubernetes (k3s)
    # --disable traefik: frees ports 80/443 for Envoy Gateway
    # --node-ip & --advertise-address: bind internal cluster API to EC2 private VPC IP
    # --tls-san: embeds Elastic IP in K8s API cert so remote kubectl works with TLS
    PRIVATE_IP=$(hostname -I | awk '{print $1}')
    curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server \
      --disable traefik \
      --node-ip $${PRIVATE_IP} \
      --advertise-address $${PRIVATE_IP} \
      --tls-san ${aws_eip.k3s_eip.public_ip}" sh -

    until [ -f /etc/rancher/k3s/k3s.yaml ]; do sleep 2; done

    # Prepare secure mode-600 kubeconfig pre-pointed at the Elastic IP
    mkdir -p /home/ubuntu/.kube
    cp /etc/rancher/k3s/k3s.yaml /home/ubuntu/.kube/config
    sed -i "s/127.0.0.1/${aws_eip.k3s_eip.public_ip}/g" /home/ubuntu/.kube/config
    chown -R ubuntu:ubuntu /home/ubuntu/.kube
    chmod 600 /home/ubuntu/.kube/config
  EOF

  tags = { Name = "${var.project_name}-k3s-node" }
}

resource "aws_eip_association" "k3s_eip_assoc" {
  instance_id   = aws_instance.k3s_node.id
  allocation_id = aws_eip.k3s_eip.id
}