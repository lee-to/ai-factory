# CI/CD Best Practices Reference

Comprehensive best practices for GitHub Actions and GitLab CI pipeline configuration.

---

## 1. GitHub Actions

### 1.1 Workflow Structure

**Always set:**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:                    # Allow manual triggers

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true             # Cancel redundant runs

permissions:
  contents: read                       # Least privilege
```

**Key rules:**
- **One workflow per concern** — `lint.yml`, `tests.yml`, `build.yml`, `security.yml`. Each gets its own triggers, permissions, concurrency group, and PR status check
- Keep single `ci.yml` only for trivially small projects (1-2 jobs)
- Always set explicit `permissions` — never rely on defaults
- Use `concurrency` groups to cancel in-progress runs on the same branch
- Add `workflow_dispatch` for manual re-runs
- Use `fetch-depth: 1` on checkout for speed (unless you need git history)

### 1.2 Caching

**Prefer built-in cache in setup actions:**

| Language | Setup Action | Cache Option |
|----------|-------------|--------------|
| PHP | `shivammathur/setup-php@v2` | `tools:` installs from cache |
| Node.js | `actions/setup-node@v4` | `cache: npm\|pnpm\|yarn` |
| Python | `actions/setup-python@v5` | `cache: pip` |
| Python (uv) | `astral-sh/setup-uv@v5` | `enable-cache: true` |
| Go | `actions/setup-go@v5` | Auto-caches modules + build |
| Rust | `Swatinem/rust-cache@v2` | Caches target/ + registry |
| Java | `actions/setup-java@v4` | `cache: maven\|gradle` |

**When using explicit `actions/cache@v4`:**

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.composer/cache
    key: ${{ runner.os }}-composer-${{ hashFiles('**/composer.lock') }}
    restore-keys: |
      ${{ runner.os }}-composer-
```

Rules:
- Cache limit: 10 GB per repository, entries expire after 7 days
- Include `runner.os` in key for cross-platform workflows
- Use `hashFiles()` with lock files for cache invalidation
- Add `restore-keys` for partial cache hits (e.g., when lock file changes)
- Cache package manager directories, NOT `node_modules`/`vendor` directly

### 1.3 Matrix Builds

```yaml
strategy:
  fail-fast: false          # Don't cancel siblings on first failure
  matrix:
    php-version: ['8.2', '8.3', '8.4']
```

Rules:
- `fail-fast: false` — always set to avoid hiding failures on other versions
- Only use matrix on the `tests` job, not on lint/SA jobs (waste of resources)
- Quote version strings to avoid YAML parsing issues (`'8.10'` not `8.10`)
- Use `include:` for version-specific overrides (e.g., different deps per version)

### 1.4 Security

- **Pin action versions** to commit SHA for third-party actions, `@v4` for official actions
- **Set `permissions`** at workflow level, override per-job if needed
- **Never store secrets in code** — use GitHub Secrets
- **Use `actions/dependency-review-action@v4`** on PRs to catch vulnerable dependencies
- **Add `security-events: write`** permission only for SAST jobs

### 1.5 Artifacts

```yaml
- uses: actions/upload-artifact@v4
  with:
    name: coverage-report
    path: coverage.xml
    retention-days: 14
```

Rules:
- Use `retention-days` to limit storage costs
- Name artifacts descriptively, especially in matrix builds
- Use `if: always()` on test artifact uploads to capture failures

### 1.6 Job Dependencies

```yaml
jobs:
  lint:       # Runs immediately
  test:       # Runs immediately (parallel)
  build:
    needs: [lint, test]   # Waits for both
```

Rules:
- Jobs without `needs` run in parallel by default
- Use `needs` only when there's a real dependency (tests must pass before deploy)
- Don't chain lint -> test -> build sequentially — lint and test can run in parallel

---

## 2. GitLab CI

### 2.1 Pipeline Structure

```yaml
stages:
  - install
  - lint
  - test
  - build

workflow:
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

default:
  interruptible: true
  retry:
    max: 2
    when:
      - runner_system_failure
      - stuck_or_timeout_failure
```

**Key rules:**
- Define `workflow.rules` to prevent duplicate pipelines (MR + push to same branch)
- Set `interruptible: true` for auto-cancel on new pushes
- Add `retry` for infrastructure failures (not code failures)
- Use DAG (`needs:`) for parallel execution within stages

### 2.2 Caching Strategy

```yaml
.cache-composer:
  cache:
    - key:
        files:
          - composer.lock
      paths:
        - vendor/
        - $COMPOSER_HOME/cache/
      policy: pull-push    # Only on install job

lint:
  extends: .cache-composer
  cache:
    - key:
        files:
          - composer.lock
      paths:
        - vendor/
      policy: pull         # Read-only on all other jobs
```

Rules:
- `policy: pull-push` only on the job that installs dependencies
- `policy: pull` on all downstream jobs (lint, test, build)
- Use `key: files:` for automatic lock-file-based invalidation
- Use `fallback_keys` for branch cache warming:

```yaml
cache:
  key:
    files:
      - package-lock.json
  fallback_keys:
    - $CI_DEFAULT_BRANCH
```

- Maximum 4 caches per job
- Use artifacts (not cache) to pass build output between stages in the same pipeline

### 2.3 Artifacts vs Cache

| Use case | Mechanism |
|----------|-----------|
| Speed up dependency install across pipelines | Cache |
| Pass `vendor/`/`node_modules/` to jobs in same pipeline | Artifacts (`expire_in: 1 hour`) |
| Pass test results/coverage between jobs | Artifacts |
| Pass build output to deploy stage | Artifacts |

```yaml
install:
  stage: install
  script:
    - composer install --no-interaction
  artifacts:
    paths:
      - vendor/
    expire_in: 1 hour       # Short TTL, only for this pipeline
```

### 2.4 Report Integration

GitLab has built-in support for reports in MR widgets:

```yaml
test:
  artifacts:
    reports:
      junit: report.xml              # Test results in MR
      codequality: gl-code-quality.json   # Code quality diff in MR
      coverage_report:
        coverage_format: cobertura
        path: coverage.xml            # Line-by-line coverage in MR
```

**Code quality report format** (Code Climate JSON):

Tools that support GitLab format natively:
- PHPStan: `--error-format=gitlab`
- golangci-lint: `--out-format code-climate`
- Ruff: `--output-format=gitlab`
- ESLint: requires `eslint-formatter-gitlab` or JSON + converter

### 2.5 Hidden Jobs & Extends

Use YAML anchors or `extends:` for shared configuration:

```yaml
.php-setup:
  image: php:8.3-cli
  before_script:
    - apt-get update && apt-get install -y git unzip
    - curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
    - composer install --no-interaction --prefer-dist
  cache:
    - key:
        files:
          - composer.lock
      paths:
        - vendor/
      policy: pull

phpstan:
  extends: .php-setup
  stage: lint
  script:
    - vendor/bin/phpstan analyse
```

---

## 3. Per-Language Conventions

### 3.1 PHP

**Mandatory CI tools for PHP projects:**

1. **Tests** (PHPUnit or Pest) — always
2. **Static analysis** (PHPStan or Psalm) — always if config exists
3. **Code style** (PHP-CS-Fixer, Pint, or PHPCS) — always if config exists
4. **Rector** — if `rector.php` exists
5. **Composer audit** — recommended

**PHP-specific CI patterns:**

- Use `shivammathur/setup-php@v2` for GitHub Actions (supports extensions, tools, coverage drivers)
- Set `coverage: xdebug` or `coverage: pcov` (pcov is faster) for coverage
- Set `coverage: none` on lint/SA jobs for faster setup
- Use `--memory-limit=512M` on PHPStan to avoid OOM
- For Pest: use `--ci` flag for CI-friendly output

**PHP version matrix:**
- Include all versions from `composer.json` `require.php` constraint
- Example: `"php": ">=8.2"` -> test on `['8.2', '8.3', '8.4']`

### 3.2 Python

**Recommended tool combinations:**

Modern (2025+):
- **uv** for dependency management
- **Ruff** for linting + formatting (replaces black, isort, flake8, pylint)
- **mypy** for type checking
- **pytest** for testing
- **bandit** for security analysis

Traditional:
- **pip** for dependencies
- **black** + **isort** + **flake8** for formatting/linting
- **mypy** for type checking
- **pytest** for testing

**Python-specific CI patterns:**

