# Build context is the REPO ROOT (see /railway.json and docker-compose.yml),
# so COPY paths are repo-root-relative. This lets Railway build the API
# straight from the monorepo on every push without a "root directory" setting.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY services/api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/api/app ./app

EXPOSE 8000

# Railway/most PaaS provide $PORT; default to 8000 locally.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
