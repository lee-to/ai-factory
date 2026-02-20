# Service Containers

If `services_needed` is not empty, add service containers to the test job.

## GitHub Actions

```yaml
tests:
  services:
    postgres:
      image: postgres:17
      env:
        POSTGRES_DB: test
        POSTGRES_USER: test
        POSTGRES_PASSWORD: test
      ports:
        - 5432:5432
      options: >-
        --health-cmd pg_isready
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5
```

## GitLab CI

```yaml
tests:
  services:
    - name: postgres:17
      alias: db
  variables:
    POSTGRES_DB: test
    POSTGRES_USER: test
    POSTGRES_PASSWORD: test
    DATABASE_URL: "postgresql://test:test@db:5432/test"
```
