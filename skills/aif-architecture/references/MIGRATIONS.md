# Architecture Migrations & Evolution Guides

Architectural design is not a one-time static decision. As business complexity, data volume, and team sizes evolve, architectures must transition gracefully without requiring risky "Big Bang" rewrites.

This guide provides practical strategies, ASCII file tree mappings, transition triggers, and incremental step-by-step procedures for evolving systems across the architectural ladder.

---

## 1. The Architecture Evolution Ladder

Systems should naturally progress through architectural stages as specific organizational and technical pressures emerge:

```text
Layered Architecture ──► Structured Modules ──► Explicit Architecture ──► Microservices
      (1–3 devs)               (3–10 devs)              (5–20 devs)             (20+ devs)
   Simple CRUD / MVP         Modular Monolith          Domain Purity / DDD     Distributed Squads
```

### Core Evolution Principles:
1. **Never Migrate Preemptively:** Moving up the ladder too early incurs a heavy "Boilerplate Tax" and slows down product-market fit. Stay on the simplest pattern until explicit pain points emerge.
2. **Migrate Incrementally (Strangler Pattern):** Never pause feature delivery for a total rewrite. Extract one module, context, or service at a time.
3. **Respect Boundary Prerequisites:** You cannot safely extract a microservice from a tangled spaghetti codebase. The path to microservices always goes through modular isolation first.
4. **No Hard Naming or Casing Lock-in:** The folder names (`Controllers/`, `Services/`, `Domain/`, `_Shared/`) and PascalCase casing shown in transformation trees are conceptual architectural notations. During migrations, strictly adapt directory casing (`snake_case`, `kebab-case`, `lowercase`) and file structures to your target stack idioms.

---

## 2. Migration: Layered Architecture → Structured Modules

### 2.1 When to Migrate (Triggers & Pain Points)
- **Bloated Services:** Service classes exceed 500 lines of code and bundle 10+ unrelated responsibilities.
- **Tangled Imports:** Controllers and services import arbitrary classes across the entire application with no boundaries.
- **Heavy Mocking in Tests:** Testing a simple service method requires mocking half the application and database.
- **Diff Explosion:** Adding a single new feature consistently touches 5+ distant directories across `src/` (`Controllers/`, `Services/`, `Models/`, `Repositories/`, `Routes/`).

---

### 2.2 Visual File Tree Transformation

```text
Layered Architecture (Before)                  Structured Modules (After)
src/                                           src/
├── Controllers/                               ├── [ModuleNameA]/                # e.g., Ordering
│   ├── UserController.{ext}                   │   ├── Controllers/
│   └── OrderController.{ext} ───────┐         │   │   └── OrderController.{ext}
├── Services/                        │         │   ├── Services/
│   ├── UserService.{ext}            │         │   │   ├── OrderService.{ext}
│   └── OrderService.{ext} ──────────┼───────> │   │   └── PlaceOrderService.{ext}
├── Repositories/                    │         │   ├── Repositories/
│   ├── UserRepository.{ext}         │         │   │   └── OrderRepository.{ext}
│   └── OrderRepository.{ext} ───────┤         │   └── Models/
├── Models/                          │             └── Order.{ext}               # Rich domain model
│   ├── User.{ext}                   │
│   └── Order.{ext} ─────────────────┘         ├── [ModuleNameB]/                # e.g., Identity
├── Routes/                                    │   └── ... (UserController, etc.)
├── Middleware/ ─────────────────────────────> └── Infrastructure/               # Shared technical tools
└── Utils/ ──────────────────────────────────>     ├── Types/
                                                   ├── Utils/
                                                   └── Middleware/
```

---

### 2.3 Step-by-Step Migration Procedure

#### Step 1: Identify Cohesive Business Modules
Audit existing models and services to identify natural business domains (e.g., `Identity`, `Billing`, `Catalog`, `Ordering`). Group tightly coupled entities together.

#### Step 2: Create Module Directories
Create top-level directories in `src/` for each identified module (e.g. `src/Ordering/`, `src/Identity/`).

#### Step 3: Move Classes into Feature Modules
Move existing controllers, services, repositories, and models into their respective module directories.

