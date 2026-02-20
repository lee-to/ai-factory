---
name: nextjs-patterns
description: Next.js development patterns and best practices. Helps with App Router, Server Components, API routes, and data fetching.
argument-hint: "[topic: routing|data|api|auth|forms]"
---

# Next.js Patterns Guide

Expert guidance on Next.js patterns using the App Router and React Server Components.

## Topics

### Routing (`/nextjs-patterns routing`)

**App Router Structure:**
```
app/
├── layout.tsx          # Root layout
├── page.tsx            # Home page
├── loading.tsx         # Loading UI
├── error.tsx           # Error boundary
├── not-found.tsx       # 404 page
├── dashboard/
│   ├── layout.tsx      # Nested layout
│   ├── page.tsx        # /dashboard
│   └── [id]/
│       └── page.tsx    # /dashboard/[id]
└── api/
    └── route.ts        # API route
```

**Key Patterns:**
- Use `layout.tsx` for shared UI and data fetching
- Use `loading.tsx` with Suspense for streaming
- Dynamic routes with `[param]` folders
- Route groups with `(group)` folders
- Parallel routes with `@slot` folders

### Data Fetching (`/nextjs-patterns data`)

**Server Components (default):**
```typescript
// Fetch directly in component - no useEffect needed
async function Page() {
  const data = await fetch('https://api.example.com/data');
  return <div>{data}</div>;
}
```

**Caching:**
```typescript
// Cache options
fetch(url, { cache: 'force-cache' });  // Default - cached
fetch(url, { cache: 'no-store' });     // Never cache
fetch(url, { next: { revalidate: 60 } }); // Revalidate every 60s
```

**Server Actions:**
```typescript
'use server';

export async function createItem(formData: FormData) {
  const name = formData.get('name');
  await db.items.create({ name });
  revalidatePath('/items');
}
```

### API Routes (`/nextjs-patterns api`)

**Route Handlers:**
```typescript
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const users = await db.users.findMany();
  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const user = await db.users.create(body);
  return NextResponse.json(user, { status: 201 });
}
```

### Authentication (`/nextjs-patterns auth`)

**Middleware Protection:**
```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('token');
  if (!token && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/dashboard/:path*',
};
```

### Forms (`/nextjs-patterns forms`)

**Server Action Forms:**
```typescript
// Using server actions
export default function Form() {
  async function handleSubmit(formData: FormData) {
    'use server';
    await saveData(formData);
    redirect('/success');
  }

  return (
    <form action={handleSubmit}>
      <input name="email" type="email" required />
      <button type="submit">Submit</button>
    </form>
  );
}
```

## Best Practices

1. **Default to Server Components** - Only use `'use client'` when needed
2. **Colocate data fetching** - Fetch data where it's used
3. **Use streaming** - Add `loading.tsx` for better UX
4. **Validate on server** - Never trust client input
5. **Use TypeScript** - Full type safety with Next.js
6. **Image optimization** - Always use `next/image`
7. **Font optimization** - Use `next/font`

## Common Mistakes

- Adding `'use client'` unnecessarily
- Fetching data in client components when server would work
- Not using proper error boundaries
- Missing loading states
- Over-fetching with multiple small requests
