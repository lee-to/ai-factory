# Verification report example

```
## Verification Report

### Task Completion: 7/8 (87%)
| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Create user model | ✅ Complete | |
| 2 | Add registration endpoint | ✅ Complete | |
| 3 | Add password reset | ⚠️ Partial | Missing: email sending |
| 4 | Add JWT auth middleware | ✅ Complete | |
| 5 | Add rate limiting | ✅ Complete | |
| 6 | Add input validation | ✅ Complete | |
| 7 | Add error handling | ✅ Complete | |
| 8 | Update API docs | ❌ Not found | No changes in docs/ |

### Code Quality
- Build: ✅ Passes
- Tests: ✅ 42 passed, 0 failed
- Lint: ⚠️ 2 warnings in src/api/auth/reset.ts

### Requirements Consistency
- Source reconciliation: ✅ Passes
- Supported combinations: ✅ Covered
- Representative artifact path: ✅ Verified / ⏭️ Not applicable

### Issues Found
1. **Task #3 incomplete** — Password reset endpoint created but email sending not implemented (SendGrid integration missing)
2. **Task #8 not done** — API documentation not updated despite plan requirement
3. **2 unfinished markers found** — src/services/auth.ts:45, src/middleware/rate-limit.ts:12
4. **New env var undocumented** — `SENDGRID_API_KEY` referenced but not in .env.example

### No Issues
- All imports resolved
- No unused dependencies
- DESCRIPTION.md up to date
- No leftover debug logs
```