- Use `astral-sh/setup-uv@v5` for uv-based projects
- Use `actions/setup-python@v5` with `cache: pip` for pip-based projects
- For uv: run tools via `uv run <tool>` (uses project's virtual env)
- Coverage regex for GitLab: `'/(?i)total.*? (100(?:\.0+)?\%|[1-9]?\d(?:\.\d+)?\%)$/'`

### 3.3 Node.js / TypeScript

**Standard CI jobs:**

1. **Lint** (ESLint + Prettier, or Biome)
2. **Type check** (`tsc --noEmit`) — if TypeScript
3. **Tests** (Jest or Vitest)
4. **Build** (`npm run build`) — if build script exists

**Node-specific CI patterns:**

- Detect package manager from lock file and use the correct install command
- For pnpm: add `pnpm/action-setup@v4` before `actions/setup-node@v4`
- For Bun: use `oven-sh/setup-bun@v2`
- Cache: use built-in `cache:` option in `actions/setup-node@v4`
- For Jest: add `--ci` flag (disables watch mode, fails on snapshot mismatch)
- For Vitest: use `vitest run` (not `vitest` which enters watch mode)

### 3.4 Go

**Standard CI jobs:**

1. **Lint** (golangci-lint) — the de facto standard meta-linter
2. **Tests** (`go test -race ./...`)
3. **Build** (`go build ./...`) — verify compilation
4. **Security** (govulncheck) — optional

**Go-specific CI patterns:**

- Use `golangci/golangci-lint-action@v6` for GitHub Actions (handles caching)
- Use `golangci/golangci-lint` Docker image for GitLab CI
- `actions/setup-go@v5` auto-caches modules and build cache
- Always use `-race` flag in tests for race condition detection
- Use `-covermode=atomic` with `-race` (not `count` or `set`)

### 3.5 Rust

**Standard CI jobs:**

1. **Format** (`cargo fmt --check`)
2. **Clippy** (`cargo clippy -- -D warnings`)
3. **Tests** (`cargo test --all-features`)
4. **Security** (`cargo audit` or `cargo deny`)

**Rust-specific CI patterns:**

- Use `dtolnay/rust-toolchain@stable` (NOT `actions-rs/toolchain` which is unmaintained)
- Use `Swatinem/rust-cache@v2` for dependency caching
- Clippy needs compilation — it's the slowest job, benefits most from caching
- `cargo fmt` doesn't need compilation — fast, no cache needed
- Use `cargo tarpaulin` for coverage (install once, cache the binary)

### 3.6 Java

**Standard CI jobs:**

1. **Code quality** (Checkstyle + PMD + SpotBugs) — can be one job
2. **Tests** (`mvn verify` or `./gradlew test`)
3. **Build** (`mvn package -DskipTests` or `./gradlew assemble`)

**Java-specific CI patterns:**

- Use `actions/setup-java@v4` with `distribution: temurin` and `cache: maven|gradle`
- For Gradle: use `gradle/actions/setup-gradle@v4` for better caching
- Always use `-B` (batch mode) flag with Maven to suppress download progress
- For multi-module projects: `mvn verify -B` runs all modules

---

## 4. Anti-Patterns

### 4.1 Common Mistakes

| Anti-Pattern | Why Bad | Fix |
|-------------|---------|-----|
| Everything in one workflow file | Can't have different triggers/permissions per concern | Split: `lint.yml`, `tests.yml`, `build.yml`, `security.yml` |
| Single monolith job | Slow feedback, can't see which step failed | Separate into parallel jobs |
| Sequential lint -> test -> build chain | Wastes time, lint doesn't depend on tests | Run lint and tests in parallel |
| `fail-fast: true` on matrix | Hides failures on other versions | Set `fail-fast: false` |
| Caching `node_modules` directly | Breaks on OS/Node version changes | Cache `~/.npm` instead |
| No `concurrency` group | Wastes CI minutes on outdated commits | Add `cancel-in-progress: true` |
| Hardcoded language versions | Drift between CI and project config | Read from project files |
| `latest` tag on Docker images | Non-reproducible builds | Pin to specific version |
| Running lint on all matrix versions | Wasted resources, lint is version-independent | Run lint only on latest |
| No `permissions` set | Over-privileged token | Set `contents: read` minimum |

### 4.2 Over-Engineering Checklist

Before writing the pipeline, verify:

- [ ] Don't add matrix builds if the project targets a single version
- [ ] Don't add security scanning unless tools are installed or user requested
- [ ] Don't add coverage upload without a coverage service (Codecov, Coveralls)
- [ ] Don't add SAST (CodeQL) unless the project has significant custom code
- [ ] Don't split lint into multiple jobs if there's only one linter
- [ ] Don't add service containers unless tests actually need them
- [ ] Don't add deploy stage — this skill focuses on CI only

---

## 5. Dependency Caching Quick Reference

### GitHub Actions

| Language | Setup Action | Cache Key File | Cache Path |
|----------|-------------|----------------|------------|
| PHP | `shivammathur/setup-php@v2` | `composer.lock` | `~/.composer/cache` |
| Node.js | `actions/setup-node@v4` | `package-lock.json` | `~/.npm` |
| Python (pip) | `actions/setup-python@v5` | `requirements*.txt` | `~/.cache/pip` |
| Python (uv) | `astral-sh/setup-uv@v5` | `uv.lock` | `~/.cache/uv` |
| Go | `actions/setup-go@v5` | `go.sum` | `~/go/pkg/mod` |
| Rust | `Swatinem/rust-cache@v2` | `Cargo.lock` | `~/.cargo`, `target/` |
| Java (Maven) | `actions/setup-java@v4` | `pom.xml` | `~/.m2/repository` |
| Java (Gradle) | `actions/setup-java@v4` | `build.gradle*` | `~/.gradle/caches` |

### GitLab CI

| Language | Image | Cache Key File | Cache Path |
|----------|-------|----------------|------------|
| PHP | `php:<ver>-cli` | `composer.lock` | `vendor/`, `.composer/cache/` |
| Node.js | `node:<ver>-slim` | `package-lock.json` | `node_modules/`, `.npm/` |
| Python | `python:<ver>-slim` | `uv.lock` / `requirements.txt` | `.venv/`, `.uv-cache/` |
| Go | `golang:<ver>` | `go.sum` | `.go/pkg/mod/` |
| Rust | `rust:<ver>-slim` | `Cargo.lock` | `.cargo/`, `target/` |
| Java (Maven) | `maven:<ver>-eclipse-temurin-<jdk>` | `pom.xml` | `.m2/repository/` |
| Java (Gradle) | `gradle:<ver>-jdk<ver>` | `build.gradle*` | `.gradle/caches/` |
