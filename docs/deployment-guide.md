# Production Deployment & Update Guide

This guide demonstrates the real-world workflow: deploying **v1.0 (Green)**, updating the code in place to **v1.1 (Blue)**, and executing a zero-downtime Canary traffic shift.

---

## Part 1: Deploying Initial Website (v1.0 Green)

Currently, [`app/index.html`](file:///c:/Users/arnab/Downloads/zero-downtime-deployment-engine/app/index.html) and [`app/styles.css`](file:///c:/Users/arnab/Downloads/zero-downtime-deployment-engine/app/styles.css) are configured for **Version 1.0 (Emerald Green UI)**.

1. **Build and Tag v1:**
   ```bash
   docker build -f docker/Dockerfile -t zero-downtime:v1 .
   ```

2. **Load into Kubernetes (Minikube):**
   ```bash
   minikube image load zero-downtime:v1
   ```

3. **Deploy Baseline Services:**
   ```bash
   kubectl apply -f k8s/namespace.yaml
   kubectl apply -f k8s/blue-green/rollout.yaml
   kubectl apply -f k8s/services/active-service.yaml
   kubectl apply -f k8s/services/preview-service.yaml
   ```

4. **Port-Forward to View Live Site:**
   ```bash
   kubectl -n deployment-engine port-forward svc/active 8080:80
   ```
   Open `http://localhost:8080`. You will see the **Green v1.0** site streaming live traffic.

---

## Part 2: Updating the Website to v1.1 (Blue) & Deploying

Now, simulate a real feature release:

1. **Edit the source files:**
   * In `app/styles.css`: Change `--primary-color: #10b981;` to `--primary-color: #3b82f6;` (Royal Blue).
   * In `app/index.html`: Change the title/badge to `Version 1.1 (Blue Release)` and add any new feature elements.

2. **Build the updated image as v2:**
   ```bash
   docker build -f docker/Dockerfile -t zero-downtime:v2 .
   ```

3. **Load the new image into the cluster:**
   ```bash
   minikube image load zero-downtime:v2
   ```

4. **Run the Automated Canary Rollout:**
   ```bash
   ./scripts/deploy-canary.sh
   ```

### Real-Time Canary Verification:
* Ingress routes **5% $\rightarrow$ 25% $\rightarrow$ 50% $\rightarrow$ 100%** of traffic to the new Blue version.
* Watch the live traffic stream in your browser transition from Green to Blue with **0 dropped requests**.
