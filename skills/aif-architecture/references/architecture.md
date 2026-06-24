# Architecture Knowledge Base

Reference material for architecture evaluation and generation. This content informs the generation of the `ARCHITECTURE.md` file based on project context.

## Decision Matrix

| Factor                 | Layered | Structured Modules | Explicit Architecture | Explicit Architecture (Vertical Slice) | Microservices  |
|------------------------|---------|--------------------|-----------------------|----------------------------------------|----------------|
| Team size              | 1-5     | 3-10               | 5-30                  | 5-30                                   | 20+            |
| Domain complexity      | Low     | Medium             | High                  | High                                   | High           |
| Scale requirements     | Low     | Low-Moderate       | Moderate-High         | Moderate-High                          | Very High      |
| Feature independence   | Low     | Medium             | Medium                | High                                   | Very High      |
| Module boundaries      | None    | Soft               | Hard                  | Hard                                   | Hard (network) |
| Domain purity          | ❌       | Encouraged         | Enforced              | Enforced                               | Varies         |
| Initial velocity       | ✅ Fast  | ✅ Fast             | Medium                | Medium                                 | ❌ Slow         |
| Operational complexity | ✅ Low   | ✅ Low              | Medium                | Medium                                 | ❌ High         |
| Testing complexity     | Medium  | Medium             | ✅ Low (ports)         | ✅ Low (ports)                          | Medium-High¹   |
| Learning curve         | ✅ Low   | Low-Medium         | Medium-High           | Medium-High                            | High           |
| Deployment model       | Single  | Single             | Single                | Single                                 | Multi-service  |

¹ Unit tests are easy per service, but integration/contract tests across services add significant complexity.

**Note on subvariants:** Each pattern offers multiple folder organization variants (e.g., *by technical layer*, *by vertical slice*). The matrix evaluates the architectural pattern — organization variants within the same pattern generally share the same scores because they differ in internal folder layout, not in architectural characteristics. When a variant affects feature independence (e.g., Explicit Architecture (Vertical Slices By Entity) scores higher than with Technical Layers), the matrix uses a separate column for that variant rather than showing ranges. The organization variant is chosen separately based on module/context size and feature independence needs.

## Terminology

All folder structures in this document use consistent placeholder names:

| Placeholder | Meaning | Examples | Maps to |
|---|---|---|---|
| `[EntityName]` | Core domain model — a data entity with identity and business rules | `User`, `Order`, `Product`, `Invoice` | Models, Repositories, Domain layer |
| `[FeatureName]` | A use case scoped to a **single entity** | `CreateUser`, `UpdateProfile`, `DeleteProduct` | Entity slice: Controller methods, Action classes, Service classes |
| `[ProcessName]` | An orchestration spanning **multiple entities** — cross-entity business process | `PlaceOrder`, `Checkout`, `TransferFunds`, `OnboardCustomer` | Process slice (alongside entity slices in `Slices/`) |
| `[ModuleName]` | A feature module grouping related entities and processes (Structured Modules) | `Auth`, `Catalog`, `Payments` | Top-level module folder |
| `[ContextName]` | A bounded context with its own ubiquitous language (Explicit Architecture) | `Identity`, `Ordering`, `Inventory` | Top-level context folder |
| `[ServiceName]` | An independently deployable microservice | `OrderService`, `PaymentGateway` | Microservice root folder |

**Slice types:** Both `[EntityName]` and `[ProcessName]` live as siblings inside `Slices/`. Entity slices group use cases for a single entity. Process slices group orchestration logic that spans multiple entities.

**File organization choice — "Unified vs Granular":** For each slice type, every file category (Controllers, Services, Actions, DTOs, Repositories) can be organized in two ways:
- **Unified (one file per entity/process):** A single `[EntityName]Controller.{ext}` contains all handler methods. A single `[EntityName]Service.{ext}` contains all entity-scoped use cases. Simpler for small slices with few use cases.
- **Granular (one file per feature):** Separate `[FeatureName]Controller.{ext}` or `[FeatureName]Action.{ext}` files, each handling a single use case. Better for complex slices with many use cases.

Choose uniformly within a slice — don't mix unified Controllers with granular Services.

## Quick Decision Guide

```text
New project, small team, simple domain? → Layered
Growing project, need structure but not full formalism? → Structured Modules
Complex business logic, many rules? → Explicit Architecture
Many independent features, long-lived? → Explicit Architecture (Vertical Slice By Entity)
Multiple subdomains, large team? → Explicit Architecture or Explicit Architecture (Vertical Slice By Entity) or Explicit Architecture (Flat Vertical Slice - Simplified)
Independent scaling + large org? → Microservices
Simple CRUD app? → Layered Architecture
Unclear requirements? → Start with Structured Modules, evolve to Explicit when patterns emerge
```

## Evolution Triggers

Signals that indicate it's time to migrate to a more structured architecture:

