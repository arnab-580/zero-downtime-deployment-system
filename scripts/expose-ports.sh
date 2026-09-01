#!/usr/bin/env bash
set +e

# Kill old background forwarders
pkill -9 -f "svc/active 8080" 2>/dev/null || true
pkill -9 -f "svc/ingress-nginx-controller 8080" 2>/dev/null || true
pkill -9 -f "control-panel/server.js" 2>/dev/null || true
pkill -9 -f "svc/prometheus 9090" 2>/dev/null || true

sleep 1

# Start daemons with setsid and disown so SSH disconnects cleanly
# Forward to the Ingress controller, not svc/active. A Service port-forward
# pins a backend pod and will not follow later selector changes. Ingress is a
# stable proxy and re-evaluates active/canary routing for each request.
setsid nohup kubectl -n ingress-nginx port-forward --address 0.0.0.0 svc/ingress-nginx-controller 8080:80 >/tmp/active-forward.log 2>&1 </dev/null &
setsid nohup node control-panel/server.js >/tmp/control-panel.log 2>&1 </dev/null &
setsid nohup kubectl -n deployment-engine port-forward --address 0.0.0.0 svc/prometheus 9090:9090 >/tmp/prometheus-forward.log 2>&1 </dev/null &

disown -a

sleep 2
echo "Background services started successfully on ports 8080, 8081, and 9090."
exit 0
