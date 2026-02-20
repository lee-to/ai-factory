---
name: api-patterns
description: Node.js API development patterns. Covers REST design, validation, error handling, authentication, and database access.
argument-hint: "[topic: rest|validation|errors|auth|database]"
---

# Node.js API Patterns Guide

Best practices for building robust Node.js APIs.

## Topics

### REST Design (`/api-patterns rest`)

**Resource Naming:**
```
GET    /users           # List users
GET    /users/:id       # Get single user
POST   /users           # Create user
PUT    /users/:id       # Replace user
PATCH  /users/:id       # Update user partially
DELETE /users/:id       # Delete user

# Nested resources
GET    /users/:id/posts # User's posts
POST   /users/:id/posts # Create post for user

# Filtering, sorting, pagination
GET    /users?role=admin&sort=-createdAt&page=2&limit=20
```

**Response Format:**
```typescript
// Success response
{
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}

// Error response
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [
      { "field": "email", "message": "Invalid email format" }
    ]
  }
}
```

### Validation (`/api-patterns validation`)

**Zod Schema Validation:**
```typescript
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
  role: z.enum(['user', 'admin']).default('user'),
});

// Middleware
function validate(schema: z.ZodSchema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          details: result.error.flatten(),
        },
      });
    }
    req.body = result.data;
    next();
  };
}

// Usage
app.post('/users', validate(createUserSchema), createUser);
```

### Error Handling (`/api-patterns errors`)

**Custom Error Classes:**
```typescript
class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, 'NOT_FOUND', `${resource} not found`);
  }
}

class ValidationError extends AppError {
  constructor(details: unknown) {
    super(400, 'VALIDATION_ERROR', 'Invalid input', details);
  }
}
```

**Global Error Handler:**
```typescript
function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  console.error(err);

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
  }

  // Unexpected error
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
    },
  });
}

app.use(errorHandler);
```

### Authentication (`/api-patterns auth`)

**JWT Authentication:**
```typescript
import jwt from 'jsonwebtoken';

// Generate token
function generateToken(user: User) {
  return jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  );
}

// Auth middleware
function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    throw new AppError(401, 'UNAUTHORIZED', 'No token provided');
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!);
    req.user = payload;
    next();
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid token');
  }
}

// Role-based access
function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    }
    next();
  };
}
```

### Database (`/api-patterns database`)

**Repository Pattern:**
```typescript
// Abstract database operations
class UserRepository {
  async findById(id: string): Promise<User | null> {
    return db.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return db.user.findUnique({ where: { email } });
  }

  async create(data: CreateUserInput): Promise<User> {
    return db.user.create({ data });
  }

  async update(id: string, data: UpdateUserInput): Promise<User> {
    return db.user.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await db.user.delete({ where: { id } });
  }
}
```

**Transaction Pattern:**
```typescript
async function transferFunds(fromId: string, toId: string, amount: number) {
  return db.$transaction(async (tx) => {
    const from = await tx.account.update({
      where: { id: fromId },
      data: { balance: { decrement: amount } },
    });

    if (from.balance < 0) {
      throw new AppError(400, 'INSUFFICIENT_FUNDS', 'Not enough balance');
    }

    await tx.account.update({
      where: { id: toId },
      data: { balance: { increment: amount } },
    });
  });
}
```

## Best Practices

1. **Validate all input** - Never trust client data
2. **Use async/await** - Avoid callback hell
3. **Handle errors centrally** - Single error handler
4. **Log appropriately** - Structured logging
5. **Rate limit** - Protect against abuse
6. **Use CORS properly** - Restrict origins
7. **Keep secrets safe** - Use environment variables
