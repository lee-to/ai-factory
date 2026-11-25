# Architecture Knowledge Base — Decision Engine & Index

Reference material for architecture evaluation and generation. This index guides the selection of architectural patterns and routes to detailed specification modules for generating `.ai-factory/ARCHITECTURE.md`.

---

## 1. Engineering Decision Matrix

This matrix evaluates architecture patterns across concrete engineering criteria. It emphasizes distinctions between monolithic patterns and structural variants, not merely monolith vs microservices.

| Factor | [Layered](./LAYERED.md) | [Structured Modules (Technical Layers)](./STRUCTURED-MODULES.md#variant-a-folder-structure--technical-layers) | [Structured Modules (Vertical Slices)](./STRUCTURED-MODULES.md#variant-b-folder-structure--vertical-slices) | [Explicit Architecture (Architectural Layers)](./EXPLICIT-ARCHITECTURE.md#variant-a-folder-structure--architectural-layers) | [Explicit Architecture (Vertical Slices)](./EXPLICIT-ARCHITECTURE.md#variant-b-folder-structure--vertical-slices) | [Microservices](./MICROSERVICES.md) |
|---|---|---|---|---|---|---|
| **Domain Model Nature** | **Anemic:** Dumb data holders; business logic resides procedurally in fat services | **Rich:** Rules, invariants, and calculations live inside `Models/` | **Rich:** Rules encapsulated in `Models/`; use-case logic partitioned in slices | **Pure Domain:** Entities, Value Objects, Aggregates with zero external dependencies | **Pure Domain:** Shared pure `Domain/` core; isolated per-entity slices | **Autonomous Domain:** Domain logic scoped to individual service boundary |
| **Boundaries & Encapsulation** | **None:** Arbitrary cross-feature imports between controllers and services | **Soft Module Boundaries:** Access across features strictly via module Public API | **Module + Slice Locality:** Features grouped by entity and subfolders | **Hard Bounded Context:** Strict ports; zero inward type leakage | **Hard Bounded Context + Feature Locality:** Max boundary enforcement | **Hard Network Boundaries:** Independent processes communicating via HTTP/gRPC/MQ |
| **Database & ORM Coupling** | **Direct:** ORM entities (Active Record) leak to controllers; DB schema = domain model | **Moderate (Data Mapper):** Repositories hydrate rich models; DB schema kept in module | **Moderate (Data Mapper):** Entity repositories sit alongside slices | **Strict Isolation:** Zero ORM decorators in domain; distinct Entity and ORM schemas | **Strict Isolation:** Pure domain entities; persistence adapters isolated in slices | **Database per Service:** Autonomous DB engine per service; cross-DB queries forbidden |
| **Feature Locality & Navigation** | **Scattered:** 1 feature touches 4–5 distant directories (`Controllers/`, `Services/`...) | **Grouped by Module:** But split across technical layer folders within module | **High:** All files for a feature (`Action`, `Handler`, `Dto`) sit in `[FeatureName]/` | **Scattered across Rings:** 1 feature split across `Domain/`, `Application/`, `Presentation/` | **Maximum:** All layers for a specific feature co-located within its slice | **High per Service:** Feature code lives within service codebase |
| **Boilerplate Tax (New Feature)** | **Minimal:** 1 controller method + 1 service method | **Low:** Domain model method + orchestrator service + DTO | **Low to Moderate:** Action + Handler + DTO | **High:** Port + Adapter + Command + Handler + Entity + Value Object + DTO | **High:** Same Explicit layers, but organized within feature slices | **Extreme:** Explicit layers + schema contracts (Proto/OpenAPI) + CI/CD pipelines |
| **Transactions & Data Consistency** | **Global ACID:** Arbitrary SQL JOINs and foreign keys across all tables | **Module-scoped ACID:** Native JOINs within module; cross-module references by ID | **Module-scoped ACID:** Native JOINs within module; cross-module references by ID | **Unit of Work ACID:** JOINs between Bounded Contexts prohibited architecturally | **Unit of Work ACID:** Cross-context joins prohibited; isolated within context | **Eventual Consistency / Saga:** Distributed transactions, Transactional Outbox; no JOINs |
| **AI-Agent Context Density** | **Low:** Agent must scan and parse files across entire `src/` tree | **Moderate:** Agent context can be scoped to target `[ModuleName]/` | **High:** Entire feature fits in single cohesive folder `[FeatureName]/` | **Complex:** Agent must navigate 5+ architectural layers for one change | **High:** Agent sees full vertical slice plus pure domain in one context | **Moderate:** Agent often lacks context of neighboring service contracts |
| **Testing Strategy** | Fragile unit tests requiring heavy DB mocks; reliance on integration tests | Fast unit tests for rich model methods; integration tests for service coordinators | Clean unit tests for models + isolated handler tests | Ideal pure unit tests for domain (0 mocks); adapters tested in isolation | Ideal domain unit tests + isolated end-to-end slice tests | Simple unit tests within service; highly complex contract (Pact) & e2e testing |

---

## 2. Quick Decision Guide & Selection Engine

### 2.1 Project Archetypes & Heuristic Mapping

| Project Archetype / Context | Recommended Pattern | Recommended Variant | Primary Rationale |
|---|---|---|---|
| **MVP, prototype, internal tooling (< 10 entities, 1–3 devs)** | **[Layered Architecture](./LAYERED.md)** | Layered (Simple CRUD) (`layers`) | Minimal boilerplate, fastest lead time to initial delivery |
| **B2B SaaS, standard e-commerce, web platforms (3–10 devs)** | **[Structured Modules](./STRUCTURED-MODULES.md)** | Vertical Slices (`structured-vertical`) | High cohesion, rich models, strong feature isolation without hexagonal ports |
| **Fintech, Healthcare, complex business rules, strict compliance** | **[Explicit Architecture](./EXPLICIT-ARCHITECTURE.md)** | Architectural Layers (`explicit-layers`) or Vertical Slices (`explicit-vertical`) | 100% pure domain (0 external deps), maximum unit testability |
| **Systems with high AI-assisted development (Antigravity, Cursor)** | **Structured or Explicit** | **Vertical Slices** (`structured-vertical` / `explicit-vertical`) | Maximum context density: entire feature fits in single cohesive folder |
| **Large enterprise platform (20+ devs, multi-cloud, independent releases)** | **[Microservices](./MICROSERVICES.md)** | Multiple Services (Monorepo) (`microservices-monorepo`) or Single Service (`microservices-single`) | Independent release lifecycle, blast-radius isolation, autonomous squads |

---

### 2.2 Two-Phase Decision Algorithm

Architecture resolution proceeds in two distinct, sequential phases:

#### Phase 1: Pattern Resolution (Select the Base Architectural Pattern)

```text
STEP 1: Are network boundaries and independent services strictly required?
├── Team size > 20 engineers divided into autonomous squads?
├── Independent CI/CD deployment pipelines required without coordinated release trains?
├── Different subdomains require polyglot persistence (SQL + Graph + Vector)?
│   ├── YES (2+ signals matched) ──> MICROSERVICES
│   └── NO (Monolith preferred) ───> Proceed to STEP 2

STEP 2: Does the core domain require strict zero-dependency isolation (Clean/DDD)?
├── Rich domain invariants and calculations spanning 2+ aggregates?
├── System expected lifecycle > 2 years with continuous domain rule evolution?
├── Strict business requirement to isolate business logic from ORM, DB, and framework?
│   ├── YES (All signals matched) ──> EXPLICIT ARCHITECTURE
│   └── NO ────────────────────────> Proceed to STEP 3

STEP 3: Growing multi-feature system or simple CRUD?
├── Multiple distinct business areas (Auth, Billing, Catalog), team 3–10 devs?
│   ├── YES ───────────────────────> STRUCTURED MODULES (Recommended Default)
│   └── NO (Simple CRUD, 1–3 devs, prototype) ──> LAYERED ARCHITECTURE
```

#### Phase 2: Structural Variant Resolution (Select Internal Folder Organization)

Once the base pattern is resolved, choose its internal code structure:

```text
IF pattern is STRUCTURED MODULES:
├── Many independent features, team parallelism, high AI-agent workflow?
│   ├── YES ──> Vertical Slices (token: structured-vertical)
│   └── NO  ──> Technical Layers (token: structured-layers; familiar MVC structure)

IF pattern is EXPLICIT ARCHITECTURE:
├── Smaller entities, priority on file co-location without intermediate subfolders?
│   ├── YES ──> Flat Vertical Slices (token: explicit-flat)
├── High feature count, multiple developers on one bounded context?
│   ├── YES ──> Vertical Slices (token: explicit-vertical; Nested Application/Infra/Presentation)
│   └── NO  ──> Architectural Layers (token: explicit-layers; canonical 4 rings)

IF pattern is MICROSERVICES:
├── Services share schemas, evolve synchronously, owned by single team?
│   ├── YES ──> Multiple Services (Monorepo) (token: microservices-monorepo)
│   └── NO  ──> Single Service (Polyrepo) (token: microservices-single)
```

---

### 2.3 Red Flags & Anti-Signals (Overengineering & Chaos Traps)

| Observed Situation / Context | ❌ DO NOT CHOOSE | Failure Mode & Consequences | What to Choose Instead |
|---|---|---|---|
| Team < 10 devs, early-stage product exploring product-market fit | **Microservices** | Guaranteed "Distributed Monolith"; network latency and deployment coordination kill velocity | **Structured Modules** |
| Simple database with 3–5 tables, standard REST CRUD endpoints | **Explicit Architecture** | Severe overengineering: a simple field update requires touching 6+ classes across rings | **Layered** or **Structured Modules** |
| Team > 5 devs, long-term application developed for > 6 months | **Layered Architecture** | Services degrade into 1000-line procedural scripts; frequent merge conflicts on shared files | **Structured Modules (Slices)** |
| Multiple developers concurrently editing features in same module | **Technical Layers** | Repeated merge conflicts in shared entity controllers, routes, and services | **Vertical Slices** |

---

### 2.4 DESCRIPTION.md Extraction Signals (AI-Agent Guidance)

When evaluating project context from `.ai-factory/DESCRIPTION.md`, the AI agent looks for these explicit text signals:

- **Layered signals:** `CRUD`, `prototype`, `MVP`, `internal tool`, `admin dashboard`, `simple REST`, `hackathon`, `small team (1-2)`.
- **Structured Modules signals:** `SaaS`, `modular`, `e-commerce`, `multi-feature`, `growing team (3-10)`, `Postgres + ORM (Prisma/Drizzle/SQLAlchemy)`, `FastAPI`, `NestJS`.
- **Explicit Architecture signals:** `DDD`, `Clean Architecture`, `complex business logic`, `fintech`, `banking`, `compliance`, `multi-tenant`, `event-driven`, `domain events`, `hexagonal`.
- **Microservices signals:** `distributed`, `independent scaling`, `multi-repo`, `Kubernetes`, `Kafka`, `polyglot persistence`, `autonomous squads`, `large engineering org`.
- **Vertical Slices signals:** `many independent features`, `high velocity`, `AI-assisted development`, `feature-sliced`, `modular endpoints`.

---

## 3. Evolution Roadmap & Triggers

Signals indicating that it is time to migrate to a higher-order architectural pattern:

```text
Layered ──> Structured Modules ──> Explicit Architecture ──> Microservices
```

### Layered → Structured Modules
- Services grow beyond 500 LOC and mix unrelated features.
- Cross-feature imports form an entangled web.
- Testing a service requires mocking half the application and database.
- New features consistently touch 5+ files across the entire `src/` tree.

### Structured Modules → Explicit Architecture
- Domain logic leaks into services despite conventions (business rules placed in orchestrators).
- Need to swap infrastructure (DB, queue, email client) without modifying domain models.
- Multiple teams work on the same module and step on each other's changes.
- Module `Infrastructure/` grows uncontrollably — a clear sign of missing domain boundaries.

### Monolith (any pattern) → Microservices
- Different parts of the system have fundamentally conflicting scaling profiles (e.g. video processing vs auth).
- Teams are blocked by coordinated deployments and release trains.
- Polyglot persistence is strictly required (e.g., relational SQL + graph DB + vector search).
- A single team's deployment failure blocks all other teams from shipping.

> 📖 **Full Evolution & Migration Playbooks:** For detailed step-by-step procedures, ASCII file tree mappings, Strangler Fig patterns, and migration anti-patterns, see **[Architecture Migrations & Evolution Guides](./MIGRATIONS.md)**.

---

## 4. Uniform Terminology & Conventions

All folder structures across all specification modules use consistent placeholder names:

| Placeholder | Meaning | Examples | Maps to |
|---|---|---|---|
| `[EntityName]` | Core domain model — data entity with identity and business rules | `User`, `Order`, `Product`, `Invoice` | Models, Repositories, Domain layer |
| `[FeatureName]` | A use case scoped to a **single entity** | `CreateUser`, `UpdateProfile`, `DeleteProduct` | Entity slice: Controller methods, Action classes, Service classes, Handlers |
| `[ProcessName]` | An orchestration spanning **multiple entities** — cross-entity business process | `PlaceOrder`, `Checkout`, `TransferFunds`, `OnboardCustomer` | Process slice (alongside entity slices in `Slices/`) |
| `[ModuleName]` | A feature module grouping related entities and processes (Structured Modules) | `Auth`, `Catalog`, `Payments` | Top-level module folder |
| `[ContextName]` | A bounded context with its own ubiquitous language (Explicit Architecture) | `Identity`, `Ordering`, `Inventory` | Top-level context folder |
| `[ServiceName]` | An independently deployable microservice | `OrderService`, `PaymentGateway` | Microservice root folder |
| `[Channel]` | A delivery channel/audience segment distinguishing access to the same entity | `Admin`, `Public` | Delivery folders (`Api/`, `Web/`) — rules consolidated in **Channel handling** below |
| `[AggregateName]`| An aggregate root grouped with its child entities in a dedicated folder | `Order` (with `OrderItem`), `Invoice` | `Domain/[AggregateName]/` folder (Explicit Architecture) |
| `_Shared/` | Shared assets preventing lateral imports: entity-level for schemas/base DTOs (`Slices/[EntityName]/_Shared/`), channel-level for intra-channel assets (`[Channel]/_Shared/`), and presentation-level for cross-channel UI (`Presentation/Web/_Shared/Components/`) | `_Shared/Schemas/`, `_Shared/Components/`, `[Channel]/_Shared/` | Entity root or presentation channel folder |
| `{ext}` | The project's file extension, substituted per stack conventions | `.ts`, `.php`, `.go`, `.py` | File suffix in all folder trees |

### Architectural Abstraction vs. Idiomatic Casing (Zero Hard Lock-in)

> **Core Principle for AI Agents and Engineers:**
> The PascalCase folder names (e.g. `Controllers/`, `Services/`, `Domain/`, `Application/`, `Presentation/`) used throughout this reference are **architectural abstractions** used for universal readability. They define **conceptual layer roles, boundary responsibilities, and dependency directions** — NOT rigid literal folder paths or strict casing mandates.

When generating `.ai-factory/ARCHITECTURE.md` or scaffolding project directories:
1. **Directory and File Casing Must Follow Stack Idioms:**
   - **Python / Rust:** Use `snake_case` (e.g. `src/ordering/domain/`, `use_cases/`, `_shared/components/`, `product_form.py`).
   - **Go:** Use short `lowercase` package names (e.g. `internal/order/`, `ports.go`, `service.go`).
   - **TypeScript / Node / Next.js:** Use `kebab-case` or `camelCase` for files (e.g. `order-repository.port.ts`, `product-form.tsx`) and `kebab-case` or `camelCase` for directories (`modules/catalog/_shared/components/`).
   - **C# / Java / Kotlin:** Use `PascalCase` for directories and files (e.g. `MyApplication.Domain/`, `CreateOrder/`, `OrdersController.cs`).
2. **Synonymous Directory Naming is Fully Permitted:**
   Ecosystem-standard synonyms for architectural roles are 100% valid:
   - `Ports/` ⟷ `Interfaces/` ⟷ `Contracts/` (or single file `ports.go` in Go)
   - `Application/` ⟷ `UseCases/` ⟷ `App/` ⟷ `Services/`
   - `Presentation/` ⟷ `Delivery/` ⟷ `Http/` ⟷ `Api/` ⟷ `Web/`
   - `Infrastructure/` ⟷ `Infra/` ⟷ `Adapters/`
   - `_Shared/` ⟷ `_shared/` ⟷ `Shared/` ⟷ `Common/`
   - `Models/` ⟷ `Entities/` ⟷ `Domain/`
3. **Co-location over Dogmatic Folder Nesting:**
   In smaller modules or languages preferring flat layouts (e.g. Go, flat TypeScript slices), Value Objects, Domain Events, and Ports do not require isolated subfolders (`ValueObjects/`, `Events/`); they can sit directly alongside the entity in the package root.

### Action Organization Styles

Every non-Layered structural variant organizes use cases in one of two styles, chosen once and applied consistently across the whole project (*Layered Architecture* has no style choice — unified multi-action by design):

- **Style 1: Feature Subfolders:** Each use case lives in its own `[FeatureName]/` folder together with its DTO — across every layer it touches (delivery and use-case logic); the exact locations per variant are shown in the folder trees. Maximizes feature isolation and prevents flat directory clutter as features multiply.
- **Style 2: Unified Multi-Action:** All use cases of an entity are grouped into single per-entity files (`[EntityName]Controller.{ext}`, `[EntityName]Service.{ext}`); DTOs sit next to the service (see the trees). Fewer files, traditional conventions.

#### Shared Assets within Style 1 (CRUD & Form Sharing)
When multiple feature subfolders of the same entity share assets (e.g., a shared CRUD form template, base DTO, or validation schema between `Create[EntityName]` and `Update[EntityName]`):
1. **Entity-Level Backend `_Shared/` Directory:** Shared backend assets belong in `Slices/[EntityName]/_Shared/` (`_Shared/Schemas/` for validation schemas, `_Shared/Dtos/` for base DTOs).
2. **Presentation Layer & Channel-Level `_Shared/` Directories:**
   - **Cross-Channel Presentation `_Shared/` (`Presentation/Web/_Shared/Components/`):** In UI/Fullstack apps, shared form components (e.g. `[EntityName]Form.{ext}`) consumed across multiple channels (Admin & Public) live in `Presentation/Web/_Shared/Components/`.
   - **Intra-Channel `_Shared/` (`Presentation/[Delivery]/[Channel]/_Shared/`):** Channel-specific shared assets (e.g. admin-only tables, filter bars, channel DTOs/serializers) live inside that channel's own `_Shared/` folder.
3. **No Lateral Feature Imports:** A feature subfolder must not import directly from a sibling feature subfolder (e.g., `UpdateUser` does not import from `CreateUser`). Shared backend assets are placed in entity-level `_Shared/`, and shared UI assets in presentation `_Shared/`.

### Channel Handling
`[Channel]` distinguishes multiple audiences served by the same delivery folder. It applies only where the trees show delivery folders (`Api/`, `Web/` in the Explicit Architecture variants and the single-microservice `Api/`), and only when the project serves multiple audiences — omit `[Channel]/` entirely for single-channel projects:
- **Style 1:** A `[Channel]/` folder sits above the feature folders: `[Channel]/[FeatureName]/[FeatureName]Action.{ext}`. Each channel maintains its own `[Channel]/_Shared/` for intra-channel helpers and serializers.
- **Style 2, Explicit architectural layers and vertical slice variants:** Channel folders sit under `Api/`/`Web/`: `[Channel]/[EntityName]Controller.{ext}`.
- **Style 2, flat slices:** Flat stays flat — no channel folders; the channel becomes a file prefix: `[Channel][EntityName]Controller.{ext}` (e.g. `AdminUserController.{ext}`).

#### Multi-Channel & Shared Scope Example (Style 1):
```text
Slices/[EntityName]/
├── _Shared/                                    # Entity-level backend shared (schemas, base DTOs)
│   ├── Schemas/                                # Reusable validation schemas (e.g. Zod, Pydantic)
│   └── Dtos/                                   # Shared base DTO types
├── Application/                                # Use-case orchestration
│   ├── CreateUser/CreateUserHandler.{ext}      # Separate use cases
│   └── UpdateUser/UpdateUserHandler.{ext}
└── Presentation/
    ├── Api/
    │   ├── Admin/                              # [Channel] Admin (Backoffice API)
    │   │   ├── _Shared/                        # Intra-channel shared (admin filters, serializers)
    │   │   ├── CreateUser/CreateUserAction.{ext}
    │   │   └── ListUsers/ListUsersAction.{ext}
    │   └── Public/                             # [Channel] Public (Storefront API)
    │       ├── _Shared/                        # Intra-channel shared (public query params)
    │       ├── GetProfile/GetProfileAction.{ext}
    │       └── UpdateProfile/UpdateProfileAction.{ext}
    └── Web/                                    # UI / SSR Delivery (for Fullstack apps)
        ├── _Shared/
        │   └── Components/                     # Cross-channel UI forms (e.g. [EntityName]Form.{ext})
        ├── Admin/                              # [Channel] Admin Web Views
        │   ├── _Shared/                        # Admin-only UI (e.g. AdminUserTable.{ext})
        │   └── EditUser/EditUserView.{ext}     # Uses _Shared/Components/[EntityName]Form
        └── Public/                             # [Channel] Public Web Views
            └── EditProfile/EditProfileView.{ext}
```
> **Channel Isolation Rule:** The `Public/` channel must NEVER import files from the `Admin/` channel. Cross-channel shared presentation logic belongs in `Presentation/Web/_Shared/Components/`, while channel-specific shared assets stay inside that channel's `[Channel]/_Shared/`.

### Role Mapping Across Styles

The architectural roles map consistently across styles and variants:

- **Delivery (`[FeatureName]Action` / `[EntityName]Controller`):** Handles incoming transport payloads and delegates to the use-case layer.
- **Use-case logic (`[FeatureName]Handler` / `[EntityName]Service` / `[FeatureName]Service`):** Orchestrates application workflows and coordinates domain models and repositories.
- **Data access (`[EntityName]Repository`):** Encapsulates persistence operations for the entity.

Every dependency rule expressed with Controller/Service vocabulary (strict downward flow, no layer skipping, inward dependencies) applies identically to `Action`/`Handler` files and to `[FeatureName]Controller`/`[FeatureName]Service` equivalents: an Action or Controller must never bypass the Handler or Service to call a Repository directly.

---

## 5. Specification Modules Directory

Detailed architecture specifications:
- 📄 **[Layered Architecture](./LAYERED.md)** — Standard 3-tier architecture, downward dependencies, thin controllers, migration.
- 📄 **[Structured Modules Architecture](./STRUCTURED-MODULES.md)** — Modular monolith, domain-centric design, technical layers vs vertical slices.
- 📄 **[Explicit Architecture](./EXPLICIT-ARCHITECTURE.md)** — Clean / Hexagonal / DDD, 4 rings, architectural layers, vertical & flat slices, unified driving adapters (HTTP, async consumers, cron, CLI).
- 📄 **[Microservices Architecture](./MICROSERVICES.md)** — Polyrepo, monorepo, saga transactions, distributed outbox, failure isolation.
- 📄 **[Stack Blueprints](./STACK-BLUEPRINTS.md)** — Concrete folder trees and idiomatic patterns for Go, TypeScript, Python, Java, C#, PHP.
- 📄 **[Domain Modeling & Code Examples](./DOMAIN-MODELING.md)** — Rich vs Anemic models, Value Objects, Aggregate Roots with OCC versioning, Ports & Adapters, CQRS read optimization (domain bypass), Syntactic vs Semantic validation, and SOLID & GRASP architectural principles in code (Tell Don't Ask, ISP role ports, LSP fakes, Creator, Pure Fabrication).
- 📄 **[Persistence & ORM Integration](./PERSISTENCE-AND-ORM.md)** — Data Mapper pattern (4-tier separation), cross-aggregate references by ID only, atomic Optimistic Concurrency Control, Unit of Work, Transactional Outbox, modern ORM strategies.
- 📄 **[Architecture Migrations & Evolution Guides](./MIGRATIONS.md)** — Comprehensive migration playbooks: inter-pattern evolution (Layered → Modules → Explicit → Microservices), intra-pattern variant transitions (Technical Layers → Slices, Polyrepo → Monorepo), ORM decoupling (Active Record → Data Mapper), and anti-patterns.
