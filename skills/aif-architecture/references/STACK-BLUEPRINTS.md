# Idiomatic Stack Blueprints

The pattern specifications in this knowledge base ([Layered](./LAYERED.md), [Structured Modules](./STRUCTURED-MODULES.md), [Explicit Architecture](./EXPLICIT-ARCHITECTURE.md), [Microservices](./MICROSERVICES.md)) use language-agnostic abstractions. They define **layer roles, boundary responsibilities, and dependency directions** — not rigid directory names or mandatory casing.

When a language compiler, package manager, or framework idiom establishes conventions, the language idioms govern. This document provides translation rules, compiler boundaries, critical anti-patterns, and concrete directory blueprints for the major web ecosystems.

---

## Universal Translation Principles (Anti-Bias Guarantee)

1. **Any Pattern Fits Any Stack:** Every language below can cleanly implement **Layered Architecture**, **Structured Modules**, **Explicit Architecture**, or **Microservices**. A blueprint showing one pattern for a stack illustrates how architectural boundaries translate in that ecosystem — it does NOT mean that stack is restricted to that pattern.
2. **Translation of Conceptual Roles:**
   - **Domain Role:** Pure business rules, state invariants, value objects, domain events.
   - **Application Role:** Use-case orchestration, command/query handling, DTO boundaries.
   - **Ports / Interfaces Role:** Abstract interfaces for outbound infrastructure (repositories, clients, publishers).
   - **Infrastructure Role:** Technical adapters implementing ports (database, message broker, external HTTP clients).
   - **Presentation / Delivery Role:** Inbound driving adapters (HTTP controllers, CLI commands, background jobs, event consumers).
3. **Unified Rules Apply Universally:**
   - **Channel Isolation:** Where multiple audiences exist (`Admin`, `Public`), delivery endpoints are partitioned by channel; `Public/` code must NEVER import from `Admin/`.
   - **3-Tier `_Shared/` Scoping:**
     - *Level 1 (Entity Backend):* `_Shared/Schemas/`, `_Shared/Dtos/` prevents lateral imports between use cases.
     - *Level 2 (Cross-Channel UI):* `Presentation/Web/_Shared/Components/` for shared UI forms across channels.
     - *Level 3 (Intra-Channel):* `[Channel]/_Shared/` for channel-specific filters and tables.

---

## 1. PHP (Modern Laravel, Yii3 & Modular Architecture)

### 1.1 Philosophy, PSR Rules & Critical Anti-Patterns

- **PSR-4 Namespace Alignment:** In modern PHP, every directory structure directly maps to a PHP namespace according to PSR-4 (`App\Modules\Ordering\Actions\CreateOrderAction` maps to `app/Modules/Ordering/Actions/CreateOrderAction.php`). Any mismatch between folder path and namespace breaks Composer autoloading.
- **Active Record (Eloquent) Boundary Trap:** Eloquent combines business data and database connection logic in a single class. In modular architectures, **cross-module Eloquent relationships are strictly forbidden**:
  - ❌ *Anti-Pattern:* An `Order` model in the `Ordering` module declaring `public function customer() { return $this->belongsTo(\App\Modules\Customer\Models\Customer::class); }`. This allows cross-module SQL `JOIN`s, breaking modular database boundaries.
  - ✅ *Correct:* Store raw scalar identifiers (`public int $customer_id`) and fetch customer data across boundaries via a DTO or public module service call.
- **Modern PHP 8.2+ Idioms:**
  - **`readonly class`:** Use `readonly class` for immutable DTOs and Value Objects (`readonly class OrderItemData`).
  - **Constructor Property Promotion:** Avoid boilerplate setters and getters by declaring properties directly in `__construct(public string $email)`.
  - **Native Backed Enums:** Enforce state machine boundaries with string-backed enums (`enum OrderStatus: string { case Pending = 'pending'; }`).
- **Single-Action Invokable Classes (`__invoke` / PSR-15):** For vertical slices and command handling, single-action invokable classes (`CreateOrderAction`) or PSR-15 RequestHandlers provide maximum cohesion and testability compared to monolithic multi-method controllers.
- **Transport Validation Boundary:** FormRequests (in Laravel) or DTOs with `yiisoft/validator` attributes (in Yii3) belong strictly in the Delivery layer (`Http/Requests/` or `Presentation/`). They validate transport input before calling Application Actions/Services. Never pass the raw server request into domain models or actions.

### 1.2 PHP Translation Matrix