```text
Layered → Structured Modules:
- Services grow beyond 500 LOC and mix unrelated features
- Cross-feature imports form a tangled web
- Testing a service requires mocking half the application
- New features consistently touch 5+ files across the entire src/ tree

Structured Modules → Explicit Architecture:
- Domain logic leaks into services despite convention (business rules in orchestrators)
- Need to swap infrastructure (DB, messaging) without touching domain
- Multiple teams work on the same module and step on each other
- Module "Infrastructure/" grows uncontrollably — sign of missing domain boundaries

Monolith (any pattern) → Microservices:
- Different parts of the system need independent scaling
- Teams are blocked by coordinated deployments
- Polyglot persistence is required (SQL + NoSQL + search)
- A single team's deploy failure blocks all other teams
```


## Structured Modules

**Core Principle:** A lightweight, domain-aware modular architecture. Each module encapsulates a feature area with its own routes, application services (orchestrators), rich models, and repositories. It brings the core benefits of DDD (rich models, dependency inversion) without the strict folder formalism.

**Why this architecture exists:** Traditional Layered Architecture often degrades into "Transaction Scripts" (anemic models + fat services) as projects grow. Full Explicit Architecture avoids this but has a steep learning curve. Structured Modules sits in the middle: it enforces rich models and interface-based dependency inversion within a simpler folder structure, making eventual migration to Explicit Architecture trivial.

**IMPORTANT: Domain-Centric, not Service-Centric:** Unlike traditional layered patterns, Structured Modules is **not** service-centric. The `Services/` layer acts only as Application Services (orchestrating use cases: fetch data → call model method → save). The actual core business rules, validations, and state mutations live strictly inside the `Models/` (Rich Domain Models).

**Migration path to Explicit Architecture:**
```text
Structured Modules                           Explicit Architecture
├── [ModuleName]/                            ├── [ContextName]/
│   ├── Models/          ── enrich ──>       │   ├── Domain/          ← extract domain logic
│   ├── Services/        ── split ───>       │   ├── Application/     ← separate CQRS (optional)
│   ├── Repositories/    ── interface ──>    │   ├── Infrastructure/  ← implement ports
│   └── Controllers/     ── formalize ──>    │   └── Presentation/    ← formalize adapters
└── Infrastructure/      ── same ───>        └── Infrastructure/
```

**Organization Variants:** Within a module, code can be organized in two ways:
- **By technical layer** — `Controllers/`, `Services/`, `Repositories/` as separate folders.
- **By vertical slice (entity)** — grouping the controller, service, and repository for a specific entity into a single folder. Within each entity slice, individual use cases can optionally be extracted into separate classes. Cross-entity processes live at the module level.

### Folder Structure — Structured Modules (Technical Layer)
```text
src/
├── [ModuleName]/                               # ── FEATURE MODULE ──
│   ├── Controllers/                            # HTTP handlers, request validation
│   │   └── [EntityName]Controller.{ext}
│   ├── Services/                               # Application Services
│   │   ├── [EntityName]Service.{ext}
│   │   └── [ProcessName]Service.{ext}          # Cross-entity orchestration (e.g. PlaceOrderService)
│   ├── Repositories/                           # Data access (interface + impl in same module)
│   │   └── [EntityName]Repository.{ext}
│   └── Models/                                 # Domain models / DTOs
│       ├── [EntityName].{ext}
│       └── [FeatureName]Dto.{ext}
├── [AnotherModuleName]/
│   └── ...                                     # Same internal structure
└── Infrastructure/                             # ── INFRASTRUCTURE (cross-cutting) ──
    ├── Types/                                  # Shared type definitions
    ├── Utils/                                  # Utility functions
    ├── Middleware/                             # HTTP middleware, auth, error handling
    └── Config/                                 # App configuration, database setup
```

### Folder Structure — Structured Modules (Vertical Slices By Entity)
```text
src/
├── [ModuleName]/                               # ── FEATURE MODULE ──
│   ├── Slices/                                 # Slices grouped by entity and process
│   │   ├── [EntityNameA]/                      # Entity slice (e.g., User)
│   │   │   ├── [EntityNameA]Controller.{ext}   # Unified: all actions in one controller
│   │   │   ├── [EntityNameA]Service.{ext}      # Unified: all use cases in one service
│   │   │   └── [EntityNameA]Repository.{ext}   # Data access for EntityNameA
│   │   │
│   │   ├── [EntityNameB]/                      # Entity slice (e.g., Role)
│   │   │   └── ...
│   │   │
│   │   └── [ProcessName]/                      # Process slice — cross-entity orchestration
│   │       ├── [ProcessName]Controller.{ext}   # Unified: all actions in one controller
│   │       └── [ProcessName]Service.{ext}      # Unified: orchestration logic
│   │
│   ├── Models/                                 # Rich Domain Models stay shared within the module
│   │   ├── [EntityNameA].{ext}
│   │   └── [EntityNameB].{ext}
│   │
│   └── Infrastructure/                         # Shared utilities strictly within this module
│
├── [AnotherModuleName]/
│   └── ...
│
└── Infrastructure/                             # ── INFRASTRUCTURE (cross-cutting globally) ──
    └── ...
```

