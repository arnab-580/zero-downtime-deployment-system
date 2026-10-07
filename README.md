# 🚀 Zero-Downtime Deployment Engine

Deploy website updates to AWS EC2 and Kubernetes with **zero downtime**, **zero dropped requests**, and **automated auto-rollback**.

---

## 🌐 Live Access & URLs

The project runs on a fixed AWS Elastic IP (**`3.111.151.79`**). You can access all services directly in your browser:

| Service | Port | URL | What It Is |
| --- | --- | --- | --- |
| **Live Website** | `8080` | [http://3.111.151.79:8080](http://3.111.151.79:8080) | The live production website that users visit. |
| **DevOps Control Panel** | `8081` | [http://3.111.151.79:8081](http://3.111.151.79:8081) | Interactive dashboard to switch Blue/Green, test Canary traffic, and run load tests. |
| **Prometheus Dashboard** | `9090` | [http://3.111.151.79:9090](http://3.111.151.79:9090) | Live monitoring and error rate graphs. |

*(If running locally via Minikube, access via `http://localhost:8080` and `http://localhost:8081`)*

---

## 🚀 How to Deploy New Changes (CI/CD Workflow)

You do **not** need to manually SSH into the server to deploy updates. Everything happens automatically when you push code to GitHub:

### 1. Make a quick edit to test it

To test the deployment immediately and see the change visually on the live website:

Open **[`app/index.html`](file:///c:/Users/arnab/Downloads/zero-downtime-deployment-engine/app/index.html)** and bump the version banner:

- Change `RELEASE v0.9` ➔ `RELEASE v1.0` (Line 13)
- Change `Production Workload v0.9` ➔ `Production Workload v1.0` (Line 33)

*(Optional: You can also change the theme color in **[`app/styles.css`](file:///c:/Users/arnab/Downloads/zero-downtime-deployment-engine/app/styles.css)** line 5 from `#d946ef` to `#10b981` for Green or `#3b82f6` for Blue).*

### 2. Commit and push to `main`

```bash
git add app/index.html
git commit -m "Bump release version to v1.0"
git push origin main
```

### 3. What happens automatically in GitHub Actions

1. **Starts EC2 Instance:** If the EC2 instance is stopped, GitHub Actions automatically starts it using the AWS CLI.
2. **Builds Container:** Builds a new Docker container with your latest code.
3. **Deploys to Inactive Slot:** Checks which version is currently live (Blue or Green) and deploys your new code to the standby slot.
4. **Runs Health Smoke Test:** Tests the new container on a private port (`/health`).
5. **Instant Cutover:** Once healthy, switches live traffic to your new version in under a millisecond with zero downtime.
6. **Keeps Ports Open:** Keeps ports `8080`, `8081`, and `9090` running in the background.
7. **Auto-Shutdown Timer (Cost Saver):** Schedules an automatic server shutdown after 60 minutes so you don't waste AWS credits.

Once the workflow finishes with a green checkmark, your updated website is immediately live at **[http://3.111.151.79:8080](http://3.111.151.79:8080)**!

---

## 💻 How to Run Locally (Optional)

If you want to run and test on your local machine using Minikube:

### Prerequisites

- Docker Desktop
- Minikube
- Node.js (v18+)

### Steps

```bash
# 1. Start Minikube
minikube start --driver=docker
kubectl config set-context --current --namespace=deployment-engine

# 2. Deploy Kubernetes manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/monitoring.yaml
kubectl apply -f k8s/blue-green/rollout.yaml
kubectl apply -f k8s/services/active-service.yaml
kubectl apply -f k8s/services/preview-service.yaml

# 3. Expose the ports
bash scripts/expose-ports.sh

# 4. Open in browser:
# Live Website: http://localhost:8080
# Control Panel: http://localhost:8081
```

---

## 💡 What is this Project? (Explained Simply)

Normally, when updating a website, users often experience:

- "502 Bad Gateway" or temporary error screens.
- Slow loading or dropped carts while the server restarts.
- Broken pages if something goes wrong during the release.

This project solves this problem completely using two deployment strategies:

### 1. Blue-Green Deployments (Instant Switch)

- We run two identical setups in Kubernetes: **Blue** and **Green**.
- If **Green** is currently live for users, we deploy the new version to **Blue** in the background.
- We test Blue privately.
- Once it is 100% healthy, we switch the traffic pointer to Blue instantly.
- Users never see a restart, error, or interrupted connection.

### 2. Canary Releases (Progressive 10% Rollout)

- If you don't want to switch 100% of users all at once, you can do a **Canary deployment**.
- You send **10% of traffic** to the new version and keep 90% on the old stable version.
- If everything is stable, you step it up: 20% → 30% → 50% → 100%.
- If errors occur, the system automatically rolls back to the stable version in less than 1 second.

---

## 🎛️ Using the Live DevOps Control Panel (`:8081`)

Open **[http://3.111.151.79:8081](http://3.111.151.79:8081)** in your browser. From here you can:

- **Switch Colors:** Click **Route 100% → BLUE** or **Route 100% → GREEN** to manually switch traffic.
- **Canary Buttons:** Click **10% Canary**, **20% Canary**, or **50% Canary** to split live traffic between versions.
- **Auto Cutover:** Click **🚀 Auto Cutover** to ramp up traffic step-by-step from 10% to 100% automatically.
- **Load Test Generator:** Choose 1,000 or 10,000 requests/second and click **Start Load Test** to send high traffic and prove that 0 requests get dropped during deployment.
- **Simulate Errors & Auto-Rollback:** Click **💥 Trigger 500 Error** to see how the system detects errors and rolls back instantly to keep the site safe.

---

## 🏢 Why Does This Matter? (Real-World Use Cases)

1. **Online Stores & E-Commerce (Black Friday / Flash Sales):**
   - Deploy pricing updates or new product features during peak shopping hours without dropping customer carts or payment requests.
2. **Banking & Payment Gateways:**
   - Financial transactions cannot afford a 5-second maintenance window or connection drops mid-transfer.
3. **Healthcare & Patient Systems:**
   - Medical tracking systems and patient dashboards must stay online 24/7 with zero downtime.
4. **Any 24/7 Web App:**
   - Developers can deploy code at 2 PM on a Tuesday instead of waiting for 2 AM weekend maintenance windows.

---

## 💰 Smart AWS EC2 Cost Optimization

Running an AWS EC2 instance 24/7 costs money. This project includes built-in cost protection:

- **Auto-Wakeup:** The GitHub Actions workflow turns the EC2 instance on only when you push code.
- **Fixed Elastic IP:** Bound to `3.111.151.79`, so the destination URL never changes even when the instance stops and starts.
- **Auto-Shutdown:** Automatically schedules a safe power-off (`shutdown -h +60`) 1 hour after deployment.
- **Result:** You only pay for the time you are actively testing or demoing the application.

---

## 📁 Repository Structure

- **`app/`**: Website source files (`index.html`, `styles.css`, `nginx.conf`).
- **`control-panel/`**: Node.js dashboard code running on port `8081`.
- **`k8s/`**: Kubernetes configuration files (Blue/Green deployments, Services, Prometheus).
- **`scripts/`**: Automation scripts for canary shifting, cutovers, rollbacks, and port exposing.
- **`.github/workflows/deploy.yml`**: GitHub Actions pipeline for AWS EC2 automation and zero-downtime deployment.
