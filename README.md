# Freshers Adda Backend

Production-grade backend boilerplate for Freshers Adda built with Node.js 22, TypeScript, Express, PostgreSQL, Prisma, Redis, BullMQ, Winston, Zod, and Docker.

## Phase 1 Scope

This phase contains the foundation only:

- Project folder structure
- Package and TypeScript configuration
- Docker and Docker Compose setup
- ESLint and Prettier configuration
- Environment validation
- Prisma schema setup
- Base Express application and server bootstrap

Business logic, authentication flows, CRUD operations, database queries, queue processors, and feature implementations are intentionally deferred.

## Local Setup

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run dev
```

## Docker Setup

```bash
cp .env.example .env
docker compose up --build
```

## API Prefix

All API routes are mounted under `/api/v1`.