**Dependency Rules (Strict Direction):**
- **Strict Downward Flow:** Dependencies must point strictly in one direction: `Controllers → Services → Repositories`. Inner layers (e.g., Repositories, Models) MUST NEVER depend on outer layers (e.g., Controllers).
- **No Layer Skipping:** Controllers must not bypass the Service layer to call Repositories directly.
- **Module Isolation:** Modules depend on root `Infrastructure/` for shared types, utilities, and middleware, but NOT on each other's internals. Cross-module dependencies must only use defined public APIs.

**Key Principles:**
1. **Module Boundaries:** Each module encapsulates a feature area. Modules have a public API. Other modules MUST use this public API and never reach into internals.
2. **Dependency Inversion (lightweight):** Services receive dependencies through constructor injection. Repository interfaces are encouraged to prepare for a future Infrastructure layer split.
3. **Domain Awareness:** While service classes orchestrate use cases, core domain logic and validation should be pushed into the models.
4. **Separation from DDD:** Unlike full DDD, Structured Modules does not enforce strict Aggregate roots, isolated Domain Events, or rigid hexagonal ports. Services act as the primary orchestrators of use cases (Application Services), delegating core business rules to the rich models. This provides a pragmatic middle ground between traditional service-heavy layered architectures and complex DDD setups.
5. **Infrastructure is Minimal:** The root `Infrastructure/` folder (cross-cutting concerns: Types, Utils, Middleware, Config) should stay small.

**Anti-Patterns:**
- ❌ **Anemic Domain Models:** Creating models that are just "data bags" (only getters/setters without behavior). Models should encapsulate their own invariants and rules. This prevents logic from leaking into services and prepares the ground for Explicit Architecture.
- ❌ **Layer Skipping:** Controllers interacting directly with Repositories.
- ❌ **Upward Dependencies:** Services importing Controllers, or Models importing Services.
- ❌ Circular module dependencies — module A imports module B, B imports A. Use shared types or events.

## Explicit Architecture

**Core Principle:** The domain is the center of the application. Everything else (frameworks, databases, UI) is a peripheral detail that plugs into the domain through well-defined interfaces. Dependencies always point **inward** — outer layers ALWAYS depend on inner layers, and inner layers NEVER import from outer layers.

**Domain-Driven Design (DDD)** is primarily about domain modeling: defining a ubiquitous language, identifying bounded contexts, and organizing logic into aggregates, entities, and value objects. DDD is **not** a folder structure. Explicit Architecture provides a way to structure code that implements DDD concepts cleanly.

**Architecture Layers** (5 concentric layers, innermost to outermost):
```text
┌─────────────────────────────────────────────────────┐
│  5. CONFIGURATION / COMPOSITION ROOT                │  DI container, wiring, bootstrap
├─────────────────────────────────────────────────────┤
│  4. PRESENTATION / ADAPTERS (inbound)               │  HTTP handlers, CLI commands, Web views
├─────────────────────────────────────────────────────┤
│  3. INFRASTRUCTURE / ADAPTERS (outbound)            │  DB repos, external APIs, messaging
├─────────────────────────────────────────────────────┤
│  2. APPLICATION LAYER                              │  Use cases, services, DTOs
├─────────────────────────────────────────────────────┤
│  1. DOMAIN LAYER (center)                          │  Entities, Value Objects, Domain Events,
│                                                    │  Ports (interfaces), Exceptions
└─────────────────────────────────────────────────────┘
```

**Dependency rule:** Dependencies point INWARD. Outer layers implement interfaces (ports) defined by inner layers. Inner layers NEVER import from outer layers.

**Organization Variants:** Within each bounded context, code can be organized in three ways:
- **By technical layer** — Application/, Infrastructure/, Presentation/ as separate top-level folders inside the context.
- **By vertical slice (entity)** — each entity (`[EntityName]`) gets its own folder containing its Application, Infrastructure, and Presentation subfolders. Within each entity slice, individual use cases are organized as `[FeatureName]` actions. Domain stays shared across slices within the context.
- **Flat vertical slice (simplified)** — same as vertical slice but all related files (controllers, DTOs, services) live side-by-side within the entity folder, omitting the Application/Infrastructure/Presentation subfolders. Individual use cases are still represented as `[FeatureName]` files. Best for smaller entities or when maximum cohesion is preferred over strict layer separation.

### Folder Structure — Explicit Architecture (Technical Layer)

