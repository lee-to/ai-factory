# Microservices Architecture

Microservices architecture decomposes an application into a collection of loosely coupled, independently deployable services, each responsible for a distinct business capability aligned with a Bounded Context.

Each microservice owns its datastore, can be developed and deployed autonomously by a dedicated team, and communicates with other services through versioned APIs or asynchronous messaging.

---

## 1. Why this Architecture Exists

Well-structured monoliths — even those using Explicit Architecture with clean bounded contexts — eventually reach organizational and operational limits:
- **Deployment contention:** A single monolith codebase requires coordinated release trains. One broken commit delays shipping for the entire engineering organization.
- **Scaling bottlenecks:** Different features have wildly different resource footprints (e.g., CPU-heavy image processing vs I/O-heavy chat). In a monolith, scaling the CPU-heavy component scales the entire application.
- **Blast radius:** A memory leak or unhandled panic in a non-critical module can crash the entire system.
- **Data storage constraints:** A monolith typically shares a single database engine, preventing optimal choices (e.g., using a time-series DB for metrics and a relational DB for billing).

**The Tradeoff:** Microservices introduce massive operational complexity: distributed transactions, network latency, eventual consistency, service discovery, and tracing. They are justified only when the organizational pain of a monolith exceeds the operational overhead of distribution.

---

## 2. When to Use & When NOT to Use

### When to Use
- Large engineering organizations (20+ engineers across multiple autonomous squads).
- Systems with distinct, conflicting scalability or performance requirements.
- Systems requiring polyglot persistence (e.g., SQL + Graph + Vector + Redis).
- Organizations where teams need full autonomous control over their tech stack and deployment cadence.

### When NOT to Use
- Small teams (< 10 developers).
- Early-stage startups exploring product-market fit with rapidly changing domain boundaries.
- Simple CRUD systems or systems with tightly coupled transactions across all entities.

---

## 3. Organization Variants

> **Note on Naming & Casing Flexibility:** Directory names (`Api/`, `Application/`, `Domain/`, `Infrastructure/`, `Libs/`) represent architectural boundaries. Adapt casing and naming to your language and framework conventions.

### Variant A: Folder Structure — Single Service (Polyrepo)

When a team maintains an individual service in its own Git repository:

```text
[ServiceName]/
├── src/
│   ├── Api/                                    # Inbound adapters (HTTP REST / gRPC handlers)
│   │   # ── Style 2: Unified Multi-Action ──
│   │   ├── Admin/                              # [Channel] folder (omit when single-channel)
│   │   │   └── [EntityName]Controller.{ext}
│   │   ├── Public/                             # [Channel] folder (omit when single-channel)
│   │   │   └── [EntityName]Controller.{ext}
│   │   └── Middleware/                         # Auth, rate limiting, logging
│   │   # ── Style 1: Feature Subfolders ──
│   │   # ├── [Channel]/
│   │   # │   ├── _Shared/                    # Intra-channel shared helpers
│   │   # │   └── [FeatureName]/[FeatureName]Controller.{ext}
│   │   # └── Middleware/
│   │
│   ├── Application/                            # Use cases & application orchestration
│   │   # ── Style 2: Unified Multi-Action ──
│   │   └── [EntityName]Service.{ext}
│   │   # ── Style 1: Feature Subfolders ──
│   │   # └── [FeatureName]/
│   │   #     ├── [FeatureName]Service.{ext}
│   │   #     └── [FeatureName]Dto.{ext}
│   │
│   ├── Domain/                                 # Pure business logic, entities, ports
│   │   ├── [EntityName].{ext}
│   │   └── Ports/                              # Interfaces for database, publishers, clients
│   │
│   └── Infrastructure/                         # Outbound adapters
│       ├── Persistence/                        # Database repository implementations
│       ├── Messaging/                          # Kafka / RabbitMQ event publishers
│       └── External/                           # Clients calling other microservices
│
├── tests/                                      # Unit, integration, and contract tests
├── migrations/                                 # Database migrations schema
├── Dockerfile
└── README.md
```

---

### Variant B: Folder Structure — Multiple Services (Monorepo)

When multiple services coexist in a single repository:

```text
repo-root/
├── [ServiceNameA]/                             # Autonomous microservice A
│   ├── src/                                    # Same internal structure as single service
│   ├── tests/
│   ├── migrations/
│   └── Dockerfile
│
├── [ServiceNameB]/                             # Autonomous microservice B
│   └── ...
│
├── Libs/                                       # ── SHARED MONOREPO LIBRARIES ──
│   ├── Contracts/                              # Shared API schemas, event protobufs/DTOs
│   ├── Common/                                 # Shared logging, telemetry, auth helpers
│   └── Testing/                                # Test containers, mock fixtures
│
├── Gateway/                                    # API Gateway / BFF (Backend for Frontend)
│   └── ...
│
└── Infra/                                      # Infrastructure-as-Code & deployment
    ├── docker-compose.yml
    └── Deploy/                                 # Helm charts, Terraform, K8s manifests
```

