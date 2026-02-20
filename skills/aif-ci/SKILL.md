---
name: aif-ci
description: Generate CI/CD pipeline (GitHub Actions / GitLab CI) with linting, static analysis, tests, security. Use when user says "ci", "setup ci", "github actions", "gitlab ci", "pipeline".
argument-hint: "[github|gitlab] [--enhance]"
allowed-tools: Read Edit Glob Grep Write Bash(git *) AskUserQuestion Questions
disable-model-invocation: true
metadata:
  author: AI Factory
  version: "1.0"
  category: ci
---

# CI — Pipeline Configuration Generator

Analyze a project and generate production-grade CI/CD pipeline configuration for GitHub Actions or GitLab CI. Generates separate jobs for linting, static analysis, tests, and security scanning — adapted to the project's language, framework, and existing tooling.

**Three modes based on what exists:**

| What exists | Mode | Action |
|-------------|------|--------|
| No CI config | `generate` | Create pipeline from scratch with interactive setup |
| CI config exists but incomplete | `enhance` | Audit & improve, add missing jobs |
| Full CI config | `audit` | Audit against best practices, fix gaps |

---

## Step 0: Load Project Context

Read the project description if available:

```
Read .ai-factory/DESCRIPTION.md
```

Store project context for later steps. If absent, Step 2 detects everything.

---

## Step 1: Detect Existing CI & Determine Mode

### 1.1 Scan for Existing CI Configuration

```
Glob: .github/workflows/*.yml, .github/workflows/*.yaml, .gitlab-ci.yml, .circleci/config.yml, Jenkinsfile, .travis.yml, bitbucket-pipelines.yml
```

Classify found files:
- `HAS_GITHUB_ACTIONS`: `.github/workflows/` contains YAML files
- `HAS_GITLAB_CI`: `.gitlab-ci.yml` exists
- `HAS_OTHER_CI`: CircleCI, Jenkins, Travis, or Bitbucket detected

### 1.2 Determine Mode

**If `$ARGUMENTS` contains `--enhance`** -> set `MODE = "enhance"` regardless.

**Path A: No CI config exists** (`!HAS_GITHUB_ACTIONS && !HAS_GITLAB_CI && !HAS_OTHER_CI`):
- Set `MODE = "generate"`
- Proceed to **Step 1.3: Interactive Setup**

**Path B: CI config exists but is incomplete** (e.g., has only tests, no linting):
- Set `MODE = "enhance"`
- Read all existing CI files -> store as `EXISTING_CONTENT`
- Log: "Found existing CI configuration. Will analyze and add missing jobs."

**Path C: Full CI setup** (has linting + tests + static analysis):
- Set `MODE = "audit"`
- Read all existing CI files -> store as `EXISTING_CONTENT`
- Log: "Found complete CI setup. Will audit against best practices and fix gaps."

### 1.3 Interactive Setup (Generate Mode Only)

**Determine CI platform** from `$ARGUMENTS` or ask:

If `$ARGUMENTS` contains `github` -> set `PLATFORM = "github"`
If `$ARGUMENTS` contains `gitlab` -> set `PLATFORM = "gitlab"`

Otherwise:

```
AskUserQuestion: Which CI/CD platform do you use?

Options:
1. GitHub Actions (Recommended) — .github/workflows/*.yml
2. GitLab CI — .gitlab-ci.yml
```

**Ask about optional features:**

```
AskUserQuestion: Which additional CI features do you need?

Options (multiSelect):
1. Security scanning — Dependency audit, SAST
2. Coverage reporting — Upload test coverage
3. Matrix builds — Test across multiple language versions
4. None — Just linting, static analysis, and tests
```

Store choices:
- `PLATFORM`: github | gitlab
- `WANT_SECURITY`: boolean
- `WANT_COVERAGE`: boolean
- `WANT_MATRIX`: boolean

### 1.4 Read Existing Files (Enhance / Audit Modes)

Read all existing CI files and store as `EXISTING_CONTENT`:
- All `.github/workflows/*.yml` files
- `.gitlab-ci.yml`
- Any included GitLab CI files (check `include:` directives)

Determine `PLATFORM` from existing files.

---

## Step 2: Deep Project Analysis

Scan the project thoroughly — every decision in the generated pipeline depends on this profile.

### 2.1 Language & Runtime

| File | Language |
|------|----------|
| `composer.json` | PHP |
| `package.json` | Node.js / TypeScript |
| `pyproject.toml` / `setup.py` / `setup.cfg` | Python |
| `go.mod` | Go |
| `Cargo.toml` | Rust |
| `pom.xml` | Java (Maven) |
| `build.gradle` / `build.gradle.kts` | Java/Kotlin (Gradle) |