```text
src/
├── [ContextName]/                              # ── BOUNDED CONTEXT ──
│   ├── Domain/                                 # PURE DOMAIN (zero external deps)
│   │   ├── Enums/
│   │   ├── Exceptions/
│   │   └── Ports/                              # Interfaces only
│   │
│   ├── Application/                            # ALL USE CASES (entity-scoped + cross-entity)
│   │   ├── [EntityName]/                       # Entity-scoped use cases, DTOs
│   │   └── [ProcessName]Service.{ext}          # Cross-entity orchestration (e.g. PlaceOrderService)
│   │
│   ├── Infrastructure/                         # INFRASTRUCTURE (adapters)
│   │   ├── Persistence/                        # Implements Domain Port
│   │   ├── External/                           # External API adapters
│   │   └── Messaging/                          # Event publishers
│   │
│   └── Presentation/                           # PRESENTATION (delivery mechanism)
│       ├── Api/                                # JSON endpoints
│       │   ├── Admin/                          # Backoffice API
│       │   │   └── [EntityName]Controller.{ext}
│       │   └── Public/                         # Public API
│       │       └── [EntityName]Controller.{ext}
│       ├── Web/                                # HTML views & controllers
│       │   ├── Admin/                          # Backoffice Web
│       │   │   └── [EntityName]Controller.{ext}
│       │   └── Public/                         # Public Web
│       │       └── [EntityName]Controller.{ext}
│       └── Cli/                                # Console commands
│           └── [EntityName]Command.{ext}
│
├── [AnotherContextName]/
│   └── ...
│
└── Infrastructure/                             # ── APPLICATION-WIDE (used across all bounded contexts) ──
    ├── Utils/                                  # Shared utility classes and helpers
    ├── Adapters/                               # Cross-context infrastructure adapters
    ├── Migrations/                             # Database migrations (schema versioning)
    └── External/                               # External API adapters
```

### Folder Structure — Explicit Architecture (Vertical Slice By Entity)

```text
src/
├── [ContextName]/                              # ── BOUNDED CONTEXT ──
│   ├── Domain/                                 # PURE DOMAIN (shared across slices)
│   │   ├── Enums/
│   │   ├── Exceptions/
│   │   └── Ports/
│   │
│   ├── Slices/
│   │   ├── [EntityName]/                       # Entity slice — use cases for this entity only
│   │   │   ├── Application/                    # Entity-scoped use cases
│   │   │   │   ├── [EntityName]Service.{ext}   # Unified: all use cases in one file
│   │   │   │   └── [FeatureName]Dto.{ext}      # e.g. CreateUserDto, UpdateProfileDto
│   │   │   ├── Infrastructure/                 # Adapters for this entity
│   │   │   │   └── [EntityName]Repository.{ext}
│   │   │   └── Presentation/                   # Delivery mechanism for this entity
│   │   │       ├── Api/
│   │   │       │   ├── Admin/
│   │   │       │   │   └── [EntityName]Controller.{ext}   # Unified: all actions in one controller
│   │   │       │   └── Public/
│   │   │       │       └── [EntityName]Controller.{ext}
│   │   │       ├── Web/
│   │   │       │   ├── Admin/
│   │   │       │   │   └── [EntityName]Controller.{ext}
│   │   │       │   └── Public/
│   │   │       │       └── [EntityName]Controller.{ext}
│   │   │       └── Cli/
│   │   │           └── [EntityName]Command.{ext}
│   │   │
│   │   └── [ProcessName]/                      # Process slice — cross-entity orchestration
│   │       ├── Application/                    # Orchestration logic
│   │       │   └── [ProcessName]Service.{ext}  # e.g. PlaceOrderService
│   │       ├── Infrastructure/                 # Adapters for this process
│   │       └── Presentation/                   # Delivery mechanism for this process
│   │           ├── Api/
│   │           │   ├── Admin/
│   │           │   │   └── [ProcessName]Controller.{ext}
│   │           │   └── Public/
│   │           │       └── [ProcessName]Controller.{ext}
│   │           ├── Web/
│   │           │   └── [ProcessName]Controller.{ext}
│   │           └── Cli/
│   │               └── [ProcessName]Command.{ext}
│   │
│   └── Infrastructure/                         # Cross-slice adapters
│
├── [AnotherContextName]/
│   └── ...
│
└── Infrastructure/                             # ── APPLICATION-WIDE (used across all bounded contexts) ──
    ├── Utils/                                  # Shared utility classes and helpers
    ├── Adapters/                               # Cross-context infrastructure adapters
    ├── Migrations/                             # Database migrations (schema versioning)
    └── External/                               # External API adapters
```

### Folder Structure — Explicit Architecture (Flat Vertical Slice - Simplified)

For smaller entities or when striving for maximum locality (cohesion), the internal `Application/`, `Infrastructure/`, and `Presentation/` folders can be omitted. A "flat slice" places all related files side-by-side within the slice folder.

