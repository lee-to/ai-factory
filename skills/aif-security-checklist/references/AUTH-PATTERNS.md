# Authentication Implementation Patterns

## Password Hashing

```typescript
// ✅ Good: Secure password hashing
import { hash, verify } from 'argon2';

const hashedPassword = await hash(password, {
  type: argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4
});

// ✅ Good: Timing-safe comparison
const isValid = await verify(hashedPassword, inputPassword);
```

```php
// ✅ Good: PHP password hashing
$hash = password_hash($password, PASSWORD_ARGON2ID, [
    'memory_cost' => 65536,
    'time_cost' => 4,
    'threads' => 3,
]);

// ✅ Good: Timing-safe verification
if (password_verify($inputPassword, $storedHash)) {
    // Valid password
}

// ✅ Laravel: Uses bcrypt by default
$user->password = Hash::make($password);
if (Hash::check($inputPassword, $user->password)) {
    // Valid
}
```

## Session Management

```typescript
// ✅ Good: Secure cookie settings
app.use(session({
  secret: process.env.SESSION_SECRET,
  name: '__Host-session', // __Host- prefix enforces secure
  cookie: {
    httpOnly: true,       // No JS access
    secure: true,         // HTTPS only
    sameSite: 'strict',   // CSRF protection
    maxAge: 3600000,      // 1 hour
    domain: undefined,    // No cross-subdomain
  },
  resave: false,
  saveUninitialized: false,
}));
```

## JWT Security

```typescript
// ❌ Bad: Secrets in JWT
{ "userId": 1, "email": "user@example.com", "ssn": "123-45-6789" }

// ✅ Good: Minimal claims
{ "sub": "user_123", "iat": 1699900000, "exp": 1699900900 }
```
