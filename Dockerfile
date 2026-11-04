FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ .
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
COPY atlas ./atlas
COPY arena ./arena
COPY gateway ./gateway
COPY eval ./eval
COPY redteam ./redteam
COPY policies ./policies
RUN pip install --no-cache-dir .
COPY --from=web /web/dist ./web/dist
RUN useradd --create-home atlas && mkdir -p /data && chown atlas /data
USER atlas
ENV ATLAS_DB=/data/arena.db
EXPOSE 8000
# Hosts set PORT. Run from /app so the site and policy files beside the code are found.
CMD ["sh", "-c", "exec python -m uvicorn --factory arena.api:main_app --host 0.0.0.0 --port ${PORT:-8000}"]