```text
src/
├── [ContextName]/                              # ── BOUNDED CONTEXT ──
│   ├── Domain/                                 # PURE DOMAIN (shared across slices)
│   │   ├── Enums/
│   │   ├── Exceptions/
│   │   └── Ports/
│   │
│   ├── Slices/
│   │   ├── [EntityName]/                       # Flat entity slice — all files side-by-side
│   │   │   ├── [EntityName]Controller.{ext}    # Unified: all actions in one controller
│   │   │   ├── [EntityName]Service.{ext}       # Unified: all use cases in one service
│   │   │   └── [EntityName]Repository.{ext}    # Data access
│   │   │
│   │   └── [ProcessName]/                      # Flat process slice — cross-entity orchestration
│   │       ├── [ProcessName]Controller.{ext}   # Unified: all actions in one controller
│   │       └── [ProcessName]Service.{ext}      # Unified: orchestration logic
│   │
│   └── Infrastructure/                         # Cross-slice adapters
│
├── [AnotherContextName]/
│   └── ...
│
└── Infrastructure/                             # ── APPLICATION-WIDE (used across all bounded contexts) ──
    ├── Utils/                                  # Shared utility classes and helpers
    ├── Adapters/                               # Cross-context infrastructure adapters
    ├── Migrations/                             # Database migrations (schema versioning)
    └── External/                               # External API adapters
```

**Naming convention:** If an entity is accessible via multiple interfaces, add a prefix to distinguish: `[Interface][EntityName]Controller.{ext}` (e.g. `AdminUserController`, `PublicUserController`).

### Core Principles

1. **Bounded Contexts:** Each bounded context represents a distinct business domain with its own ubiquitous language. A bounded context is a good candidate for extraction into its own microservice, though extraction usually requires operational, persistence, integration, and deployment work.
  - Cross-context communication happens through DTOs, facades, or domain events.
  - **Context Mapping:** Contexts communicate through strategic DDD relationship patterns like Customer/Supplier or Anti-Corruption Layer (ACL). Note that a Context Map is a strategic view of your system; an ACL is a specific integration pattern used within that map.

2. **Domain Layer Purity:** The domain layer has ZERO dependencies on frameworks, databases, or external services. Contains Entities, Aggregates, Value Objects, Domain Events, Ports (interfaces), and Domain Exceptions.

3. **Ports and Adapters (Hexagonal):** The domain defines interfaces (ports). Infrastructure implements them (adapters). Dependencies point INWARD.

4. **CQRS (Command Query Responsibility Segregation) is OPTIONAL:** Separating read and write models is a powerful pattern, but should NOT be considered mandatory for Explicit Architecture or DDD. Only use it when read/write use-case complexity or scaling needs justify the overhead.

5. **Vertical Slices** (when using the by-entity variant): Organize code by entity, not by technical layer. Each entity slice (`[EntityName]`) contains everything it needs across Application, Infrastructure, and Presentation. Domain entities stay shared in the context's Domain/ folder. Within each slice, individual use cases (`[FeatureName]`) are represented as action classes or methods.

6. **Port Abstraction for External Dependencies:**
   - All dependencies on external systems (databases, messaging systems, file systems, third-party APIs) MUST be defined as interfaces (ports) in the Domain layer.
   - Infrastructure layer implements these interfaces as adapters.
   - This enables testing the domain logic in isolation and swapping implementations without affecting the domain.

**Anti-Patterns:**
- ❌ Anemic Domain Model — entities with only getters/setters and no behavior.
- ❌ Leaking dependencies inward — importing framework types in the domain layer.
- ❌ CQRS everywhere — applying strict command/query separation to simple CRUD screens.
- ❌ God services — single application service handling all features.
- ❌ Circular module dependencies — module A imports module B, B imports A. Use shared types or events.

## Microservices

**Core Principle:** The application is decomposed into a set of loosely coupled, independently deployable services, each responsible for a distinct business capability (ideally aligned with a Bounded Context). Each microservice owns its data, can be developed, deployed, and scaled independently, and communicates with other services through well-defined APIs or asynchronous messaging. Internally, each service may use whatever local architecture fits best (Layered, Structured Modules, or Explicit Architecture).

**Why this architecture exists:** Well-structured monoliths — even those using Explicit Architecture with clean bounded contexts — eventually hit organizational and operational ceilings. A single deployment artifact forces every team to coordinate releases. A single database becomes a scaling bottleneck. A single runtime means one team's memory leak or CPU spike affects everyone. Microservices solve this by giving each team full ownership of their service's lifecycle — from development through deployment to monitoring. The tradeoff is significant operational complexity: distributed tracing, network-level failure modes, data consistency challenges, and the need for mature DevOps practices. This architecture pays off only when the organizational and scaling pain of a monolith outweighs the operational cost of distribution.

**When to Use:**
- Large teams needing independent deployment
- Different scaling requirements per service
- Polyglot persistence needs

