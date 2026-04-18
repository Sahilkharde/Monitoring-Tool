# Backend API — slim image; browser scans off by default (set USE_BROWSER_SCAN=true + install Playwright if needed).
FROM python:3.12-slim-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app app/

ENV PYTHONUNBUFFERED=1
ENV USE_BROWSER_SCAN=false

EXPOSE 8000

# Render/Fly set PORT; default 8000 for local docker run -p 8000:8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
