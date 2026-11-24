# OrderPulse Operations & Verification Runbook

This runbook covers day-to-day operations, progressive delivery testing, automated rollback verification, and cost-control procedures for the OrderPulse platform.

---

## 1. Environment & Remote Access

### Remote Cluster Access (from workstation)
Ensure your PowerShell session points to the remote cluster configuration:
```powershell
$env:KUBECONFIG = "$HOME\.kube\aws-orderpulse.yaml"
kubectl cluster-info
kubectl get nodes -o wide
```

### Whitelisting a New IP in AWS Security Group
If your local public IP changes:
1. Check current public IP:
   ```powershell
   (Invoke-RestMethod https://checkip.amazonaws.com).Trim()
   ```
2. Update `my_ip_cidr` in `infra/terraform/terraform.tfvars`:
   ```hcl
   my_ip_cidr = "NEW_IP/32"
   ```
3. Apply the security group rule update (~2 seconds):
   ```powershell
   terraform -chdir=infra/terraform apply -auto-approve
   ```

---

## 2. Accessing Private Internal Admin Portals

Production user traffic flows publicly over HTTPS (`:443`). Administrative portals are kept private on internal `ClusterIP` services and accessed via authenticated SSH/kubectl tunnels:

### A. Grafana Monitoring Dashboard
```powershell
kubectl -n deployment-engine port-forward svc/grafana 3000:3000
```
- **URL**: [http://localhost:3000](http://localhost:3000)
- **User**: `admin`
- **Password**: `orderpulse-admin`
- **Dashboard**: `OrderPulse — Zero-Downtime Progressive Delivery`

### B. Argo Rollouts Progressive Delivery Dashboard
```powershell
kubectl -n argo-rollouts port-forward svc/argo-rollouts-dashboard 3100:3100
```
- **URL**: [http://localhost:3100/rollouts/deployment-engine](http://localhost:3100/rollouts/deployment-engine)

### C. Prometheus Targets & Metrics Explorer
```powershell
kubectl -n deployment-engine port-forward svc/prometheus 9090:9090
```
- **URL**: [http://localhost:9090/targets](http://localhost:9090/targets)

---

## 3. Progressive Delivery Workflows

### Scenario 1: Deploying a New Release (Happy Path)
1. Commit code changes and push a semantic release tag:
   ```bash
   git tag v2.0.0
   git push origin v2.0.0
   ```
2. Verify GitHub Actions completes build, Ruff linting, Pytest, Trivy scan, and pushes `ghcr.io/arnab-580/orderpulse-api:v2.0.0`.
3. If new migrations exist, run the Pre-Deploy migration Job:
   ```powershell
   kubectl apply -f k8s/workloads/migration-job-v2.yaml
   kubectl -n deployment-engine wait --for=condition=complete job/orderpulse-migrate-v2 --timeout=90s
   ```
4. Start continuous k6 load testing in a separate terminal:
   ```powershell
   docker run --rm -v "${PWD}/loadtest:/loadtest" grafana/k6 run /loadtest/zero-downtime.js
   ```
5. Trigger the canary rollout by applying the updated rollout spec:
   ```powershell
   kubectl apply -f k8s/workloads/rollout.yaml
   kubectl -n deployment-engine get rollout orderpulse-api -w
   ```
6. Observe automated traffic steps:
   - `10%` canary weight -> 45s pause + Prometheus AnalysisRun
   - `25%` canary weight -> 45s pause + Prometheus AnalysisRun
   - `50%` canary weight -> 45s pause + Prometheus AnalysisRun
   - `100%` promotion -> v2 becomes stable -> v1 pods drain and terminate

---

### Scenario 2: Automated Rollback Verification (Chaos Path)
To prove that the automated SLO gate protects users from faulty code releases:
1. Start k6 load testing:
   ```powershell
   docker run --rm -v "${PWD}/loadtest:/loadtest" grafana/k6 run /loadtest/zero-downtime.js
   ```
2. Modify `k8s/workloads/rollout.yaml` to inject fault parameters:
   ```yaml
   env:
     - name: APP_VERSION
       value: "v2.1.0-buggy"
     - name: CHAOS_ERROR_RATE
       value: "0.20"  # 20% 500 errors on /api/*
   ```
3. Apply the rollout:
   ```powershell
   kubectl apply -f k8s/workloads/rollout.yaml
   ```
4. Verification Milestones:
   - Canary pod spins up and receives 10% weight.
   - Prometheus detects ~20% 5xx error rate on the canary pod hash.
   - AnalysisRun fails after 2 consecutive checks (> 1% threshold).
   - Argo Rollouts marks the rollout `Aborted` / `Degraded`.
   - Envoy Gateway HTTPRoute resets immediately to `100%` stable / `0%` canary.
   - Faulty canary pod is terminated.
   - Stable users experience zero interruption.
5. Revert back to healthy spec:
   ```powershell
   # Restore clean v2.0.0 config in rollout.yaml
   kubectl apply -f k8s/workloads/rollout.yaml
   ```

---

## 4. Cost Management (AWS Free Tier Optimization)

### Stopping Compute Overnight (Compute drops to ₹0/hr)
Stopping the instance keeps EBS data, PostgreSQL volume, Let's Encrypt certificates, and the Elastic IP intact:
```powershell
aws ec2 stop-instances --instance-ids i-09bf4d74a69acd24a --region ap-south-1
aws ec2 wait instance-stopped --instance-ids i-09bf4d74a69acd24a --region ap-south-1
```

### Restarting the Cluster Next Day
```powershell
aws ec2 start-instances --instance-ids i-09bf4d74a69acd24a --region ap-south-1
aws ec2 wait instance-running --instance-ids i-09bf4d74a69acd24a --region ap-south-1
```
Wait ~60 seconds for k3s and container runtimes to initialize, then verify:
```powershell
kubectl get nodes
kubectl -n deployment-engine get rollout,pods,certificate
```

### Complete Decommissioning (Tear Down Everything)
When finishing the demo or project lifecycle, destroy all AWS resources in one command:
```powershell
terraform -chdir=infra/terraform destroy
```