**When NOT to Use:**
- Small team (< 10 people)
- Unclear domain boundaries
- Startups exploring product-market fit

### Folder Structure — Single Microservice (dedicated repo)

When a team works on a single microservice in its own repository:

```text
[ServiceName]/
├── src/
│   ├── Api/                                    # Inbound adapters (HTTP/gRPC/CLI handlers)
│   │   ├── [EntityName]Controller.{ext}
│   │   └── Middleware/                         # Auth, rate limiting, request validation
│   ├── Application/                            # Use cases / application services
│   │   └── [EntityName]Service.{ext}
│   ├── Domain/                                 # Core business logic, entities, value objects
│   │   ├── [EntityName].{ext}
│   │   └── Ports/                              # Interfaces for outbound dependencies
│   ├── Infrastructure/                         # Outbound adapters (DB, queues, external APIs)
│   │   ├── Persistence/
│   │   ├── Messaging/
│   │   └── External/
│   └── Config/                                 # Bootstrap, DI wiring, environment config
├── tests/
├── migrations/                                 # Database migrations
├── Dockerfile
└── README.md
```

### Folder Structure — Multiple Microservices (monorepo)

When several microservices coexist in a single repository:

```text
repo-root/
├── [ServiceNameA]/                             # Self-contained microservice
│   ├── src/                                    # Same internal structure as single service
│   ├── tests/
│   ├── migrations/
│   └── Dockerfile
│
├── [ServiceNameB]/
│   └── ...                                     # Same internal structure
│
├── Libs/                                       # ── SHARED LIBRARIES ──
│   ├── Contracts/                              # Shared API schemas, event definitions, DTOs
│   ├── Common/                                 # Cross-service utilities (logging, auth helpers)
│   └── Testing/                                # Shared test utilities and fixtures
├── Gateway/                                    # (Optional) API Gateway / BFF service
│   └── ...
└── Infra/                                      # Infrastructure-as-Code, CI/CD, docker-compose
    ├── docker-compose.yml
    └── Deploy/
```

**Monorepo vs Polyrepo:**
- **Monorepo** — all services in one repository. Easier code sharing, atomic cross-service refactors, single CI pipeline. Works well when services share contracts or evolve together.
- **Polyrepo** — one repository per service. Stronger isolation, independent release cycles, clearer ownership boundaries. Better for large organizations with autonomous teams.

### Key Principles

1. **Service Autonomy:** Each service owns its data, runtime, and deployment pipeline. A service can be developed, tested, deployed, and scaled independently without coordinating with other teams.
2. **API-First Contract:** Service interfaces (REST, gRPC, event schemas) are defined and versioned as contracts before implementation. Breaking changes require an explicit versioning strategy.
3. **Smart Endpoints, Dumb Pipes:** Business logic lives inside services, not in the communication layer. Message brokers and API gateways route messages — they don't transform or orchestrate them.
4. **Design for Failure:** Every inter-service call can fail. Services must handle failures gracefully using circuit breakers, retries with backoff, timeouts, and fallback strategies.
5. **Decentralized Governance:** Each team chooses the best tech stack for their service. Shared standards apply only to inter-service contracts and observability.
6. **Single Responsibility:** One service = one business capability. A service should be small enough for one team to own but large enough to justify the operational overhead.

### Distributed Patterns

- **Communication:** Choose **Synchronous** (REST/gRPC) for immediate responses (queries) and **Asynchronous** (Events/Commands) for side effects and loose coupling.
- **Data Consistency:** Cross-service transactions must use the **Saga Pattern** (Orchestration or Choreography). Direct database access between services is strictly forbidden.
- **API Entry Point:** Use an **API Gateway or BFF** (Backend for Frontend) to aggregate data, handle cross-cutting concerns (auth, rate limiting), and hide the internal service topology.

**Anti-Patterns:**
- ❌ **Distributed Monolith:** Services coupled via synchronous calls, must deploy together — negates all benefits.
- ❌ **Shared Database:** Multiple services accessing the same tables — hidden coupling, no independent deployment.
- ❌ **Chatty Services:** Long synchronous call chains for a single request — multiplied latency and failure points.
- ❌ **No Observability:** No centralized logging or distributed tracing — production debugging becomes a guessing game.
- ❌ **Premature Decomposition:** Splitting before domain boundaries are understood — wrong boundaries, expensive re-merges.
- ❌ **Nano-services:** Services so small that operational overhead dwarfs the business logic.
- ❌ **Cascading Failures:** One failure propagates through call chains. Mitigate with circuit breakers, timeouts, bulkheads.

## Layered Architecture

**Core Principle:** Separate concerns into horizontal layers. Each layer only depends on the layer directly below it. This is the simplest architectural pattern — easy to understand, easy to set up, and sufficient for small applications with straightforward business logic.

