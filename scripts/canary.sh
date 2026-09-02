#!/usr/bin/env bash
set -euo pipefail

TARGET_COLOR="${1:?usage: canary.sh <blue|green> <weight 0-100>}"
WEIGHT="${2:-100}"

OTHER_COLOR="green"
if [ "$TARGET_COLOR" = "green" ]; then
  OTHER_COLOR="blue"
fi

if [ "$WEIGHT" -le 0 ]; then
  # 100% on other color (Reset)
  kubectl -n deployment-engine scale deployment "$OTHER_COLOR" --replicas=3
  kubectl -n deployment-engine scale deployment "$TARGET_COLOR" --replicas=3
  kubectl -n deployment-engine patch service active --type merge -p "{\"spec\":{\"selector\":{\"app\":\"deployment-engine\",\"color\":\"$OTHER_COLOR\"}}}"
  echo "Traffic 100% routed to $OTHER_COLOR (0% Canary)"

  # Refresh forwarder only on full cutover/reset
  pkill -f "svc/active 8080" 2>/dev/null || true
  setsid nohup kubectl -n deployment-engine port-forward --address 0.0.0.0 svc/active 8080:80 >/tmp/active-forward.log 2>&1 </dev/null &
  disown -a

elif [ "$WEIGHT" -ge 100 ]; then
  # 100% on target color (Full Promotion)
  kubectl -n deployment-engine scale deployment "$TARGET_COLOR" --replicas=3
  kubectl -n deployment-engine scale deployment "$OTHER_COLOR" --replicas=3
  kubectl -n deployment-engine patch service active --type merge -p "{\"spec\":{\"selector\":{\"app\":\"deployment-engine\",\"color\":\"$TARGET_COLOR\"}}}"
  echo "Traffic 100% promoted to $TARGET_COLOR"

  # Refresh forwarder only on full cutover/reset
  pkill -f "svc/active 8080" 2>/dev/null || true
  setsid nohup kubectl -n deployment-engine port-forward --address 0.0.0.0 svc/active 8080:80 >/tmp/active-forward.log 2>&1 </dev/null &
  disown -a

else
  # Granular Canary split in 10% steps (10%, 20%, 30%, 40%, 50%, 60%, 70%, 80%, 90%)
  TARGET_REPLICAS=$(( (WEIGHT + 5) / 10 ))
  if [ "$TARGET_REPLICAS" -lt 1 ]; then TARGET_REPLICAS=1; fi
  if [ "$TARGET_REPLICAS" -gt 9 ]; then TARGET_REPLICAS=9; fi
  OTHER_REPLICAS=$(( 10 - TARGET_REPLICAS ))
  PERCENT=$(( TARGET_REPLICAS * 10 ))
  OTHER_PERCENT=$(( OTHER_REPLICAS * 10 ))

  kubectl -n deployment-engine scale deployment "$TARGET_COLOR" --replicas="$TARGET_REPLICAS"
  kubectl -n deployment-engine scale deployment "$OTHER_COLOR"  --replicas="$OTHER_REPLICAS"
  kubectl -n deployment-engine patch service active --type merge -p '{"spec":{"selector":{"app":"deployment-engine","color":null}}}'
  echo "Canary split active: ${PERCENT}% $TARGET_COLOR / ${OTHER_PERCENT}% $OTHER_COLOR (replicas: $TARGET_REPLICAS vs $OTHER_REPLICAS)"

  # Keep existing port forwarder running without interruption!
  if ! pgrep -f "svc/active 8080" >/dev/null 2>&1; then
    setsid nohup kubectl -n deployment-engine port-forward --address 0.0.0.0 svc/active 8080:80 >/tmp/active-forward.log 2>&1 </dev/null &
    disown -a
  fi
fi
