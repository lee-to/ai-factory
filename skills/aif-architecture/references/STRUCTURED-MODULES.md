# Structured Modules Architecture

Structured Modules is a lightweight, domain-aware modular architecture. Each module encapsulates a cohesive feature area with its own delivery endpoints, application services (orchestrators), rich domain models, and repositories.

It brings the core benefits of Domain-Driven Design (rich models, dependency inversion) without the strict folder formalism and boilerplate of full Hexagonal / Clean Architecture.

---

## 1. Why this Architecture Exists

Traditional Layered Architecture often degrades into "Transaction Scripts" (anemic models consisting only of getters/setters + giant procedural services) as applications expand. Full Explicit Architecture avoids this degradation, but introduces a steep learning curve and significant ceremony (ports, adapters, domain events, aggregate roots).

**Structured Modules occupies the practical middle ground:**
- It enforces rich domain models and interface-based dependency inversion within a clean, intuitive folder structure.
- It groups code by business feature rather than technical concern, providing high cohesion.
- It establishes clear boundaries that make an eventual migration to Explicit Architecture straightforward.

### Domain-Centric, not Service-Centric
Unlike traditional layered patterns, Structured Modules is **not** service-centric:
- The `Services/` layer acts strictly as **Application Services** (orchestrating use cases: fetch data → call model method → persist).
- The actual core business rules, validations, calculations, and state mutations live strictly inside the `Models/` (**Rich Domain Models**).

---

## 2. Organization Variants

Within each module, code can be organized in two ways:
1. **Technical Layers:** `Controllers/`, `Services/`, `Repositories/`, `Models/` as separate directories inside the module.
2. **Vertical Slices:** Grouping delivery, use-case logic, and data access for a specific entity into a slice directory. Cross-entity workflows live in dedicated process slices.

