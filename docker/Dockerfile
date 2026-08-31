FROM nginx:1.27-alpine-slim

WORKDIR /usr/share/nginx/html

# Clean up default configs
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

# Copy NGINX server configuration
COPY app/nginx.conf /etc/nginx/conf.d/default.conf

# Copy single production website source files
COPY app/index.html app/styles.css ./

# Expose standard HTTP port
EXPOSE 80

# Health check inside Docker
HEALTHCHECK --interval=5s --timeout=3s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