### 2.2 Language Version

Detect the project's language version to use in CI:

| Language | Version Source | Example |
|----------|---------------|---------|
| PHP | `composer.json` -> `require.php` | `>=8.2` -> `['8.2', '8.3', '8.4']` |
| Node.js | `package.json` -> `engines.node`, `.nvmrc`, `.node-version` | `>=18` -> `[18, 20, 22]` |
| Python | `pyproject.toml` -> `requires-python`, `.python-version` | `>=3.11` -> `['3.11', '3.12', '3.13']` |
| Go | `go.mod` -> `go` directive | `go 1.23` -> `'1.23'` |
| Rust | `Cargo.toml` -> `rust-version`, `rust-toolchain.toml` | `1.82` -> `'1.82'` |
| Java | `pom.xml` -> `maven.compiler.source`, `build.gradle` -> `sourceCompatibility` | `17` -> `[17, 21]` |

For matrix builds: use the minimum version from the project config as the lowest, and include the latest stable version. For non-matrix builds: use the latest version that satisfies the constraint.

### 2.3 Package Manager & Lock File

| File | Package Manager | Install Command |
|------|-----------------|-----------------|
| `composer.lock` | Composer | `composer install --no-interaction --prefer-dist` |
| `bun.lockb` | Bun | `bun install --frozen-lockfile` |
| `pnpm-lock.yaml` | pnpm | `pnpm install --frozen-lockfile` |
| `yarn.lock` | Yarn | `yarn install --frozen-lockfile` |
| `package-lock.json` | npm | `npm ci` |
| `uv.lock` | uv | `uv sync --all-extras --dev` |
| `poetry.lock` | Poetry | `poetry install` |
| `Pipfile.lock` | Pipenv | `pipenv install --dev` |
| `requirements.txt` | pip | `pip install -r requirements.txt` |
| `go.sum` | Go modules | `go mod download` |
| `Cargo.lock` | Cargo | (built-in) |

Store: `PACKAGE_MANAGER`, `LOCK_FILE`, `INSTALL_CMD`.

### 2.4–2.7 Tool Detection

Detect project tools by scanning config files and dependencies. For the complete tool-to-command mapping → read `references/TOOL-COMMANDS.md`

Categories: **Linters & Formatters** (PHP-CS-Fixer, ESLint, Prettier, Biome, Ruff, golangci-lint, clippy, Checkstyle), **Static Analysis** (PHPStan, Psalm, Rector, mypy, tsc), **Test Frameworks** (PHPUnit, Pest, Jest, Vitest, pytest, go test, cargo test) with coverage flags, **Security Audit** (composer audit, npm audit, pip-audit, govulncheck, cargo audit).

### 2.8 Services Detection

Check if tests require external services (database, Redis, etc.):

```
Grep in tests/: postgres|mysql|redis|mongo|rabbitmq|elasticsearch
Glob: docker-compose.test.yml, docker-compose.ci.yml
```

If services are needed, they will be configured in the CI pipeline as service containers.

### 2.9 Build Output

Does the project have a build step?

| Language | Has Build | Build Command |
|----------|-----------|---------------|
| Node.js (with `build` script) | Yes | `npm run build` / `pnpm build` |
| Go | Yes | `go build ./...` |
| Rust | Yes | `cargo build --release` |
| Java | Yes | `mvn package -DskipTests -B` / `./gradlew assemble` |
| PHP | Usually no | — |
| Python | Usually no | — |

### Summary

Build `PROJECT_PROFILE`:
- `language`, `language_version`, `language_versions` (for matrix)
- `package_manager`, `lock_file`, `install_cmd`
- `linters`: list of {name, command, config_file}
- `static_analyzers`: list of {name, command}
- `test_framework`, `test_cmd`, `coverage_cmd`
- `security_tools`: list of {name, command}
- `has_build_step`, `build_cmd`
- `has_typescript`: boolean (for typecheck job)
- `services_needed`: list of services for CI
- `source_dir`: main source directory (src/, app/, lib/)

---

## Step 3: Read Best Practices & Templates

```
Read skills/ci/references/BEST-PRACTICES.md
```

Select templates matching the platform and language:

**GitHub Actions:**

| Language | Template |
|----------|----------|
| PHP | `templates/github/php.yml` |
| Node.js | `templates/github/node.yml` |
| Python | `templates/github/python.yml` |
| Go | `templates/github/go.yml` |
| Rust | `templates/github/rust.yml` |
| Java | `templates/github/java.yml` |