| Conceptual Role | Laravel Idiom | Yii3 / Clean PHP Idiom | Notes |
|---|---|---|---|
| **Module / Bounded Context** | `app/Modules/[Module]/` | `src/[Context]/` | Self-contained domain module |
| **Domain Entity** | `Models/[Entity].php` (Rich Eloquent) | `Domain/[Entity].php` (Pure POPO) | Cycle ORM Entity or Rich Eloquent |
| **Value Object** | `Domain/ValueObjects/` | `Domain/ValueObject/` | `readonly class` with validation |
| **Use Case / Action** | `Slices/[Entity]/[Feature]/[Feature]Action.php` | `Application/Command/[Feature]Handler.php` | Single-action execution |
| **Port (Interface)** | `Contracts/` or `Domain/Ports/` | `Domain/Port/[Entity]RepositoryInterface.php` | Pure interface |
| **DTO / Input Data** | `Dtos/[Feature]Data.php` (`readonly`) | `Application/Dto/[Feature]Input.php` | Strongly-typed transport DTO (with `yiisoft/validator`) |
| **Delivery (HTTP)** | `Http/[Channel]/` | `Presentation/Action/[Channel]/` | PSR-15 RequestHandler / Middleware Action |
| **Validation** | `Http/Requests/[Feature]Request.php` | `yiisoft/validator` (Attributes on DTO) | Transport payload validation |
| **Entity `_Shared/`** | `app/Modules/[Module]/Slices/[Entity]/_Shared/` | `src/[Context]/Slices/[Entity]/_Shared/` | Entity-scoped base DTOs and schemas |
| **Module Wiring** | `Providers/[Module]ServiceProvider.php` | `config/di-web.php` via `yiisoft/config` | PSR-11 container definitions |

### 1.3 Blueprint 1: Laravel Modular Monolith (Vertical Slices & Actions — Style 1)

For medium-to-large business platforms and SaaS requiring high feature cohesion and isolation:

```text
app/
├── Modules/                                    # ── FEATURE MODULES (Structured Modules) ──
│   ├── Ordering/
│   │   ├── Slices/                             # Vertical Slices by Entity (Style 1)
│   │   │   ├── Order/
│   │   │   │   ├── _Shared/                    # Entity-level shared backend (prevents lateral imports)
│   │   │   │   │   └── Dtos/
│   │   │   │   │       └── OrderBaseData.php   # Base DTO (readonly class)
│   │   │   │   │
│   │   │   │   ├── CreateOrder/                # Feature Subfolder (Style 1)
│   │   │   │   │   ├── CreateOrderAction.php   # Invokable Action / Handler (__invoke)
│   │   │   │   │   └── CreateOrderRequest.php  # FormRequest (HTTP transport validation)
│   │   │   │   ├── UpdateOrder/
│   │   │   │   │   ├── UpdateOrderAction.php
│   │   │   │   │   └── UpdateOrderRequest.php
│   │   │   │   └── CancelOrder/
│   │   │   │       ├── CancelOrderAction.php
│   │   │   │       └── CancelOrderRequest.php
│   │   │   │
│   │   │   └── Checkout/                       # Process slice (cross-entity workflow)
│   │   │       ├── CheckoutAction.php
│   │   │       └── CheckoutRequest.php
│   │   │
│   │   ├── Models/                             # Eloquent models with domain methods
│   │   │   ├── Order.php                       # Invariants, state transitions & business calculations
│   │   │   └── OrderItem.php                   # Child entity (references cross-module by ID only)
│   │   │
│   │   ├── Enums/                              # Backed Enums
│   │   │   └── OrderStatus.php
│   │   │
│   │   ├── Http/                               # Delivery Layer (Channels)
│   │   │   ├── Admin/                          # [Channel] Admin Backoffice Single-Action Endpoints
│   │   │   │   ├── _Shared/                    # Intra-channel shared (admin filters, serializers)
│   │   │   │   └── Orders/
│   │   │   │       └── AdminOrderAction.php    # Single-action endpoint (__invoke)
│   │   │   └── Public/                         # [Channel] Public Customer Storefront Endpoints
│   │   │       ├── _Shared/                    # Intra-channel shared (public query params)
│   │   │       └── Orders/
│   │   │           └── PublicOrderAction.php   # Single-action endpoint (__invoke)
│   │   │
│   │   ├── Policies/                           # Authorization logic
│   │   │   └── OrderPolicy.php
│   │   │
│   │   └── Providers/
│   │       └── OrderingServiceProvider.php     # Registers module routes, policies, and events
│   │
│   └── Identity/
│       └── ...
│
└── Support/                                    # ── GLOBAL INFRASTRUCTURE & CROSS-CUTTING ──
    ├── Helpers/
    └── Middleware/
```

