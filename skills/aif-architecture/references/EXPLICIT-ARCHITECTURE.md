# Explicit Architecture (Clean / Hexagonal / DDD)

Explicit Architecture (also known as Clean Architecture, Onion Architecture, or Ports & Adapters) places the business domain at the center of the system.

Frameworks, databases, user interfaces, and external APIs are treated as peripheral details that plug into the domain through well-defined interfaces. Dependencies always point **inward** — outer layers depend on inner layers, and inner layers NEVER import from outer layers.

---

## 1. Why this Architecture Exists

As systems grow in complexity and business rules evolve over years, coupling business logic to frameworks, ORMs, and database schemas causes severe architectural degradation. A minor database migration or framework upgrade risks breaking core business calculations across hundreds of files.

**Explicit Architecture solves this by strictly isolating the domain:**
- **Zero Framework Contamination:** The business domain contains pure code with zero external libraries or database decorators.
- **Independent Testability:** Business logic can be tested in milliseconds using pure unit tests without mocks or database instances.
- **Swappable Infrastructure:** Frameworks, databases, message brokers, and delivery channels can be replaced or added without touching domain rules.
- **Screaming Architecture:** The folder and class structure screams what the application *does* (e.g. `PlaceOrder`, `FinalizeInvoice`) rather than what framework it uses.

### Domain-Driven Design (DDD) in Context

**Domain-Driven Design (DDD)** is primarily about domain modeling: discovering a ubiquitous language, identifying bounded contexts, and organizing business rules into aggregates, entities, and value objects. DDD is **not** a folder structure.

Explicit Architecture provides the structural container that allows DDD concepts to be implemented cleanly and protected from infrastructure pollution.

---

## 2. Architecture Rings

The system is organized into four concentric rings (center outward; ring 2 is a sibling pair):

```text
┌────────────────────────────────────────────────────────────────────┐
│  4. CONFIGURATION / COMPOSITION ROOT                               │  DI container: wires Infrastructure
│                                                                    │  implementations into Domain ports
├────────────────────────────────────────────────────────────────────┤
│  3. PRESENTATION / ADAPTERS (inbound)                              │  HTTP handlers, CLI commands, Web views —
│                                                                    │  depends on Application layer only
├────────────────────────────────────────────────────────────────────┤
│  2. ADAPTER & USE-CASE RINGS — siblings; never imported by         │
│     each other at compile time; both depend inward only            │
│    ┌────────────────────────┐      ┌────────────────────────┐      │
│    │ 2a. APPLICATION        │      │ 2b. INFRASTRUCTURE     │      │
│    │ Use cases, services,   │      │ (outbound)             │      │
│    │ DTOs; reads/writes     │ ─ ─► │ implements Domain      │      │
│    │ repositories THROUGH   │      │ ports (PostgresOrder-  │      │
│    │ Domain ports — never   │      │ Repository implements  │      │
│    │ imports Infrastructure │      │ OrderRepository); DB,  │      │
│    │ directly               │      │ APIs, messaging; never │      │
│    │                        │      │ calls Application      │      │
│    └───────────┬────────────┘      └───────────┬────────────┘      │
│                │      both depend inward       │                   │
│                │  dashed arrow = runtime call  │                   │
│                │  via Domain ports only — no   │                   │
│                │  compile-time import          │                   │
├────────────────▼───────────────────────────────▼───────────────────┤
│  1. DOMAIN LAYER (center)                                          │  Entities, Value Objects, Domain Events,
│                                                                    │  Ports (interfaces), Exceptions
└────────────────────────────────────────────────────────────────────┘
```

**Dependency Rule:** Dependencies point **INWARD**. Solid lines are compile-time imports. The dashed arrow (`2a → 2b`) is a runtime dispatch through interfaces (Domain Ports). Inner layers never import outer layers.

---

## 3. Organization Variants

Within each bounded context (`[ContextName]`), code can be organized in three structural variants:
1. **Architectural Layers:** `Application/`, `Infrastructure/`, `Presentation/` as top-level directories in the context.
2. **Vertical Slices:** Each entity slice contains its own Application, Infrastructure, and Presentation subfolders. Domain remains shared across slices in the context.
3. **Flat Vertical Slices:** Omits internal layer subfolders within the slice, placing handlers, actions, and DTOs side-by-side.

