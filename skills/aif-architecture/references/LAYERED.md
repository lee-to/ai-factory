# Layered Architecture

Layered Architecture separates concerns into horizontal layers. Each layer only depends on the layer directly below it. This is the simplest architectural pattern — easy to understand, quick to bootstrap, and sufficient for small applications with straightforward business logic.

---

## 1. Why this Architecture Exists

Layered Architecture provides the minimum viable separation of concerns. It prevents the worst software anti-pattern: spaghetti code where HTTP handling, business calculations, SQL queries, and response rendering are mixed in the same function.

For small teams (1–5 developers) and simple CRUD applications, this separation is pragmatic and productive:
- Low cognitive overhead: every developer knows where controllers, services, and models go.
- Rapid bootstrapping: frameworks like Rails, Laravel, Express, Django, and Spring Boot provide out-of-the-box support for layered designs.

**The tradeoff:** As the project grows, the flat structure makes it hard to locate where specific business features live. Services tend to accumulate unrelated logic, cross-feature imports proliferate, and services degrade into procedural "Transaction Scripts" operating on anemic data bags.

---

## 2. Folder Structure

```text
src/
├── Controllers/                                # Request/response handling, input validation, HTTP status codes
│   └── [EntityName]Controller.{ext}
├── Services/                                   # Business logic & use case orchestration
│   └── [EntityName]Service.{ext}
├── Models/                                     # Data models / entities / DTOs
│   └── [EntityName].{ext}
├── Repositories/                               # Data access layer (SQL queries, ORM calls)
│   └── [EntityName]Repository.{ext}
├── Routes/                                     # Route definitions (maps URLs to controllers)
├── Middleware/                                 # Cross-cutting: auth, logging, error handling, rate limiting
└── Utils/                                      # Shared non-business helpers
```

> **Note on Infrastructure folders:** `Routes/`, `Middleware/`, and `Utils/` are configuration and cross-cutting directories, not core application layers. Routes define URL-to-controller mappings. Middleware and Utils provide shared infrastructure mechanisms invoked by Controllers/Services, but must never contain domain business logic.

> **Note on Naming & Casing Flexibility:** Folder names (`Controllers/`, `Services/`, `Models/`, `Repositories/`) represent architectural roles. Adapt folder names and casing to the target stack (e.g. `snake_case` in Python, lowercase in Go, `kebab-case` or `camelCase` in TypeScript). There is zero hard lock-in to literal PascalCase.

---

## 3. Key Principles

1. **Strict Downward Dependencies:** Each layer depends ONLY on the layer directly below it. No skipping layers, no upward imports.
2. **Single Responsibility per Layer:** Controllers handle transport/HTTP concerns (parsing, validation, HTTP response headers). Services contain business logic and orchestration. Repositories handle database interactions. Mixing these concerns is the primary way layered architecture degrades.
3. **Thin Controllers:** Controllers should validate input, call one or two service methods, and format the response. If a controller contains domain logic (e.g., `if/else` checks on domain state, price calculations, multi-step orchestration), that logic belongs in a service.
4. **Stateless Services:** Services should not hold request-scoped state in class fields. They receive data as method parameters, process it, and return results.
5. **Transaction Boundary in Services:** Database transactions are initiated and committed strictly at the Service layer (via `@Transactional`, `db.Transaction()`, or Unit of Work). Controllers must never manage database transactions, and Repositories must not commit transactions autonomously.
6. **API DTO Boundary:** Controllers accept `RequestDTO` payloads and return `ResponseDTO` objects. Database ORM entities must never be returned directly in API responses.

---

## 4. Dependency Rules

```text
Routes ──> Controllers ──> Services ──> Repositories ──> Database
```

- **Routes → Controllers:** Routes match incoming requests and invoke corresponding controller actions.
- **Controllers → Services:** Controllers invoke service methods; controllers never execute SQL or ORM queries.
- **Services → Repositories:** Services query and persist data through repositories; services do not manage raw database connections.
- **Repositories → Database:** Repositories encapsulate database access.
- **Sidecar concerns:** `Models`, `Middleware`, and `Utils` are consumed alongside this flow — they hold no intermediate layer position in the downward dependency chain.
  - Models are shared data structures (DTOs, entities) consumed by Services and Repositories.
  - Middleware and Utils provide cross-cutting concerns (auth verification, logging, telemetry) without domain rules.

---

## 5. Migration Path to Structured Modules

When the codebase shows signs of strain (services exceeding 500 LOC, tangled imports, heavy testing mocks), Layered Architecture migrates naturally into [Structured Modules](./STRUCTURED-MODULES.md) by reorganizing code from horizontal technical layers into cohesive vertical feature areas.

For the complete step-by-step migration guide, ASCII file tree mappings, and safe refactoring procedures, see:
👉 **[Architecture Migrations: Layered to Structured Modules](./MIGRATIONS.md#2-migration-layered-architecture--structured-modules)**

---

## 6. Anti-Patterns to Avoid

- ❌ **God Controller:** A controller that contains business logic, database queries, and response formatting all in one method. Split into Controller (HTTP) + Service (logic) + Repository (data).
- ❌ **Business Logic in Routes/Middleware:** Placing validation rules, authorization checks with business context, or data mutations in middleware. Middleware handles cross-cutting transport concerns (JWT verification, rate limiting, request logging), not domain rules.
- ❌ **Layer Skipping:** Controllers calling repositories directly, or routes calling services without going through controllers.
- ❌ **Upward Dependencies:** Services importing controllers, or repositories importing services.
- ❌ **Shared Mutable State:** Services storing request-scoped state in class- or module-level variables instead of passing data through function arguments.
- ❌ **ORM Entity Leaking to API:** Returning raw database models directly in JSON responses. This exposes internal database fields (password hashes, soft-delete flags, internal IDs) and risks serialization crashes or N+1 query cascades on relationship properties.