### 1.4 Blueprint 2: Laravel Clean Layered Architecture (Pragmatic / CRUD — Style 2)

For MVPs, internal admin tools, or simpler applications (< 10 entities) where a modular monolith introduces unnecessary overhead:

```text
app/
├── Http/                                       # ── DELIVERY LAYER (Style 2: Unified Multi-Action) ──
│   ├── Controllers/
│   │   ├── Admin/                              # [Channel] Admin Backoffice
│   │   │   └── OrderController.php             # Unified Controller: store(), update(), destroy()
│   │   └── Public/                             # [Channel] Public Customer API
│   │       └── OrderController.php             # Unified Controller: index(), show()
│   ├── Requests/                               # FormRequests (HTTP payload validation)
│   │   ├── StoreOrderRequest.php
│   │   └── UpdateOrderRequest.php
│   ├── Resources/                              # API JsonResources (formats response DTOs)
│   │   └── OrderResource.php
│   └── Middleware/
│
├── Services/                                   # ── USE CASE LAYER (Unified Multi-Action Services) ──
│   └── OrderService.php                        # Unified Service: createOrder(), cancelOrder(), processPayment()
│
├── Models/                                     # ── DOMAIN & PERSISTENCE (Rich Eloquent) ──
│   ├── Order.php                               # Methods: markAsPaid(), cancel(), calculateTotal()
│   └── OrderItem.php
│
├── Data/                                       # ── DATA TRANSFER OBJECTS (PHP 8.2 readonly) ──
│   ├── CreateOrderData.php
│   └── OrderItemData.php
│
└── Providers/
    └── AppServiceProvider.php
```

### 1.5 Blueprint 3: PHP Clean Architecture / Yii3 (Ports & Adapters with Cycle ORM)

For enterprise domains with complex business rules requiring 100% decoupling from the database and framework (using Yii3 PSR-15 actions, `yiisoft/validator`, and Cycle ORM Data Mapper):

```text
src/
└── Ordering/                                   # ── BOUNDED CONTEXT ──
    ├── Domain/                                 # PURE DOMAIN (zero framework/ORM dependencies)
    │   ├── Order.php                           # Pure domain entity with invariants
    │   ├── OrderId.php                         # Value Object
    │   ├── Port/                               # Domain Ports (Interfaces)
    │   │   ├── OrderRepositoryInterface.php
    │   │   └── PaymentGatewayInterface.php
    │   ├── Event/                              # Domain Events
    │   │   └── OrderPlacedEvent.php
    │   └── Exception/
    │       └── OrderAlreadyPaidException.php
    │
    ├── Application/                            # USE CASES (CQRS / Interactors)
    │   ├── Command/
    │   │   ├── PlaceOrderCommand.php           # Command DTO (with yiisoft/validator attributes)
    │   │   └── PlaceOrderHandler.php           # Handles command via Domain Model & Ports
    │   ├── Query/
    │   │   ├── GetOrderByIdQuery.php
    │   │   └── GetOrderByIdHandler.php
    │   └── Dto/
    │       └── OrderResponseDto.php
    │
    ├── Infrastructure/                         # ADAPTERS (Outbound)
    │   ├── Persistence/
    │   │   ├── CycleOrderRepository.php        # Implements OrderRepositoryInterface via Cycle ORM
    │   │   └── Schema/                         # Cycle ORM Schema & Entity Definitions
    │   │       └── OrderSchema.php
    │   └── Gateway/
    │       └── StripePaymentGateway.php        # Implements PaymentGatewayInterface
    │
    └── Presentation/                           # ADAPTERS (Inbound PSR-15 Delivery)
        ├── Action/                             # PSR-15 Single-Action Handlers (yiisoft/request-handler)
        │   ├── Admin/                          # [Channel] Admin Backoffice Actions
        │   │   └── AdminOrderAction.php
        │   └── Public/                         # [Channel] Public Customer Actions
        │       └── OrderAction.php
        └── Command/                            # Console Commands (yiisoft/yii-console)
            └── ExpireOrdersCommand.php
```

---

## 2. Go (Standard & Capability-Driven Layout)

### 2.1 Philosophy, Compiler Rules & Critical Anti-Patterns