> **Note on Naming & Casing Flexibility:**
> Ring directories (`Domain/`, `Application/`, `Infrastructure/`, `Presentation/`) and subfolders (`Ports/`) represent conceptual architectural roles. There is zero hard lock-in to literal PascalCase or folder paths:
> - Adapt casing (`snake_case`, `kebab-case`, `lowercase`) to your target language conventions.
> - Use idiomatic synonyms (`UseCases/` for `Application/`, `Interfaces/` for `Ports/`, `Delivery/` for `Presentation/`) where your framework prefers them.

---

### Variant A: Folder Structure — Architectural Layers

```text
src/
├── [ContextName]/                              # ── BOUNDED CONTEXT ──
│   ├── Domain/                                 # PURE DOMAIN (zero external dependencies)
│   │   ├── [EntityName].{ext}                  # Standalone entities
│   │   ├── [AggregateName]/                    # Dedicated folder when aggregate has child entities
│   │   │   ├── [AggregateName].{ext}           # Aggregate root
│   │   │   └── [ChildEntity].{ext}             # Child entity inside aggregate boundary
│   │   ├── Services/                           # Domain Services (pure cross-entity rules, zero I/O)
│   │   │   └── [ProcessName]PricingService.{ext}
│   │   ├── ValueObjects/                       # Immutable Value Objects (Money, Email)
│   │   ├── Events/                             # Domain Events (OrderPlaced, PaymentFailed)
│   │   ├── Ports/                              # Outbound interfaces (OrderRepository, PaymentGateway)
│   │   └── Exceptions/                         # Domain-specific business exceptions
│   │
│   ├── Application/                            # ALL USE CASES (orchestration)
│   │   # ── Style 2: Unified Multi-Action ──
│   │   ├── [EntityName]/
│   │   │   ├── [EntityName]Service.{ext}
│   │   │   └── [FeatureName]Dto.{ext}          # DTO next to the unified service
│   │   └── [ProcessName]Service.{ext}          # Cross-entity workflow (e.g. PlaceOrderService)
│   │   # ── Style 1: Feature Subfolders ──
│   │   # ├── [FeatureName]/
│   │   # │   ├── [FeatureName]Handler.{ext}
│   │   # │   └── [FeatureName]Dto.{ext}
│   │   # └── [ProcessName]/
│   │   #     └── [ProcessName]Handler.{ext}
│   │
│   ├── Infrastructure/                         # INFRASTRUCTURE (outbound driven adapters)
│   │   ├── Persistence/                        # Implements Domain repository ports
│   │   ├── External/                           # External third-party API adapters
│   │   └── Messaging/                          # Outbound event publishers (implements EventPublisherPort)
│   │
│   └── Presentation/                           # PRESENTATION (inbound driving delivery adapters)
│       ├── Api/                                # HTTP / REST / GraphQL endpoints
│       │   # ── Style 2: Unified Multi-Action ──
│       │   ├── Admin/                          # [Channel] folder — Backoffice API
│       │   │   └── [EntityName]Controller.{ext}
│       │   └── Public/                         # [Channel] folder — Public API
│       │       └── [EntityName]Controller.{ext}
│       │   # ── Style 1: Feature Subfolders ──
│       │   # └── [Channel]/[FeatureName]/[FeatureName]Action.{ext}
│       ├── Consumers/                          # Inbound event listeners (Kafka, RabbitMQ, SQS message consumers)
│       │   └── [EntityName]EventConsumer.{ext} # Dispatches incoming messages to Application Services
│       ├── Jobs/                               # Schedulers, cron tasks, and background workers
│       │   └── [ProcessName]Scheduler.{ext}    # Triggers periodic use cases via Application Services
│       ├── Web/                                # HTML views & SSR controllers
│       │   ├── _Shared/
│       │   │   └── Components/                 # Cross-channel UI forms (e.g. [EntityName]Form.{ext})
│       │   # ── Style 2: Unified Multi-Action ──
│       │   ├── Admin/
│       │   │   ├── _Shared/                    # Admin-only UI (e.g. AdminUserTable.{ext})
│       │   │   └── [EntityName]Controller.{ext}
│       │   └── Public/
│       │       └── [EntityName]Controller.{ext}
│       │   # ── Style 1: Feature Subfolders ──
│       │   # ├── Admin/
│       │   # │   ├── _Shared/
│       │   # │   └── Edit[EntityName]/Edit[EntityName]View.{ext}
│       │   # └── Public/
│       │   #     └── View[EntityName]/View[EntityName]View.{ext}
│       └── Cli/                                # Console CLI commands
│           └── [EntityName]Command.{ext}
│
├── [AnotherContextName]/
│   └── ...
│
└── Infrastructure/                             # ── GLOBAL CROSS-CONTEXT INFRASTRUCTURE ──
    ├── Utils/                                  # Cross-cutting utility helpers
    ├── Adapters/                               # Shared client adapters
    └── Migrations/                             # Database migrations schema
```

