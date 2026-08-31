# Zero-Downtime Deployment Engine (Pure NGINX)

An enterprise-grade Zero-Downtime Deployment Engine running on Kubernetes and lightweight Alpine NGINX (~15MB image, 0 Node.js dependencies).

---

## 📁 Real-World Single Source Directory

In real production, you maintain a single codebase:
```
app/
├── nginx.conf   <-- NGINX routing and /health probes
├── index.html   <-- Your active website HTML
└── styles.css   <-- Your active website CSS
```

---

## 🚀 Step 1: Deploy Version 1.0 (Green UI)

### 1. Build the v1 Image:
```bash
docker build -f docker/Dockerfile -t zero-downtime:v1 .
```

### 2. Verify Locally:
```bash
docker run --rm -p 8080:80 zero-downtime:v1
```
Open `http://localhost:8080` to see the **Green v1.0** website with live traffic monitoring.

### 3. Deploy to Kubernetes:
```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/blue-green/rollout.yaml
kubectl apply -f k8s/services/active-service.yaml
```

---

## 🔄 Step 2: Release Version 1.1 (Blue UI with New Features)

When you are ready to update the website:

1. **Edit `app/index.html` and `app/styles.css` directly in place** (e.g., change the theme to Blue and add new feature cards or banners).
2. **Build the updated image as `v2`:**
   ```bash
   docker build -f docker/Dockerfile -t zero-downtime:v2 .
   ```
3. **Execute the Canary Rollout:**
   ```bash
   ./scripts/deploy-canary.sh
   ```

The Ingress will shift traffic gradually (**5% $\rightarrow$ 25% $\rightarrow$ 50% $\rightarrow$ 100%**) to the new Blue version while verifying zero 5xx errors with Prometheus.
