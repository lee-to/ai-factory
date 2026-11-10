## Examples

### Example 1: Null Reference Error

**User:** `/aif-fix TypeError: Cannot read property 'name' of undefined in UserProfile`

**Actions:**

1. Search for UserProfile component/function
2. Find where `.name` is accessed
3. Add a regression check for the null user case and confirm it fails
4. Add null check with logging
5. Rerun the same regression check and confirm it passes

### Example 2: API Returns Wrong Data

**User:** `/aif-fix /api/orders returns empty array for authenticated users`

**Actions:**

1. Find orders API endpoint
2. Trace the query logic
3. Find the bug (e.g., wrong filter)
4. Add or identify an integration regression check for the authenticated user case and confirm it fails
5. Fix with logging
6. Rerun the same regression check and confirm it passes

### Example 3: Form Validation Not Working

**User:** `/aif-fix email validation accepts invalid emails`

**Actions:**

1. Find email validation logic
2. Check regex or validation library usage
3. Add a unit regression test for the invalid email case and confirm it fails
4. Fix the validation
5. Add logging for validation failures
6. Rerun the same regression test and confirm it passes

**Example patch:**

```markdown
# Null reference in UserProfile when user has no avatar

**Date:** 2026-02-07 14:30
**Files:** src/components/UserProfile.tsx
**Severity:** medium

## Problem

TypeError: Cannot read property 'url' of undefined when rendering
UserProfile for users without an uploaded avatar.

## Root Cause

The `user.avatar` field is optional in the database schema but the
component accessed `user.avatar.url` without a null check. This was
introduced in commit abc123 when avatar display was added — the
developer tested only with users that had avatars.

## Solution

Added optional chaining: `user.avatar?.url` with a fallback to a
default avatar URL. Also added a null check in the Avatar sub-component.

## Prevention

- Always check if database fields marked as `nullable` / `optional`
  are handled with null checks in the UI layer
- Add test cases for "empty state" — user with minimal data
- Consider a lint rule for accessing nested optional properties

## Tags

`#null-check` `#react` `#optional-field` `#typescript`
```
