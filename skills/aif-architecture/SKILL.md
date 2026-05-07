---
name: aif-architecture
description: Generate architecture guidelines for the project. Analyzes tech stack from DESCRIPTION.md, recommends an architecture pattern, and creates .ai-factory/ARCHITECTURE.md. Use when setting up project architecture, asking "which architecture", or after /aif setup.
argument-hint: "[structured|explicit|vertical|microservices|layers]"
allowed-tools: Read Write Glob Grep Bash(mkdir *) AskUserQuestion Questions
disable-model-invocation: false
---

# Architecture - Generate Architecture Guidelines

Generate `.ai-factory/ARCHITECTURE.md` with architecture decisions tailored to the project.

## Workflow

### Step 0: Load Config & Project Context

**FIRST:** Read `.ai-factory/config.yaml` if it exists to resolve:
- **Paths:** `paths.description` and `paths.architecture`
- **Language:** `language.ui` for prompts and `language.artifacts` for generated architecture content

When invoked by `/aif`, assume `.ai-factory/config.yaml` has already been written for the current setup run and already contains the resolved `language.ui` / `language.artifacts` values.

If config.yaml doesn't exist, use defaults:
- DESCRIPTION.md: `.ai-factory/DESCRIPTION.md`
- ARCHITECTURE.md: `.ai-factory/ARCHITECTURE.md`
- Language: `en` (English)

**THEN:** Read `.ai-factory/DESCRIPTION.md` (use path from config) if it exists to understand:
- Tech stack (language, framework, database, ORM)
- Project size and complexity
- Core features and requirements
- Non-functional requirements

**If `.ai-factory/DESCRIPTION.md` does not exist:**
```
⚠️  No project description found.

Run /aif first to set up project context, or describe your project manually:
- What are you building?
- Tech stack (language, framework, database)?
- Team size?
- Expected scale?
```

Allow standalone usage — if user provides manual input, use that instead.

**Read `.ai-factory/skill-context/aif-architecture/SKILL.md`** — MANDATORY if the file exists.

This file contains project-specific rules accumulated by `/aif-evolve` from patches,
codebase conventions, and tech-stack analysis. These rules are tailored to the current project.

**How to apply skill-context rules:**
- Treat them as **project-level overrides** for this skill's general instructions
- When a skill-context rule conflicts with a general rule written in this SKILL.md,
  **the skill-context rule wins** (more specific context takes priority — same principle as nested CLAUDE.md files)
- When there is no conflict, apply both: general rules from SKILL.md + project rules from skill-context
- Do NOT ignore skill-context rules even if they seem to contradict this skill's defaults —
  they exist because the project's experience proved the default insufficient
- **CRITICAL:** skill-context rules apply to ALL outputs of this skill — including the
  ARCHITECTURE.md template. The template in this SKILL.md is a **base structure**. If a skill-context
  rule says "architecture doc MUST include X" or "MUST cover section Y" — you MUST augment the
  template accordingly. Generating ARCHITECTURE.md that violates skill-context rules is a bug.

**Enforcement:** After generating any output artifact, verify it against all skill-context rules.
If any rule is violated — fix the output before presenting it to the user.

### Step 1: Analyze & Recommend

Based on project context, evaluate against the decision matrix and recommend an architecture:

**If `$ARGUMENTS` specifies an architecture** (e.g., `/aif-architecture explicit`):
- Use that architecture directly, skip to Step 2

**If no specific architecture requested:**
- Evaluate the project against the decision matrix (see Knowledge Base below)
- Consider: team size, domain complexity, scale requirements, tech stack
- Present recommendation via `AskUserQuestion`:

```
Based on your project context:
- [reason 1 from project analysis]
- [reason 2 from project analysis]

Which architecture pattern should we use?

1. [Recommended pattern] (Recommended) — [why it fits]
2. [Alternative 1] — [brief reason]
3. [Alternative 2] — [brief reason]
4. [Alternative 3] — [brief reason]
```

