# STAS Operations Runbook

**Last updated:** 2026-05-18 | **Version:** 0.4.0

This runbook covers the top 5 failure scenarios for the Socio-Technical Alignment Simulator in production. For each scenario: symptoms, diagnosis, immediate remediation, and root-cause fix.

---

## 1. Simulation Timeouts / p99 > 10s

### Symptoms
- Grafana: `stas_simulation_duration_seconds p99 > 10`
- Frontend shows "Extraction failed" after ~15s
- API logs: `asyncio.TimeoutError` or 504 from ingress

### Diagnosis
```bash
# Check CPU saturation on API pods
kubectl top pods -n stas -l app=stas-api

# Check HPA state
kubectl get hpa stas-api -n stas

# Check simulation duration histogram
# PromQL: histogram_quantile(0.99, rate(stas_simulation_duration_seconds_bucket[5m]))
```

### Immediate Remediation
```bash
# Scale up API replicas manually
kubectl scale deployment stas-api -n stas --replicas=6

# If Neo4j is the bottleneck: check query times
kubectl exec -n stas neo4j-0 -- cypher-shell -u neo4j -p "$NEO4J_PASSWORD" \
  "CALL dbms.listQueries() YIELD elapsedTimeMillis, query ORDER BY elapsedTimeMillis DESC LIMIT 5"
```

### Root Cause Fix
- If CPU bound: increase HPA `maxReplicas` or pod CPU limit in `k8s/api/deployment.yaml`
- If Neo4j query bound: run `EXPLAIN` on the slow query, add missing index
- If iteration count: enforce `n_iterations ≤ 1000` for sync endpoint (already guarded at `_SYNC_ITER_LIMIT`)

---

## 2. Kafka Consumer Lag Spike

### Symptoms
- Grafana: `stas_kafka_consumer_lag_seconds` rising
- Graph not reflecting recent GitHub/Slack/Jira activity
- Telemetry service logs: `CommitFailedError` or consumer group rebalancing

### Diagnosis
```bash
# Check consumer group lag
kubectl exec -n stas kafka-0 -- kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --describe --group stas-telemetry-consumer

# Check telemetry pod status
kubectl get pods -n stas -l app=telemetry
kubectl logs -n stas -l app=telemetry --tail=50
```

### Immediate Remediation
```bash
# Restart telemetry consumer to clear rebalance deadlock
kubectl rollout restart deployment/stas-telemetry -n stas

# If DLQ is filling up:
kubectl exec -n stas kafka-0 -- kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic stas.dlq.telemetry-consumer \
  --from-beginning --max-messages 20
```

### Root Cause Fix
- Dead-letter messages: inspect payload, fix schema mismatch, replay via `make kafka-events`
- Consumer too slow: increase `fetch.max.bytes`, add consumer replicas

---

## 3. Neo4j Connectivity Loss

### Symptoms
- API health endpoint: `{"kafka": "connected"}` but `500` on graph routes
- API logs: `ServiceUnavailable: Unable to retrieve routing information`

### Diagnosis
```bash
# Check Neo4j pod
kubectl get pods -n stas -l app=neo4j
kubectl logs -n stas neo4j-0 --tail=50

# Test Bolt connectivity from API pod
kubectl exec -n stas deploy/stas-api -- \
  python -c "import neo4j; d=neo4j.GraphDatabase.driver('bolt://neo4j:7687'); d.verify_connectivity(); print('OK')"
```

### Immediate Remediation
```bash
# Restart Neo4j (StatefulSet — preserves volume)
kubectl rollout restart statefulset/neo4j -n stas

# If volume is full:
kubectl exec -n stas neo4j-0 -- df -h /data
# Expand PVC size in neo4j/statefulset.yaml and apply
```

### Root Cause Fix
- OOM kill: increase `NEO4J_dbms_memory_heap_max__size` and pod memory limit
- Disk full: expand PVC or prune old snapshots via graph migration

---

## 4. Redis Unavailability (Cache Miss Cascade)

### Symptoms
- API logs: `Redis unavailable — simulation results will not be cached`
- Repeated NLP extractions hitting Claude API (cost spike)
- Rate limiting not enforced (in-memory fallback active)

### Diagnosis
```bash
kubectl get pods -n stas -l app=redis
kubectl logs -n stas -l app=redis --tail=30

# Test Redis connectivity
kubectl exec -n stas deploy/stas-api -- \
  python -c "import redis; r=redis.Redis.from_url('redis://redis:6379'); print(r.ping())"
```

### Immediate Remediation
```bash
# Restart Redis (data is on PVC — no data loss)
kubectl rollout restart deployment/redis -n stas
```

### Root Cause Fix
- OOM: increase Redis memory limit; tune `maxmemory-policy allkeys-lru`
- PVC full: check data volume, reduce TTLs (`_CACHE_TTL`, `_CANDIDATE_TTL`, `_REPORT_TTL`)

---

## 5. NLP Extraction Failures (Claude API)

### Symptoms
- Frontend: "Extraction failed. Try again." after 30s
- API logs: `anthropic.APIError` or `anthropic.RateLimitError`
- Grafana: `stas_nlp_extraction_latency_seconds p99` spiking

### Diagnosis
```bash
# Check NLP extraction errors
kubectl logs -n stas deploy/stas-api --tail=100 | grep "nlp_agent\|anthropic"

# Check rate limit headers from Anthropic (visible in DEBUG log mode)
kubectl set env deployment/stas-api -n stas LOG_LEVEL=DEBUG
kubectl rollout restart deployment/stas-api -n stas
# ... observe logs ...
kubectl set env deployment/stas-api -n stas LOG_LEVEL=INFO
```

### Immediate Remediation
- If `RateLimitError`: wait for Anthropic rate limit window (usually 60s). The semaphore(5) prevents thundering herd.
- If `APIError` / model unavailable: check [Anthropic status page](https://status.anthropic.com). No action needed — requests will fail gracefully with user-facing error.

### Root Cause Fix
- Persistent rate limits: reduce semaphore from 5 → 2 (`_SEMAPHORE = asyncio.Semaphore(2)` in `nlp_agent.py`)
- High latency: check `_README_CHAR_LIMIT` and `_FILE_CHAR_LIMIT` — reduce if GitHub content is too large

---

## Useful Commands

```bash
# View all STAS pods
kubectl get pods -n stas

# Live logs from all API replicas
kubectl logs -n stas -l app=stas-api -f --max-log-requests 8

# Force a graph rebuild (triggers Airflow DAG via API)
curl -X POST https://api.stas.io/graph/rebuild \
  -H "Authorization: Bearer $TOKEN"

# Run PII audit against production logs
kubectl cp stas-api-<pod>:/var/log/stas /tmp/stas-logs -n stas
python scripts/pii_audit.py --log-dir /tmp/stas-logs --fail-on-match

# Run k6 load test against staging
k6 run --env BASE_URL=https://api.staging.stas.io tests/load/sim_load_test.js
```
