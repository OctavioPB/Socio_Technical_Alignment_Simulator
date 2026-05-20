/**
 * k6 load test — STAS simulation endpoint
 *
 * Target: 50 concurrent simulation runs on a 200-node graph → p99 < 10s
 *
 * Usage:
 *   k6 run tests/load/sim_load_test.js
 *   k6 run --env BASE_URL=http://api.staging.stas.internal tests/load/sim_load_test.js
 *
 * Thresholds (fail if not met):
 *   http_req_duration p(99) < 10 000ms
 *   http_req_failed   rate  < 0.01  (< 1% error rate)
 */

import http from "k6/http"
import { check, sleep } from "k6"
import { Rate, Trend } from "k6/metrics"

// ── Configuration ─────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000"
const TEAM_ID = __ENV.TEAM_ID || "platform"

// ── Custom metrics ────────────────────────────────────────────────────────────

const simSuccessRate = new Rate("sim_success_rate")
const simDuration = new Trend("sim_duration_ms", true)

// ── Thresholds ────────────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    ramp_up: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },   // warm up
        { duration: "60s", target: 50 },   // ramp to 50 concurrent
        { duration: "60s", target: 50 },   // sustain
        { duration: "30s", target: 0 },    // ramp down
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(99)<10000"],  // p99 < 10s
    http_req_failed: ["rate<0.01"],      // < 1% failures
    sim_success_rate: ["rate>0.99"],     // > 99% simulations complete
  },
}

// ── Simulation payload ─────────────────────────────────────────────────────────

function makePayload(vu) {
  return JSON.stringify({
    team_id: TEAM_ID,
    candidate: {
      id: `load_test_cand_${vu}`,
      name: `Load Test Candidate ${vu}`,
      skills: ["python", "fastapi", "neo4j", "kafka"],
      github_url: "https://github.com/load-test/candidate",
      collaboration_vector: [0.7, 0.6, 0.8, 0.5, 0.4],
      team_id: TEAM_ID,
    },
    n_iterations: 500,
    seed: vu,
  })
}

// ── Main scenario ──────────────────────────────────────────────────────────────

export default function () {
  const payload = makePayload(__VU)
  const params = {
    headers: { "Content-Type": "application/json" },
    timeout: "15s",
  }

  const start = Date.now()
  const res = http.post(`${BASE_URL}/simulation/run`, payload, params)
  const elapsed = Date.now() - start

  const ok = check(res, {
    "status 200": (r) => r.status === 200,
    "has result_id": (r) => {
      try {
        const body = JSON.parse(r.body)
        return typeof body.result_id === "string"
      } catch {
        return false
      }
    },
    "closeness_centrality present": (r) => {
      try {
        const body = JSON.parse(r.body)
        return typeof body.closeness_centrality?.mean === "number"
      } catch {
        return false
      }
    },
  })

  simSuccessRate.add(ok)
  if (ok) simDuration.add(elapsed)

  sleep(0.5) // 500ms think time between iterations
}

// ── Setup: verify API is reachable ────────────────────────────────────────────

export function setup() {
  const res = http.get(`${BASE_URL}/health`)
  if (res.status !== 200) {
    throw new Error(`API health check failed: ${res.status} ${res.body}`)
  }
  const health = JSON.parse(res.body)
  console.log(`API healthy — version=${health.version} kafka=${health.kafka}`)
}

// ── Teardown: print summary ───────────────────────────────────────────────────

export function teardown() {
  console.log("Load test complete. Review thresholds in k6 output above.")
}