Architecture options:
- **Structured Modules** — layered architecture with module boundaries and basic dependency inversion. Simpler than Explicit Architecture but prepares the codebase for a smooth migration. Best for growing projects that need structure now but may evolve into Explicit Architecture later.
- **Explicit Architecture** — pragmatic fusion of DDD, Hexagonal, Onion, Clean, CQRS; domain at the center, dependencies point outward. Best for complex business domains with bounded contexts.
- **Vertical Slice + Explicit Architecture** — same Explicit Architecture principles, but code within each bounded context is organized by feature (vertical slices) instead of by technical layer. Best when features are independent, long-lived, and need to be understood in isolation.
- **Microservices** — independent deployment, good for large teams with clear domain boundaries
- **Layered Architecture** — simple layers (presentation → business → data), good for smaller projects

### Step 2: Generate the Architecture Artifact

Create the parent directory for the resolved architecture path if needed.

Generate the resolved architecture artifact (default: `.ai-factory/ARCHITECTURE.md`) with the following structure, **adapted to the project's tech stack and language**:

```markdown
# Architecture: [Pattern Name]

## Overview
[1-2 paragraphs: what this architecture is and why it was chosen for THIS project]

## Decision Rationale
- **Project type:** [from DESCRIPTION.md]
- **Tech stack:** [language, framework]
- **Key factor:** [primary reason for this choice]

## Folder Structure
\`\`\`
[folder structure adapted to the project's tech stack]
[use actual framework conventions — e.g., Next.js app/ dir, Laravel app/ dir, Go cmd/ dir]
\`\`\`

## Dependency Rules
[What depends on what. Inner vs outer layers. Module boundaries.]

- ✅ [allowed dependency direction]
- ❌ [forbidden dependency direction]

## Layer/Module Communication
[How layers or modules communicate with each other]
- [pattern 1]
- [pattern 2]

## Key Principles
1. [Principle 1 — adapted to this project]
2. [Principle 2]
3. [Principle 3]

## Code Examples

### [Example 1 title]
\`\`\`[language]
[code example in the project's language/framework]
\`\`\`

### [Example 2 title]
\`\`\`[language]
[code example showing dependency rule]
\`\`\`

## Anti-Patterns
- ❌ [What NOT to do in this architecture]
- ❌ [Common mistake to avoid]
```

**Rules for generation:**
- Adapt ALL examples to the project's language and framework (don't use TypeScript examples for a Go project)
- Use the project's actual conventions (import paths, naming, etc.)
- Keep it practical — focus on rules that affect day-to-day development
- Folder structure should extend from what already exists in the project, not replace it

### Step 3: Update DESCRIPTION.md

If the resolved DESCRIPTION.md path exists, add or update an architecture-pointer section in resolved `language.artifacts`.
Use the resolved architecture path from config, not the default path literal.

```markdown
## [Localized heading: Architecture]
[Localized sentence in resolved artifacts language referencing the resolved architecture artifact path for detailed architecture guidelines.]
[Localized label: Pattern]: [chosen pattern name]
```

### Step 4: Update AGENTS.md

If `AGENTS.md` exists in the project root, add the resolved architecture artifact path to the localized "AI Context Files" table in resolved `language.artifacts`:

```markdown
| [resolved-architecture-path] | [Localized architecture artifact description in resolved artifacts language] |
```

Only add if the resolved architecture path is not already present.

### Step 5: Confirm

Present the confirmation in resolved `language.ui` and report the resolved architecture path:

```
[Localized success heading in `language.ui`]

[Localized pattern label in `language.ui`]: [chosen pattern]
[Localized file label in `language.ui`]: [resolved architecture path]

[Localized key-rules heading in `language.ui`]:
- [rule 1]
- [rule 2]
- [rule 3]

[Localized closing sentence in `language.ui` about workflow skills following these architecture guidelines.]
```

## Artifact Ownership

