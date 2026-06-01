FROM python:3.12-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install dependencies (cached layer — only invalidates when pyproject.toml changes)
COPY pyproject.toml .
COPY app/__init__.py app/__init__.py
RUN uv pip install --system --no-cache -e .

# Copy source and config
COPY app/ app/
COPY .env .env

# Docker-specific overrides (take precedence over .env via pydantic-settings env var priority)
ENV CACHE_DIR=/data/cache \
    FRONTEND_ORIGIN=http://localhost:3000

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
