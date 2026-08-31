#!/bin/sh
set -e

# Default to v1 if not set
VERSION="${APP_VERSION:-v1}"

if [ "$VERSION" = "v2" ] || [ "$VERSION" = "blue" ]; then
  THEME_COLOR="#3b82f6"
  THEME_GLOW="rgba(59, 130, 246, 0.45)"
  THEME_BADGE_BG="rgba(59, 130, 246, 0.20)"
  VERSION_TEXT="Version 2.0 (Blue Release)"
  BANNER_TEXT="VERSION 2.0 (BLUE NEXT-GEN WORKLOAD)"
  BANNER_ICON="🔵"
  TITLE_TEXT="Production Workload v2.0"
  DESC_TEXT="Serving upgraded next-generation release v2.0 with enhanced performance and zero-downtime traffic cutover."
elif [ "$VERSION" = "v3" ] || [ "$VERSION" = "purple" ]; then
  THEME_COLOR="#a855f7"
  THEME_GLOW="rgba(168, 85, 247, 0.45)"
  THEME_BADGE_BG="rgba(168, 85, 247, 0.20)"
  VERSION_TEXT="Version 2.1 (Purple Release)"
  BANNER_TEXT="VERSION 2.1 (PURPLE CANARY WORKLOAD)"
  BANNER_ICON="🟣"
  TITLE_TEXT="Production Workload v2.1"
  DESC_TEXT="Serving cutting-edge release v2.1 with real-time canary monitoring and instantaneous traffic shifting."
else
  # Default v1 (Green)
  THEME_COLOR="#10b981"
  THEME_GLOW="rgba(16, 185, 129, 0.45)"
  THEME_BADGE_BG="rgba(16, 185, 129, 0.20)"
  VERSION_TEXT="Version 1.0 (Green Stable)"
  BANNER_TEXT="VERSION 1.0 (GREEN STABLE WORKLOAD)"
  BANNER_ICON="🟢"
  TITLE_TEXT="Production Workload v1.0"
  DESC_TEXT="Currently serving live user traffic across high-availability Kubernetes pods with zero single point of failure."
fi

# Inject theme variables into styles.css
sed -i "s|--primary-color:.*|--primary-color: ${THEME_COLOR};|g" /usr/share/nginx/html/styles.css
sed -i "s|--primary-glow:.*|--primary-glow: ${THEME_GLOW};|g" /usr/share/nginx/html/styles.css
sed -i "s|--primary-badge-bg:.*|--primary-badge-bg: ${THEME_BADGE_BG};|g" /usr/share/nginx/html/styles.css

# Inject version text and banner into index.html
sed -i "s|VERSION 1.0 (GREEN STABLE WORKLOAD)|${BANNER_TEXT}|g" /usr/share/nginx/html/index.html
sed -i "s|<span class=\"version-icon\">🟢</span>|<span class=\"version-icon\">${BANNER_ICON}</span>|g" /usr/share/nginx/html/index.html
sed -i "s|Version 1.0 (Green Stable)|${VERSION_TEXT}|g" /usr/share/nginx/html/index.html
sed -i "s|Production Workload v1.0|${TITLE_TEXT}|g" /usr/share/nginx/html/index.html
sed -i "s|Currently serving live user traffic across high-availability Kubernetes pods with zero single point of failure.|${DESC_TEXT}|g" /usr/share/nginx/html/index.html

exec nginx -g "daemon off;"