- Primary ownership: the resolved architecture artifact path (default: `.ai-factory/ARCHITECTURE.md`).
- Respect config overrides: write to the resolved architecture path from `config.yaml` when provided.
- Allowed companion updates: architecture pointer in the resolved DESCRIPTION path from `config.yaml`, architecture row in `AGENTS.md` context table.
- Read-only context: roadmap, rules, research, and plan artifacts unless user explicitly requests otherwise.

---

## Knowledge Base

Reference material for architecture evaluation and generation. This content informs the generation — it is NOT output directly.

### Decision Matrix

| Factor                 | Layered | Structured Modules | Explicit Architecture | Vertical Slice + Explicit | Microservices  |
|------------------------|---------|--------------------|-----------------------|---------------------------|----------------|
| Team size              | 1-5     | 3-10               | 5-30                  | 5-30                      | 20+            |
| Domain complexity      | Low     | Medium             | High                  | High                      | High           |
| Scale requirements     | Low     | Low-Moderate       | Moderate-High         | Moderate-High             | Very High      |
| Feature independence   | Low     | Medium             | Medium                | High                      | Very High      |
| Module boundaries      | None    | Soft               | Hard                  | Hard                      | Hard (network) |
| Domain purity          | ❌       | Encouraged         | Enforced              | Enforced                  | Varies         |
| Initial velocity       | ✅ Fast  | ✅ Fast             | Medium                | Medium                    | ❌ Slow         |
| Operational complexity | ✅ Low   | ✅ Low              | Medium                | Medium                    | ❌ High         |

### Quick Decision Guide

```
New project, small team, simple domain? → Layered
Growing project, need structure but not full formalism? → Structured Modules
Complex business logic, many rules? → Explicit Architecture
Many independent features, long-lived? → Vertical Slice + Explicit Architecture
Multiple subdomains, large team? → Explicit Architecture or Vertical Slice + Explicit
Independent scaling + large org? → Microservices
Simple CRUD app? → Layered Architecture
Unclear requirements? → Start with Structured Modules, evolve to Explicit when patterns emerge
```

### Structured Modules

**Core Principle:** Layered architecture with module boundaries and basic dependency inversion. Each module is a feature area with its own routes, services, and repositories, but without the strict formalism of Explicit Architecture — no mandatory CQRS, no ContextMap, no enforced domain purity. The goal is to provide structure and separation while keeping the barrier to entry low.

**Why this architecture exists:** Layered Architecture breaks down when the project grows — everything ends up in a few flat folders. Explicit Architecture provides rigorous structure but has a steep learning curve and initial overhead. Structured Modules sits between them: it introduces module boundaries and interface-based dependency inversion today, making the eventual migration to Explicit Architecture a series of small, incremental steps rather than a rewrite.

**Migration path to Explicit Architecture:**
```
Structured Modules                           Explicit Architecture
├── [Module]/                                 ├── [BoundedContext]/
│   ├── controllers/      ── enforce ──>      │   ├── Domain/          ← extract domain logic
│   ├── services/         ── split ───>       │   ├── Application/     ← separate CQRS
│   ├── repositories/     ── interface ──>    │   ├── Infrastructure/ ← implement ports
│   └── models/           ── enrich ──>       │   └── Presentation/    ← formalize adapters
└── shared/              ── same ───>         └── Shared/
```
1. Enforce domain purity — move business logic out of services into domain entities
2. Split application layer — introduce Command/Query handlers (CQRS)
3. Formalize ports — repositories become interfaces in Domain/, implementations in Infrastructure/
4. Add ContextMap/ — when cross-module communication becomes complex

