# Logging Requirements

**ALWAYS add verbose logging when implementing code.** AI-generated code often has subtle bugs that are hard to debug without proper logging.

## Logging Guidelines

1. **Log function entry/exit** with parameters and return values
2. **Log state changes** - before and after mutations
3. **Log external calls** - API requests, database queries, file operations
4. **Log error context** - include relevant variables, not just error message
5. **Use structured logging** when possible (JSON format)

## Example Pattern

```typescript
function processOrder(order: Order): Result {
  console.log('[processOrder] START', { orderId: order.id, items: order.items.length });

  try {
    const validated = validateOrder(order);
    console.log('[processOrder] Validation passed', { validated });

    const result = submitToPayment(validated);
    console.log('[processOrder] Payment result', { success: result.success, transactionId: result.id });

    return result;
  } catch (error) {
    console.error('[processOrder] ERROR', { orderId: order.id, error: error.message, stack: error.stack });
    throw error;
  }
}
```

## Log Management Requirements

**Logs must be configurable and manageable:**

1. **Use log levels** - DEBUG, INFO, WARN, ERROR
2. **Environment-based control** - LOG_LEVEL env variable
3. **Easy to disable** - single flag or env var to turn off verbose logs
4. **Consider rotation** - for file-based logs, implement rotation or use existing tools

```typescript
// Good: Configurable logging
const LOG_LEVEL = process.env.LOG_LEVEL || 'debug';
const logger = createLogger({ level: LOG_LEVEL });

// Good: Can be disabled
if (process.env.DEBUG) {
  console.log('[debug]', data);
}

// Bad: Hardcoded verbose logs that can't be turned off
console.log(hugeObject); // Will pollute production logs
```

## Why This Matters

- AI-generated code may have edge cases not covered
- Logs help identify WHERE things go wrong
- Debugging without logs wastes significant time
- User can remove logs later if needed, but missing logs during development is costly
- **Production safety** - logs must be reducible to avoid performance issues and storage costs

**DO NOT skip logging to "keep code clean" - verbose logging is REQUIRED during implementation, but MUST be configurable.**