---

### Variant B: Folder Structure — Vertical Slices

```text
src/
├── [ContextName]/                              # ── BOUNDED CONTEXT ──
│   ├── Domain/                                 # PURE DOMAIN (shared across slices in context)
│   │   ├── [EntityName].{ext}
│   │   ├── [AggregateName]/
│   │   │   ├── [AggregateName].{ext}
│   │   │   └── [ChildEntity].{ext}
│   │   ├── Services/                           # Domain Services (pure calculations)
│   │   ├── Ports/                              # Repository & Gateway interfaces
│   │   └── Exceptions/
│   │
│   ├── Slices/
│   │   ├── [EntityName]/                       # Entity slice (e.g. User)
│   │   │   ├── _Shared/                        # Entity-level backend shared (prevents lateral imports)
│   │   │   │   ├── Schemas/                    # Shared validation schemas
│   │   │   │   └── Dtos/                       # Base DTOs
│   │   │   │
│   │   │   ├── Application/                    # Entity-scoped use cases
│   │   │   │   # ── Style 1: Feature Subfolders ──
│   │   │   │   ├── Create[EntityName]/         # Dedicated folder per use case
│   │   │   │   │   ├── Create[EntityName]Handler.{ext}
│   │   │   │   │   └── Create[EntityName]Dto.{ext}
│   │   │   │   ├── Update[EntityName]/
│   │   │   │   │   ├── Update[EntityName]Handler.{ext}
│   │   │   │   │   └── Update[EntityName]Dto.{ext}
│   │   │   │   └── Get[EntityName]/            # Query use case
│   │   │   │       ├── Get[EntityName]Handler.{ext}
│   │   │   │       └── Get[EntityName]Dto.{ext}
│   │   │   │   # ── Style 2: Unified Multi-Action ──
│   │   │   │   # ├── [EntityName]Service.{ext} # Unified service for all entity use cases
│   │   │   │   # └── [FeatureName]Dto.{ext}    # DTOs next to the unified service
│   │   │   │
│   │   │   ├── Infrastructure/                 # Entity-specific persistence adapters
│   │   │   │   └── [EntityName]Repository.{ext}
│   │   │   │
│   │   │   └── Presentation/                   # Delivery layer with explicit Channels
│   │   │       ├── Api/
│   │   │       │   # ── Style 1: Feature Subfolders ──
│   │   │       │   ├── Admin/                  # [Channel] Admin Backoffice API
│   │   │       │   │   ├── _Shared/            # Intra-channel shared (admin filters, serializers)
│   │   │       │   │   ├── Create[EntityName]/
│   │   │       │   │   │   └── Create[EntityName]Action.{ext}
│   │   │       │   │   └── Update[EntityName]/
│   │   │       │   │       └── Update[EntityName]Action.{ext}
│   │   │       │   └── Public/                 # [Channel] Public Portal / Customer API
│   │   │       │       ├── _Shared/            # Intra-channel shared (public query params)
│   │   │       │       └── Get[EntityName]/
│   │   │       │           └── Get[EntityName]Action.{ext}
│   │   │       │   # ── Style 2: Unified Multi-Action ──
│   │   │       │   # ├── Admin/
│   │   │       │   # │   ├── _Shared/
│   │   │       │   # │   └── [EntityName]Controller.{ext}
│   │   │       │   # └── Public/
│   │   │       │   #     ├── _Shared/
│   │   │       │   #     └── [EntityName]Controller.{ext}
│   │   │       ├── Web/                        # HTML views & SSR controllers (for Fullstack)
│   │   │       │   ├── _Shared/
│   │   │       │   │   └── Components/         # Cross-channel UI forms (e.g. [EntityName]Form.{ext})
│   │   │       │   # ── Style 1: Feature Subfolders ──
│   │   │       │   ├── Admin/                  # Admin channel views
│   │   │       │   │   ├── _Shared/            # Admin-only UI (e.g. AdminUserTable.{ext})
│   │   │       │   │   └── Edit[EntityName]/   # Uses _Shared/Components/[EntityName]Form.{ext}
│   │   │       │   └── Public/                 # Public channel views
│   │   │       │       └── View[EntityName]/
│   │   │       │   # ── Style 2: Unified Multi-Action ──
│   │   │       │   # ├── Admin/
│   │   │       │   # │   ├── _Shared/
│   │   │       │   # │   └── [EntityName]Controller.{ext}
│   │   │       │   # └── Public/
│   │   │       │   #     └── [EntityName]Controller.{ext}
│   │   │       └── Cli/
│   │   │           └── [EntityName]Command.{ext}
│   │   │
│   │   └── [ProcessName]/                      # Process slice — cross-entity orchestration (e.g. Checkout)
│   │       ├── Application/
│   │       │   # ── Style 1: Feature Subfolders ──
│   │       │   ├── [ProcessName]Handler.{ext}
│   │       │   └── [ProcessName]Dto.{ext}
│   │       │   # ── Style 2: Unified Multi-Action ──
│   │       │   # ├── [ProcessName]Service.{ext}
│   │       │   # └── [ProcessName]Dto.{ext}
│   │       ├── Infrastructure/
│   │       └── Presentation/
│   │           └── Api/
│   │               # ── Style 1: Feature Subfolders ──
│   │               └── [ProcessName]Action.{ext}
│   │               # ── Style 2: Unified Multi-Action ──
│   │               # └── [ProcessName]Controller.{ext}
│   │
│   └── Infrastructure/                         # Cross-slice adapters within context
│
└── Infrastructure/                             # ── GLOBAL INFRASTRUCTURE ──
```

