---
name: aif-best-practices
description: Code quality guidelines and best practices for writing clean, maintainable code. Covers naming, structure, error handling, testing, and code review standards. Use when writing code, reviewing, refactoring, or asking "how should I name this", "best practice for", "clean code".
argument-hint: "[naming|structure|errors|testing|review]"
allowed-tools: Read Glob Grep
disable-model-invocation: false
---

# Best Practices Guide

Universal code quality guidelines applicable to any language or framework.

**Context:** If `.ai-factory/ARCHITECTURE.md` exists, follow its folder structure, dependency rules, and module boundaries alongside these guidelines.

## Quick Reference

- `/aif-best-practices` — Full overview
- `/aif-best-practices naming` — Naming conventions
- `/aif-best-practices structure` — Code organization
- `/aif-best-practices errors` — Error handling
- `/aif-best-practices testing` — Testing practices
- `/aif-best-practices review` — Code review checklist

---

## Naming Conventions

### Variables & Functions
```
✅ Good                          ❌ Bad
─────────────────────────────────────────────
getUserById(id)                  getUser(i)
isValidEmail                     checkEmail
maxRetryCount                    max
calculateTotalPrice              calc
handleSubmit                     submit
```

**Rules:**
- Use descriptive names that reveal intent
- Avoid abbreviations (except universally known: `id`, `url`, `api`)
- Boolean variables: `is`, `has`, `can`, `should` prefix
- Functions: verb + noun (`fetchUser`, `validateInput`)
- Constants: SCREAMING_SNAKE_CASE
- Classes/Types: PascalCase
- Variables/functions: camelCase (JS/TS/PHP) or snake_case (Python/Rust)

### Files & Directories
```
✅ Good                          ❌ Bad
─────────────────────────────────────────────
user-service.ts                  userService.ts (inconsistent)
UserRepository.ts                user_repository.ts (mixed)
/components/Button/              /Components/button/
/services/auth/                  /Services/Auth/
```

**Rules:**
- One convention per project (kebab-case or PascalCase for files)
- Directories: lowercase with hyphens
- Test files: `*.test.ts` or `*.spec.ts` (consistent)
- Index files: only for re-exports, not logic

---

## Code Structure

### Function Design
```typescript
// ✅ Good: Single responsibility, clear inputs/outputs
function calculateDiscount(price: number, discountPercent: number): number {
  if (discountPercent < 0 || discountPercent > 100) {
    throw new Error('Discount must be between 0 and 100');
  }
  return price * (1 - discountPercent / 100);
}

// ❌ Bad: Multiple responsibilities, side effects
function processOrder(order) {
  validateOrder(order);           // validation
  order.discount = getDiscount(); // mutation
  saveToDatabase(order);          // persistence
  sendEmail(order.user);          // notification
  return order;
}
```

```php
// ✅ Good: PHP with type declarations
function calculateDiscount(float $price, float $discountPercent): float
{
    if ($discountPercent < 0 || $discountPercent > 100) {
        throw new InvalidArgumentException('Discount must be between 0 and 100');
    }
    return $price * (1 - $discountPercent / 100);
}
```

**Rules:**
- Single Responsibility: one function = one job
- Max 20-30 lines per function
- Max 3-4 parameters (use object for more)
- No side effects in pure functions
- Early returns for guard clauses

### Module Organization
```
feature/
├── index.ts          # Public exports only
├── types.ts          # Types and interfaces
├── constants.ts      # Constants
├── utils.ts          # Pure utility functions
├── hooks.ts          # React hooks (if applicable)
├── service.ts        # Business logic
└── repository.ts     # Data access
```

**Rules:**
- Group by feature, not by type
- Clear public API via index.ts
- Internal modules prefixed with `_` or in `internal/`
- Avoid circular dependencies

---

## Error Handling

### Do's and Don'ts
```typescript
// ✅ Good: Specific errors, meaningful messages
class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`User not found: ${userId}`);
    this.name = 'UserNotFoundError';
  }
}

async function getUser(id: string): Promise<User> {
  const user = await db.users.find(id);
  if (!user) {
    throw new UserNotFoundError(id);
  }
  return user;
}

// ❌ Bad: Generic errors, swallowed exceptions
async function getUser(id) {
  try {
    return await db.users.find(id);
  } catch (e) {
    console.log(e);  // Swallowed!
    return null;     // Hides the problem
  }
}
```

**Rules:**
- Create specific error classes for domain errors
- Never swallow exceptions without logging
- Log errors with context (user ID, request ID, etc.)
- Use error boundaries at system edges
- Return Result types for expected failures (optional)

### Error Messages
```
✅ Good: "Failed to create user: email 'test@example.com' already exists"
❌ Bad: "Error occurred"
❌ Bad: "Something went wrong"
```

---

## Testing Practices

### Test Structure (AAA Pattern)
```typescript
describe('calculateDiscount', () => {
  it('should apply percentage discount to price', () => {
    // Arrange
    const price = 100;
    const discount = 20;

    // Act
    const result = calculateDiscount(price, discount);

    // Assert
    expect(result).toBe(80);
  });

  it('should throw for invalid discount percentage', () => {
    expect(() => calculateDiscount(100, -10)).toThrow();
    expect(() => calculateDiscount(100, 150)).toThrow();
  });
});
```

**Rules:**
- One assertion concept per test
- Descriptive test names: "should [expected behavior] when [condition]"
- Test behavior, not implementation
- Use factories/fixtures for test data
- Avoid testing private methods directly

### Test Coverage Priorities
```
1. Critical business logic      ████████████ Must have
2. Edge cases and boundaries    ████████░░░░ Important
3. Integration points           ██████░░░░░░ Important
4. Happy paths                  ████░░░░░░░░ Basic
5. UI components                ██░░░░░░░░░░ Optional
```

---

## Code Review Checklist

### Before Requesting Review
- [ ] Self-reviewed the diff
- [ ] Tests pass locally
- [ ] No debug code (console.log, debugger)
- [ ] No commented-out code
- [ ] Updated documentation if needed
- [ ] Commit messages are clear

### Reviewer Checklist
- [ ] **Correctness**: Does it do what it claims?
- [ ] **Edge cases**: What could go wrong?
- [ ] **Security**: Any vulnerabilities? (see `/aif-security-checklist`)
- [ ] **Performance**: Any obvious bottlenecks?
- [ ] **Readability**: Can I understand it in 5 minutes?
- [ ] **Tests**: Are critical paths covered?
- [ ] **Consistency**: Follows project conventions?

### Review Comments
```
✅ Good feedback:
"This could throw if `user` is null. Consider adding a null check
or using optional chaining: `user?.profile?.name`"

❌ Bad feedback:
"This is wrong"
"I don't like this"
"Why did you do it this way?"
```

---

## Quick Rules Summary

| Area | Rule |
|------|------|
| Naming | Descriptive, consistent, reveals intent |
| Functions | Small, single purpose, no side effects |
| Errors | Specific types, never swallow, log context |
| Tests | AAA pattern, test behavior, descriptive names |
| Reviews | Be specific, suggest solutions, be kind |
