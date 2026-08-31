#!/usr/bin/env bash
set -euo pipefail

echo "==> Deploying Canary version (v1.1 Blue)..."
kubectl -n deployment-engine apply -f k8s/canary/rollout.yaml
kubectl apply -f k8s/canary/ingress.yaml

# Function to rollback canary
rollback_canary() {
  echo "⚠️ ERROR: Canary quality gate failed! Rolling back traffic immediately..."
  kubectl -n deployment-engine annotate ingress deployment-engine-canary nginx.ingress.kubernetes.io/canary-weight="0" --overwrite || true
  kubectl -n deployment-engine scale deployment canary --replicas=0 || true
  echo "✅ Canary rolled back to 0%. 100% traffic retained on stable version."
  exit 1
}

# Gradual traffic progression: 5% -> 25% -> 50% -> 100%
for weight in 5 25 50 100; do
  echo "----------------------------------------"
  echo "==> Shifting ${weight}% of user traffic to Canary..."
  kubectl -n deployment-engine annotate ingress deployment-engine-canary nginx.ingress.kubernetes.io/canary-weight="$weight" --overwrite
  
  echo "==> Running health check on Canary pods..."
  ./scripts/health-check.sh canary || rollback_canary

  echo "==> Verifying live error rate via Prometheus..."
  if ! ./scripts/canary-gate.sh; then
    rollback_canary
  fi
  
  echo "✅ Canary weight ${weight}% verified healthy (0% error rate)."
  sleep 3
done

echo "========================================"
echo "🎉 Canary deployment successfully verified at 100%!"
echo "Promoting active baseline service..."
./scripts/promote.sh blue
kubectl -n deployment-engine annotate ingress deployment-engine-canary nginx.ingress.kubernetes.io/canary-weight="0" --overwrite || true
kubectl -n deployment-engine scale deployment canary --replicas=0 || true
echo "✅ Full Zero-Downtime Canary Rollout Complete!"
