# CI Audit Report Format

## Audit Report Template

```
## CI Pipeline Audit

### Jobs
| Check | Status | Detail |
|-------|--------|--------|
| Code style job | ✅ | php-cs-fixer dry-run |
| Static analysis | ❌ | PHPStan installed but no CI job |
| Rector check | ❌ | rector.php exists but no CI job |
| Tests | ✅ | PHPUnit with coverage |
| Security audit | ❌ | No dependency scanning |

### Configuration
| Check | Status | Detail |
|-------|--------|--------|
| Caching | ⚠️ | Missing composer cache |
| Concurrency | ❌ | No concurrency group |
| Permissions | ❌ | No explicit permissions |
| Matrix builds | ⚠️ | Only PHP 8.3, missing 8.2 |

### Recommendations
1. CRITICAL: Add PHPStan job — phpstan.neon exists
2. CRITICAL: Add Rector dry-run job — rector.php exists
3. HIGH: Add concurrency group to cancel redundant runs
4. HIGH: Add composer cache for faster installs
5. MEDIUM: Add security audit job (composer audit)
6. LOW: Add PHP 8.2 to test matrix
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
| .github/workflows/tests.yml | phpunit (PHP 8.2, 8.3, 8.4) |
| .github/workflows/security.yml | composer audit |

### Features
- Composer caching via shivammathur/setup-php
- Concurrency groups (cancel redundant runs)
- Matrix builds for PHP 8.2, 8.3, 8.4
- Coverage upload as artifact

### Quick Start
  # Trigger manually
  gh workflow run ci.yml

  # View runs
  gh run list --workflow=ci.yml
```
