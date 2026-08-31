#!/usr/bin/env bash
set +e

# 1. Kill old background forwarders
pkill -9 -f "port-forward --address 0.0.0.0 svc/active" 2>/dev/null || true
pkill -9 -f "control-panel/server.js" 2>/dev/null || true
pkill -9 -f "port-forward --address 0.0.0.0 svc/prometheus" 2>/dev/null || true

sleep 1

# 2. Launch background port-forwards to 0.0.0.0 (detached from terminal)
( nohup kubectl -n deployment-engine port-forward --address 0.0.0.0 svc/active 8080:80 </dev/null >/tmp/active-forward.log 2>&1 & )
( nohup node control-panel/server.js </dev/null >/tmp/control-panel.log 2>&1 & )
( nohup kubectl -n deployment-engine port-forward --address 0.0.0.0 svc/prometheus 9090:9090 </dev/null >/tmp/prometheus-forward.log 2>&1 & )

sleep 2
echo "Background services started successfully on ports 8080, 8081, and 9090."
exit 0