---

### Variant C: Folder Structure — Flat Vertical Slices

For smaller entities or when striving for maximum locality (cohesion), the formal `Application/`, `Infrastructure/`, and `Presentation/` subfolders within slices are omitted.

When multiple channels exist, `[Channel]` folders group the feature endpoints, while `_Shared/` prevents duplication and lateral imports (in strictly flat single-folder setups, use prefixing instead: `[Channel][EntityName]Controller.{ext}`, e.g. `AdminUserController.{ext}`):

```text
src/
├── [ContextName]/
│   ├── Domain/                                 # Pure shared domain & ports
│   │   ├── [EntityName].{ext}
│   │   └── Ports/
│   │
│   ├── Slices/
│   │   ├── [EntityName]/                       # Flat entity slice
│   │   │   ├── _Shared/                        # Entity-level shared backend schemas & base DTOs
│   │   │   │   ├── [EntityName]Schema.{ext}    # Validation schema
│   │   │   │   └── [EntityName]Dto.{ext}       # Base DTO
│   │   │   │
│   │   │   # ── Style 1: Feature Subfolders ──
│   │   │   ├── Admin/                          # [Channel] Admin Backoffice
│   │   │   │   ├── _Shared/                    # Intra-channel shared (admin filters, admin UI)
│   │   │   │   ├── Create[EntityName]/         # Feature folder
│   │   │   │   │   ├── Create[EntityName]Action.{ext}
│   │   │   │   │   ├── Create[EntityName]Handler.{ext}
│   │   │   │   │   └── Create[EntityName]Dto.{ext}
│   │   │   │   └── Update[EntityName]/
│   │   │   │       ├── Update[EntityName]Action.{ext}
│   │   │   │       ├── Update[EntityName]Handler.{ext}
│   │   │   │       └── Update[EntityName]Dto.{ext}
│   │   │   │
│   │   │   ├── Public/                         # [Channel] Public Portal / Customer API
│   │   │   │   ├── _Shared/                    # Intra-channel shared (public query params)
│   │   │   │   └── Get[EntityName]/
│   │   │   │       ├── Get[EntityName]Action.{ext}
│   │   │   │       ├── Get[EntityName]Handler.{ext}
│   │   │   │       └── Get[EntityName]Dto.{ext}
│   │   │   │
│   │   │   # ── Style 2: Unified Multi-Action ──
│   │   │   # ├── [Channel][EntityName]Controller.{ext} # Unified controller per channel (e.g. AdminUserController)
│   │   │   # ├── [EntityName]Service.{ext}    # Unified service for all entity use cases
│   │   │   # ├── [FeatureName]Dto.{ext}       # DTOs next to the unified service
│   │   │   │
│   │   │   └── [EntityName]Repository.{ext}    # Data access adapter
│   │   │
│   │   └── [ProcessName]/                      # Flat process slice
│   │       # ── Style 1: Feature Subfolders ──
│   │       ├── [ProcessName]Action.{ext}
│   │       ├── [ProcessName]Handler.{ext}
│   │       └── [ProcessName]Dto.{ext}
│   │       # ── Style 2: Unified Multi-Action ──
│   │       # ├── [ProcessName]Controller.{ext}
│   │       # ├── [ProcessName]Service.{ext}
│   │       # └── [ProcessName]Dto.{ext}
│   │
│   └── Infrastructure/
│
└── Infrastructure/
```

