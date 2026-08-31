# EC2 Deployment Setup Guide via GitHub Actions

This guide explains how to set up automated Zero-Downtime deployments to an AWS EC2 instance using GitHub Actions.

---

## 1. AWS EC2 Instance Prerequisites

### A. Recommended Instance Specifications
* **OS:** Ubuntu 22.04 LTS or 24.04 LTS (64-bit x86_64)
* **Instance Type:** `t3.medium` or `t3a.medium` (2 vCPU, 4GB RAM minimum to run Docker + Minikube comfortably).
* **Storage:** 20 GB gp3 SSD.

### B. AWS Security Group (Inbound Rules)
In your AWS Console under **EC2 > Security Groups**, ensure the following Inbound ports are open:

| Type | Port Range | Source | Purpose |
| :--- | :--- | :--- | :--- |
| **SSH** | `22` | `0.0.0.0/0` (or your IP) | For GitHub Actions SSH connection |
| **HTTP** | `80` | `0.0.0.0/0` | Public website traffic |
| **Custom TCP** | `8080` | `0.0.0.0/0` | Alternative website port / NodePort |
| **Custom TCP** | `8081` | `0.0.0.0/0` | Deployment Control Panel |

---

## 2. One-Time Setup on the EC2 Instance

Connect to your EC2 instance once via SSH:
```bash
ssh -i /path/to/your-key.pem ubuntu@<YOUR_EC2_PUBLIC_IP>
```

Run this automated setup snippet to install **Docker, Kubectl, and Minikube**:

```bash
# 1. Update system packages
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y curl wget git apt-transport-https ca-certificates conntrack

# 2. Install Docker
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io

# 3. Add ubuntu user to docker group (no sudo needed for docker)
sudo usermod -aG docker ubuntu
newgrp docker

# 4. Install Kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
rm kubectl

# 5. Install Minikube
curl -LO https://github.com/kubernetes/minikube/releases/latest/download/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube
rm minikube-linux-amd64

# 6. Start Minikube with Docker driver
minikube start --driver=docker
```

---

## 3. Configure GitHub Repository Secrets

In your GitHub repository, go to:
**Settings > Secrets and variables > Actions > New repository secret**

Add the following 3 secrets:

1. `EC2_HOST`
   * Value: Your EC2 Public IP address (e.g., `54.210.123.45` or `ec2-54-210-123-45.compute-1.amazonaws.com`).
2. `EC2_USER`
   * Value: `ubuntu`
3. `EC2_SSH_KEY`
   * Value: The entire contents of your AWS private key file (`.pem` file), including the `-----BEGIN RSA PRIVATE KEY-----` and `-----END RSA PRIVATE KEY-----` header/footer lines.

---

## 4. How the Automated Deployment Works

Whenever you push a change to the `main` branch:

1. **GitHub Actions runner (`ubuntu-latest`)**:
   * Checks out the code.
   * Runs local container verification.
2. **SSH Connection to EC2**:
   * Securely connects to your EC2 instance.
   * Syncs the latest code.
   * Builds the immutable container image on EC2 (`zero-downtime:<COMMIT_SHA>`).
   * Loads the image into the cluster.
   * Deploys to the inactive environment (Blue or Green).
   * Runs automated smoke tests against the new version.
   * Switches live traffic to the new version with **0 dropped requests**.
