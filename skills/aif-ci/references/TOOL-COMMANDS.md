# Tool Detection: Command Mapping

Detect existing tools by scanning config files and dependency files.

## Linters & Formatters

### PHP (scan `composer.json` → `require-dev`)

| Tool | Config File | CI Command |
|------|-------------|------------|
| PHP-CS-Fixer | `.php-cs-fixer.php`, `.php-cs-fixer.dist.php` | `vendor/bin/php-cs-fixer fix --dry-run --diff` |
| PHP_CodeSniffer | `phpcs.xml`, `phpcs.xml.dist` | `vendor/bin/phpcs` |
| Pint | `pint.json` | `vendor/bin/pint --test` |

### Node.js (scan `package.json` → `devDependencies`)

| Tool | Config File | CI Command |
|------|-------------|------------|
| ESLint | `eslint.config.*`, `.eslintrc.*` | `npx eslint .` |
| Prettier | `.prettierrc*`, `prettier.config.*` | `npx prettier --check .` |
| Biome | `biome.json`, `biome.jsonc` | `npx biome check .` |

### Python (scan `pyproject.toml` → `[tool.*]` sections, `requirements-dev.txt`)

| Tool | Config File | CI Command |
|------|-------------|------------|
| Ruff | `ruff.toml`, `pyproject.toml [tool.ruff]` | `ruff check .` / `ruff format --check .` |
| Black | `pyproject.toml [tool.black]` | `black --check .` |
| isort | `pyproject.toml [tool.isort]` | `isort --check-only .` |
| Flake8 | `.flake8`, `setup.cfg [flake8]` | `flake8 .` |
| Pylint | `.pylintrc`, `pyproject.toml [tool.pylint]` | `pylint src/` |

### Go

| Tool | Config File | CI Command |
|------|-------------|------------|
| golangci-lint | `.golangci.yml`, `.golangci.yaml` | `golangci-lint run` |

### Rust (built-in)

| Tool | CI Command |
|------|------------|
| clippy | `cargo clippy --all-targets --all-features -- -D warnings` |
| rustfmt | `cargo fmt --all -- --check` |

### Java

| Tool | Config File | CI Command (Maven) | CI Command (Gradle) |
|------|-------------|-------------------|---------------------|
| Checkstyle | `checkstyle.xml` | `mvn checkstyle:check -B` | `./gradlew checkstyleMain` |
| PMD | `pmd-ruleset.xml` | `mvn pmd:check -B` | `./gradlew pmdMain` |
| SpotBugs | — | `mvn compile spotbugs:check -B` | `./gradlew spotbugsMain` |

## Static Analysis Tools

### PHP (scan `composer.json` → `require-dev`)

| Tool | Config File | CI Command |
|------|-------------|------------|
| PHPStan | `phpstan.neon`, `phpstan.neon.dist` | `vendor/bin/phpstan analyse --memory-limit=512M` |
| Psalm | `psalm.xml`, `psalm.xml.dist` | `vendor/bin/psalm --no-cache` |
| Rector | `rector.php` | `vendor/bin/rector process --dry-run` |

### Python

| Tool | CI Command |
|------|------------|
| mypy | `mypy src/` |
| pyright | `pyright` |

### Node.js (TypeScript)

| Tool | CI Command |
|------|------------|
| tsc | `npx tsc --noEmit` |

### Go
- `golangci-lint` includes static analysis (go vet, staticcheck, etc.)

### Rust
- `cargo clippy` covers static analysis

## Test Frameworks

| Language | Detect By | Test Command |
|----------|-----------|--------------|
| PHP | `phpunit/phpunit` in composer.json | `vendor/bin/phpunit` |
| PHP | `pestphp/pest` in composer.json | `vendor/bin/pest --ci` |
| Node.js | `jest` in package.json | `npx jest --ci` |
| Node.js | `vitest` in package.json | `npx vitest run` |
| Python | `pytest` in pyproject.toml | `pytest -v` |
| Go | Built-in | `go test -race -v ./...` |
| Rust | Built-in | `cargo test --all-features` |
| Java | Built-in (JUnit) | `mvn verify -B` / `./gradlew test` |

### Coverage Tools

| Language | Coverage Flag |
|----------|--------------|
| PHP | `--coverage-clover coverage.xml` |
| Node.js (Jest) | `--coverage` |
| Node.js (Vitest) | `--coverage` |
| Python | `--cov=src --cov-report=xml` |
| Go | `-coverprofile=coverage.out -covermode=atomic` |
| Rust | `cargo tarpaulin --ignore-tests --out xml` |
| Java | `mvn jacoco:report` / `./gradlew jacocoTestReport` |

## Security Audit Tools

| Language | Tool | CI Command |
|----------|------|------------|
| PHP | Composer audit | `composer audit` |
| Node.js | npm audit | `npm audit --audit-level=high` |
| Python | pip-audit | `pip-audit` or `uv run pip-audit` (dependency vulnerabilities) |
| Python | bandit | `bandit -r src/` or `uv run bandit -r src/` (code security) |
| Go | govulncheck | `govulncheck ./...` |
| Rust | cargo audit | `cargo audit` |
| Rust | cargo deny | `cargo deny check` |
| Java | OWASP | `mvn dependency-check:check -B` |