**Folder Structure:**
```
src/
├── modules/
│   ├── [Module]/                               # ── FEATURE MODULE ──
│   │   ├── controllers/                       # HTTP handlers, request validation
│   │   │   └── [Feature]Controller.{ext}
│   │   ├── services/                          # Business logic, orchestration
│   │   │   └── [Feature]Service.{ext}
│   │   ├── repositories/                      # Data access (interface + impl in same module)
│   │   │   └── [Entity]Repository.{ext}
│   │   └── models/                            # Domain models / DTOs
│   │       ├── [Entity].{ext}
│   │       └── [Feature]Dto.{ext}
│   │
│   └── [AnotherModule]/
│       └── ...                                # Same internal structure
│
└── shared/                                    # ── SHARED (cross-cutting) ──
    ├── types/                                 # Shared type definitions
    ├── utils/                                 # Utility functions
    ├── middleware/                            # HTTP middleware, auth, error handling
    └── config/                                # App configuration, database setup
```

**Dependency Rules:**
- Modules depend on shared/ but NOT on each other's internals.
- Controllers → Services → Repositories — layers within a module.
- Repository interfaces are encouraged but not mandatory (impl can live alongside interface).

**Key Principles:**

1. **Module Boundaries:** Each module encapsulates a feature area. Modules have a public API. Other modules MUST use this public API and never reach into internals. This is the single most important rule — it enables future extraction into bounded contexts.

2. **Dependency Inversion (lightweight):** Services receive dependencies through constructor injection. Repository interfaces are defined in the same module. The DI container wires implementations at the composition root. No need for strict port/adapter separation — just inject, don't `new`.

3. **Domain Awareness:** Business logic lives in services (not in controllers or repositories). Domain models should contain validation and behavior, not just data. Full domain purity (zero framework imports) is encouraged but not enforced — pragmatism over dogma.

4. **Shared is Minimal:** The shared/ folder should stay small. If shared/ starts growing, it's a sign that logic belongs in a specific module. shared/ is for truly cross-cutting concerns: types, utils, middleware, config.

**Anti-Patterns:**
- ❌ God module — single module handling unrelated features. Split by domain boundary.
- ❌ Circular module dependencies — module A imports module B, B imports A. Use shared types or events.
- ❌ Leaking internals — other modules importing from `controllers/` or `repositories/` directly.
- ❌ Shared dumping ground — putting business logic in shared/ instead of in the appropriate module.

---

### Explicit Architecture

**Core Principle:** The domain is the center of the application. Everything else (frameworks, databases, UI) is a peripheral detail that plugs into the domain through well-defined interfaces. Dependencies always point outward — inner layers NEVER import from outer layers.

**Architecture Layers** (4 concentric layers, innermost to outermost):
```
┌─────────────────────────────────────────────────────┐
│  4. CONFIGURATION / COMPOSITION ROOT                │  DI container, wiring, bootstrap
├─────────────────────────────────────────────────────┤
│  3. INFRASTRUCTURE / ADAPTERS                      │  DB repos, external APIs, frameworks
├─────────────────────────────────────────────────────┤
│  2. APPLICATION LAYER                              │  Use cases, services, DTOs, CQRS
├─────────────────────────────────────────────────────┤
│  1. DOMAIN LAYER (center)                          │  Entities, Value Objects, Domain Events,
│                                                    │  Ports (interfaces), Exceptions
└─────────────────────────────────────────────────────┘
```

**Dependency rule:** Inner layers NEVER import from outer layers. Outer layers implement interfaces (ports) defined by inner layers.

**Organization Variants:** Within each bounded context, code can be organized in two ways:
- **By technical layer** — Application/, Infrastructure/, Presentation/ as separate top-level folders inside the context (classic Explicit Architecture).
- **By vertical slice (feature)** — each feature gets its own folder containing its Application, Infrastructure, and Presentation subfolders. Domain stays shared across slices within the context. Best when features are independent and long-lived.

---

#### Folder Structure — Explicit Architecture (by technical layer)

