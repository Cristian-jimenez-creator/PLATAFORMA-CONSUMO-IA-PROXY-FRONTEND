# AI Consumption Platform

A deployable workshop project with a Spring Boot API and a vanilla JavaScript frontend.

## Requirements

- Java 17+
- Maven 3.9+
- PostgreSQL for persistent production data

## Run locally

1. Create a PostgreSQL database and set `SPRING_DATASOURCE_URL` (for example, `jdbc:postgresql://host:5432/database`), `DATABASE_USERNAME`, and `DATABASE_PASSWORD`.
2. Start the API from `backend` with `mvn spring-boot:run`.
3. Serve `frontend` with any static web server and set `API_BASE_URL` in `frontend/config.js` if the API is not at `http://localhost:8080`.

The frontend can be deployed to Vercel. Deploy `backend` to Railway and configure the database environment variables. Set `CORS_ALLOWED_ORIGINS` to the deployed frontend URL and set `API_BASE_URL` in `frontend/config.js` to the deployed API URL before deploying the frontend.

## API

- `POST /api/ai/generate` — generate simulated text and record token usage.
- `GET /api/quota?userId=...` — plan, remaining quota, and rate limit state.
- `GET /api/quota/history?userId=...` — daily usage for the last seven days.
- `POST /api/quota/upgrade` — simulate upgrading a FREE account to PRO.

The caller's browser generates a random user ID and stores it locally. This is suitable for an individual workshop demo, not authentication. The per-minute limiter is in-memory and should be replaced with a shared Redis limiter for multi-instance production deployments. Configure PostgreSQL for persistent data; without a datasource URL, the service uses an in-memory H2 database for local development.
