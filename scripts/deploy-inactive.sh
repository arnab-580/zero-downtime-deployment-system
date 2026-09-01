#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:?image required}"

# Check current images on both deployments
IMAGE_BLUE="$(kubectl -n deployment-engine get deployment blue -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || true)"
IMAGE_GREEN="$(kubectl -n deployment-engine get deployment green -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || true)"

# If any deployment still has the un-versioned placeholder ':latest', upgrade it first!
if [[ "$IMAGE_GREEN" == *"latest"* ]]; then
  TARGET="green"
elif [[ "$IMAGE_BLUE" == *"latest"* ]]; then
  TARGET="blue"
else
  # Standard active/inactive alternation
  ACTIVE="$(kubectl -n deployment-engine get service active -o jsonpath='{.spec.selector.color}' 2>/dev/null || echo "green")"
  TARGET="green"
  if [ "$ACTIVE" = "green" ]; then
    TARGET="blue"
  fi
fi

# Set image and force rollout restart so old pods are always evicted cleanly
kubectl -n deployment-engine set image deployment/"$TARGET" website="$IMAGE"
kubectl -n deployment-engine rollout restart deployment/"$TARGET"
kubectl -n deployment-engine rollout status deployment/"$TARGET" --timeout=180s >/dev/null

echo "$TARGET"
