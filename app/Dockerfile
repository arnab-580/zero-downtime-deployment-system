FROM python:3.12-slim AS builder
WORKDIR /install
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install/deps -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/usr/local/bin:$PATH"

RUN groupadd -r -g 1001 app && useradd -r -u 1001 -g app app

COPY --from=builder /install/deps /usr/local
COPY --chown=1001:1001 . .

USER 1001
EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--timeout-keep-alive", "65", "--timeout-graceful-shutdown", "20"]