**GitLab CI:**

| Language | Template |
|----------|----------|
| PHP | `templates/gitlab/php.yml` |
| Node.js | `templates/gitlab/node.yml` |
| Python | `templates/gitlab/python.yml` |
| Go | `templates/gitlab/go.yml` |
| Rust | `templates/gitlab/rust.yml` |
| Java | `templates/gitlab/java.yml` |

Read the selected template:

```
Read skills/ci/templates/<platform>/<language>.yml
```

---

## Step 4: Generate Pipeline (Generate Mode)

Using the `PROJECT_PROFILE`, best practices, and template as a base, generate a customized CI pipeline.

### 4.1 GitHub Actions Generation

**One workflow per concern** — each file has its own triggers, permissions, concurrency:

| File | Name | Jobs | When to create |
|------|------|------|----------------|
| `lint.yml` | Lint | code-style, static-analysis, rector | Linters or SA detected |
| `tests.yml` | Tests | tests (+ service containers) | Always |
| `build.yml` | Build | build | `has_build_step` |
| `security.yml` | Security | dependency-audit, dependency-review | `WANT_SECURITY` |

**Why one file per concern:**
- Each check is a **separate status check** in PR — instantly see what failed
- Independent triggers — security on schedule, tests on push/PR, build only after tests
- Independent permissions — security may need `security-events: write`
- Can disable/re-run one workflow without touching others
- Branch protection rules can require specific workflows (e.g. require `tests` but not `security`)

**When to keep single file:** Only for very small projects with just lint + tests (2 jobs). As soon as there are 3+ concerns — split.

**Every workflow gets the same header pattern:**

```yaml
name: <Name>

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read
```

**Per-file job organization:**

**`lint.yml`** — all code quality checks in parallel:

| Job | Purpose | When to include |
|-----|---------|-----------------|
| `code-style` | Formatting (CS-Fixer, Prettier, Ruff format, rustfmt) | Formatter detected |
| `lint` | Linting (ESLint, Ruff check, Clippy, golangci-lint) | Linter detected |
| `static-analysis` | Type checking / SA (PHPStan, Psalm, mypy, tsc) | SA tools detected |
| `rector` | Rector dry-run (PHP only) | Rector detected |

All jobs run in parallel (no `needs`). If only one tool detected (e.g. Go with just golangci-lint) — single job in the file is fine.

**`tests.yml`** — test suite:

| Job | Purpose | When to include |
|-----|---------|-----------------|
| `tests` | Unit/integration tests | Always |
| `tests-<service>` | Tests requiring service containers | `services_needed` detected |

Matrix builds (multiple language versions) only in this file.

**`build.yml`** — build verification:

| Job | Purpose | Notes |
|-----|---------|-------|
| `build` | Verify compilation/bundling | Can depend on external workflow via `workflow_run` or just run independently |

**`security.yml`** — security scanning:

| Job | Purpose | Extra triggers |
|-----|---------|---------------|
| `dependency-audit` | Vulnerability scan | `schedule: cron '0 6 * * 1'` (weekly) |
| `dependency-review` | PR dependency diff | Only on `pull_request` |

**Per-job rules:**

1. Each job gets its own setup (checkout, language setup, cache, dependency install)
2. Use language-specific setup actions with built-in cache:
   - PHP: `shivammathur/setup-php@v2` with `tools:` parameter
   - Node.js: `actions/setup-node@v4` with `cache:` parameter
   - Python: `astral-sh/setup-uv@v5` (if uv) or `actions/setup-python@v5` (if pip)
   - Go: `actions/setup-go@v5` (auto-caches)
   - Rust: `dtolnay/rust-toolchain@stable` + `Swatinem/rust-cache@v2`
   - Java: `actions/setup-java@v4` with `cache:` parameter
3. Use `fail-fast: false` in matrix builds
4. Upload coverage as artifact when `WANT_COVERAGE`

**Matrix builds** (when `WANT_MATRIX`):

Only the `tests` job uses a matrix. Lint/SA jobs run on the latest version only.

```yaml
tests:
  name: Tests (${{ matrix.<language>-version }})
  strategy:
    fail-fast: false
    matrix:
      <language>-version: <language_versions from PROJECT_PROFILE>
```

**Combining linter jobs:**

If the project has both a formatter AND a linter from the same ecosystem, combine them into one job:
- PHP: `php-cs-fixer` check + other lint -> `code-style` job
- Node.js: `eslint` + `prettier` -> `lint` job. **Biome replaces BOTH ESLint and Prettier** — if Biome is detected, use only `npx biome check .` in a single `lint` job
- Python: `ruff check` + `ruff format --check` -> `lint` job (Ruff handles both)
- Rust: `cargo fmt` + `cargo clippy` -> can be separate (fmt is fast, clippy needs compilation)