> 💡 **Transitioning between variants:** If a module outgrows Technical Layers due to team scale or merge conflicts, see the step-by-step refactoring guide: **[Architecture Migrations — Technical Layers to Vertical Slices](./MIGRATIONS.md#5-migration-technical-layers--vertical-slices-intra-pattern-evolution)**.

> **Note on Naming & Casing Flexibility:** Directory names (e.g. `Controllers/`, `Services/`, `Slices/`, `_Shared/`) are architectural abstractions defining layer roles and boundaries. Adapt casing and structure to your stack (e.g. `_shared/` in Python `snake_case`, lowercase in Go). There is no hard lock-in to literal PascalCase.

---

### Variant A: Folder Structure — Technical Layers

```text
src/
├── [ModuleName]/                               # ── FEATURE MODULE ──
│   ├── Controllers/                            # HTTP handlers, request validation
│   │   # ── Style 2: Unified Multi-Action ──
│   │   └── [EntityName]Controller.{ext}
│   │   # ── Style 1: Feature Subfolders ──
│   │   # └── [FeatureName]/[FeatureName]Controller.{ext}
│   │
│   ├── Services/                               # Application Services (orchestrators)
│   │   # ── Style 2: Unified Multi-Action ──
│   │   ├── [EntityName]Service.{ext}
│   │   ├── [ProcessName]Service.{ext}          # Cross-entity orchestration (e.g. PlaceOrderService)
│   │   └── [FeatureName]Dto.{ext}              # DTO next to the orchestrating service
│   │   # ── Style 1: Feature Subfolders ──
│   │   # ├── [FeatureName]/
│   │   # │   ├── [FeatureName]Service.{ext}
│   │   # │   └── [FeatureName]Dto.{ext}
│   │   # └── [ProcessName]/
│   │   #     └── [ProcessName]Service.{ext}
│   │
│   ├── Repositories/                           # Data access (interface + implementation)
│   │   └── [EntityName]Repository.{ext}
│   │
│   └── Models/                                 # Rich domain models & value objects
│       └── [EntityName].{ext}
│
├── [AnotherModuleName]/                        # Other isolated feature module
│   └── ...
│
└── Infrastructure/                             # ── CROSS-CUTTING INFRASTRUCTURE ──
    ├── Types/                                  # Shared type definitions
    ├── Utils/                                  # Shared utility functions
    └── Middleware/                             # Global middleware (auth, error formatting)
```

---

### Variant B: Folder Structure — Vertical Slices

```text
src/
├── [ModuleName]/                               # ── FEATURE MODULE ──
│   ├── Slices/                                 # Slices grouped by entity and process
│   │   ├── [EntityNameA]/                      # Entity slice (e.g., User)
│   │   │   # ── Shared Backend Assets within this entity (prevents lateral imports) ──
│   │   │   ├── _Shared/
│   │   │   │   ├── Schemas/                    # Shared validation schemas
│   │   │   │   └── Dtos/                       # Base DTOs
│   │   │   │
│   │   │   # ── Style 1: Feature Subfolders ──
│   │   │   ├── Create[EntityNameA]/            # Dedicated folder for Create use case
│   │   │   │   ├── Create[EntityNameA]Action.{ext}
│   │   │   │   ├── Create[EntityNameA]Handler.{ext}
│   │   │   │   └── Create[EntityNameA]Dto.{ext}
│   │   │   ├── Update[EntityNameA]/            # Dedicated folder for Update use case
│   │   │   │   ├── Update[EntityNameA]Action.{ext}
│   │   │   │   ├── Update[EntityNameA]Handler.{ext}
│   │   │   │   └── Update[EntityNameA]Dto.{ext}
│   │   │   # ── Style 2: Unified Multi-Action ──
│   │   │   # ├── [EntityNameA]Controller.{ext} # Unified controller for all entity actions
│   │   │   # ├── [EntityNameA]Service.{ext}    # Unified service for all entity use cases
│   │   │   # └── [FeatureName]Dto.{ext}
│   │   │   # ── Shared Data Access within Entity ──
│   │   │   └── [EntityNameA]Repository.{ext}   # Data access for EntityNameA
│   │   │
│   │   ├── [EntityNameB]/                      # Another entity slice (e.g., Role)
│   │   │   └── ...
│   │   │
│   │   └── [ProcessName]/                      # Process slice — cross-entity orchestration
│   │       # ── Style 1: Feature Subfolders ──
│   │       ├── [ProcessName]Action.{ext}       # Endpoint / Action
│   │       ├── [ProcessName]Handler.{ext}      # Orchestration logic
│   │       └── [ProcessName]Dto.{ext}          # DTO
│   │       # ── Style 2: Unified Multi-Action ──
│   │       # ├── [ProcessName]Controller.{ext}
│   │       # ├── [ProcessName]Service.{ext}
│   │       # └── [ProcessName]Dto.{ext}
│   │
│   ├── Models/                                 # Rich domain models shared within the module
│   │   ├── [EntityNameA].{ext}
│   │   └── [EntityNameB].{ext}
│   │
│   └── Infrastructure/                         # Internal utilities strictly for this module
│
├── [AnotherModuleName]/
│   └── ...
│
└── Infrastructure/                             # ── GLOBAL INFRASTRUCTURE ──
    └── ...
```

---

## 3. Key Principles

1. **Module Boundaries:** Each module represents a cohesive feature area. Modules expose a public API (exported services/interfaces). Other modules must consume this public API and never reach into another module's internal files.
2. **Lightweight Dependency Inversion:** Services receive dependencies (like repositories) via constructor injection. Interface-based repositories are encouraged to prepare for an eventual infrastructure split.
3. **Domain Awareness:** While service classes coordinate transactions and operations, business rules, calculations, and invariant checks must be pushed into `Models/`.
4. **Pragmatic Separation from Full DDD:** Unlike full DDD, Structured Modules does not mandate formal Aggregate roots, explicit Domain Events, or rigid hexagonal port folders. This keeps developer velocity high while maintaining clean code separation.
5. **Minimal Root Infrastructure:** The global `Infrastructure/` folder should remain small, containing only genuine cross-cutting utilities (types, logging, auth middleware).
6. **Schema & Table Ownership:** A module strictly owns its database tables. Other modules are strictly prohibited from executing direct SQL `JOIN`s or declaring ORM foreign-key relationships across module boundaries. Cross-module data integration must proceed via public API method calls, DTOs, or domain events, correlated by ID.
7. **The Rule of Three for Shared Code:** Utilities and helpers are moved to the root `Infrastructure/` folder ONLY if they are genuinely used across 3 or more modules and are strictly technical. Domain models, entities, and business validation rules must never be placed in the global infrastructure folder.

---

## 4. Dependency Rules

- **Strict Downward Flow:** Within each slice or module, dependencies point in one direction: `Controllers/Actions → Services/Handlers → Repositories`. Repositories and `Models/` MUST NEVER depend on Controllers or Handlers.
- **No Layer Skipping:** Controllers must not bypass the Service/Handler layer to interact directly with Repositories.
- **Module Isolation:** Modules depend on root `Infrastructure/` for shared cross-cutting types and middleware, but NEVER on another module's internal directories. Cross-module communication must proceed only through designated public interfaces/facades or domain events.

---

## 5. Migration Path to Explicit Architecture

When business logic grows complex or infrastructure needs to be swappable, Structured Modules evolves naturally into [Explicit Architecture](./EXPLICIT-ARCHITECTURE.md) by purifying the domain, introducing strict ports and adapters, and formalizing use cases.

For the complete step-by-step migration guide, ASCII file tree mappings, and domain extraction procedures, see:
👉 **[Architecture Migrations: Structured Modules to Explicit Architecture](./MIGRATIONS.md#3-migration-structured-modules--explicit-architecture)**

---

## 6. Anti-Patterns to Avoid

- ❌ **Anemic Domain Models:** Creating models that are just dumb data bags (only getters/setters without behavior). Models should encapsulate their own invariants and rules.
- ❌ **Layer Skipping:** Controllers interacting directly with Repositories or raw database queries.
- ❌ **Upward Dependencies:** Services importing Controllers, or Models importing Services.
- ❌ **Circular Module Dependencies:** Module A imports Module B while Module B imports Module A. Break cycles using domain events or shared types in `Infrastructure/`.
- ❌ **Database Backdoor (Cross-Module SQL JOINs):** Executing direct SQL queries or declaring ORM foreign-key relationships to another module's database tables in bypass of its public API.
- ❌ **The Fake Public API:** Exporting internal repositories or raw database models from a module instead of clean DTOs and public application services.
- ❌ **The "Shared" Junk Drawer:** Relocating domain entities, models, or business logic into the global `Infrastructure/` folder to bypass encapsulation, turning the architecture into a tangled monolith.