#### Step 4: Establish the Module Public API
Create an entry point for each module (e.g., `index.{ext}` or a public Facade class). Other modules may **ONLY** import from this public entry point, never from another module's internal directories.

#### Step 5: Enrich Domain Models
Refactor models from anemic data bags into **Rich Domain Models**:
- Move validation logic from services into model constructors or factory methods.
- Encapsulate state mutations inside model methods (`order.finalize()`) instead of modifying public properties directly.

#### Step 6: Consolidate Cross-Cutting Concerns into `Infrastructure/`
Move genuinely shared, non-business utilities (database connection pool, auth middleware, logging, base types) into root `Infrastructure/`.

#### Step 7: Enforce Database Table Boundaries
Eliminate cross-module SQL `JOIN`s and direct foreign keys between tables belonging to different modules. Reference external entities strictly by ID (e.g., `order.customerId`).

---

## 3. Migration: Structured Modules → Explicit Architecture

### 3.1 When to Migrate (Triggers & Pain Points)
- **Domain Logic Leakage:** Despite conventions, complex business calculations and policies keep leaking into orchestrator services.
- **Infrastructure Coupling:** Core business rules are deeply tied to ORM decorators (TypeORM, Prisma, SQLAlchemy, Hibernate) or framework-specific HTTP contexts.
- **Swappable Technology Drivers:** Requirement to swap persistence engines (e.g. Postgres to Mongo/Dynamo), integrate new third-party providers (payment gateways, SMS providers), or support multiple delivery mechanisms (REST, gRPC, CLI) without altering business logic.
- **Team Scale:** Multiple squads working in the same module stepping on each other's changes.

---

### 3.2 Visual File Tree Transformation

```text
Structured Modules (Before)                    Explicit Architecture (After)
src/                                           src/
├── [ModuleName]/                              ├── [ContextName]/                # Bounded Context
│   │                                          │   ├── Domain/                   # ── PURE DOMAIN ──
│   ├── Models/                                │   │   ├── [EntityName].{ext}    # Stripped of ORM decorators
│   │   └── Order.{ext} ───────── enrich ────> │   │   ├── [AggregateName]/      # Aggregates & Value Objects
│   │                                          │   │   ├── Services/             # Pure Domain Services (no I/O)
│   │                                          │   │   ├── Ports/                # Interfaces (Ports)
│   │                                          │   │   │   └── OrderRepository.{ext}
│   │                                          │   │   └── Events/               # Domain Events
│   │                                          │   │
│   ├── Services/                              │   ├── Application/              # ── USE CASES ──
│   │   └── OrderService.{ext} ── split ─────> │   │   ├── PlaceOrder/           # Command & Handler
│   │                                          │   │   └── Dtos/
│   │                                          │   │
│   ├── Repositories/                          │   ├── Infrastructure/           # ── ADAPTERS (Outbound) ──
│   │   └── OrderRepository.{ext} ─ adapt ───> │   │   ├── Persistence/          # Implements Domain Ports
│   │                                          │   │   └── External/             # Payment/Email adapters
│   │                                          │   │
│   └── Controllers/                           │   └── Presentation/             # ── ADAPTERS (Inbound) ──
│       └── OrderController.{ext} ─ formalize> │       ├── Api/                  # REST / gRPC delivery
│                                              │       └── Web/                  # SSR / Web delivery
└── Infrastructure/ ─────────────── keep ────> └── Infrastructure/               # Global cross-context tools
```

---

### 3.3 Step-by-Step Migration Procedure

#### Step 1: Purify the Domain (Extract Zero-Dependency Entities)
- Create `src/[ContextName]/Domain/`.
- Copy models into `Domain/` and strip away all external library imports, framework decorators, and database annotations.
- Model business invariants strictly with pure language types and custom domain exceptions.
- Introduce immutable **Value Objects** for concepts like `Money`, `Email`, and `Address`.

#### Step 2: Define Domain Ports (Dependency Inversion)
- Inside `Domain/Ports/`, declare repository interfaces (e.g., `OrderRepositoryPort`) and external service interfaces (e.g., `PaymentGatewayPort`).
- Ensure all method signatures consume and return pure domain entities, value objects, or primitive types — never database or HTTP types.