```
src/
├── [BoundedContext]/                           # ── BOUNDED CONTEXT ──
│   ├── Domain/                                 # PURE DOMAIN (zero external deps)
│   │   ├── Enum/                               # Domain enumeration types
│   │   ├── Exception/                          # Domain exceptions
│   │   └── Port/                               # Repositories and etc (interfaces only)
│   │
│   ├── Application/                            # APPLICATION SERVICES (use cases)
│   │   ├── Command/                            # Command handlers (CQRS)
│   │   │   └── [Feature]/                      # Command DTO, CommandHandler, Interface
│   │   └── Query/                              # Query handlers (CQRS)
│   │       └── [Feature]/                      # QueryHandler and Interface
│   │
│   ├── Infrastructure/                         # INFRASTRUCTURE (adapters)
│   │   ├── Persistence/
│   │   │   └── [Entity]Repository/             # Implements Domain Port
│   │   │      ├── [Entity]Repository.{ext}
│   │   │      ├── Scope/                       # Query scopes / criteria
│   │   │      └── Mapper/                      # ORM <-> Domain mapper
│   │   ├── External/                           # External API adapters and clients
│   │   └── Messaging/                          # Domain event publisher
│   │
│   ├── Presentation/                           # PRESENTATION (delivery mechanism)
│   │   ├── [Interface]/                        # Web / API / Console / CLI / gRPC
│   │   │   ├── [Feature]Controller.{ext}
│   │   │   ├── [Feature]Request.{ext}
│   │   │   ├── [Feature]Response.{ext}
│   │   │   └── [Feature]ViewModel.{ext}
│   │   └── View/                               # Templates (if applicable)
│   │
│   └── ContextMap/                             # ANTI-CORRUPTION LAYER
│       ├── [OtherContext]Translator.{ext}       # Maps between contexts
│       └── [OtherContext]Facade.{ext}           # Facade for cross-context access
│
├── [AnotherBoundedContext]/                     # ── ANOTHER BOUNDED CONTEXT ──
│   └── ...                                     # Same internal structure
│
└── Shared/                                     # ── SHARED (cross-cutting) ──
   ├── Domain/                                  # Base ValueObject, DomainEvent, Uuid
   ├── Application/                             # EventDispatcherInterface, ClockInterface
   └── Infrastructure/                          # Sync/async event bus impl
```

#### Folder Structure — Vertical Slice + Explicit Architecture (by feature)

```
src/
├── [BoundedContext]/                           # ── BOUNDED CONTEXT ──
│   ├── Domain/                                 # PURE DOMAIN (shared across slices, zero external deps)
│   │   ├── Enum/                               # Domain enumeration types
│   │   ├── Exception/                          # Domain exceptions
│   │   └── Port/                               # Repositories and etc (interfaces only)
│   │
│   ├── Slices/
│   │   └── [Feature]/                          # Feature slice — self-contained across layers
│   │       ├── Application/                    # Use cases for this feature
│   │       │   ├── Command/                    # Command handler(s) for this feature
│   │       │   └── Query/                      # Query handler(s) for this feature
│   │       ├── Infrastructure/                 # Repos, mappers, adapters for this feature
│   │       └── Presentation/                   # Controllers, view models for this feature
│   │           └── [Interface]/                # Web / API / Console / CLI / gRPC
│   │               ├── Controller.{ext}
│   │               ├── template.{ext}          # Template (if applicable)
│   │               └── ViewModel.{ext}
│   │
│   ├── Infrastructure/                         # Cross-feature INFRASTRUCTURE (adapters)
│   │   ├── External/
│   │   │   ├── [ExternalService]Adapter.{ext}  # External API adapter
│   │   │   └── [ExternalService]Client.{ext}   # HTTP/gRPC client
│   │   └── Messaging/
│   │       └── [Event]Publisher.{ext}          # Domain event publisher
│   │
│   └── ContextMap/                             # ANTI-CORRUPTION LAYER
│       ├── [OtherContext]Translator.{ext}       # Maps between contexts
│       └── [OtherContext]Facade.{ext}           # Facade for cross-context access
│
├── [AnotherBoundedContext]/                     # ── ANOTHER BOUNDED CONTEXT ──
│   └── ...                                     # Same internal structure
│
└── Shared/                                     # ── SHARED (cross-cutting) ──
   ├── Domain/                                  # Base ValueObject, DomainEvent, Uuid
   ├── Application/                             # EventDispatcherInterface, ClockInterface
   └── Infrastructure/                          # Sync/async event bus impl
```

