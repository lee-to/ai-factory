# Race Conditions

## Double-Spending / Balance Race
```typescript
// ❌ VULNERABLE: Read-then-write (two requests can read same balance)
app.post('/transfer', async (req, res) => {
  const account = await db.accounts.findOne({ id: req.user.id });
  if (account.balance >= amount) {
    await db.accounts.updateOne(
      { id: req.user.id },
      { $set: { balance: account.balance - amount } }
    );
  }
});
// Attack: Send 2 requests simultaneously, both read balance=100, both pass check

// ✅ SAFE: Atomic conditional update
app.post('/transfer', async (req, res) => {
  const result = await db.accounts.updateOne(
    { id: req.user.id, balance: { $gte: amount } },
    { $inc: { balance: -amount } }
  );
  if (result.modifiedCount === 0) {
    return res.status(400).json({ error: 'Insufficient funds' });
  }
});
```

```sql
-- ✅ SAFE: SQL with row-level locking
BEGIN;
SELECT balance FROM accounts WHERE id = $1 FOR UPDATE;
-- Only one transaction can hold this lock at a time
UPDATE accounts SET balance = balance - $2 WHERE id = $1 AND balance >= $2;
COMMIT;
```

## TOCTOU (Time of Check to Time of Use)
```typescript
// ❌ VULNERABLE: Check permission, then act — gap between check and action
app.post('/admin/delete-user', async (req, res) => {
  const caller = await db.users.findOne({ id: req.user.id });
  if (caller.role !== 'admin') return res.status(403).end();
  // ⚠️ Between check above and delete below, role could be revoked
  await db.users.deleteOne({ id: req.body.targetId });
});

// ✅ SAFE: Atomic check-and-act in single query
app.post('/admin/delete-user', async (req, res) => {
  const result = await db.query(
    `DELETE FROM users WHERE id = $1
     AND EXISTS (SELECT 1 FROM users WHERE id = $2 AND role = 'admin')`,
    [req.body.targetId, req.user.id]
  );
  if (result.rowCount === 0) return res.status(403).end();
});
```

```typescript
// ❌ VULNERABLE: File TOCTOU
import { access, readFile } from 'fs/promises';

await access(filePath, fs.constants.R_OK); // Check
// ⚠️ File could be replaced with symlink here
const data = await readFile(filePath);     // Use

// ✅ SAFE: Open with flags, handle errors
import { open } from 'fs/promises';

try {
  const fh = await open(filePath, 'r');  // Atomic open
  const data = await fh.readFile();
  await fh.close();
} catch (err) {
  if (err.code === 'EACCES') return res.status(403).end();
}
```

## Optimistic Locking
```typescript
// ✅ SAFE: Version-based optimistic locking prevents lost updates
app.put('/articles/:id', async (req, res) => {
  const { title, body, version } = req.body;
  const result = await db.query(
    `UPDATE articles SET title = $1, body = $2, version = version + 1
     WHERE id = $3 AND version = $4`,
    [title, body, req.params.id, version]
  );
  if (result.rowCount === 0) {
    return res.status(409).json({ error: 'Conflict: article was modified by another user' });
  }
});
```

## Idempotency Keys
```typescript
// ✅ SAFE: Prevent duplicate payments with idempotency key
app.post('/payments', async (req, res) => {
  const idempotencyKey = req.headers['idempotency-key'];
  if (!idempotencyKey) return res.status(400).json({ error: 'Idempotency-Key required' });

  const existing = await db.payments.findOne({ idempotencyKey });
  if (existing) return res.json(existing.result); // Return cached result

  const result = await processPayment(req.body);
  await db.payments.insertOne({ idempotencyKey, result, createdAt: new Date() });
  res.json(result);
});
```

## Distributed Locks (Redis)
```typescript
// ✅ SAFE: Redis lock for cross-instance critical sections
import { Redis } from 'ioredis';
const redis = new Redis();

async function withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const lockKey = `lock:${key}`;
  const lockValue = crypto.randomUUID();

  const acquired = await redis.set(lockKey, lockValue, 'PX', ttlMs, 'NX');
  if (!acquired) throw new Error('Could not acquire lock');

  try {
    return await fn();
  } finally {
    // Release only if we still own the lock (atomic check-and-delete)
    await redis.eval(
      `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
      1, lockKey, lockValue
    );
  }
}

// Usage
await withLock(`checkout:${userId}`, 5000, async () => {
  await processOrder(userId, cartItems);
});
```