- **Short, Lowercase Package Names:** Go packages must be short, lowercase single words (`order`, `billing`, `customer`), never snake_case, camelCase, or plural.
- **Compiler-Enforced Privacy via `internal/`:** Any package placed inside an `internal/` directory cannot be imported by packages outside its parent tree. This is enforced directly by the Go compiler (`go build`).
- **The Stuttering Anti-Pattern:** Naming packages `models`, `services`, `controllers`, or `utils` is considered a major anti-pattern in Go. It causes stuttering identifiers (`models.User`, `services.OrderService`), cyclic imports, and breaks encapsulation.
- **Interface Placement (Consumer Defines):** In Go, interfaces should ideally be defined where they are consumed, or in a shared package interface file, keeping them small (1–3 methods).

### 2.2 Go Translation Matrix

| Conceptual Role | Idiomatic Go Implementation | Notes / Constraints |
|---|---|---|
| **Bounded Context / Module** | `internal/[context]/` or `internal/[capability]/` | Compiler-enforced boundary |
| **Domain Entity** | `[entity].go` in capability package | Pure struct with receiver methods |
| **Ports (Interfaces)** | `ports.go` or defined next to consumer | Small interfaces (e.g. `OrderRepository`) |
| **Application Use Case** | `service.go` or `handler.go` | Orchestrates entities and repository interfaces |
| **Delivery / Adapters** | `handler_http.go`, `handler_grpc.go` | Inbound driving transport handlers |
| **Channels (`Admin` / `Public`)** | `handler_http_admin.go`, `handler_http_public.go` | Or `admin/`, `public/` subpackages |
| **Composition Root** | `cmd/[app]/main.go` | Wires dependencies, passes adapters to services |
| **Cross-Cutting Tooling** | `internal/platform/` or `pkg/` | DB pool, telemetry, auth middleware |

### 2.3 Canonical Go Blueprint (Explicit / Capability Layout)

```text
my-service/
├── cmd/
│   ├── server/
│   │   └── main.go                             # Composition root (wires dependencies, starts HTTP/gRPC)
│   ├── worker/
│   │   └── main.go                             # Background daemon (consumers, cron schedulers)
│   └── cli/
│       └── main.go                             # Administrative CLI entry point
│
├── internal/                                   # Compiler-enforced private code
│   ├── order/                                  # Capability / Domain package
│   │   ├── order.go                            # Pure Domain Entity, Value Objects, invariants
│   │   ├── ports.go                            # Ports (interfaces): OrderRepository, PaymentGateway
│   │   ├── service.go                          # Application service (use case orchestration)
│   │   ├── dto.go                              # Request/Response data transfer structs
│   │   ├── handler_http_admin.go               # [Channel] Admin Backoffice HTTP endpoints
│   │   ├── handler_http_public.go              # [Channel] Public Customer HTTP endpoints
│   │   ├── handler_grpc.go                     # Inbound gRPC adapter
│   │   ├── handler_consumer.go                 # Inbound async consumer (Kafka / RabbitMQ)
│   │   ├── job_expire_orders.go                # Background worker job
│   │   └── repository_postgres.go              # Outbound database adapter (implements OrderRepository)
│   │
│   ├── customer/                               # Sibling capability package
│   │   ├── customer.go
│   │   ├── ports.go
│   │   ├── service.go
│   │   └── handler_http.go
│   │
│   └── platform/                               # Cross-cutting technical infrastructure (zero business rules)
│       ├── database/                           # DB pool initialization (pgx / gorm)
│       ├── telemetry/                          # OpenTelemetry, structured logging (slog / zap)
│       └── middleware/                         # HTTP authentication, CORS, panic recovery
│
├── api/                                        # Public schema contracts (OpenAPI specs, Protobuf definitions)
├── migrations/                                 # SQL migrations (goose / golang-migrate)
├── go.mod
└── go.sum
```

---

## 3. TypeScript / Node.js

### 3.1 Fullstack Next.js (App Router + Domain Feature Modules)

#### Philosophy & Critical Rules
- **`src/app/` is STRICTLY Delivery:** In Next.js App Router, directories inside `src/app/` define the URL routing tree, layouts, Server Components, and route handlers. They must **never** contain core business domain logic or direct raw database mutations.
- **Domain Modules in `src/modules/`:** All domain models, business validation rules, application services, and UI components live in modular feature folders in `src/modules/`.
- **Channels Map to Route Groups:** Delivery channels map naturally to Next.js route groups: `app/(admin)/` and `app/(public)/`, providing distinct layouts and auth guards without altering public URL structures.

#### Translation Matrix