---

**Core Principles:**

1. **Bounded Contexts:** Each bounded context represents a distinct business domain with its own ubiquitous language. A bounded context should be extractable into its own microservice without internal code changes.
  - Each bounded context has its own domain model, isolated from other contexts.
  - Cross-context communication happens through DTOs, facades, or domain events — never through shared entities.
  - Context Mapping: contexts communicate through strategic DDD patterns (Anti-Corruption Layer, Shared Kernel, Customer/Supplier)

2. **Domain Layer Purity:** The domain layer has ZERO dependencies on frameworks, databases, or external services. Contains Entities, Aggregates, Value Objects, Domain Events, Ports (interfaces), and Domain Exceptions. This makes the architecture testable and portable.

3. **Ports and Adapters (Hexagonal):** The domain defines interfaces (ports). Infrastructure implements them (adapters). Driving adapters (Controllers, CLI) drive the application; Driven adapters (Repositories, external clients) are driven by the application.

    ```
              ┌──────────────┐
              │   Controller  │  ← Driving Adapter (left)
              └──────┬───────┘
                     │ calls
              ┌──────▼───────┐
              │ App Service   │  ← Application Layer
              └──────┬───────┘
                     │ uses
              ┌──────▼───────┐
              │    Domain     │  ← Domain Layer (ports defined here)
              └──────┬───────┘
                     │ implemented by
              ┌──────▼───────┐
              │  Repository   │  ← Driven Adapter (right)
              └──────────────┘
    ```

4. **CQRS:** Separate write operations (Commands) from read operations (Queries) at the application service level. Each command/query has a DTO, a handler interface (Application layer), and a handler implementation.

5. **Vertical Slices** (when using the by-feature variant): Organize code by feature, not by technical layer. Each feature (vertical slice) contains everything it needs across Application, Infrastructure, and Presentation. Domain entities stay shared in the context's Domain/ folder. This makes features self-contained, easy to understand, and independently testable.

6. **Dependency Inversion:** Inner layers define interfaces. Outer layers implement them. The DI container (Composition Root) wires everything together. No `new` keyword for concrete implementations in inner layers — always inject interfaces.

**Anti-Patterns:**
- ❌ Anemic Domain Model — entities with only getters/setters and no behavior
- ❌ Leaking dependencies inward — importing framework types in the domain layer
- ❌ God services — single application service handling all features
- ❌ Shared mutable state across contexts — use events, facades, or DTOs instead
- ❌ Infrastructure in domain tests — domain tests should not need a database

### Microservices

**When to Use:**
- Large teams needing independent deployment
- Different scaling requirements per service
- Polyglot persistence needs

**When NOT to Use:**
- Small team (< 10 people)
- Unclear domain boundaries
- Startups exploring product-market fit

**Communication Patterns:**
- Synchronous (HTTP/gRPC): queries, real-time validation
- Asynchronous (Events/Messages): side effects, eventual consistency

**Data Patterns:**
- Database per Service
- Saga Pattern for distributed transactions

### Layered Architecture

**Core Principle:** Separate concerns into horizontal layers. Each layer only depends on the layer directly below it.

**Folder Structure (TypeScript example):**
```
src/
├── routes/                # Presentation layer (HTTP handlers)
├── controllers/           # Request/response handling
├── services/              # Business logic layer
├── models/                # Data models
├── repositories/          # Data access layer
└── utils/                 # Cross-cutting utilities
```

**Dependency Rules:**
- Routes → Controllers → Services → Repositories → Database
- No skipping layers (routes should not call repositories directly)
