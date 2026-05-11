# Angie Docker ACME Reference

> Sources:
> - https://en.angie.software/angie/docs/configuration/
> - https://en.angie.software/angie/docs/configuration/acme/
> - https://en.angie.software/angie/docs/configuration/modules/http/http_acme/
> - https://en.angie.software/angie/docs/configuration/modules/http/http_ssl/
> - https://en.angie.software/angie/docs/configuration/modules/stream/stream_acme/
> - https://en.angie.software/angie/docs/installation/docker/
> Created: 2026-05-11
> Updated: 2026-05-11

## Overview

Angie has built-in ACME support for automatic certificate issuance and renewal. Official Angie packages and Docker images include the ACME module. When building Angie from source, the HTTP ACME module must be enabled explicitly with `--with-http_acme_module`.

For Docker-based projects, the key operational point is that a separate Certbot container is usually unnecessary for a basic HTTP-01 flow. Configure `acme_client`, use `$acme_cert_<name>` and `$acme_cert_key_<name>` in the TLS server block, and persist the certificate/key storage directory with a Docker volume. Set `acme_client_path` explicitly so the mounted path is obvious and does not depend on build-time defaults.

## Core Concepts

`acme_client`: HTTP-level ACME client definition. It is configured in the `http` context and has a name plus an ACME directory URI.

`acme`: server-level directive. It binds the `server_name` values from a server block to a named ACME client. All `server_name` values using the same client name are included in one certificate.

`$acme_cert_<name>`: the latest certificate obtained by the named ACME client.

`$acme_cert_key_<name>`: the key for the named ACME client certificate. The key is available immediately after startup, while the certificate is available only after successful issuance.

`acme_client_path`: certificate and key storage directory. In Docker, set it explicitly and mount the same path as a persistent volume.

`resolver`: required in the same context as `acme_client`; otherwise Angie cannot resolve the ACME directory host.

## Configuration

| Directive / option | Context | Default / values | Notes |
|---|---|---|---|
| `acme name;` | `server` | none | Enables ACME for the domains in this server block's `server_name`. |
| `acme_client name uri ...;` | `http` | none | Defines a named ACME client used by `acme` and the `$acme_cert_*` variables. |
| `enabled=` | `acme_client` | `on` | Enables or disables renewal without removing the client from config. |
| `key_type=` | `acme_client` | `ecdsa`; valid: `rsa`, `ecdsa` | Certificate key algorithm. |
| `key_bits=` | `acme_client` | `256` for `ecdsa`, `2048` for `rsa` | Certificate key size. |
| `email=` | `acme_client` | none | Email for the CA account. |
| `renew_before_expiry=` | `acme_client` | `30d` | How early renewal starts before expiration. |
| `renew_on_load` | `acme_client` | off unless present | Forces renewal on config load; use carefully because of CA rate limits. |
| `retry_after_error=` | `acme_client` | `2h`; can be `off` | Delay before retry after an issuance or renewal error. |
| `challenge=` | `acme_client` | `http`; valid: `dns`, `http`, `alpn` | Wildcard domains require `challenge=dns`. |
| `account_key=` | `acme_client` | generated when omitted | Full path to the PEM account key. If missing, Angie attempts to create it. |
| `acme_client_path path;` | `http` | build-time path | Overrides the certificate/key storage directory. Set this explicitly in Docker. |
| `acme_http_port` | `http` | `80` | HTTP challenge port. If nothing listens on the address/port, the module creates a dedicated listener. |
| `acme_dns_port` | `http` | `53` | UDP port for DNS challenge. Ports `<=1024` require superuser privileges. |
| `acme_max_response_size` | `http` | `32k` | Increase if Angie logs a too-large ACME subrequest response. |

## Docker Pattern

Use a named volume for ACME state and mount it at the exact path configured by `acme_client_path`.

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

volumes:
  angie_acme:
  angie_logs:
```

`/var/lib/angie/acme` is a project-chosen path in this example, not a required official default. The portable Docker pattern is to set `acme_client_path` and mount that same path.

## Minimal HTTP-01 Example

```nginx
resolver 1.1.1.1 8.8.8.8 valid=300s;

