.PHONY: dev dev-down dev-logs test lint graph-migrate graph-seed sim-run dag-test kafka-events \
        deploy-staging deploy-prod k8s-apply k8s-diff helm-lint load-test pii-audit bundle-analyze help

# ─── Default target ────────────────────────────────────────────────────────────
help:
	@echo "STAS — Socio-Technical Alignment Simulator"
	@echo ""
	@echo "  make dev           Start full stack (Docker Compose)"
	@echo "  make dev-down      Stop and remove containers + volumes"
	@echo "  make dev-logs      Tail logs from all services"
	@echo "  make test          Run all test suites"
	@echo "  make lint          Lint Python + TypeScript"
	@echo "  make graph-seed    Seed Neo4j with synthetic team data"
	@echo "  make sim-run       Run a test simulation from CLI"
	@echo "  make dag-test      Test Airflow DAGs with dag.test()"
	@echo "  make kafka-events  Produce synthetic telemetry events to Kafka"
	@echo ""
	@echo "Deployment:"
	@echo "  make deploy-staging VERSION=0.4.0   Build, push, deploy to staging"
	@echo "  make deploy-prod    VERSION=0.4.0   Deploy to production (requires confirm)"
	@echo "  make k8s-diff                       Diff manifests vs live cluster"
	@echo "  make helm-lint                      Lint Helm chart"
	@echo ""
	@echo "Performance + Security:"
	@echo "  make load-test                      k6 load test (50 VUs)"
	@echo "  make pii-audit ARGS='--log-dir /var/log/stas'   PII scan"
	@echo "  make bundle-analyze                 Next.js bundle report"

# ─── Docker Compose ────────────────────────────────────────────────────────────
dev:
	@test -f .env || (cp .env.example .env && echo "Created .env from .env.example — fill in secrets before continuing.")
	docker compose up --build -d
	@echo ""
	@echo "Services:"
	@echo "  Neo4j Browser  → http://localhost:7474"
	@echo "  FastAPI docs   → http://localhost:8000/docs"
	@echo "  Next.js app    → http://localhost:3000"
	@echo "  Airflow UI     → http://localhost:8080  (admin / admin)"

dev-down:
	docker compose down -v

dev-logs:
	docker compose logs -f

# ─── Testing ───────────────────────────────────────────────────────────────────
test:
	docker compose run --rm api pytest tests/ simulation/tests/ -v --cov --cov-report=term-missing

test-python:
	docker compose run --rm api pytest tests/ simulation/tests/ -v

test-web:
	docker compose run --rm web npm test

# ─── Linting ───────────────────────────────────────────────────────────────────
lint: lint-python lint-web

lint-python:
	docker compose run --rm api ruff check apps/api simulation pipelines

lint-web:
	docker compose run --rm web npm run lint

# ─── Graph schema + seeding ────────────────────────────────────────────────────
graph-migrate:
	docker compose run --rm api python -m graph.migrations.runner

graph-seed: graph-migrate
	docker compose run --rm api python -m simulation.scripts.seed_graph

# ─── Simulation CLI ────────────────────────────────────────────────────────────
sim-run:
	docker compose run --rm api python -m simulation.scripts.run_sim

# ─── Airflow DAG testing ────────────────────────────────────────────────────────
dag-test:
	docker compose run --rm airflow-scheduler airflow dags test stas_graph_rebuild
	docker compose run --rm airflow-scheduler airflow dags test stas_candidate_profile_extract \
	  --conf '{"candidate_id":"test_cand_001","github_url":"https://github.com/apache/airflow"}'
	docker compose run --rm airflow-scheduler airflow dags test stas_telemetry_health

# ─── Kafka event production ────────────────────────────────────────────────────
kafka-events:
	docker compose run --rm api python -m pipelines.kafka.produce_events $(ARGS)

telemetry-logs:
	docker compose logs -f telemetry

# ─── Deployment ────────────────────────────────────────────────────────────────

# Diff k8s manifests against live cluster (dry-run)
k8s-diff:
	kubectl diff -R -f k8s/ --namespace stas

# Apply all raw manifests (use Helm for production)
k8s-apply:
	kubectl apply -f k8s/namespace.yaml
	kubectl apply -f k8s/configmap.yaml
	kubectl apply -R -f k8s/neo4j/
	kubectl apply -R -f k8s/redis/
	kubectl apply -R -f k8s/kafka/
	kubectl apply -R -f k8s/api/
	kubectl apply -R -f k8s/web/
	kubectl apply -f k8s/ingress.yaml

# Lint Helm chart
helm-lint:
	helm lint k8s/helm/

# Deploy to staging
deploy-staging:
	@echo "Deploying to staging..."
	docker build -t ghcr.io/stas/api:$(VERSION) -f docker/Dockerfile.api . && \
	docker build -t ghcr.io/stas/web:$(VERSION) -f docker/Dockerfile.web apps/web && \
	docker push ghcr.io/stas/api:$(VERSION) && \
	docker push ghcr.io/stas/web:$(VERSION)
	helm upgrade --install stas k8s/helm/ \
	  --namespace stas \
	  --create-namespace \
	  --set global.imageTag=$(VERSION) \
	  --set config.environment=staging \
	  --values k8s/helm/values.staging.yaml \
	  --wait --timeout 5m
	@echo "Staging deploy complete: https://app.staging.stas.io"

# Deploy to production (requires VERSION and explicit confirm)
deploy-prod:
	@echo "Deploying $(VERSION) to PRODUCTION..."
	@read -p "Type 'yes' to confirm: " confirm && [ "$$confirm" = "yes" ]
	helm upgrade --install stas k8s/helm/ \
	  --namespace stas \
	  --create-namespace \
	  --set global.imageTag=$(VERSION) \
	  --set config.environment=production \
	  --values k8s/helm/values.prod.yaml \
	  --wait --timeout 10m
	@echo "Production deploy complete: https://app.stas.io"

# ─── Performance testing ───────────────────────────────────────────────────────

load-test:
	@which k6 > /dev/null || (echo "k6 not found. Install: https://k6.io/docs/get-started/installation/" && exit 1)
	k6 run $(ARGS) tests/load/sim_load_test.js

# ─── Security tooling ─────────────────────────────────────────────────────────

pii-audit:
	python scripts/pii_audit.py $(ARGS)

# ─── Bundle analysis ───────────────────────────────────────────────────────────

bundle-analyze:
	docker compose run --rm -e ANALYZE=true web npm run build
