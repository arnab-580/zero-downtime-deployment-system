#!/usr/bin/env bash
set -euo pipefail

# 1. Kill old background forwarders
pkill -f "port-forward --address 0.0.0.0 svc/active" 2>/dev/null || true
pkill -f "control-panel/server.js" 2>/dev/null || true
pkill -f "port-forward --address 0.0.0.0 svc/grafana" 2>/dev/null || true

# 2. Launch new background processes detached from terminal
( nohup kubectl -n deployment-engine port-forward --address 0.0.0.0 svc/active 8080:80 </dev/null >/tmp/active-forward.log 2>&1 & )
( nohup node control-panel/server.js </dev/null >/tmp/control-panel.log 2>&1 & )
( nohup kubectl -n deployment-engine port-forward --address 0.0.0.0 svc/grafana 3000:3000 </dev/null >/tmp/grafana-forward.log 2>&1 & )

echo "Background services started successfully."
