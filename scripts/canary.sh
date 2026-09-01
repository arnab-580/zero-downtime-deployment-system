#!/usr/bin/env bash
set -euo pipefail

TARGET_COLOR="${1:?usage: canary.sh <blue|green> <weight 0-100>}"
WEIGHT="${2:-100}"

if ! [[ "$WEIGHT" =~ ^[0-9]+$ ]] || [ "$WEIGHT" -lt 0 ] || [ "$WEIGHT" -gt 100 ]; then
  echo "weight must be an integer from 0 to 100" >&2
  exit 2
fi

OTHER_COLOR="green"
if [ "$TARGET_COLOR" != "blue" ] && [ "$TARGET_COLOR" != "green" ]; then
  echo "target must be blue or green" >&2
  exit 2
fi

# Canary weights belong to the Ingress request path. Do not scale live
# deployments or clear the active Service selector: both operations churn
# endpoints and can reset connections under load.
kubectl -n deployment-engine annotate ingress deployment-engine-canary \
  nginx.ingress.kubernetes.io/canary-weight="$WEIGHT" --overwrite
echo "Canary weight set to ${WEIGHT}% for $TARGET_COLOR; stable endpoints preserved"