**Do NOT combine** lint/SA with tests — they should fail independently with clear feedback.

Use the templates in `templates/github/` and `templates/gitlab/` as a base for generating workflow files. Follow the header pattern (name, on, concurrency, permissions) and per-file job organization described above.

### 4.2 GitLab CI Generation

Output file: `.gitlab-ci.yml`

For GitLab-specific pipeline structure, cache strategy, report format integration, and language-specific patterns → read `references/GITLAB-PATTERNS.md`

Pipeline stages: install → lint → test → build → security

### 4.3 Service Containers

If `services_needed` is not empty, add service containers to the test job.
For GitHub Actions and GitLab CI service container syntax → read `references/SERVICE-CONTAINERS.md`

### Quality Checks (Before Writing)

Verify generated pipeline before writing:

**Correctness:**
- [ ] Every job has checkout/setup/install steps
- [ ] Cache is configured for the correct lock file
- [ ] All commands match tools actually present in the project
- [ ] Matrix versions match the project's version constraints
- [ ] Service containers have health checks

**Best practices:**
- [ ] `concurrency` group set (GitHub Actions)
- [ ] `permissions: contents: read` set (GitHub Actions)
- [ ] `interruptible: true` set (GitLab CI)
- [ ] `workflow.rules` defined (GitLab CI)
- [ ] Jobs are parallel where possible (no unnecessary `needs`)
- [ ] `fail-fast: false` on matrix builds

**No over-engineering:**
- [ ] No jobs for tools not present in the project
- [ ] No matrix builds if the project only targets one version
- [ ] No security scanning unless requested or tools are installed
- [ ] No build job if the project has no build step

---

## Step 5: Enhance / Audit Existing Pipeline

When `MODE = "enhance"` or `MODE = "audit"`, analyze `EXISTING_CONTENT` against the project profile and best practices.

### 5.1 Gap Analysis

Compare existing pipeline against `PROJECT_PROFILE`:

**Missing jobs:**
- Linter installed but no lint job in CI?
- SA tool installed but no SA job?
- Tests exist but no test job?
- Security tools installed but no security job?

**Configuration issues:**
- No caching configured?
- No concurrency group (GitHub Actions)?
- Using deprecated actions (e.g., `actions-rs` instead of `dtolnay/rust-toolchain`)?
- Hardcoded language versions instead of variable/matrix?
- Missing `fail-fast: false` on matrix?
- Using `policy: pull-push` on all GitLab jobs instead of `pull` on non-install jobs?

**Missing features:**
- No coverage reporting when coverage tools are available?
- No JUnit/codequality report integration (GitLab)?
- No path filtering for monorepos?
- No `workflow_dispatch` trigger (GitHub Actions)?

### 5.2 Audit Report & Fix

For audit report format, fix flow options, and display templates → read `references/AUDIT-REPORT.md`

Present results as tables with ✅/❌/⚠️ per check. Categorize recommendations by severity (CRITICAL, HIGH, MEDIUM, LOW). Ask user to choose: fix all, fix critical only, or show details first.

**If fixing:** preserve existing structure, job names, and ordering conventions.

---

## Step 6: Write Files

### 6.1 Generate Mode — Write Pipeline

**GitHub Actions:**

```
Bash: mkdir -p .github/workflows
Write .github/workflows/lint.yml        # If linters/SA detected
Write .github/workflows/tests.yml       # Always
Write .github/workflows/build.yml       # If has_build_step
Write .github/workflows/security.yml    # If WANT_SECURITY
```

Only create files for detected concerns. If only lint + tests — two files. If the project is trivially small (single lint + single test job) — a single `ci.yml` is acceptable.

**GitLab CI:**

```
Write .gitlab-ci.yml
```

GitLab CI uses a single `.gitlab-ci.yml` — stages and DAG (`needs:`) handle separation.

### 6.2 Enhance / Audit Mode — Update Existing

Edit existing files using the `Edit` tool. Preserve the original structure and only add/modify what's needed.

---

## Step 7: Summary & Follow-Up

### 7.1 Display Summary

Display summary using format from `references/AUDIT-REPORT.md` (Summary Display Template section). Show platform, files created, features, and quick start commands.

### 7.2 Suggest Follow-Up Skills

Suggest: `/aif-build-automation` for CI targets in Makefile/Taskfile, `/aif-dockerize` for containerization.
