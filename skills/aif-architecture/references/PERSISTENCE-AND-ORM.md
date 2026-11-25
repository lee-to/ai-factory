# Persistence & ORM Integration Guide

A central challenge in Domain-Driven Design and Explicit Architecture is preventing database tools, SQL libraries, and Object-Relational Mappers (ORMs) from contaminating the pure domain layer.

This guide details the implementation of the **Data Mapper Pattern**, cross-aggregate **Transaction Management (Unit of Work)**, the **Transactional Outbox Pattern**, and real-world ORM mapping strategies for Prisma, Drizzle, TypeORM, and SQLAlchemy.

> ⚠️ **Zero Naming & Casing Lock-in:**
> The file paths, interfaces, and directory names shown below (e.g. `OrderTableRecord.ts`, `OrderMapper.ts`, `PostgresOrderRepository`) are conceptual representations of the Data Mapper pattern.
> Your actual persistence layout depends entirely on your chosen database tool and ecosystem:
> - In **Prisma**: schemas live in `prisma/schema.prisma`, returning generated TypeScript types.
> - In **Drizzle ORM**: schemas live in `src/db/schema.ts` (or `drizzle/schema.ts`).
> - In **SQLAlchemy**: models live in `app/infrastructure/db/models.py`.
> - In **Go / pgx**: persistence schemas are local Go structs in `internal/order/repository_postgres.go`.
> Adapt folder naming, casing (`snake_case`, `kebab-case`, `lowercase`), and file structures to your database driver conventions.

---

## 1. Active Record vs Data Mapper

| Attribute | Active Record (Rails, Django ORM, TypeORM Active Record) | Data Mapper (Prisma, Drizzle, SQLAlchemy, Hibernate) |
|---|---|---|
| **Core Concept** | The entity class *is* the database table (`order.save()`) | Domain entity is decoupled from DB schema; Repository maps between them |
| **Domain Purity** | ❌ Heavily coupled to DB columns and ORM decorators | ✅ 100% pure; domain entity knows nothing about DB |
| **Boilerplate** | Low; rapid setup | Medium; requires mapping code |
| **Unit Testability** | Poor; requires mock databases or Docker containers | Ideal; entities can be instantiated in memory with zero I/O |
| **Best Pattern Fit** | [Layered Architecture](./LAYERED.md) for small CRUD apps | [Structured Modules](./STRUCTURED-MODULES.md) & [Explicit Architecture](./EXPLICIT-ARCHITECTURE.md) |