#### Step 3: Implement Outbound Adapters in `Infrastructure/`
- Move existing repository implementations and third-party API clients to `Infrastructure/`.
- Ensure each adapter implements the corresponding domain port interface.
- Implement the **Data Mapper** pattern to map between pure domain entities and database persistence schemas.

#### Step 4: Split Services into Granular Application Use Cases
- Move business orchestration from fat services into dedicated use-case handlers in `Application/` (e.g., `PlaceOrderHandler`, `CancelOrderHandler`).
- Each handler accepts a dedicated `Command` or `Query` DTO and interacts with the domain exclusively through Domain Ports.

#### Step 5: Formalize Delivery Channels in `Presentation/`
- Transform old controllers into inbound adapters inside `Presentation/Api/` and `Presentation/Web/`.
- Isolate channels (`Admin/` vs `Public/`) if the system serves multiple distinct audiences.
- Controllers validate transport payloads, map them to Application Commands/Queries, invoke the handler, and format response DTOs.

#### Step 6: Wire Dependencies in the Composition Root
- In the application bootstrap (`main.{ext}` or DI module), wire concrete `Infrastructure` adapters into `Domain` ports and inject them into `Application` handlers.

---

## 4. Migration: Monolith (Explicit / Structured) → Microservices

### 4.1 When to Migrate (Triggers & Pain Points)
- **Conflicting Scaling Profiles:** Specific capabilities (e.g. real-time video processing, notification streams) require 100x the compute or memory of the rest of the application.
- **Deployment Coordination Bottlenecks:** A release train blocked by one team prevents 10 other teams from shipping independent features.
- **Autonomous Squads:** Engineering org exceeds 20+ developers organized into independent feature teams requiring dedicated CI/CD pipelines.
- **Polyglot Persistence Requirement:** Part of the system strictly requires graph databases, time-series engines, or specialized vector stores incompatible with the monolithic SQL database.

---

### 4.2 The Strangler Fig Pattern (Incremental Service Extraction)

Never attempt to extract multiple services simultaneously. Use the **Strangler Fig Pattern** to extract one capability at a time:

```text
Monolith (Initial)              Phase 1: Gateway Routing        Phase 2: Autonomous Microservice
┌──────────────┐                ┌──────────────────┐            ┌──────────────────┐
│   Clients    │                │     Clients      │            │     Clients      │
└──────┬───────┘                └────────┬─────────┘            └────────┬─────────┘
       │                                 │                               │
       ▼                                 ▼                               ▼
┌──────────────┐                ┌──────────────────┐            ┌──────────────────┐
│  API Gateway │                │   API Gateway    │            │   API Gateway    │
└──────┬───────┘                └────┬────────┬────┘            └────┬────────┬────┘
       │                             │        │                      │        │
       │ (100% traffic)    (old /)   │        │ (new /orders) (old/) │        │ (/orders)
       ▼                             ▼        ▼                      ▼        ▼
┌──────────────┐                ┌─────────┐ ┌──────────┐        ┌─────────┐ ┌──────────┐
│   MONOLITH   │                │MONOLITH │ │  Orders  │        │MONOLITH │ │  Orders  │
│  • Identity  │                │•Identity│ │ Service  │        │•Identity│ │ Service  │
│  • Catalog   │                │•Catalog │ └────┬─────┘        │•Catalog │ └────┬─────┘
│  • Ordering  │                │•Ordering│      │ (sync DB)    └─────────┘      │ (async outbox)
│              │                └────┬────┘      ▼                               ▼
│ [Monolith DB]│                     └───► [Orders DB]                     [Orders DB]
└──────────────┘
```

---

### 4.3 Step-by-Step Extraction Procedure

#### Step 1: Enforce Strict In-Monolith Boundaries First
Before writing a single line of microservice code, ensure the target domain (e.g., `Ordering`) in the monolith has **zero** direct SQL joins to foreign tables and communicates with other monolith modules strictly via in-memory DTOs or domain events.

#### Step 2: Separate the Database Tables
- Physically separate the target tables from the monolith database into a dedicated schema or independent database instance (`Orders DB`).
- If cross-database queries exist, replace them with dual-phase reads or data replication.

