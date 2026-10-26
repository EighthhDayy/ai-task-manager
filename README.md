<div align="center">

# ⚡ AI TASK MANAGER

### An AI-native backend for tasks, documents, and knowledge workflows.

**Secure REST APIs · Agentic tool execution · Retrieval-augmented knowledge**

<br />

![Python](https://img.shields.io/badge/Python-3.13%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-API-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)

<br />

[![CI](https://github.com/EighthhDayy/ai-task-manager/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/EighthhDayy/ai-task-manager/actions/workflows/ci.yml)
![Version](https://img.shields.io/badge/version-0.1.0-555?style=flat-square)
![API](https://img.shields.io/badge/API-REST%20%2B%20OpenAPI-555?style=flat-square)
![Status](https://img.shields.io/badge/status-active%20development-7957D5?style=flat-square)

<br />

[**Overview**](#overview) · [**Architecture**](#architecture) · [**Capabilities**](#capabilities) · [**Quick Start**](#quick-start) · [**API**](#api-reference) · [**Engineering**](#engineering-decisions) · [**Roadmap**](#roadmap)

</div>

---

## Overview

**AI Task Manager** is a backend engineering project exploring the journey from a conventional authenticated task API to an **LLM-powered workflow and document knowledge platform**.

The public repository establishes a Python/FastAPI foundation with **JWT authentication, user-scoped task CRUD, PostgreSQL persistence, database migrations, containerization, and automated tests**.

Beyond the public snapshot, the project has been extended locally with an **LLM tool-calling agent**, a **document RAG pipeline**, **PDF/OCR ingestion**, and **Redis/RQ background workers**.

> [!IMPORTANT]
> **Repository synchronization status:** The public \`main\` branch currently contains the **core backend snapshot**. The advanced AI modules described as *local* below have been implemented and exercised in local development, but their latest source files have **not yet been pushed to \`main\`**. In addition, the current committed \`main.py\` references an \`ai\` router that is not yet committed; see [Quick Start](#quick-start) for the core-only workaround. Features marked *planned* are design goals, not completed work.

## At a glance

<table>
<tr>
<td width="50%" valign="top">

**🛡️ Secure by design**

JWT bearer authentication, Argon2 password hashing, per-user task authorization, and explicit API response schemas.

</td>
<td width="50%" valign="top">

**🧠 Agent-ready workflows**

Locally developed OpenAI Responses API integration, tool calls routed through backend business logic, and duplicate-operation protection.

</td>
</tr>
<tr>
<td width="50%" valign="top">

**📚 Document intelligence**

Locally developed PDF text extraction, scanned-PDF OCR, paragraph-first chunking, embeddings, and pgvector retrieval.

</td>
<td width="50%" valign="top">

**⚙️ Backend reliability**

SQLAlchemy transactions, Alembic migrations, Dockerized services, pytest integration tests, and Redis/RQ worker-based processing in local development.

</td>
</tr>
</table>

## Architecture

**Architecture overview** — solid lines represent the public core; dashed lines lead to AI modules developed locally and awaiting repository synchronization.

\`\`\`mermaid
flowchart TB
    Client["Client / Swagger UI"] --> API["FastAPI · REST API"]

    subgraph Core["PUBLIC MAIN · Core backend"]
        API --> Auth["JWT authentication · Argon2"]
        API --> Tasks["User-scoped task CRUD"]
        Tasks --> Postgres[("PostgreSQL 18")]
        Auth --> Postgres
    end

    subgraph Extensions["LOCAL DEVELOPMENT · Pending GitHub sync"]
        API -.-> Agent["LLM Agent · Tool Calling"]
        Agent --> Ops["Backend tools · Idempotent writes"]
        Ops -.-> Tasks

        API -.-> Upload["PDF upload / job status"]
        Upload --> Queue["Redis · RQ queue"]
        Queue --> Worker["Background worker"]
        Worker --> Parse["PDF parsing · OCR"]
        Parse --> Chunk["Paragraph-first chunking"]
        Chunk --> Embed["Embeddings"]
        Embed --> Vector[("PostgreSQL · pgvector")]

        API -.-> Retrieval["RAG retrieval"]
        Vector --> Retrieval
        Retrieval --> Answer["Grounded answer · Source attribution"]
    end

    classDef core fill:#e8f5f0,stroke:#009688,color:#173e34;
    classDef local fill:#eef2ff,stroke:#6574cd,color:#25346b;
    class API,Auth,Tasks,Postgres core;
    class Agent,Ops,Upload,Queue,Worker,Parse,Chunk,Embed,Vector,Retrieval,Answer local;
\`\`\`

### Technology stack

| Layer | Technologies | Scope |
| :--- | :--- | :--- |
| API & validation | Python 3.13+, FastAPI, Pydantic | Public \`main\` |
| Authentication | JWT, HTTP Bearer, Argon2 | Public \`main\` |
| Persistence | PostgreSQL 18, SQLAlchemy, psycopg, Alembic | Public \`main\` |
| Delivery & testing | Docker Compose, uv, pytest, GitHub Actions | Public \`main\` |
| LLM orchestration | OpenAI Responses API, tool calling, streaming | Local development |
| Retrieval | Embeddings, PostgreSQL + pgvector, context-grounded QA | Local development |
| Document processing | pypdf, PyMuPDF, Tesseract OCR | Local development |
| Background jobs | Redis, RQ, independent worker | Local development |

## Capabilities

### Available in the public repository

| Feature | Implementation |
| :--- | :--- |
| **Account lifecycle** | Registration, login, \`GET /me\` |
| **Protected task API** | Create, list, update, and delete user-owned tasks |
| **User isolation** | Queries scoped to the authenticated user; cross-user update/delete tests |
| **Typed contracts** | Pydantic request and response models |
| **Database evolution** | Versioned Alembic migrations |
| **Integration testing** | pytest, FastAPI TestClient, isolated test DB |
| **Containerization** | Docker Compose API + PostgreSQL services |
| **CI** | GitHub Actions runs tests against PostgreSQL |

### Implemented locally — source sync pending

| Feature | Design |
| :--- | :--- |
| **LLM task agent** | Natural-language task operations via backend tool execution |
| **Streaming model responses** | Incremental response delivery using the OpenAI API |
| **Tool-call idempotency** | Operation keys, uniqueness constraints, and transaction conflict handling |
| **Document Q&A** | Embedding-based retrieval with pgvector and grounded answer generation |
| **Source attribution** | Source/Chunk identifiers supplied as retrieval evidence |
| **Abstention handling** | Similarity filtering and no-evidence fallback |
| **PDF ingestion** | Text-first PDF extraction with OCR fallback for scanned pages |
| **Async indexing** | Redis/RQ queue, isolated worker, \`202 Accepted\`, and job status polling |

**Accuracy note:** The local RAG flow uses *paragraph-first* chunking with overlap for oversized segments. **Structure-aware / heading-aware chunking, strict citation validation, and retrieval benchmark improvements are not claimed as completed features.**

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) with Docker Compose
- Git
- Optional: [uv](https://docs.astral.sh/uv/) for development outside containers

### 1. Clone

\`\`\`bash
git clone https://github.com/EighthhDayy/ai-task-manager.git
cd ai-task-manager
\`\`\`

### 2. Configure environment

Create a \`.env\` file in the repository root:

\`\`\`dotenv
DB_USER=app_user
DB_PASSWORD=change-this-to-a-strong-password
DB_NAME=ai_task_manager
DB_HOST=localhost
DB_PORT=5432
SECRET_KEY=replace-with-a-long-random-secret
\`\`\`

> The Docker Compose configuration sets the API container's database host to \`db\`. Keep real credentials out of source control; \`.env\` is ignored by Git.

### 3. Account for the current public snapshot

The current \`main.py\` imports \`ai_task_manager.routers.ai\`, but that file is not on the public branch yet. **Until the AI module is synchronized**, use a **temporary local core-only edit**:

\`\`\`python
# In main.py, use the routers that are currently committed:
from ai_task_manager.routers import tasks, users

# Keep the two committed router registrations:
app.include_router(tasks.router)
app.include_router(users.router)

# Temporarily remove / comment:
# app.include_router(ai.router)
\`\`\`

This workaround is only for the **current public snapshot** and is not necessary in the complete local AI development version.

### 4. Launch the core backend

\`\`\`bash
docker compose up --build -d
docker compose exec api uv run --no-sync alembic -c src/ai_task_manager/alembic.ini upgrade head
\`\`\`

After startup:

| Resource | URL |
| :--- | :--- |
| Interactive API documentation | [http://localhost:8000/docs](http://localhost:8000/docs) |
| OpenAPI specification | [http://localhost:8000/openapi.json](http://localhost:8000/openapi.json) |
| Health-style root response | [http://localhost:8000/](http://localhost:8000/) |

> [!NOTE]
> The \`/\` endpoint is a basic status response, **not** a comprehensive dependency health check. For the local AI extensions, additional Redis, Worker, vector database, OCR, and API-key configuration is required.

## API Reference

The committed backend exposes the following endpoints:

| Method | Endpoint | Purpose | Authentication |
| :--- | :--- | :--- | :--- |
| \`POST\` | \`/users\` | Register a user | No |
| \`POST\` | \`/login\` | Obtain JWT access token | No |
| \`GET\` | \`/me\` | Get current user | Bearer |
| \`GET\` | \`/my/tasks\` | List own tasks | Bearer |
| \`POST\` | \`/my/tasks\` | Create a task | Bearer |
| \`PATCH\` | \`/my/tasks/{task_id}\` | Update own task | Bearer |
| \`DELETE\` | \`/my/tasks/{task_id}\` | Delete own task | Bearer |
| \`GET\` | \`/\` | Basic API status | No |

<details>
<summary><strong>Example: create and retrieve tasks</strong></summary>

**1. Register**

\`\`\`bash
curl -X POST http://localhost:8000/users \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","email":"demo@example.com","password":"your-password"}'
\`\`\`

**2. Log in**

\`\`\`bash
curl -X POST http://localhost:8000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"your-password"}'
\`\`\`

Copy the returned \`access_token\`.

**3. Create a task**

\`\`\`bash
curl -X POST http://localhost:8000/my/tasks \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Review RAG architecture","description":"Document retrieval pipeline","completed":false}'
\`\`\`

**4. List your tasks**

\`\`\`bash
curl http://localhost:8000/my/tasks \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
\`\`\`

</details>

## Engineering Decisions

A strong backend is defined as much by its **failure handling and data boundaries** as by its happy path.

| Concern | Design decision |
| :--- | :--- |
| **Authorization** | Validate bearer tokens and filter task queries by the authenticated user's ID |
| **Password safety** | Store Argon2 password hashes rather than plaintext credentials |
| **Data integrity** | Enforce username/email uniqueness and return \`409 Conflict\` for duplicates |
| **Schema evolution** | Manage database changes through versioned Alembic migrations |
| **Testability** | Replace database dependencies in integration tests and verify cross-user access controls |
| **Duplicate agent actions** *(local)* | Use an idempotency key and DB uniqueness guarantee to prevent duplicate creates |
| **Long-running ingestion** *(local)* | Queue document processing outside the HTTP request lifecycle |
| **Evidence-based answers** *(local)* | Ground generation in retrieved passages and include source identifiers |

### Testing and CI

The repository includes a pytest suite covering registration, login, protected task CRUD, persistence, and user-isolation scenarios.

\`\`\`bash
# Requires an accessible PostgreSQL test database:
# ai_task_manager_test, with DB_* and SECRET_KEY configured.
uv sync --frozen
uv run pytest
\`\`\`

GitHub Actions defines a PostgreSQL 18 service for CI and runs the suite on pushes and pull requests.

> Test coverage percentages, latency improvements, hallucination-reduction scores, and retrieval metrics are intentionally **not published without reproducible measurements**.

## Project Layout

\`\`\`text
ai-task-manager/
├── .github/workflows/ci.yml       # PostgreSQL-backed CI tests
├── main.py                        # FastAPI application entry point
├── src/ai_task_manager/
│   ├── auth.py                    # JWT, passwords, current user
│   ├── database.py                # Engine and session lifecycle
│   ├── models.py                  # SQLAlchemy ORM models
│   ├── schemas.py                 # Pydantic contracts
│   ├── routers/
│   │   ├── users.py               # Registration, login, profile
│   │   └── tasks.py               # User-scoped CRUD
│   └── alembic/                  # Versioned migrations
├── tests/                         # Integration tests and fixtures
├── Dockerfile
├── compose.yaml
├── pyproject.toml
└── uv.lock
\`\`\`

*Tree reflects files currently present on the public branch; local AI modules are not listed as committed files.*

## Roadmap

- [x] Authenticated FastAPI backend with PostgreSQL persistence
- [x] JWT-protected user-scoped task CRUD
- [x] SQLAlchemy models and Alembic migrations
- [x] Docker Compose and PostgreSQL-backed CI
- [x] Local LLM tool-calling and streamed responses
- [x] Local RAG, PDF/OCR ingestion, and Redis/RQ jobs
- [ ] Sync AI extensions and integration tests to the public repository
- [ ] Add heading-aware / structure-aware document chunking
- [ ] Add structured citation validation and RAG evaluation datasets
- [ ] Benchmark retrieval quality, job latency, and reliability under load
- [ ] Provide screenshots and a reproducible end-to-end AI demo

---

<div align="center">

**Built with Python, grounded in backend engineering, and extended toward reliable agentic systems.**

<sub>Designed and developed as an independent engineering project.</sub>

<br /><br />

[Back to top ↑](#-ai-task-manager)

</div>
