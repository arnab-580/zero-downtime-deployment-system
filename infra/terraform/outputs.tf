output "elastic_ip" {
  value = aws_eip.k3s_eip.public_ip
}

output "app_domain" {
  description = "Automatic zero-cost DNS pointing to your Elastic IP via sslip.io"
  value       = "orderpulse.${replace(aws_eip.k3s_eip.public_ip, ".", "-")}.sslip.io"
}

output "app_url" {
  value = "https://orderpulse.${replace(aws_eip.k3s_eip.public_ip, ".", "-")}.sslip.io"
}

output "ssh_command" {
  value = "ssh -i $HOME\\.ssh\\orderpulse-aws ubuntu@${aws_eip.k3s_eip.public_ip}"
}