> 💡 **Refactoring Active Record to Data Mapper:** For a step-by-step decoupling procedure without downtime, see **[Architecture Migrations — Active Record to Data Mapper](./MIGRATIONS.md#7-migration-active-record--data-mapper-persistence-decoupling)**.

---

## 2. Implementing the Data Mapper Pattern (4-Tier Separation)

To isolate the domain layer from the database, use a 4-tier persistence mapping:

```text
Domain Layer:                 Order (Entity / Aggregate Root) ◄──► OrderRepositoryPort (Interface)
                                           ▲
                                           │ (Mapped via OrderMapper)
                                           ▼
Infrastructure Layer:       OrderTableRecord (ORM Schema)    ◄──► PostgresOrderRepository (Adapter)
```

---

### Step 1: Pure Domain Entity (Domain Layer)
Contains business invariants, private state, and domain methods. Zero database imports, zero ORM decorators.

```typescript
// src/ordering/domain/Order.ts
export class Order {
  private constructor(
    private readonly _id: OrderId,
    private readonly _customerId: CustomerId, // Referenced strictly by Identity, NOT by Customer entity!
    private _status: OrderStatus,
    private _total: Money,
    private _items: OrderItem[],
    private _version: number = 1 // Optimistic Concurrency Control
  ) {}

  public static reconstitute(
    id: OrderId,
    customerId: CustomerId,
    status: OrderStatus,
    total: Money,
    items: OrderItem[],
    version: number
  ): Order {
    return new Order(id, customerId, status, total, items, version);
  }

  public get id(): OrderId { return this._id; }
  public get customerId(): CustomerId { return this._customerId; }
  public get status(): OrderStatus { return this._status; }
  public get items(): readonly OrderItem[] { return [...this._items]; }
  public get total(): Money { return this._total; }
  public get version(): number { return this._version; }
}
```

---

### Step 2: Database Persistence Schemas (Infrastructure Layer)
Represents the actual PostgreSQL / MySQL database columns, foreign keys, and indices.

```typescript
// src/ordering/infrastructure/persistence/OrderTableRecord.ts
export interface OrderTableRecord {
  id: string;
  customer_id: string;
  status: string;
  total_amount_cents: number;
  currency: string;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export interface OrderItemTableRecord {
  id: string;
  order_id: string;
  product_id: string;
  price_cents: number;
  currency: string;
  quantity: number;
}
```

---

### Step 3: The Bidirectional Data Mapper (Infrastructure Layer)
Pure functions converting database records to domain entities, and flattening domain entities into database records.

```typescript
// src/ordering/infrastructure/persistence/OrderMapper.ts
export class OrderMapper {
  public static toDomain(
    record: OrderTableRecord,
    itemRecords: OrderItemTableRecord[]
  ): Order {
    const items = itemRecords.map(item =>
      new OrderItem(
        new OrderItemId(item.id),
        new ProductId(item.product_id),
        Money.cents(item.price_cents, item.currency),
        item.quantity
      )
    );

    return Order.reconstitute(
      new OrderId(record.id),
      new CustomerId(record.customer_id),
      record.status as OrderStatus,
      Money.cents(record.total_amount_cents, record.currency),
      items,
      record.version
    );
  }

  public static toPersistence(order: Order): {
    orderRecord: OrderTableRecord;
    itemRecords: OrderItemTableRecord[];
  } {
    const orderRecord: OrderTableRecord = {
      id: order.id.value,
      customer_id: order.customerId.value,
      status: order.status,
      total_amount_cents: order.total.cents,
      currency: order.total.currency,
      version: order.version,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const itemRecords: OrderItemTableRecord[] = order.items.map(item => ({
      id: item.id.value,
      order_id: order.id.value,
      product_id: item.productId.value,
      price_cents: item.unitPrice.cents,
      currency: item.unitPrice.currency,
      quantity: item.quantity,
    }));

    return { orderRecord, itemRecords };
  }
}
```

---

### Step 4: Repository Adapter (Infrastructure Layer)
Implements the `OrderRepositoryPort` declared in the Domain layer. Persists the entire Aggregate Root and synchronizes child items and outbox messages within an atomic transaction:

```typescript
// src/ordering/infrastructure/persistence/PostgresOrderRepository.ts
export class PostgresOrderRepository implements OrderRepositoryPort {
  constructor(private readonly db: DatabaseClient) {}

  async findById(id: OrderId): Promise<Order | null> {
    const orderRow = await this.db.query<OrderTableRecord>(
      "SELECT * FROM orders WHERE id = $1",
      [id.value]
    );
    if (!orderRow) return null;

    const itemRows = await this.db.query<OrderItemTableRecord>(
      "SELECT * FROM order_items WHERE order_id = $1",
      [id.value]
    );

    return OrderMapper.toDomain(orderRow, itemRows);
  }

  async save(order: Order): Promise<void> {
    const { orderRecord, itemRecords } = OrderMapper.toPersistence(order);
    const domainEvents = order.pullDomainEvents();

    await this.db.transaction(async (tx) => {
      // 1. Upsert Aggregate Root with Optimistic Concurrency Control (OCC)
      const res = await tx.query(
        `INSERT INTO orders (id, customer_id, status, total_amount_cents, currency, version, updated_at)
         VALUES ($1, $2, $3, $4, $5, 1, NOW())
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           total_amount_cents = EXCLUDED.total_amount_cents,
           version = orders.version + 1,
           updated_at = NOW()
         WHERE orders.version = $6`,
        [
          orderRecord.id,
          orderRecord.customer_id,
          orderRecord.status,
          orderRecord.total_amount_cents,
          orderRecord.currency,
          order.version,
        ]
      );

      // If updating an existing row but version mismatched, 0 rows were updated -> Concurrent collision!
      if (res.rowCount === 0) {
        throw new ConcurrencyException(
          `Order ${order.id.value} was concurrently modified. Expected version ${order.version}.`
        );
      }

      // 2. Synchronize Child Items (Aggregate Boundary)
      await tx.query("DELETE FROM order_items WHERE order_id = $1", [orderRecord.id]);
      for (const item of itemRecords) {
        await tx.query(
          `INSERT INTO order_items (id, order_id, product_id, price_cents, currency, quantity)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [item.id, item.order_id, item.product_id, item.price_cents, item.currency, item.quantity]
        );
      }

      // 3. Atomically Record Domain Events (Transactional Outbox)
      for (const event of domainEvents) {
        await tx.query(
          `INSERT INTO outbox_messages (id, event_type, payload, created_at)
           VALUES ($1, $2, $3, NOW())`,
          [crypto.randomUUID(), event.constructor.name, JSON.stringify(event)]
        );
      }
    });
  }
}
```

---

## 3. Cross-Aggregate References: Identity Only vs. ORM Navigation Properties

In Domain-Driven Design, a foundational rule is: **Aggregates reference other aggregates strictly by Identity (Foreign Key ID), NEVER by direct object instance or ORM navigation property.**

| Approach | Pure DDD / Data Mapper (✅ Correct) | Traditional ORM Navigation (❌ Anti-Pattern) |
|---|---|---|
| **Property in Entity** | `customerId: CustomerId` (Value Object / string) | `customer: Customer` (Full entity object reference) |
| **ORM Decorator** | `@Column() customer_id: string` | `@ManyToOne(() => Customer, { eager: true })` |
| **Transaction Boundary** | Isolated: 1 transaction modifies 1 aggregate | Dangerous: Modifying Order can trigger cascades on Customer |
| **Memory / Performance** | Minimal: loads only the required aggregate | Risky: Accidental cascade loading, N+1 queries, memory bloat |
| **Context Boundaries** | Clean: Order bounded context knows nothing of Customer internals | Violated: Order traverses `order.customer.creditProfile...` |

### Why ORM Navigation Between Aggregates Fails

When developers use ORM relationships (`@ManyToOne`, `@OneToMany`, EF Core navigation properties) between distinct aggregate roots:
1. **Accidental Cascading Updates:** The ORM's change-tracker may detect mutations on the related entity and issue unexpected `UPDATE` queries during `orderRepo.save(order)`.
2. **Lazy Loading Traps:** Calling `order.customer.name` outside an open database session throws runtime errors (`LazyInitializationException`). If serialization (JSON formatting) triggers lazy loading, it issues hundreds of hidden SQL queries.
3. **Broken Bounded Contexts:** Different aggregates often belong to different subdomains (e.g. `Order` in Ordering Context, `Customer` in Identity Context). Direct object references force their database models into a single tightly coupled schema.

### How to Retrieve Related Aggregate Data
- **In Write Scenarios (Commands):** Load `Order` via `orderRepo.findById(orderId)`. If you need customer data for a business calculation, use the ID: `customerRepo.findById(order.customerId)`. Pass both to a pure **Domain Service**.
- **In Read Scenarios (Queries):** Do NOT load domain aggregates. Use **CQRS Read Projections** (see [Domain Modeling](./DOMAIN-MODELING.md#6-cqrs--query-optimization-read-path-vs-write-path)) with a direct SQL `JOIN orders o JOIN customers c ON c.id = o.customer_id` returning a flat Read DTO.

---

## 4. Managing Database Transactions Across Aggregates

Do **not** pass database transaction handles (e.g., `pg.Client`, `EntityManager`, `sql.Tx`) through domain layers. To coordinate multi-repository operations atomically:

### Unit of Work Pattern (or Transaction Runner)
Define a transaction runner interface in `Domain/Ports/` (or `Application/Ports/`):

```typescript
// src/ordering/domain/ports/unit-of-work.port.ts
export interface UnitOfWorkPort {
  runInTransaction<T>(operation: () => Promise<T>): Promise<T>;
}
```

The Application Service coordinates multiple repository calls inside the transaction wrapper without knowing database driver details:

```typescript
// src/ordering/application/PlaceOrderService.ts
await this.unitOfWork.runInTransaction(async () => {
  await this.orderRepo.save(order);
  await this.customerRepo.save(customer);
});
```

---

## 5. The Transactional Outbox Pattern

When persisting domain state must guarantee reliable asynchronous event publishing (to Kafka, RabbitMQ, or Redis), avoid the dual-write anti-pattern (writing to DB then calling message broker) by writing events to an `outbox_messages` table within the **same atomic database transaction**.

### Outbox Database Schema
```sql
CREATE TABLE outbox_messages (
  id UUID PRIMARY KEY,
  event_type VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE NULL,
  error_message TEXT NULL
);

