# CI Audit Report Format

## Audit Report Template

```
## CI Pipeline Audit

### Jobs
| Check | Status | Detail |
|-------|--------|--------|
| Security audit | ❌ | No dependency scanning |

### Configuration
| Check | Status | Detail |
|-------|--------|--------|
| Caching | ⚠️ | Missing composer cache |
| Concurrency | ❌ | No concurrency group |
| Permissions | ❌ | No explicit permissions |

### Recommendations
3. HIGH: Add concurrency group to cancel redundant runs
4. HIGH: Add composer cache for faster installs
5. MEDIUM: Add security audit job (composer audit)
```

## Fix Options

```
AskUserQuestion: CI audit found issues. What should we do?

Options:
1. Fix all — Apply all recommendations
2. Fix critical only — Add missing jobs, skip configuration improvements
3. Show details — Explain each issue before deciding
```

**If fixing:**
- For missing jobs → add new jobs to existing pipeline
- For configuration issues → edit existing jobs
- Preserve existing structure, job names, and ordering conventions
- For GitHub Actions: edit in-place or add new workflow files
- For GitLab CI: edit `.gitlab-ci.yml` in-place

## Summary Display Template

```
## CI Pipeline Generated

### Platform
GitHub Actions

### Files Created
| File | Purpose |
|------|---------|
| .github/workflows/lint.yml | code-style, static-analysis, rector |
| .github/workflows/security.yml | composer audit |

### Features
- Concurrency groups (cancel redundant runs)
- Coverage upload as artifact

### Quick Start
  # Trigger manually
  gh workflow run ci.yml

  # View runs
  gh run list --workflow=ci.yml
```