| Conceptual Role | Next.js App Router Implementation | Notes |
|---|---|---|
| **Delivery (Web/Routes)** | `src/app/(channel)/[route]/` | Server Components, page.tsx, layout.tsx |
| **Delivery (API/Webhooks)**| `src/app/api/[endpoint]/route.ts` | Route Handlers for external webhooks |
| **Feature Module / Slice** | `src/modules/[module]/` | Self-contained domain + UI |
| **Entity `_Shared/`** | `src/modules/[module]/Slices/[entity]/_Shared/` | Entity-scoped Schemas (Zod), base DTOs |
| **Cross-Channel UI** | `src/modules/[module]/Components/` | Shared UI forms (e.g. `ProductForm.tsx`) |
| **Use Cases / Actions** | `Slices/[entity]/[Feature]/[feature].action.ts` | Next.js Server Actions (`"use server"`) |
| **Persistence Adapter** | `Repositories/[entity].repository.ts` | Drizzle, Prisma, or Kysely queries |

#### Canonical Next.js Blueprint

```text
src/
├── app/                                        # ── DELIVERY LAYER (App Router routing only) ──
│   ├── (public)/                               # [Channel] Public Storefront (Route Group)
│   │   ├── layout.tsx                          # Storefront header/footer shell
│   │   ├── products/
│   │   │   ├── page.tsx                        # Server Component (renders ProductGrid)
│   │   │   └── [id]/page.tsx                   # Product details page
│   │   └── cart/page.tsx
│   │
│   ├── (admin)/                                # [Channel] Admin Backoffice (Route Group)
│   │   ├── layout.tsx                          # Admin sidebar/auth shell
│   │   ├── products/
│   │   │   ├── page.tsx                        # Admin product list table
│   │   │   ├── new/page.tsx                    # Uses catalog/Components/ProductForm.tsx
│   │   │   └── [id]/edit/page.tsx              # Uses catalog/Components/ProductForm.tsx
│   │   └── dashboard/page.tsx
│   │
│   ├── api/                                    # Raw REST Webhooks
│   │   └── webhooks/stripe/route.ts
│   └── layout.tsx                              # Root HTML shell
│
├── modules/                                    # ── FEATURE MODULES (Domain & Slices) ──
│   ├── catalog/
│   │   ├── Components/                         # Cross-channel UI components for this module
│   │   │   ├── ProductForm.tsx                 # Shared CRUD form component for Create & Edit
│   │   │   └── ProductCard.tsx
│   │   │
│   │   ├── Slices/                             # Vertical Slices by Entity
│   │   │   ├── Product/
│   │   │   │   ├── _Shared/                    # Entity-level shared backend (prevents lateral imports)
│   │   │   │   │   ├── Schemas/
│   │   │   │   │   │   └── product.schema.ts   # Zod validation schemas
│   │   │   │   │   └── Dtos/
│   │   │   │   │       └── product.dto.ts      # Base DTOs
│   │   │   │   │
│   │   │   │   ├── CreateProduct/              # Feature Subfolder (Style 1)
│   │   │   │   │   └── create-product.action.ts# Server Action ("use server")
│   │   │   │   ├── UpdateProduct/
│   │   │   │   │   └── update-product.action.ts# Server Action ("use server")
│   │   │   │   └── DeleteProduct/
│   │   │   │       └── delete-product.action.ts
│   │   │   │
│   │   │   └── Category/
│   │   │       └── ...
│   │   │
│   │   ├── Models/                             # Rich domain models & business rules
│   │   │   └── product.ts
│   │   │
│   │   └── Repositories/                       # Database queries (Drizzle / Prisma)
│   │       └── product.repository.ts
│   │
│   └── ordering/
│       ├── Slices/
│       └── Repositories/
│
└── shared/                                     # ── GLOBAL CROSS-CUTTING PRIMITIVES ──
    ├── db/                                     # DB client connection & schema definitions
    ├── ui/                                     # Design system primitives (Button, Modal, Input)
    └── lib/                                    # Pure utilities (formatters, env helpers)
```

---

### 3.2 Backend NestJS / Node.js (Modular & Clean Architecture)

#### Philosophy & Critical Rules
- **DI Encapsulation:** NestJS relies on `@Module()` decorators to organize dependencies. Modules export only their public services.
- **Pure Domain vs ORM Entities:** In Clean/Explicit architecture, domain entities must remain pure TypeScript classes without `@Entity()`, `@Column()`, or `@Injectable()` decorators. TypeORM/Prisma/Mongoose models live strictly in `infrastructure/persistence/` as ORM schema entities.
- **Channels in Controllers:** Channel separation is achieved by grouping controllers into `controllers/admin/` and `controllers/public/`.