acme_client_path /var/lib/angie/acme;

acme_client letsencrypt https://acme-v02.api.letsencrypt.org/directory
    email=admin@example.com
    challenge=http
    renew_before_expiry=30d
    retry_after_error=2h;

server {
    listen 80;
    server_name example.com www.example.com;

    acme letsencrypt;

    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name example.com www.example.com;

    acme letsencrypt;

    ssl_certificate     $acme_cert_letsencrypt;
    ssl_certificate_key $acme_cert_key_letsencrypt;

    location / {
        proxy_pass http://app:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

For initial infrastructure validation, use the Let's Encrypt staging directory to avoid production rate limits:

```nginx
acme_client letsencrypt https://acme-staging-v02.api.letsencrypt.org/directory
    email=admin@example.com
    challenge=http;
```

## Stream Module Notes

Stream ACME supports automatic certificates for `stream` servers. Official Angie packages and images include it. When building from source, `--with-stream_acme_module` is required and it also requires `--with-http_acme_module`.

The `stream` block must be placed after the `http` block because stream ACME uses client definitions created while parsing HTTP configuration.

```nginx
http {
    resolver 1.1.1.1;
    acme_client_path /var/lib/angie/acme;
    acme_client letsencrypt https://acme-v02.api.letsencrypt.org/directory;
}

stream {
    server {
        listen 12345 ssl;
        server_name example.com;

        acme letsencrypt;

        ssl_certificate     $acme_cert_letsencrypt;
        ssl_certificate_key $acme_cert_key_letsencrypt;
    }
}
```

## Best Practices

1. Always mount the `acme_client_path` directory as a persistent Docker volume.
2. Set `acme_client_path` explicitly in Angie config so storage, backups, permissions, and migrations are obvious.
3. Expose port `80` for `challenge=http` and port `443` for HTTPS. If public HTTP is impossible, use DNS challenge instead.
4. Configure `resolver` in the same context as `acme_client`.
5. Use the Let's Encrypt staging directory while validating new infrastructure.
6. Keep `server_name` exact. Regex server names are skipped by ACME, and wildcard domains require `challenge=dns`.
7. Do not enable `renew_on_load` casually in production because reloads/restarts can force renewals.
8. Treat `$acme_cert_<name>` as unavailable until first successful issuance; Angie logs are the source of truth during bootstrap.
9. Pin Angie image versions for production instead of using `latest`.

## Common Pitfalls

Missing Docker volume: certificates and account keys disappear when the container is replaced. Fix by mounting the directory used by `acme_client_path`.

Missing `resolver`: `acme_client` requires DNS resolver configuration in the same context. Fix by adding project-approved DNS resolvers.

Port 80 blocked: HTTP-01 cannot validate. Fix by publishing `80:80`, checking firewall/DNS routing, or switching to DNS challenge.

Unnecessary Certbot container: Angie can issue and renew certificates itself through built-in ACME in official images/packages.

Wildcard with HTTP challenge: wildcard domains require DNS challenge.

Stream block before HTTP block: stream ACME needs HTTP ACME client definitions, so put `stream` after `http`.

Regex server names: domains specified with regular expressions are not supported and will be skipped.

Unclear storage path: choose a project path, set it in `acme_client_path`, and mount that exact path.

## Source Facts To Preserve

- ACME HTTP module provides automatic certificate retrieval using ACME.
- Official Angie packages and images include HTTP ACME and SSL modules.
- `acme_client` requires a `resolver` in the same context.
- The Let's Encrypt production directory is `https://acme-v02.api.letsencrypt.org/directory`.
- The Let's Encrypt staging directory is `https://acme-staging-v02.api.letsencrypt.org/directory`.
- `challenge` defaults to `http`; valid values are `dns`, `http`, and `alpn`.
- `renew_before_expiry` defaults to `30d`.
- `retry_after_error` defaults to `2h`.
- `acme_http_port` defaults to `80`.
- `acme_client_path` overrides the certificate/key storage directory set at build time.
- Official Docker images use config under `/etc/angie` and logs under `/var/log/angie`.
