from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Neo4j ─────────────────────────────────────────────────────────────────
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "changeme_dev"

    # ── Simulation ────────────────────────────────────────────────────────────
    simulation_gds_threshold: int = 200

    # ── Kafka ─────────────────────────────────────────────────────────────────
    kafka_bootstrap_servers: str = "localhost:9092"

    # ── Redis ─────────────────────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379"

    # ── Anthropic ─────────────────────────────────────────────────────────────
    anthropic_api_key: str = ""

    # ── CORS ──────────────────────────────────────────────────────────────────
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3001"]

    # ── Auth (Clerk JWT) ──────────────────────────────────────────────────────
    # Set to your Clerk JWKS URL in prod, e.g.:
    # https://<your-clerk-domain>/.well-known/jwks.json
    # Leave empty to bypass auth validation in dev.
    clerk_jwks_url: str = ""

    # ── Rate limiting ─────────────────────────────────────────────────────────
    rate_limit_sim_per_hour: int = 100      # simulation runs per tenant/hour
    rate_limit_extract_per_hour: int = 20   # NLP extractions per tenant/hour

    # ── Observability ─────────────────────────────────────────────────────────
    sentry_dsn: str = ""                    # Sentry DSN; empty = Sentry disabled
    log_level: str = "INFO"
    log_format: str = "json"                # "json" or "text" (text for local dev)
    metrics_enabled: bool = True            # Prometheus /metrics endpoint
    environment: str = "development"        # development | staging | production
    release: str = "0.3.0"                  # matches FastAPI version

    # ── HashiCorp Vault (production secrets) ──────────────────────────────────
    # When vault_addr is set, secrets are loaded from Vault at startup and
    # override any env var values for: neo4j_password, anthropic_api_key,
    # and all *_secret / *_token fields.
    vault_addr: str = ""                    # e.g. https://vault.internal:8200
    vault_token: str = ""                   # Vault token; use Vault Agent in prod
    vault_path: str = "secret/data/stas"   # KV v2 path for STAS secrets


settings = Settings()