---

## 4. Key Principles

1. **Bounded Contexts:** Each bounded context represents an autonomous business subdomain with its own ubiquitous language. Contexts communicate across boundaries via DTOs, application facades, or asynchronous domain events.
   - **Context Mapping:** Relationships between contexts use strategic DDD patterns such as *Customer/Supplier* or *Anti-Corruption Layer (ACL)*.
2. **Domain Layer Purity:** The domain layer contains **zero dependencies** on external libraries, ORMs, frameworks, or databases. Contains Entities, Aggregates, Value Objects, Domain Events, Ports (interfaces), and Domain Exceptions.
   - *Entities:* Standalone entities live in `Domain/` (or `Domain/Entities/`).
   - *Aggregate Folders:* When an entity is an Aggregate Root with child entities (e.g. `Order` and `OrderItem`), group them in a dedicated folder: `Domain/[AggregateName]/`.
   - *Domain Services:* Pure business rules that span multiple entities without I/O live in `Domain/Services/`.
3. **Ports and Adapters:** The domain defines interfaces (ports) for all I/O dependencies. Infrastructure implements these interfaces (adapters). Dependencies point strictly inward.
4. **CQRS & Query Optimization (Bypass Domain for Reads):** While separate read databases or Event Sourcing are optional, separating **Commands (Write Path)** from **Queries (Read Path)** is essential for performance:
   - *Commands (Write Path):* Load Aggregate Roots to enforce invariants and persist state.
   - *Queries (Read Path):* Completely bypass the Domain layer and fetch flat, read-optimized DTOs directly from the database using SQL or ORM projections, eliminating N+1 performance cascades (see [Domain Modeling](./DOMAIN-MODELING.md#6-cqrs--query-optimization-read-path-vs-write-path)).
5. **Port Abstraction for External Dependencies:** All persistence, network clients, messaging publishers, and file storage must be accessed exclusively through domain interfaces. This enables 100% isolated unit testing and trivial swapping of technical drivers.
6. **Domain-Specific Repositories (No Generic Repositories):** Repository port interfaces in `Domain/Ports/` must speak the ubiquitous language of the business (e.g. `findActiveOrdersByCustomer(customerId)`), rather than generic abstractions like `IRepository<T>` with `GetAll()` or `IQueryable` query expressions.
7. **Pull-Based Domain Events:** Domain entities record events in an internal buffer (`pullDomainEvents()`). The Application Service retrieves and dispatches these events to message brokers strictly **after** the database transaction commits (or via Transactional Outbox). Domain entities must never perform network I/O or publish events directly.
8. **Small Aggregates & Reference by ID Only:** Aggregates must remain small and protect immediate transactional invariants:
   - Hold cross-aggregate references strictly by identifier (e.g., `CustomerId`), never by direct object reference or ORM navigation properties (`@ManyToOne`).
   - This prevents cascading dirty-checks and transaction locks (see [Persistence & ORM](./PERSISTENCE-AND-ORM.md#3-cross-aggregate-references-identity-only-vs-orm-navigation-properties)).
9. **Unified Driving Adapters (HTTP, Async Consumers, Cron, CLI):** The Presentation layer acts as the unified boundary for all incoming triggers. HTTP controllers, Kafka/RabbitMQ message consumers, background scheduler jobs, and CLI commands all act identically as **Inbound Driving Adapters**: they parse/validate incoming transport payloads and dispatch inward by invoking Application Services.

---

## 5. Dependency Rules

Clean Architecture is governed by the **Inward Dependency Rule**:

```text
Presentation ──► Application ──► Domain ◄── Infrastructure
```

1. **Inward Dependencies Only:** Dependencies point strictly inward toward the Domain. The Domain depends on nothing; Application depends only on Domain; Presentation depends on Application and Domain types; Infrastructure depends on Domain ports.
2. **Ports & Adapters (Dependency Inversion):** Application needs persistence, messaging, or third-party APIs through **Domain Ports** (interfaces in `Domain/Ports/`). Infrastructure implements these interfaces. At compile time, Application never imports Infrastructure.
3. **No Direct Entity Mutation from Presentation:** Controllers/Actions in `Presentation/` accept input DTOs, invoke Application Services/Handlers, and receive response DTOs. Presentation never queries repositories or mutates domain entities directly.
4. **Context Isolation:** Bounded contexts never import internal classes from sibling contexts. Cross-context communication is conducted through Application Facades, shared DTOs, or Domain Events via an Anti-Corruption Layer (ACL).
5. **Channel Isolation:** Within `Presentation/`, channels (`Admin/`, `Public/`) must be isolated. `Public/` code must NEVER import from `Admin/`. Shared presentation logic belongs in each channel's `[Channel]/_Shared/` (intra-channel) or `Presentation/Web/_Shared/` (cross-channel UI).
6. **No Lateral Imports in Slices:** When using vertical slices, a feature subfolder must NEVER import from a sibling feature subfolder (e.g., `UpdateUser` never imports from `CreateUser`). Shared validation schemas and base DTOs belong in entity-level `_Shared/` (`Slices/[EntityName]/_Shared/`), while shared UI forms belong strictly in `Presentation/Web/_Shared/Components/` or channel `_Shared/`.

---

## 6. Anti-Patterns to Avoid

- ❌ **Anemic Domain Model:** Entities that are data-only bags with getters/setters, while business rules leak into application services.
- ❌ **Leaking Dependencies Inward:** Importing framework packages, HTTP annotations, or ORM decorators inside `Domain/`.
- ❌ **CQRS Everywhere:** Applying strict command/query separation to simple CRUD screens that don't need it.
- ❌ **God Services:** A single application service handling dozens of unrelated features.
- ❌ **Circular Context Dependencies:** Context A importing Context B while Context B imports Context A. Break circularity using Domain Events or an ACL.
- ❌ **Leaking `IQueryable` / Expression Trees:** Returning database-coupled queryables or passing ORM lambda expressions into domain repository ports.
- ❌ **I/O inside Domain Layer:** Performing network calls, database lookups, or reading unabstracted system clocks (`DateTime.now`) inside `Domain/`.
- ❌ **God Aggregate:** Designing an aggregate root that pulls thousands of child records into memory for a minor status change, causing out-of-memory errors and concurrency contention.