**Why this architecture exists:** Layered Architecture provides the minimum viable separation of concerns. It prevents the worst anti-pattern — spaghetti code where HTTP handling, business logic, and database access are mixed in the same function. For small teams and simple CRUD applications, this separation is enough. The tradeoff: as the project grows, the flat structure makes it hard to find where features live, and services tend to accumulate unrelated logic.

### Folder Structure

```text
src/
├── Controllers/                                # Request/response handling, input validation
│   └── [EntityName]Controller.{ext}
├── Services/                                   # Business logic layer
│   └── [EntityName]Service.{ext}
├── Models/                                     # Data models / entities
│   └── [EntityName].{ext}
├── Repositories/                               # Data access layer (queries, ORM calls)
│   └── [EntityName]Repository.{ext}
├── Routes/                                     # Route definitions (maps URLs to controllers)
├── Middleware/                                  # Cross-cutting: auth, error handling, logging
└── Utils/                                      # Shared utilities, helpers
```

**Note:** `Routes/`, `Middleware/`, and `Utils/` are configuration and cross-cutting directories, not core application layers. Routes define URL-to-controller mappings. Middleware and Utils provide shared infrastructure concerns (auth, logging, helpers) and are invoked by Controllers/Services but do not contain business logic.

### Key Principles

1. **Strict Downward Dependencies:** Each layer depends ONLY on the layer directly below it. No skipping layers, no upward imports.
2. **Single Responsibility per Layer:** Controllers handle HTTP concerns (parsing, validation, response formatting). Services contain business logic. Repositories handle data access. Mixing these responsibilities is the primary way layered architecture degrades.
3. **Thin Controllers:** Controllers should validate input, call one or two service methods, and format the response. If a controller contains business logic (if/else on domain state, calculations, multi-step orchestration), that logic belongs in a service.
4. **Stateless Services:** Services should not hold request state. They receive data as parameters, process it, and return results.

### Dependency Rules

```text
Routes → Controllers → Services → Repositories → Database
    ↓                                           ↑
Middleware (cross-cutting)              Models (shared data structures)
    ↓                                           ↑
Utils (cross-cutting)                  Config (cross-cutting)
```

- Routes → Controllers → Services → Repositories → Database
- No skipping layers (controllers should not call repositories directly)
- Models are shared data structures (DTOs, entities) consumed by Services and Repositories — not a separate layer
- Middleware and Utils are cross-cutting concerns invoked alongside the main request flow, not a third column in the dependency chain

### Migration Path to Structured Modules

```text
Layered Architecture                         Structured Modules
src/                                         src/
├── Controllers/         ── group by ──>     ├── [ModuleName]/
│   ├── UserController.{ext}                 │   ├── Controllers/UserController.{ext}
│   └── OrderController.{ext}                │   ├── Services/UserService.{ext}
├── Services/            ── entity ──>       │   ├── Repositories/UserRepository.{ext}
│   ├── UserService.{ext}                    │   └── Models/User.{ext}
│   └── OrderService.{ext}                   ├── [AnotherModuleName]/
├── Repositories/        ── entity ──>       │   └── ...
│   ├── UserRepository.{ext}                 └── Infrastructure/
│   └── OrderRepository.{ext}                    ├── Types/
├── Models/              ── entity ──>           ├── Utils/
│   ├── User.{ext}                               ├── Middleware/
│   └── Order.{ext}                              └── Config/
├── Routes/              ── to Controllers ──>    (Routes map to Controllers)
├── Middleware/           ── to Infrastructure ──> (Middleware to Infrastructure/)
└── Utils/                ── to Infrastructure ──> (Utils to Infrastructure/)
```

**Anti-Patterns:**
- ❌ **God Controller:** A controller that contains business logic, database calls, and response formatting all in one method. Split into controller (HTTP) + service (logic) + repository (data).
- ❌ **Business Logic in Routes/Middleware:** Placing validation rules, authorization checks with business context, or data transformations in middleware. Middleware handles cross-cutting concerns (auth token verification, rate limiting, request logging), not domain rules.
- ❌ **Layer Skipping:** Controllers calling repositories directly, or routes calling services without going through controllers.
- ❌ **Upward Dependencies:** Services importing controllers, or repositories importing services.
- ❌ **Shared Mutable State:** Services storing request-scoped state in module-level variables instead of passing data through function parameters.

## Code Examples (Language-Agnostic Pseudo-Code)

These examples illustrate key architectural concepts. When generating `ARCHITECTURE.md`, adapt them to the project's actual language and framework.

### Rich Domain Model vs Anemic Domain Model