#### Translation Matrix

| Conceptual Role | NestJS Implementation | Notes |
|---|---|---|
| **Bounded Context / Module** | `src/[context]/` | Encapsulated by `[context].module.ts` |
| **Domain Entity** | `domain/[entity].entity.ts` | Pure TS class with invariants |
| **Ports (Interfaces)** | `domain/ports/[port].port.ts` | TypeScript interface / abstract class |
| **Use Cases** | `application/services/` or `commands/` | Orchestration logic |
| **ORM Entity & Mapper** | `infrastructure/persistence/[entity].orm-entity.ts` | TypeORM/Prisma schema entity |
| **Inbound Controllers** | `presentation/controllers/[channel]/` | `@Controller()` with route prefixes |
| **Async Consumers** | `presentation/consumers/` | `@EventPattern()` / Kafka / RabbitMQ |

#### Canonical NestJS Blueprint

```text
src/
├── contexts/                                   # Bounded contexts
│   └── ordering/
│       ├── domain/                             # ── PURE DOMAIN (zero NestJS dependencies) ──
│       │   ├── order.entity.ts                 # Pure domain entity with invariants
│       │   ├── ports/order-repository.port.ts  # Outbound interface
│       │   └── events/order-placed.event.ts    # Domain Events
│       │
│       ├── application/                        # ── USE CASES & ORCHESTRATION ──
│       │   ├── services/order.service.ts       # Unified Application Service
│       │   └── dtos/create-order.dto.ts        # Request/Response DTOs
│       │
│       ├── infrastructure/                     # ── ADAPTERS (Outbound) ──
│       │   ├── persistence/
│       │   │   ├── order.orm-entity.ts         # TypeORM/Prisma schema entity
│       │   │   ├── order.mapper.ts             # Maps between ORM entity and Domain entity
│       │   │   └── order.repository.ts         # Implements OrderRepositoryPort
│       │   └── messaging/
│       │       └── order-event.publisher.ts
│       │
│       ├── presentation/                       # ── ADAPTERS (Inbound) ──
│       │   ├── controllers/
│       │   │   ├── admin/                      # [Channel] Admin Backoffice API
│       │   │   │   └── admin-order.controller.ts
│       │   │   └── public/                     # [Channel] Public Customer API
│       │   │       └── order.controller.ts
│       │   ├── consumers/                      # Inbound event consumers (Kafka/RabbitMQ)
│       │   │   └── payment-event.consumer.ts
│       │   └── jobs/                           # Background schedulers
│       │       └── order-cleanup.job.ts
│       │
│       └── ordering.module.ts                  # NestJS DI Module wiring
│
└── app.module.ts                               # Root NestJS composition module
```

---

## 4. Python (FastAPI & Modern Async Stacks)

### 4.1 Philosophy, Standard Library Rules & Critical Anti-Patterns

- **Standard Library Shadowing (CRITICAL):** NEVER name a module `types.py`, `io.py`, `json.py`, `string.py`, or `dataclass.py`. Doing so shadows Python's standard library and causes obscure circular import crashes.
- **Domain Purity with `@dataclass`:** Domain entities should be pure standard library `@dataclass` classes, NOT Pydantic `BaseModel`. Pydantic belongs in the Application/Presentation layers for I/O validation and JSON serialization. Coupling the Domain to Pydantic drags serialization, validators, and external library versioning into pure business rules.
- **Ports via `typing.Protocol`:** In Python, ports should be declared using `typing.Protocol` (structural subtyping/duck typing). This avoids hard class inheritance and allows adapters to satisfy ports implicitly.
- **Composition Root via `Depends()`:** FastAPI's dependency injection system (`Depends`) acts as the composition root, wiring database sessions and adapters into route handlers.

### 4.2 Python Translation Matrix

| Conceptual Role | Python Implementation | Notes / Constraints |
|---|---|---|
| **Domain Entity** | `domain/[entity].py` | Pure `@dataclass(slots=True)` with invariants |
| **Port (Interface)** | `domain/ports/[port].py` | `class [Entity]Repository(typing.Protocol):` |
| **DTO (Validation)** | `application/dtos/[dto].py` | Pydantic `BaseModel` for request/response I/O |
| **Use Case** | `application/services/` or `use_cases/` | Pure business execution; zero HTTP awareness |
| **Persistence Adapter**| `infrastructure/db/repositories/` | SQLAlchemy / Tortoise async queries |
| **Delivery / Endpoints**| `presentation/api/[channel]/` | `APIRouter()` grouped by channel |
| **Composition Root** | `presentation/dependencies.py` | FastAPI `Depends()` providers |

