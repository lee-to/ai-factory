## Logging Requirements

**All fixes MUST include logging:**

1. **Log prefix**: Use `[FIX]` or `[FIX:<issue-id>]` for easy filtering
2. **Log inputs**: What data was being processed
3. **Log success**: Confirm the fix worked
4. **Log errors**: Full context if something fails
5. **Configurable**: Use LOG_LEVEL if available

```typescript
// Pattern for fixes
const LOG_FIX = process.env.LOG_LEVEL === "debug" || process.env.DEBUG_FIX;

function fixedFunction(input) {
  if (LOG_FIX) console.log("[FIX] Input:", input);

  // ... fix logic ...

  if (LOG_FIX) console.log("[FIX] Output:", result);
  return result;
}
```
