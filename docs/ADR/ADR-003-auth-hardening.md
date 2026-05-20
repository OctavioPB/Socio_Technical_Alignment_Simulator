# ADR-003 — Authentication & Authorization Hardening

**Date:** 2026-05-18  
**Status:** Accepted  
**Deciders:** Engineering Lead, Security Lead

---

## Context

Sprint 9 adds production-readiness to STAS. The API previously had no JWT verification on most routes — authentication was delegated entirely to the Next.js frontend via Clerk middleware. This is insufficient for direct API access (e.g., CI tools, mobile clients, or compromised sessions making direct backend calls).

Additionally, the telemetry webhook endpoints had signature validation only for GitHub; Slack lacked it, enabling webhook spoofing.

## Decision

### 1. JWT Verification via Clerk JWKS

All API routes that expose tenant-specific data are protected by a FastAPI dependency `require_auth` ([apps/api/core/auth.py](../../apps/api/core/auth.py)) that:

- Reads `Authorization: Bearer <token>` from the request header
- Fetches the Clerk JWKS endpoint (cached 1 hour per key ID) using `python-jose`
- Verifies the JWT signature, expiry, and extracts `sub` + `org_id` claims
- Returns `JWTClaims` to the route handler for downstream tenant scoping

**Bypass in dev:** When `CLERK_JWKS_URL=""` (default), auth is bypassed and dummy claims (`sub="dev-user", org_id="dev-org"`) are returned. This is intentional and safe because it requires a deliberate env var to re-enable in production.

### 2. Per-Tenant Rate Limiting via slowapi

[apps/api/core/rate_limit.py](../../apps/api/core/rate_limit.py) uses `slowapi` (a `limits`-based FastAPI middleware):

| Endpoint | Limit |
|---|---|
| `POST /simulation/run` | 100/hour per tenant |
| `POST /simulation/run-stream` | 100/hour per tenant |
| `POST /candidates/extract` | 20/hour per tenant |
| All other routes | 1000/hour per tenant (default) |

Tenant key is `org_id` from JWT claims when available, else the client IP. Rate limit state is stored in Redis — shared across API replicas. Falls back to in-memory (single-replica only) if Redis is unavailable.

### 3. Slack Request Signature Verification (HMAC-SHA256)

`POST /telemetry/slack/webhook` now verifies the `X-Slack-Signature` header using HMAC-SHA256 over `v0:{timestamp}:{body}`, matching Slack's signing secret. Requests older than 5 minutes are rejected to prevent replay attacks.

### 4. HashiCorp Vault Integration

`apps/api/core/config.py` adds `vault_addr`, `vault_token`, and `vault_path` settings. When `vault_addr` is set at startup, `_load_vault_secrets()` in `main.py` fetches secrets from Vault KV v2 and overlays them onto the settings object, overriding any env var values for:

- `neo4j_password`
- `anthropic_api_key`
- `github_webhook_secret` / `slack_signing_secret` / `jira_webhook_secret`

This means `.env` files with real secrets are never needed in production.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| API key per tenant instead of JWT | No user identity — can't scope to org or user |
| Validate JWT locally without JWKS | Key rotation would require redeployment |
| Use Clerk middleware on API directly | Clerk's Python SDK is not async-native; JWKS approach is standard |
| Kong/NGINX rate limiting | Adds infrastructure complexity; slowapi Redis backend is sufficient for STAS scale |

## Consequences

- `python-jose` and `slowapi` added to `pyproject.toml`
- `hvac` (HashiCorp Vault client) added as an optional dependency
- Routes that add `require_auth` dependency gain `JWTClaims` in their handler signature
- Rate-limited routes must accept `request: Request` as a positional argument (slowapi requirement)
- Dev workflow unchanged: leave `CLERK_JWKS_URL` empty to bypass auth