```text
// ✅ GOOD: Rich Domain Model — logic lives inside the model
class Order {
  items: OrderItem[]
  status: OrderStatus

  addItem(product, quantity) {
    if (this.status != DRAFT)
      throw CannotModifyFinalizedOrder()
    if (product.stock < quantity)
      throw InsufficientStock(product, quantity)

    this.items.push(new OrderItem(product, quantity))
    this.recalculateTotal()                              // ← encapsulated
  }

  finalize() {
    if (this.items.isEmpty())
      throw CannotFinalizeEmptyOrder()
    this.status = FINALIZED
    this.emit(OrderFinalized(this.id))                   // ← domain event
  }
}

// ❌ BAD: Anemic Model + Fat Service — logic lives outside the model
class Order {
  items: OrderItem[]
  status: OrderStatus
  total: number
  // no methods, just data
}

class OrderService {
  addItem(order, product, quantity) {
    if (order.status != DRAFT) throw Error("Cannot modify")  // ← logic OUTSIDE model
    if (product.stock < quantity) throw Error("No stock")
    order.items.push({ product, quantity })
    order.total = order.items.reduce((sum, i) => sum + i.product.price * i.quantity, 0)
  }
}
```

### Port and Adapter (Dependency Inversion)

```text
// ── DOMAIN LAYER: defines the Port (interface) ──
interface OrderRepository {                          // ← Port
  findById(id): Order
  save(order): void
}

// ── INFRASTRUCTURE LAYER: implements the Adapter ──
class PostgresOrderRepository implements OrderRepository {    // ← Adapter
  constructor(dbConnection) { ... }

  findById(id): Order {
    row = this.db.query("SELECT * FROM orders WHERE id = ?", id)
    return Order.fromRow(row)                         // ← maps DB row to domain entity
  }

  save(order): void {
    this.db.query("INSERT INTO orders ...", order.toRow())
  }
}

// ── COMPOSITION ROOT: wires Port to Adapter ──
orderRepo = new PostgresOrderRepository(dbConnection)
orderService = new OrderService(orderRepo)           // ← injected via constructor
```

### Application Service (Use Case Orchestration)

```text
// Application Service — orchestrates, does NOT contain business rules
class PlaceOrderService {
  constructor(orderRepo, customerRepo, paymentGateway, pricingService, eventPublisher) { ... }

  execute(command: PlaceOrderCommand) {
    order = this.orderRepo.findById(command.orderId)
    customer = this.customerRepo.findById(order.customerId)

    total = this.pricingService.calculateTotal(order.items, customer)  // ← domain service called here
    order.finalize(total)                              // ← entity receives VALUE, not service

    this.paymentGateway.charge(order.total)             // ← infrastructure call via port
    this.orderRepo.save(order)                          // ← persistence via port
    this.eventPublisher.publish(order.domainEvents())   // ← publish domain events
  }
}
```

### Domain Service vs Application Service

A **Domain Service** contains business logic that spans multiple entities/aggregates but has **zero infrastructure dependencies** (no DB, no HTTP, no messaging). It lives in the **Domain layer**.

An **Application Service** orchestrates use cases: loads data, calls domain logic, saves results, publishes events. It lives in the **Application layer**.

```text
// ── DOMAIN LAYER: Domain Service ──
// Pure business logic that doesn't belong to a single entity.
// No infrastructure deps — only domain objects in, domain objects out.
class PricingService {

  calculateTotal(items: OrderItem[], customer: Customer): Money {
    base = items.reduce((sum, item) => sum + item.price * item.quantity, Money.zero())

    // Business rule: logic spans Order + Customer — doesn't belong to either entity alone
    if (customer.tier == PREMIUM)
      return base.applyDiscount(Percent(10))
    if (base > Money(500))
      return base.applyDiscount(Percent(5))
    return base
  }
}

// ── DOMAIN LAYER: Entity receives computed value, not the service ──
class Order {
  finalize(total: Money) {
    if (this.items.isEmpty())
      throw CannotFinalizeEmptyOrder()
    this.total = total                                  // ← pure value, no service dependency
    this.status = FINALIZED
    this.emit(OrderFinalized(this.id, this.total))
  }
}

// ❌ BAD: Placing cross-entity logic in Application Service
class PlaceOrderService {
  execute(command) {
    order = this.orderRepo.findById(command.orderId)
    customer = this.customerRepo.findById(order.customerId)

    // This is domain logic disguised as orchestration!
    if (customer.tier == PREMIUM)                       // ← business rule leaked
      total = order.subtotal * 0.9                      //    into application layer
    else
      total = order.subtotal

    order.total = total                                  // ← model is anemic
    order.status = FINALIZED
    this.orderRepo.save(order)
  }
}
```

**When to use a Domain Service:**
- Logic involves **2+ entities/aggregates** and doesn't naturally belong to either one
- The operation is a **pure business rule** (no I/O, no infrastructure)
- Putting the logic in one entity would create an awkward dependency on the other

**When NOT to use (keep logic in the entity):**
- The rule involves only **one entity's own state** (e.g., `order.addItem()` — use the entity method)
- You're tempted to create a Domain Service for every operation — this leads to anemic models with all logic in services