---

## 4. Monorepo vs Polyrepo Comparison

| Criterion | Monorepo | Polyrepo |
|---|---|---|
| **Code Sharing** | Easy (direct import of `Libs/Contracts`) | Requires versioned packages (npm/artifactory) |
| **Atomic Refactoring** | Feasible across services in one commit | Complex; requires multi-step deprecation |
| **CI/CD Pipeline** | Needs smart tooling (Turborepo, Nx, Bazel) | Simpler, isolated pipelines per repo |
| **Team Isolation** | Soft (codeowners, branch permissions) | Hard (independent repository access) |
| **Best for** | Fast-evolving startups & tight service groups | Large enterprises with autonomous squads |

> 💡 **Migrating from Polyrepo to Monorepo:** To consolidate fragmented microservice repositories into a unified monorepo while preserving full Git commit history, see **[Architecture Migrations — Microservices Polyrepo to Monorepo](./MIGRATIONS.md#6-migration-microservices-polyrepo--monorepo)**.

---

## 5. Key Principles

1. **Service Autonomy:** Each service owns its data, runtime, and deployment pipeline. A service must be developable, testable, and deployable without coordinating with other teams.
2. **API-First Contract:** Public interfaces (OpenAPI, gRPC Protobuf, AsyncAPI) are versioned and agreed upon before implementation. Breaking changes must follow strict semantic versioning and parallel run periods.
3. **Smart Endpoints, Dumb Pipes:** Business logic lives inside the services, never in the message bus or API gateway.
4. **Design for Failure:** Every network call across service boundaries can fail. Services must implement resilience patterns: timeouts, retries with exponential backoff, circuit breakers, and fallbacks.
5. **Decentralized Governance:** Teams are free to choose the optimal programming language and datastore for their service's specific requirements.
6. **Single Responsibility:** One service = one business capability.
7. **Idempotency by Design:** Because distributed networks guarantee at-least-once delivery, state mutation endpoints and event consumers must be idempotent (supporting `Idempotency-Key` headers or database deduplication) to guarantee safe retries.
8. **Distributed Tracing & Correlation:** Inbound requests at the API Gateway receive a unique `X-Correlation-ID` (or W3C TraceContext) that must be propagated across all downstream HTTP/gRPC calls and message headers, and attached to every log record.

---

## 6. Distributed Patterns

### 6.1 Communication Strategy
- **Synchronous (REST / gRPC):** Used strictly for read queries requiring real-time response.
- **Asynchronous (Events / Message Queues):** Used for state mutations, commands, and cross-service notifications to maintain loose coupling.

### 6.2 Data Consistency & Saga Pattern
Direct cross-service database transactions are strictly forbidden. Distributed transactions must be handled via the **Saga Pattern**:
- **Choreography:** Services react to domain events published by other services (decentralized, best for simple workflows).
- **Orchestration:** A central Saga Orchestrator coordinates the steps and issues compensating transactions on failure (best for complex business workflows like checkout).

### 6.3 Transactional Outbox Pattern
To prevent dual-write bugs (updating a database record but failing to publish an event to Kafka/RabbitMQ), services must use the **Transactional Outbox Pattern**:
1. Save the entity change and the domain event into an `outbox` table within the same local database transaction.
2. A separate background worker reads the `outbox` table and publishes the events to the message broker reliably.

### 6.4 API Gateway & BFF (Backend for Frontend)
An API Gateway acts as the single entry point for clients, aggregating data from multiple downstream services, handling authentication, and terminating TLS.

---

## 7. Anti-Patterns to Avoid

- ❌ **Distributed Monolith:** Services coupled through synchronous HTTP calls that must be deployed together in a specific order. Negates all benefits while multiplying operational pain.
- ❌ **Shared Database:** Multiple microservices reading and writing directly to the same database tables. Completely destroys service autonomy.
- ❌ **Chatty Services:** Deep synchronous call chains (Service A → Service B → Service C → Service D) for a single client request, multiplying latency and failure risk.
- ❌ **No Observability:** Deploying microservices without centralized logging, distributed tracing (OpenTelemetry), and health metrics.
- ❌ **Premature Decomposition:** Breaking a system into microservices before the business domain is understood, locking in the wrong boundaries.
- ❌ **Nano-Services:** Services broken down so finely that operational overhead dwarfs the actual business code.
- ❌ **Cascading Failures:** A failure in one downstream dependency takes down the whole system due to lack of circuit breakers and timeouts.
- ❌ **Shared Domain Library:** Packaging core domain models or database entities into a shared package (npm, NuGet, Go module) imported by multiple microservices. This creates tight compile-time coupling and coordinated release bottlenecks.
- ❌ **Sync-over-Async:** Publishing an asynchronous message and holding an HTTP thread open waiting for a response, multiplying latency and thread exhaustion risk.
- ❌ **Distributed Two-Phase Commit (2PC):** Attempting to coordinate ACID transactions across multiple microservice databases using distributed locks or XA protocols. Use the Saga pattern with compensating actions instead.
