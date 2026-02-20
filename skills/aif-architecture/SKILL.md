---
name: aif-architecture
description: Generate architecture guidelines for the project. Analyzes tech stack from DESCRIPTION.md, recommends an architecture pattern, and creates .ai-factory/ARCHITECTURE.md. Use when setting up project architecture, asking "which architecture", or after /aif setup.
argument-hint: "[clean|ddd|microservices|monolith|layers]"
allowed-tools: Read Write Glob Grep Bash(mkdir *) AskUserQuestion Questions
disable-model-invocation: false
---

# Architecture - Generate Architecture Guidelines

Generate `.ai-factory/ARCHITECTURE.md` with architecture decisions tailored to the project.

## Workflow

### Step 0: Load Project Context

**Read `.ai-factory/DESCRIPTION.md`** if it exists to understand:
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

### Step 1: Analyze & Recommend

Based on project context, evaluate against the decision matrix and recommend an architecture:

**If `$ARGUMENTS` specifies an architecture** (e.g., `/aif-architecture clean`):
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
- **Clean Architecture** — strict dependency inversion, good for complex business logic
- **Domain-Driven Design (DDD)** — bounded contexts, good for complex domains with multiple subdomains
- **Microservices** — independent deployment, good for large teams with clear domain boundaries
- **Modular Monolith** — single deployment with strong module boundaries, good default for most projects
- **Layered Architecture** — simple layers (presentation → business → data), good for smaller projects

### Step 2: Generate .ai-factory/ARCHITECTURE.md

```bash
mkdir -p .ai-factory
```

Generate `.ai-factory/ARCHITECTURE.md` with the following structure, **adapted to the project's tech stack and language**:

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

If `.ai-factory/DESCRIPTION.md` exists, add an `## Architecture` section (or update if it already exists):

```markdown
## Architecture
See `.ai-factory/ARCHITECTURE.md` for detailed architecture guidelines.
Pattern: [chosen pattern name]
```

### Step 4: Update AGENTS.md

If `AGENTS.md` exists in the project root, add `.ai-factory/ARCHITECTURE.md` to the "AI Context Files" table:

```markdown
| .ai-factory/ARCHITECTURE.md | Architecture decisions and guidelines |
```

Only add if not already present.

### Step 5: Confirm

```
✅ Architecture document generated!

Pattern: [chosen pattern]
File: .ai-factory/ARCHITECTURE.md

Key rules:
- [rule 1]
- [rule 2]
- [rule 3]

All workflow skills (/aif-plan, /aif-implement) will now follow these architecture guidelines.
```

---

## Knowledge Base

Reference material for architecture evaluation and generation. This content informs the generation — it is NOT output directly.

### Decision Matrix

| Factor | Layered | Clean Architecture | Modular Monolith | DDD | Microservices |
|--------|---------|-------------------|-------------------|-----|---------------|
| Team size | 1-5 | 1-15 | 5-30 | 5-30 | 20+ |
| Domain complexity | Low | Medium-High | Medium-High | High | High |
| Scale requirements | Low | Moderate | Moderate-High | Moderate-High | Very High |
| Deploy independence | ❌ | ❌ | Partial | Partial | ✅ |
| Initial velocity | ✅ Fast | Medium | ✅ Fast | Medium | ❌ Slow |
| Operational complexity | ✅ Low | ✅ Low | ✅ Low | Medium | ❌ High |

### Quick Decision Guide

```
New project, small team? → Modular Monolith or Layered
Complex business logic, many rules? → Clean Architecture
Multiple subdomains, large team? → DDD
Independent scaling + large org? → Microservices
Simple CRUD app? → Layered Architecture
Unclear requirements? → Start simple, refactor when patterns emerge
```

### Clean Architecture

**Core Principle:** Dependencies point inward. Inner layers know nothing about outer layers.

```
┌─────────────────────────────────────────────────────────┐
│                    Frameworks & Drivers                  │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Interface Adapters                  │    │
│  │  ┌─────────────────────────────────────────┐    │    │
│  │  │           Application Layer              │    │    │
│  │  │  ┌─────────────────────────────────┐    │    │    │
│  │  │  │         Domain Layer            │    │    │    │
│  │  │  │    (Entities & Business Rules)  │    │    │    │
│  │  │  └─────────────────────────────────┘    │    │    │
│  │  └─────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

**Folder Structure (TypeScript example):**
```
src/
├── domain/                 # Core business logic (no dependencies)
│   ├── entities/
│   ├── value-objects/
│   └── repositories/       # Interfaces only
├── application/            # Use cases (depends on domain)
│   ├── use-cases/
│   └── services/
├── infrastructure/         # External concerns (implements interfaces)
│   ├── database/
│   ├── external/
│   └── config/
└── presentation/           # UI/API layer
    ├── api/
    ├── controllers/
    └── dto/
```

**Dependency Rules:**
- Domain → nothing (pure business logic)
- Application → Domain only
- Infrastructure → Application + Domain (implements interfaces)
- Presentation → Application (calls use cases)

### Domain-Driven Design (DDD)

**Core Principle:** Software structure mirrors the business domain. Bounded contexts define clear boundaries.

**Strategic Patterns:**
- Bounded Contexts: explicit boundaries around domain models
- Context Mapping: how contexts communicate (Shared Kernel, Customer/Supplier, Anti-Corruption Layer)

**Tactical Patterns:**
- Entities: identity-based objects
- Value Objects: immutable, equality by value
- Aggregates: consistency boundaries (all invariants enforced through aggregate root)
- Domain Events: communicate state changes between contexts

**Folder Structure (TypeScript example):**
```
src/
├── contexts/
│   ├── ordering/
│   │   ├── domain/         # Entities, VOs, events, repository interfaces
│   │   ├── application/    # Use cases, command/query handlers
│   │   ├── infrastructure/ # Repository implementations, external adapters
│   │   └── api/            # HTTP handlers, DTOs
│   ├── inventory/
│   │   └── ...
│   └── shipping/
│       └── ...
└── shared/
    └── kernel/             # Shared base classes, interfaces
```

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

### Modular Monolith

**Core Principle:** Single deployment unit with strong module boundaries. Best of both worlds — simple ops, future extraction ready.

**Folder Structure (TypeScript example):**
```
src/
├── modules/
│   ├── users/
│   │   ├── api/           # HTTP handlers
│   │   ├── domain/        # Business logic
│   │   ├── infra/         # Database, external
│   │   └── index.ts       # Public API only
│   ├── orders/
│   │   └── ...
│   └── payments/
│       └── ...
├── shared/                 # Truly shared code
│   ├── kernel/
│   └── utils/
└── main.ts                # Composition root
```

**Module Communication Rules:**
- Modules expose explicit public API via index file
- Other modules use ONLY the public API
- Never reach into module internals

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