CREATE INDEX idx_outbox_unprocessed ON outbox_messages (created_at) WHERE processed_at IS NULL;
```

### Complete Workflow:
```text
Application Service          PostgreSQL (Atomic Transaction)       Message Broker (Kafka/RabbitMQ)
       │                                   │                                    │
       ├── 1. save(order) ────────────────►│ (orders row updated)               │
       │                                   │ (outbox_messages row inserted)     │
       │                                   │ (transaction COMMITTED)            │
       │                                   │                                    │
       │                         Background Poller / CDC                        │
       │                                   ├── 2. Read unprocessed rows ───────►│
       │                                   │                                    ├── 3. Publish event
       │                                   │◄── 4. Mark processed_at = NOW() ───┘
```

### Idempotent Consumer Pattern (Receiving Side)
Because network delivery guarantees at-least-once semantics, consumers must prevent duplicate processing using an idempotent message log:

```sql
CREATE TABLE processed_messages (
  message_id UUID PRIMARY KEY,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

Consumer transaction:
```sql
BEGIN;
-- If message was already processed, ignore or skip
INSERT INTO processed_messages (message_id) VALUES ($messageId) ON CONFLICT DO NOTHING;
-- Process business logic only if message was successfully inserted
COMMIT;
```

---

## 6. Real-World ORM Mapping Strategies

Modern frameworks and ORMs map to the Data Mapper pattern differently:

### 1. Prisma & Drizzle ORM (TypeScript)
- **Natural Data Mappers:** Prisma and Drizzle produce plain JavaScript data objects (`$inferSelect`), not Active Record instances with methods.
- **Workflow:** Define your pure domain classes in `Domain/`. Use Drizzle/Prisma client in `Infrastructure/Persistence/` and map Drizzle records to domain entities via a mapper.

### 2. TypeORM & Hibernate / JPA (TypeScript / Java)
- **Decorator Isolation:** Avoid putting TypeORM `@Entity()` or JPA `@Table` annotations on pure domain classes.
- **Workflow:** Create dedicated `OrderOrmEntity` classes in `Infrastructure/Persistence/` with ORM decorators. Use repositories to convert between `OrderOrmEntity` and pure `Order`.

### 3. SQLAlchemy 2.0 (Python)
- **Declarative Models in Infrastructure:** Define `Base = declarative_base()` models inside `infrastructure/db/models.py`.
- **Workflow:** Keep pure Python `@dataclass` classes in `domain/` (e.g. `domain/order.py`). Repositories execute async queries with SQLAlchemy and instantiate dataclasses using mappers.

---

## 7. Persistence Strategy by Pattern

| Pattern | Persistence Approach | Key Invariant |
|---|---|---|
| **Layered Architecture** | **Active Record** is acceptable. Models can be ORM entities directly. | Fast bootstrap; DB schema = domain model |
| **Structured Modules** | **Lightweight Data Mapper.** Domain models contain business logic; repositories handle DB schema hydration. | Module owns its tables; cross-module SQL joins prohibited |
| **Explicit Architecture** | **Strict Data Mapper.** Zero ORM decorators in `Domain/`. ORM schemas live in `Infrastructure/`. | 100% pure domain entities; repository ports decouple DB technology |
| **Microservices** | **Database per Service.** Each microservice owns its migrations and tables. Direct cross-service queries are forbidden. | Sagas coordinate transactions; Transactional Outbox ensures event delivery |