### 4.3 Canonical Python Blueprint

```text
src/
└── app/
    ├── domain/                                 # ── PURE DOMAIN LAYER ──
    │   ├── order.py                            # @dataclass Order with domain methods
    │   ├── customer.py                         # Pure domain entity
    │   ├── ports/
    │   │   ├── repositories.py                 # class OrderRepository(Protocol): ...
    │   │   └── payment_gateway.py
    │   └── exceptions.py                       # Domain-specific exceptions
    │
    ├── application/                            # ── USE CASE ORCHESTRATION ──
    │   ├── use_cases/
    │   │   ├── place_order.py                  # PlaceOrderUseCase (pure execution)
    │   │   └── cancel_order.py
    │   └── dtos/                               # Pydantic schemas for request/response
    │       └── order_dtos.py
    │
    ├── infrastructure/                         # ── ADAPTERS (Outbound) ──
    │   ├── db/
    │   │   ├── session.py                      # SQLAlchemy async engine & session factory
    │   │   ├── models.py                       # SQLAlchemy ORM Table mappings
    │   │   ├── mappers.py                      # Maps SQLAlchemy model <-> Pure Domain Dataclass
    │   │   └── repositories/
    │   │       └── order_repository.py         # Implements OrderRepository Protocol
    │   └── clients/                            # External HTTP / Stripe adapters
    │       └── payment_client.py
    │
    └── presentation/                           # ── ADAPTERS (Inbound) ──
        ├── api/
        │   ├── v1/
        │   │   ├── admin/                      # [Channel] Admin Backoffice Endpoints
        │   │   │   └── orders.py               # APIRouter(prefix="/admin/orders")
        │   │   ├── public/                     # [Channel] Public Customer Endpoints
        │   │   │   └── orders.py               # APIRouter(prefix="/orders")
        │   │   └── dependencies.py             # FastAPI Depends() providers (composition root)
        │   └── error_handlers.py               # Maps domain exceptions to HTTP status codes
        ├── consumers/                          # Inbound event listeners (FastStream / AIOKafka)
        │   └── order_events.py
        ├── jobs/                               # Background workers (Celery / ARQ / Cron)
        │   └── cancel_stale_orders.py
        └── main.py                             # FastAPI application entry point
```

---

## 5. Java / Kotlin (Spring Boot & Multi-Module Builds)

### 5.1 Philosophy, Build Rules & Critical Anti-Patterns

- **Compile-Time Layer Isolation:** In enterprise Java/Kotlin, strict architectural layer isolation is typically enforced at the build level via Gradle/Maven subprojects. The `:order-domain` subproject has zero Spring or JPA dependencies, making inward dependency leaks impossible to compile.
- **Package-Private Visibility:** Use package-private visibility (default scope in Java) inside feature packages to hide internal implementation classes from neighboring packages.
- **Separation of JPA Entity vs Domain Model:** In Explicit Architecture, avoid putting JPA `@Entity`, `@Table`, `@ManyToOne` annotations on pure domain models. Keep pure POJO/data classes in Domain and JPA entities in Infrastructure, joined by a mapper.

### 5.2 Java / Kotlin Translation Matrix

| Conceptual Role | Java / Kotlin Implementation | Notes |
|---|---|---|
| **Domain Layer** | `:order-domain` (or package `.domain`) | Pure Java/Kotlin, zero Spring/JPA |
| **Port (Interface)** | `domain.port.OrderRepository` | Pure Java interface |
| **Application Layer** | `:order-application` (or `.application`) | Use cases, Command/Query handlers |
| **Persistence Adapter**| `:order-infrastructure` (or `.infrastructure.persistence`) | Spring Data JPA + Mapper |
| **Delivery Channels** | `web.admin`, `web.public` | `@RestController` in channel packages |
| **Bootstrap / DI Root**| `:app-bootstrap` (or `Application.java`) | `@SpringBootApplication` wiring |

### 5.3 Canonical Java / Kotlin Blueprint

