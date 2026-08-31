#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:?image required}"

# Detect current active color (defaults to green if not set)
ACTIVE="$(kubectl -n deployment-engine get service active -o jsonpath='{.spec.selector.color}' 2>/dev/null || echo "green")"

# Target the opposite (inactive) color
TARGET="blue"
if [ "$ACTIVE" = "blue" ]; then
  TARGET="green"
fi

# Update the inactive deployment to the new immutable image
kubectl -n deployment-engine set image deployment/"$TARGET" website="$IMAGE"
kubectl -n deployment-engine rollout status deployment/"$TARGET" --timeout=180s >/dev/null

echo "$TARGET"
