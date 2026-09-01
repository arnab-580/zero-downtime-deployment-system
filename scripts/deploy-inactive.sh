#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:?image required}"

# Detect current active color
ACTIVE="$(kubectl -n deployment-engine get service active -o jsonpath='{.spec.selector.color}' 2>/dev/null || echo "green")"

# Target the opposite (inactive) color
TARGET="blue"
if [ "$ACTIVE" = "blue" ]; then
  TARGET="green"
fi

# Set image and explicitly restart rollout so old pods are always evicted
kubectl -n deployment-engine set image deployment/"$TARGET" website="$IMAGE"
kubectl -n deployment-engine rollout restart deployment/"$TARGET"
kubectl -n deployment-engine rollout status deployment/"$TARGET" --timeout=180s >/dev/null

echo "$TARGET"
