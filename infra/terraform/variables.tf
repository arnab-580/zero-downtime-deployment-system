variable "aws_region" {
  description = "AWS region (Mumbai)"
  type        = string
  default     = "ap-south-1"
}

variable "project_name" {
  type    = string
  default = "orderpulse"
}

variable "instance_type" {
  description = "t3.medium (4GB) for core stack; t3.large (8GB) if adding Argo CD + Grafana"
  type        = string
  default     = "t3.medium"
}

variable "my_ip_cidr" {
  description = "Your laptop public IP in CIDR form (e.g. 49.36.12.34/32) for SSH & K8s API"
  type        = string
}

variable "ssh_public_key_path" {
  description = "Path to your local ed25519 public key"
  type        = string
}