#### Step 3: Implement the Transactional Outbox Pattern
- To keep other monolith modules synchronized without distributed locks or 2-phase commit (2PC), store events in an `outbox` table in the same database transaction.
- Set up a background CDC worker (Debezium, Kafka Connect, or polling worker) to publish events to a message broker (Kafka, RabbitMQ).

#### Step 4: Stand Up the Autonomous Microservice Repository
- Create the new microservice repository (Polyrepo) or directory in a monorepo (`[ServiceName]/`).
- Migrate the domain, application, and infrastructure layers from the monolith's bounded context into the microservice.
- Implement health checks, distributed tracing (`OpenTelemetry`), and containerization (`Dockerfile`).

#### Step 5: Introduce the API Gateway & Route Traffic
- Deploy an API Gateway (Kong, Traefik, Envoy, AWS API Gateway, or custom Node/Go reverse proxy).
- Route all traffic for `/api/orders` to the new microservice, while leaving all other endpoints routing to the monolith.

#### Step 6: Transition Cross-Service Mutations to Sagas
- For workflows spanning multiple services (e.g., Checkout involving Orders, Inventory, and Payments), implement the **Saga Pattern** with compensating actions rather than distributed ACID transactions.

#### Step 7: Decommission Monolithic Legacy Code
- Delete the old ordering module from the monolith codebase.
- Monitor error rates, distributed trace latencies, and circuit breaker metrics.

---

## 5. Migration: Technical Layers → Vertical Slices (Intra-Pattern Evolution)

### 5.1 When to Migrate (Triggers & Pain Points)
- **Merge Conflicts in Shared Files:** When multiple developers work on features for the same entity, they constantly produce merge conflicts in shared `[EntityName]Controller.{ext}`, routes, and service files.
- **Cognitive Switching Overhead:** Developing or modifying a single feature requires jumping between 4–5 distant directories within the module (`Controllers/`, `Services/`, `Models/`, `Repositories/`, `Dtos/`).
- **AI-Agent Context Fragmentation:** An AI coding assistant (Antigravity, Cursor) must parse a 1000-line multi-action controller and multi-action service to update one small endpoint, diluting attention and increasing hallucination risk.

---

### 5.2 Visual File Tree Transformation

```text
Technical Layers (Variant A - Before)       Vertical Slices (Variant B - After)
src/[ModuleName]/                           src/[ModuleName]/
├── Controllers/                            ├── Slices/
│   └── UserController.{ext} ──── split ──> │   ├── User/
│                                           │   │   ├── _Shared/                     # Prevents lateral feature imports
├── Services/                               │   │   │   ├── Schemas/                 # Validation schemas
│   ├── UserService.{ext} ─────── split ──> │   │   │   └── Dtos/                    # Base DTOs
│   ├── PlaceOrderService.{ext}             │   │   │
│   └── CreateUserDto.{ext}                 │   │   ├── CreateUser/                  # Isolated feature folder (Style 1)
│                                           │   │   │   ├── CreateUserAction.{ext}
├── Repositories/                           │   │   │   ├── CreateUserHandler.{ext}
│   └── UserRepository.{ext} ──── keep ───> │   │   │   └── CreateUserDto.{ext}
└── Models/                                 │   │   │
    └── User.{ext} ────────────── keep ───> │   │   ├── UpdateUser/                  # Isolated feature folder (Style 1)
                                            │   │   │   ├── UpdateUserAction.{ext}
                                            │   │   │   ├── UpdateUserHandler.{ext}
                                            │   │   │   └── UpdateUserDto.{ext}
                                            │   │   │
                                            │   │   └── UserRepository.{ext}         # Data access scoped to slice
                                            │   │
                                            │   └── PlaceOrder/                      # Process slice (cross-entity)
                                            │       ├── PlaceOrderAction.{ext}
                                            │       ├── PlaceOrderHandler.{ext}
                                            │       └── PlaceOrderDto.{ext}
                                            │
                                            └── Models/                              # Rich models shared in module
                                                └── User.{ext}
```

---

### 5.3 Step-by-Step Migration Procedure

