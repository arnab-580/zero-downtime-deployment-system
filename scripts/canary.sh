#!/usr/bin/env bash
set -euo pipefail

TARGET_COLOR="${1:?usage: canary.sh <blue|green> <weight 0-100>}"
WEIGHT="${2:-100}"

OTHER_COLOR="green"
if [ "$TARGET_COLOR" = "green" ]; then
  OTHER_COLOR="blue"
fi

if [ "$WEIGHT" -eq 0 ]; then
  # 100% on other color
  kubectl -n deployment-engine scale deployment "$OTHER_COLOR" --replicas=2
  kubectl -n deployment-engine scale deployment "$TARGET_COLOR" --replicas=2
  kubectl -n deployment-engine patch service active --type merge -p "{\"spec\":{\"selector\":{\"app\":\"deployment-engine\",\"color\":\"$OTHER_COLOR\"}}}"
  echo "Traffic 100% routed to $OTHER_COLOR (0% Canary)"

elif [ "$WEIGHT" -ge 100 ]; then
  # 100% on target color
  kubectl -n deployment-engine scale deployment "$TARGET_COLOR" --replicas=2
  kubectl -n deployment-engine scale deployment "$OTHER_COLOR" --replicas=2
  kubectl -n deployment-engine patch service active --type merge -p "{\"spec\":{\"selector\":{\"app\":\"deployment-engine\",\"color\":\"$TARGET_COLOR\"}}}"
  echo "Traffic 100% promoted to $TARGET_COLOR"

elif [ "$WEIGHT" -le 15 ]; then
  # 10% Canary: 9 other, 1 target
  kubectl -n deployment-engine scale deployment "$OTHER_COLOR" --replicas=9
  kubectl -n deployment-engine scale deployment "$TARGET_COLOR" --replicas=1
  kubectl -n deployment-engine patch service active --type merge -p '{"spec":{"selector":{"app":"deployment-engine","color":null}}}'
  echo "Canary split active: 10% $TARGET_COLOR / 90% $OTHER_COLOR"

elif [ "$WEIGHT" -le 35 ]; then
  # 25% Canary: 3 other, 1 target
  kubectl -n deployment-engine scale deployment "$OTHER_COLOR" --replicas=3
  kubectl -n deployment-engine scale deployment "$TARGET_COLOR" --replicas=1
  kubectl -n deployment-engine patch service active --type merge -p '{"spec":{"selector":{"app":"deployment-engine","color":null}}}'
  echo "Canary split active: 25% $TARGET_COLOR / 75% $OTHER_COLOR"

else
  # 50% Canary: 2 other, 2 target
  kubectl -n deployment-engine scale deployment "$OTHER_COLOR" --replicas=2
  kubectl -n deployment-engine scale deployment "$TARGET_COLOR" --replicas=2
  kubectl -n deployment-engine patch service active --type merge -p '{"spec":{"selector":{"app":"deployment-engine","color":null}}}'
  echo "Canary split active: 50% $TARGET_COLOR / 50% $OTHER_COLOR"
fi

# Refresh port 8080 forwarder
pkill -9 -f "svc/active 8080" 2>/dev/null || true
sleep 1
setsid nohup kubectl -n deployment-engine port-forward --address 0.0.0.0 svc/active 8080:80 >/tmp/active-forward.log 2>&1 </dev/null &
disown -a
