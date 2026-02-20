# GitLab CI Patterns

## Pipeline Structure

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
```

## Job Organization

| Stage | Jobs | Notes |
|-------|------|-------|
| `install` | `install` | Install dependencies, cache + artifact for downstream |
| `lint` | `code-style`, `lint`, `static-analysis`, `rector` | All `needs: [install]`, run in parallel |
| `test` | `tests` | `needs: [install]` |
| `build` | `build` | `needs: [tests, lint, ...]` |
| `security` | `security` | `needs: [install]`, `allow_failure: true` |

## GitLab-Specific Features

1. **Cache strategy**: Use `policy: pull-push` on `install` job, `policy: pull` on all others
2. **Cache key**: Use `key: files:` with lock file for automatic invalidation
3. **Artifacts**: Pass `vendor/`/`node_modules/` via artifacts from install job (faster than cache for same-pipeline)
4. **Reports**: Use `artifacts.reports.junit` for test results, `artifacts.reports.codequality` for lint output
5. **DAG**: Use `needs:` keyword for parallel execution within stages
6. **Hidden jobs**: Use `.setup` anchors for shared `before_script` and cache config
7. **Coverage regex**: Add `coverage:` regex for test jobs

## PHP-Specific GitLab Patterns

```yaml
image: php:8.3-cli

variables:
  COMPOSER_HOME: $CI_PROJECT_DIR/.composer

.composer-setup:
  before_script:
    - apt-get update && apt-get install -y git unzip
    - curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
```

## Report Formats for GitLab Integration

| Tool | Flag | Report Type |
|------|------|-------------|
| PHPStan | `--error-format=gitlab` | `codequality` |
| ESLint | `--format json` | `codequality` |
| Ruff | `--output-format=gitlab` | `codequality` |
| golangci-lint | `--out-format code-climate` | `codequality` |
| PHPUnit | `--log-junit report.xml` | `junit` |
| Jest | `--reporters=jest-junit` | `junit` |
| pytest | `--junitxml=report.xml` | `junit` |