#### Step 1: Create the `Slices/` Container
Inside the target module or context, create the `Slices/` directory and subdirectories for each entity (e.g. `Slices/User/`, `Slices/Order/`).

#### Step 2: Establish the `_Shared/` Directory (Prevent Lateral Imports)
Before splitting features, create `Slices/[EntityName]/_Shared/`. Move shared validation schemas (`_Shared/Schemas/`) and shared base DTOs (`_Shared/Dtos/`) here. Reusable UI components belong in presentation shared (`Presentation/Web/_Shared/Components/` or channel `_Shared/`).
> **Cardinal Rule:** Feature subfolders must **never** import from sibling feature subfolders (e.g., `UpdateUser` must never import from `CreateUser`). If assets are shared, they belong in entity-level `_Shared/` or presentation `_Shared/`.

#### Step 3: Decompose Unified Controllers into Discrete Actions
Break the methods of `[EntityName]Controller` into single-responsibility Action classes:
- Extract `createUser()` into `CreateUser/CreateUserAction.{ext}`.
- Extract `updateUser()` into `UpdateUser/UpdateUserAction.{ext}`.

#### Step 4: Decompose Unified Services into Dedicated Use-Case Handlers
Break the methods of `[EntityName]Service` into isolated Handlers:
- Extract `createUser()` business logic into `CreateUser/CreateUserHandler.{ext}`.
- Extract `updateUser()` business logic into `UpdateUser/UpdateUserHandler.{ext}`.
- Place dedicated request/response DTOs directly alongside their handlers.

#### Step 5: Separate Cross-Entity Workflows into Process Slices
Identify workflows that orchestrate multiple entities (e.g., `PlaceOrder`, `Checkout`, `OnboardCustomer`). Place them into dedicated process slices directly under `Slices/[ProcessName]/` rather than nesting them under a single entity.

#### Step 6: Relocate Repository and Verify Layer Invariants
Move the entity's data access class (`[EntityName]Repository.{ext}`) to the root of the entity slice (`Slices/[EntityName]/`). Verify that Actions call Handlers, Handlers call Repositories and Models, and no layer skipping occurs.

---

## 6. Migration: Microservices Polyrepo → Monorepo

### 6.1 When to Migrate (Triggers & Pain Points)
- **Cross-Repo Dependency Hell:** A simple change to an API schema or shared event DTO requires creating 5 PRs across 5 independent Git repositories and coordinating merge orders.
- **Stale Shared Packages:** Services drift out of sync on internal utility SDKs (`@company/auth`, `@company/logger`, `@company/contracts`) because bumping npm/NuGet versions across 20 repositories is high-friction.
- **Painful Local Setup:** Onboarding developers requires cloning 15 repositories and orchestrating disparate docker-compose files that frequently break.
- **CI/CD Configuration Drift:** Each repository maintains its own GitHub Actions or GitLab CI YAML, leading to inconsistent security scanning, lint rules, and test practices.

---

### 6.2 Visual File Tree Transformation

```text
Polyrepo (10+ Separate Repositories)            Monorepo (Unified Repository)
repo-order-service/ ──────────────────────────> repo-root/
repo-payment-service/ ────────────────────────> ├── OrderService/               # Retains internal autonomy
repo-notification-service/ ───────────────────> ├── PaymentService/
repo-shared-contracts/ (npm/artifactory) ─────> ├── NotificationService/
                                                │
                                                ├── Libs/                       # ── SHARED MONOREPO LIBRARIES ──
                                                │   ├── Contracts/              # Direct path imports (0 npm publishing)
                                                │   │   ├── Proto/              # Protobuf / gRPC definitions
                                                │   │   └── Dtos/               # API Request/Response DTOs
                                                │   ├── Common/                 # Shared logging, tracing, auth
                                                │   └── Testing/                # Shared fixtures & testcontainers
                                                │
                                                ├── Gateway/                    # API Gateway / BFF
                                                └── Infra/                      # ── UNIFIED INFRASTRUCTURE ──
                                                    ├── docker-compose.yml      # 1 command local startup
                                                    └── Deploy/                 # Helm charts, Terraform, K8s
```

---

### 6.3 Step-by-Step Migration Procedure

