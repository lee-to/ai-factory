# Docker Compose Lifecycle Hooks Reference

> Sources:
> - https://docs.docker.com/compose/how-tos/lifecycle/
> - https://docs.docker.com/reference/compose-file/services/#post_start
> - https://docs.docker.com/reference/compose-file/services/#pre_stop
> Created: 2026-05-11
> Updated: 2026-05-11

## Overview

Docker Compose lifecycle hooks let a service run commands just after container start or just before container stop. They are useful when the main container should run as a non-root user, but a narrow setup or cleanup task needs elevated privileges.

For Docker generation, the main use case is fixing permissions on named volumes or generated data directories without running the whole service as root. Docker's own lifecycle hook example uses `post_start` to run `chown` on a volume because Docker volumes are created with root ownership by default.

Lifecycle hooks require Docker Compose 2.30.0 or later.

## Core Concepts

`post_start`: sequence of commands run after a container has started. The exact timing is not guaranteed, and Docker explicitly notes that hook timing is not assured during execution of the container entrypoint.

`pre_stop`: sequence of commands run before a container is stopped by a Compose or user stop action. It does not run if the container stops by itself or is killed suddenly.

Hook-level `user`: runs the hook command as a different user than the main service command. This is the key setting for permission fixes: the service can run as UID/GID `1001`, while a short `chown` hook runs as `root`.

Hook-level `privileged`: runs the hook command with privileged access. Use only when `user: root` is not enough.

Hook-level `working_dir`: sets the working directory for the hook command. If omitted, Compose uses the main service command working directory.

Hook-level `environment`: adds or overrides environment variables for the hook command. Hook commands inherit the service command environment.

## Interface

```yaml
services:
  app:
    post_start:
      - command: <string-or-exec-form-command>
        user: <user>
        privileged: <true|false>
        working_dir: <path>
        environment:
          - KEY=VALUE

    pre_stop:
      - command: <string-or-exec-form-command>
        user: <user>
        privileged: <true|false>
        working_dir: <path>
        environment:
          KEY: VALUE
```

`command` is required for each hook. The command can use shell form or exec form.

`pre_stop` uses configuration equivalent to `post_start`.

## Permission Fix Pattern

Use this pattern when a service can tolerate the permission fix running shortly after startup:

```yaml
services:
  app:
    image: example/app:latest
    user: "${APP_UID:-1001}:${APP_GID:-1001}"
    volumes:
      - app_data:/var/lib/app
      - app_cache:/var/cache/app
    post_start:
      - command: >
          sh -lc 'chown -R "${APP_UID:-1001}:${APP_GID:-1001}" /var/lib/app /var/cache/app'
        user: root
        environment:
          APP_UID: "${APP_UID:-1001}"
          APP_GID: "${APP_GID:-1001}"

volumes:
  app_data:
  app_cache:
```

If the application needs permissions before entrypoint work starts reading or writing those paths, do the permission setup in the image entrypoint or a separate init/migration step instead.

## Angie ACME Volume Pattern

For Angie ACME, use hooks only if the Angie worker process needs access to a persisted ACME directory and image defaults do not already set ownership correctly.

```yaml
services:
  angie:
    image: docker.angie.software/angie:1.11.4
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/angie/default.conf:/etc/angie/http.d/default.conf:ro
      - angie_acme:/var/lib/angie/acme
      - angie_logs:/var/log/angie
    post_start:
      - command: chown -R angie:angie /var/lib/angie/acme /var/log/angie
        user: root

volumes:
  angie_acme:
  angie_logs:
```

Only use user/group names that exist in the image. If unsure, check the image and prefer numeric UID/GID when portability matters.

## Pre-stop Pattern

Use `pre_stop` for best-effort cleanup or flushing when the container is intentionally stopped by Compose or the user:

```yaml
services:
  app:
    image: example/app:latest
    pre_stop:
      - command: ./data_flush.sh
```

Do not rely on `pre_stop` for critical durability. It will not run if the container stops by itself or is terminated suddenly.

## Best Practices

1. Use hooks to keep the main service non-root while allowing a narrow setup command to run as root.
2. Prefer hook-level `user: root` over `privileged: true`. Use `privileged` only when normal root permissions are insufficient.
3. Make permission hooks idempotent. `chown -R` and `mkdir -p` are acceptable; destructive cleanup is risky.
4. Keep hook commands short and observable. If the command grows, put it in a script inside the image and call the script from the hook.
5. Avoid `post_start` for work that must finish before the application starts.
6. For named volumes, hooks are useful because Docker volumes are created with root ownership by default.
7. For bind mounts from the host, remember that container `chown` can change host filesystem ownership on Linux.
8. Add explicit `working_dir` when the hook command uses relative paths.
9. Use hook-level `environment` for hook-specific values like UID/GID overrides.
10. Require Docker Compose 2.30.0+ in generated documentation if the project uses `post_start` or `pre_stop`.

## Common Pitfalls

Assuming `post_start` runs before app startup: it runs after the container starts, and exact timing is not guaranteed. If permissions are required before entrypoint work, use entrypoint or init logic.

Using `privileged: true` by default: for volume ownership fixes, `user: root` is usually the intended narrow elevation.

Relying on `pre_stop` for guaranteed cleanup: it does not run on sudden termination, kill, or self-exit.

Using user names that do not exist in the image: `chown app:app` fails if the image has no `app` user/group.

Running recursive `chown` on large volumes every start: this can slow startup. Prefer a marker file or narrower paths if the volume is large.

Changing ownership of host bind mounts unexpectedly: this can alter host filesystem ownership on Linux. Avoid recursive ownership changes on project source directories.

Forgetting Compose version requirements: older Docker Compose versions do not support lifecycle hooks.

## Source Facts To Preserve

- Lifecycle hooks require Docker Compose 2.30.0 or later.
- `post_start` runs after a container has started.
- Exact `post_start` timing is not guaranteed.
- Docker docs use `post_start` to `chown` a Docker volume because volumes are created with root ownership by default.
- Hook command `user` defaults to the same user as the main service command when unset.
- Hook command `privileged` can run the hook with privileged access.
- Hook command `working_dir` defaults to the main service command working directory when unset.
- Hook command `environment` inherits service environment and can add or override variables for the hook.
- `pre_stop` runs before an intentional stop, such as `docker compose down` or manual stop.
- `pre_stop` does not run if the container stops by itself or is terminated suddenly.
