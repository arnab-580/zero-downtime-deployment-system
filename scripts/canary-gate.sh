#!/usr/bin/env bash
set -euo pipefail
PROMETHEUS_URL="${PROMETHEUS_URL:-http://127.0.0.1:9090}"
MAX_ERROR_RATE="${MAX_ERROR_RATE:-0.05}"
QUERY='sum(rate(nginx_http_requests_total{status=~"5.."}[2m])) / clamp_min(sum(rate(nginx_http_requests_total[2m])), 1)'
VALUE="$(curl --fail --silent --get --data-urlencode "query=$QUERY" "$PROMETHEUS_URL/api/v1/query" | sed -n 's/.*"value":\[[^,]*,"\([0-9.eE+-]*\)".*/\1/p')"
VALUE="${VALUE:-0}"
awk -v value="$VALUE" -v max="$MAX_ERROR_RATE" 'BEGIN { if (value > max) exit 1 }'
echo "canary error rate ${VALUE}; gate passed"