#### Step 1: Establish Workspace Tooling
Choose monorepo workspace tooling suited to your technology stack:
- **TypeScript/Node:** pnpm workspaces + Turborepo or Nx.
- **Go:** Go Workspaces (`go.work`).
- **JVM (Java/Kotlin):** Gradle Composite Builds or Maven Multi-Module.
- **C# / .NET:** Solution file (`.sln`) with multiple `.csproj` references.

#### Step 2: Merge Repositories Preserving Git Commit History
Never copy-paste code without history. Use `git subtree` or `git-filter-repo` to import each service repository into a dedicated subdirectory of `repo-root/` while preserving full commit and blame history:
```bash
git remote add origin-order https://github.com/org/repo-order-service.git
git fetch origin-order
git subtree add --prefix=OrderService origin-order main
```

#### Step 3: Consolidate Shared Schemas into `Libs/Contracts/`
Deprecate published private packages (npm/artifactory). Move OpenAPI schemas, Protobuf files, and event DTOs into `Libs/Contracts/`. Services now reference contracts via direct workspace package links (`workspace:*` or project references), making breaking changes immediately visible at compile time across all services.

#### Step 4: Centralize Common Infrastructure
Consolidate Dockerfiles and create a unified root `docker-compose.yml` in `Infra/` allowing any developer to spin up the entire ecosystem with one command.

#### Step 5: Implement Affected-Only CI/CD
Configure CI/CD pipelines (via Turborepo, Nx, or git diff filters) to detect changed files:
- If a PR only changes files in `OrderService/`, **only** `OrderService` tests and deployments run.
- If `Libs/Contracts/` changes, run tests across all dependent downstream services.

#### Step 6: Configure Granular Ownership (`CODEOWNERS`)
Enforce team autonomy by creating a `.github/CODEOWNERS` file:
```text
/OrderService/          @org/order-squad
/PaymentService/        @org/payments-squad
/Libs/Contracts/        @org/architecture-guild
```

---

## 7. Migration: Active Record → Data Mapper (Persistence Decoupling)

### 7.1 When to Migrate (Triggers & Pain Points)
- **Database Leaking into Domain:** Entity classes are decorated with ORM metadata (`@Column()`, `@ManyToOne`, `@Table()`, `models.Model`). Changing a column type or database engine forces breaking changes in business logic.
- **Untestable Business Rules:** Because Active Record models inherit database connection state (`order.save()`), unit testing requires spinning up a live PostgreSQL/MySQL test database or complex mock chains.
- **N+1 Query Cascades:** Lazy-loaded relationship properties on Active Record entities trigger hidden database queries when accessed inside loops or JSON serializers.
- **Violated Invariants:** Public getters/setters exposed by Active Record allow any controller or service to bypass business validation and directly mutate database fields.

---

### 7.2 Visual 4-Tier Separation Mapping

```text
Active Record (Tangled Concerns):
┌────────────────────────────────────────────────────────┐
│ class Order extends Model {                            │
│   @Column() public total: number;                      │  <── DB column decorator leaks to domain
│   @ManyToOne() public customer: Customer;              │  <── ORM relationship coupling
│   public async save(): Promise<void> { ... }           │  <── Direct I/O method coupled to entity
│   public addItem(product: Product): void { ... }       │  <── Business invariant logic
│ }                                                      │
└────────────────────────────────────────────────────────┘

Data Mapper (4-Tier Decoupled Architecture):
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. PURE DOMAIN ENTITY (Domain Layer)                                                       │
│    class Order { private total: Money; public addItem(): void; }   <── 0 ORM deps, 0 I/O   │
│                                                                                            │
│ 2. DOMAIN REPOSITORY PORT (Domain Layer)                                                   │
│    interface OrderRepositoryPort { save(order: Order): Promise<void>; }                    │
│                                           ▲                                                │
│                                           │ (mapped via OrderMapper)                       │
│                                           ▼                                                │
│ 3. PERSISTENCE RECORD SCHEMA (Infrastructure Layer)                                        │
│    interface OrderTableRecord { id: string; total_cents: number; currency: string; }       │
│                                                                                            │
│ 4. REPOSITORY ADAPTER (Infrastructure Layer)                                               │
│    class PostgresOrderRepository implements OrderRepositoryPort { ... }                   │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 7.3 Step-by-Step Migration Procedure

#### Step 1: Audit Invariants and Lifecycle Callbacks
Inspect the existing Active Record model. Identify all business rules hidden inside database lifecycle hooks (`@BeforeInsert`, `@BeforeUpdate`, `after_save`, `validates_presence_of`). Document them as domain invariants.

#### Step 2: Demote the Active Record Class to a Persistence Schema
Rename the old Active Record class to `OrderTableRecord` (or `OrderOrmEntity`) and move it into `Infrastructure/Persistence/`:
- Keep all database-specific column decorators, table names, and foreign keys here.
- Strip all business calculation logic from this class — it is now strictly a database schema container.

#### Step 3: Create the Pure Domain Entity
Create `Domain/Order.{ext}`:
- Define fields with strict privacy (`private` or `#`).
- Expose read-only accessors (`get id()`, `get total()`).
- Encapsulate all mutations in expressive domain methods (`order.addItem()`, `order.finalize()`).
- Ensure **zero imports** of ORM packages or database drivers.

