#!/usr/bin/env bash
set -euo pipefail

# 1. Kill old background forwarders
pkill -f "socat TCP-LISTEN:8080" 2>/dev/null || true
pkill -f "port-forward --address 0.0.0.0 svc/active" 2>/dev/null || true
pkill -f "control-panel/server.js" 2>/dev/null || true
pkill -f "port-forward --address 0.0.0.0 svc/grafana" 2>/dev/null || true
pkill -f "port-forward --address 0.0.0.0 svc/prometheus" 2>/dev/null || true

# Ensure socat is installed for high-speed zero-drop kernel proxying
if ! command -v socat >/dev/null 2>&1; then
  sudo apt-get update -y && sudo apt-get install -y socat || true
fi

# 2. Get Minikube IP
MINIKUBE_IP=$(minikube ip 2>/dev/null || echo "")

# 3. High-throughput NodePort Proxy (Zero-drop kernel proxying)
if [ -n "$MINIKUBE_IP" ] && command -v socat >/dev/null 2>&1; then
  ( nohup socat TCP-LISTEN:8080,fork,reuseaddr TCP:${MINIKUBE_IP}:30080 </dev/null >/tmp/active-socat.log 2>&1 & )
else
  ( nohup kubectl -n deployment-engine port-forward --address 0.0.0.0 svc/active 8080:80 </dev/null >/tmp/active-forward.log 2>&1 & )
fi

# 4. Control Panel, Grafana & Prometheus
( nohup node control-panel/server.js </dev/null >/tmp/control-panel.log 2>&1 & )
( nohup kubectl -n deployment-engine port-forward --address 0.0.0.0 svc/grafana 3000:3000 </dev/null >/tmp/grafana-forward.log 2>&1 & )
( nohup kubectl -n deployment-engine port-forward --address 0.0.0.0 svc/prometheus 9090:9090 </dev/null >/tmp/prometheus-forward.log 2>&1 & )

echo "Background services started successfully."