```text
my-application/
├── order-domain/                               # Subproject: Pure domain (zero Spring/JPA deps)
│   └── src/main/java/com/app/order/domain/
│       ├── Order.java                          # Pure domain entity with invariants
│       ├── OrderId.java                        # Value Object
│       ├── port/
│       │   └── OrderRepository.java            # Pure repository interface
│       └── exception/
│           └── OrderFinalizedException.java
│
├── order-application/                          # Subproject: Use cases (depends on domain)
│   └── src/main/java/com/app/order/application/
│       ├── service/PlaceOrderService.java      # Application orchestrator
│       └── dto/PlaceOrderCommand.java          # Input command DTO
│
├── order-infrastructure/                       # Subproject: Outbound adapters (depends on domain)
│   └── src/main/java/com/app/order/infrastructure/
│       ├── persistence/
│       │   ├── OrderJpaEntity.java             # JPA table entity
│       │   ├── OrderMapper.java                # Maps between JpaEntity and Domain model
│       │   └── JpaOrderRepository.java         # Implements OrderRepository port
│       └── messaging/
│           └── KafkaOrderPublisher.java
│
├── order-web/                                  # Subproject: Inbound delivery (depends on application)
│   └── src/main/java/com/app/order/web/
│       ├── admin/                              # [Channel] Admin Backoffice REST Controllers
│       │   └── AdminOrderRestController.java
│       └── public/                             # [Channel] Public Customer REST Controllers
│           └── OrderRestController.java
│
└── app-bootstrap/                              # Subproject: Wires Spring Context & entry point
    └── src/main/java/com/app/
        └── Application.java                    # @SpringBootApplication
```

---

## 6. C# / .NET (Solution & Project-Based Architecture)

### 6.1 Philosophy, Solution Rules & Critical Anti-Patterns

- **Solution-Level Projects:** In .NET, architectural rings are enforced by dividing the solution (`.sln`) into separate `.csproj` projects:
  - `Domain.csproj`: Class library referencing nothing except core language abstractions.
  - `Application.csproj`: References `Domain.csproj`.
  - `Infrastructure.csproj`: References `Domain.csproj` (and optionally `Application.csproj`).
  - `WebApi.csproj`: References `Application.csproj` and `Infrastructure.csproj` (as composition root).
- **Inward Dependency Verification:** The compiler strictly prevents `Domain.csproj` from importing Entity Framework Core or ASP.NET Core libraries.
- **Channel Partitioning:** API controllers are cleanly partitioned into `Controllers/Admin/` and `Controllers/Public/` folders with matching route attributes.

### 6.2 C# / .NET Translation Matrix

| Conceptual Role | .NET Implementation | Notes |
|---|---|---|
| **Domain Project** | `[Solution].Domain` | Pure C# entities, Value Objects, Port interfaces |
| **Application Project** | `[Solution].Application` | Services, Handlers, DTOs, Validators |
| **Infrastructure Project**| `[Solution].Infrastructure` | EF Core `DbContext`, Configurations, Repositories |
| **Delivery Project** | `[Solution].WebApi` | ASP.NET Core Controllers or Minimal APIs |
| **Channels** | `Controllers/Admin/`, `Controllers/Public/` | Channel route separation |
| **Composition Root** | `Program.cs` in WebApi | `builder.Services.AddScoped<...>()` wiring |

### 6.3 Canonical C# / .NET Blueprint

```text
MyApplication.sln
├── src/
│   ├── MyApplication.Domain/                   # Class library (Zero external NuGet dependencies)
│   │   ├── Order.cs                            # Pure domain entity with invariants
│   │   ├── ValueObjects/Money.cs               # Immutable Value Object
│   │   ├── Interfaces/IOrderRepository.cs      # Domain Repository Port
│   │   └── Exceptions/DomainException.cs
│   │
│   ├── MyApplication.Application/              # Class library (references Domain)
│   │   ├── Orders/
│   │   │   ├── Services/OrderService.cs        # Use-case service
│   │   │   ├── DTOs/OrderDto.cs                # Transfer DTOs
│   │   │   └── Validators/OrderValidator.cs    # Validation logic
│   │   └── Common/Interfaces/IDateTimeProvider.cs
│   │
│   ├── MyApplication.Infrastructure/           # Class library (references Domain & Application)
│   │   ├── Persistence/
│   │   │   ├── OrderDbContext.cs               # Entity Framework Core DbContext
│   │   │   ├── Configurations/OrderConfig.cs   # Entity configuration (EF mappings)
│   │   │   └── Repositories/OrderRepository.cs # Implements IOrderRepository
│   │   └── Services/EmailSender.cs
│   │
│   └── MyApplication.WebApi/                   # ASP.NET Core Web API (Composition Root)
│       ├── Controllers/
│       │   ├── Admin/                          # [Channel] Admin Backoffice API
│       │   │   └── AdminOrdersController.cs
│       │   └── Public/                         # [Channel] Public Storefront API
│       │       └── OrdersController.cs
│       └── Program.cs                          # Composition root (wires DI container)
```