#### Step 4: Implement the Bi-Directional Data Mapper
Inside `Infrastructure/Persistence/OrderMapper.{ext}`, create pure conversion functions:
- `toDomain(record: OrderTableRecord): Order` — hydrates the pure entity from database fields.
- `toPersistence(domain: Order): OrderTableRecord` — flattens the pure entity into database columns.

#### Step 5: Declare the Repository Port and Implement the Adapter
- In `Domain/Ports/OrderRepository.{ext}`, define the interface:
  ```typescript
  interface OrderRepository {
    findById(id: OrderId): Promise<Order | null>;
    save(order: Order): Promise<void>;
  }
  ```
- In `Infrastructure/Persistence/PostgresOrderRepository.{ext}`, implement the port using the database driver and `OrderMapper`.

#### Step 6: Refactor Services / Handlers from Active Record to Repository
Replace active record mutation calls with repository save operations:
```typescript
// ❌ BEFORE (Active Record):
const order = await Order.findById(id);
order.total = 100; // Anemic direct mutation
await order.save(); // Entity performs database I/O

// ✅ AFTER (Data Mapper):
const order = await this.orderRepo.findById(id);
order.applyDiscount(discountRate); // Pure business method
await this.orderRepo.save(order); // Persistence handled by repository adapter
```

---

## 8. Universal Anti-Patterns in Architecture Migrations

- ❌ **The "Big Bang" Rewrite:** Freezing feature delivery for 6–12 months to rebuild the system from scratch. Business requirements change during the freeze, leading to canceled projects and massive sunk costs. Evolve incrementally using the Strangler Fig pattern.
- ❌ **The Distributed Monolith:** Breaking an application into multiple services while keeping a shared database, tight compile-time shared libraries, or synchronous REST call chains. You get all the operational pain of microservices with none of the autonomy benefits.
- ❌ **Premature Evolution (Skipping Ladder Rungs):** Jumping from a simple Layered prototype directly into Microservices or full CQRS before understanding domain boundaries.
- ❌ **Dual-Write without Outbox:** Updating a local database and publishing a message to a broker in two separate uncoordinated calls. If the broker call fails, data state is permanently corrupted. Always use the Transactional Outbox pattern.
- ❌ **Lateral Imports during Slice Migration:** Decomposing controllers into feature folders, but having `UpdateUser` import components or schemas directly from `CreateUser`. Always elevate shared schemas to entity `_Shared/` and shared UI forms to presentation `_Shared/Components/` or channel `_Shared/`.
- ❌ **Monorepo Dependency Tangling:** Merging repositories into a monorepo and allowing Service A to import internal classes or database entities directly from Service B. Monorepo services must communicate strictly via `Libs/Contracts/` or network calls.
- ❌ **Half-Baked Data Mapper:** Creating a repository adapter, but continuing to keep `@Column()` decorators and database foreign keys on the domain entity itself. True Data Mapper requires complete domain purity.
- ❌ **Copy-Paste Migration:** Copying entire monolithic helper libraries and models into new services without auditing dependencies, introducing hidden circular coupling across network boundaries.
