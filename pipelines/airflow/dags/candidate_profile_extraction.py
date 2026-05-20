"""stas_candidate_profile_extract — on-demand candidate profile pipeline.

Triggered via Airflow REST API with:
  conf = {
    "candidate_id": "cand_abc123",
    "github_url":   "https://github.com/user/repo"
  }

Pipeline:
  1. validate_input        — validate candidate_id and github_url params.
  2. extract_skills_static — GitHub API: repo languages, topics, README keywords.
  3. extract_skills_nlp    — NLP agent stub (Sprint 5 dependency).
  4. write_candidate_node  — MERGE :Candidate node into Neo4j.
"""

from __future__ import annotations

import os
import re
from datetime import timedelta

from airflow.decorators import dag, task
from airflow.operators.python import get_current_context
from airflow.utils.dates import days_ago

_TECH_KEYWORDS: frozenset[str] = frozenset(
    {
        "python", "typescript", "javascript", "go", "rust", "java", "kotlin",
        "react", "fastapi", "django", "flask", "postgresql", "neo4j", "kafka",
        "redis", "docker", "kubernetes", "terraform", "aws", "gcp", "azure",
        "machine-learning", "deep-learning", "pytorch", "tensorflow", "sklearn",
        "spark", "airflow", "dbt",
    }
)


def _slack_alert(context: dict) -> None:
    webhook = os.environ.get("SLACK_ALERT_WEBHOOK_URL", "")
    if not webhook:
        return
    import requests

    dag_id = context["dag"].dag_id
    task_id = context["task_instance"].task_id
    run_id = context.get("run_id", "")
    requests.post(
        webhook,
        json={
            "text": (
                f":red_circle: *STAS* — `{dag_id}` / `{task_id}` failed"
                f" (run: `{run_id}`)"
            )
        },
        timeout=5,
    )


@dag(
    dag_id="stas_candidate_profile_extract",
    schedule=None,  # on-demand only — triggered via REST API
    start_date=days_ago(1),
    catchup=False,
    default_args={
        "owner": "stas-team",
        "retries": 2,
        "retry_delay": timedelta(minutes=2),
        "sla": timedelta(minutes=15),
        "on_failure_callback": _slack_alert,
    },
    params={
        "candidate_id": "",
        "github_url": "",
    },
    tags=["stas", "candidate"],
    doc_md=__doc__,
)
def stas_candidate_profile_extract() -> None:
    @task
    def validate_input() -> dict:
        """Validate DAG run params; raise ValueError on bad input."""
        context = get_current_context()
        params = context["params"]
        candidate_id = str(params.get("candidate_id", "")).strip()
        github_url = str(params.get("github_url", "")).strip()

        if not candidate_id:
            raise ValueError("candidate_id is required and must be non-empty")
        if not github_url.startswith("https://github.com/"):
            raise ValueError(
                f"github_url must start with 'https://github.com/', got: {github_url!r}"
            )

        return {"candidate_id": candidate_id, "github_url": github_url}

    @task
    def extract_skills_static(params: dict) -> dict:
        """Detect skills from GitHub repo metadata (languages, topics, README).

        Uses the unauthenticated GitHub API for public repos. Falls back
        gracefully on network failures so a transient GitHub outage does not
        block the pipeline.
        """
        import requests

        candidate_id = params["candidate_id"]
        github_url = params["github_url"]

        parts = github_url.rstrip("/").split("/")
        if len(parts) < 5:
            raise ValueError(f"Cannot parse owner/repo from {github_url!r}")
        owner, repo = parts[-2], parts[-1]

        skills: set[str] = set()
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        base = f"https://api.github.com/repos/{owner}/{repo}"

        # ── Repo languages ────────────────────────────────────────────────────
        try:
            resp = requests.get(f"{base}/languages", headers=headers, timeout=10)
            if resp.ok:
                skills.update(lang.lower() for lang in resp.json())
        except requests.RequestException:
            pass

        # ── Repo topics ───────────────────────────────────────────────────────
        try:
            resp = requests.get(f"{base}/topics", headers=headers, timeout=10)
            if resp.ok:
                skills.update(resp.json().get("names", []))
        except requests.RequestException:
            pass

        # ── README keyword scan ───────────────────────────────────────────────
        try:
            resp = requests.get(
                f"{base}/readme",
                headers={**headers, "Accept": "application/vnd.github.raw+json"},
                timeout=10,
            )
            if resp.ok:
                readme = resp.text.lower()
                skills.update(kw for kw in _TECH_KEYWORDS if re.search(rf"\b{kw}\b", readme))
        except requests.RequestException:
            pass

        return {
            "candidate_id": candidate_id,
            "github_url": github_url,
            "skills": sorted(skills),
        }

    @task
    def extract_skills_nlp(static_result: dict) -> dict:
        """NLP agent skill extraction via Claude API (Sprint 5).

        Calls extract_candidate_profile_sync which:
        - Fetches GitHub context (README, top-5 files)
        - Calls Claude claude-sonnet-4-20250514 with tool use
        - Returns structured CandidateProfile (skills + collaboration vector)
        - Caches result in Redis for 24 h

        Falls back to static skills if the NLP agent fails (network or API
        errors should not block the pipeline).
        """
        import sys
        import pathlib

        # Make apps package importable inside the Airflow container.
        # The repo root is mounted at /opt/airflow/dags/repo (see docker-compose).
        _repo_root = str(pathlib.Path(__file__).parent.parent.parent.parent)
        if _repo_root not in sys.path:
            sys.path.insert(0, _repo_root)

        try:
            from apps.api.services.nlp_agent import extract_candidate_profile_sync

            profile = extract_candidate_profile_sync(
                github_url=static_result["github_url"],
                candidate_id=static_result["candidate_id"],
            )
            return {
                **static_result,
                # Merge NLP-extracted skills with static ones (NLP takes precedence)
                "skills": sorted(
                    {s.skill for s in profile.skills} | set(static_result["skills"])
                ),
                "collaboration_vector": profile.collaboration_vector.as_list(),
                "domain_expertise": profile.domain_expertise,
                "graph_position_estimate": profile.graph_position_estimate,
            }
        except Exception as exc:
            import logging

            logging.getLogger(__name__).warning(
                "NLP extraction failed — using static skills only: %s", exc
            )
            return {
                **static_result,
                "collaboration_vector": [],
                "domain_expertise": [],
                "graph_position_estimate": "generalist",
            }

    @task
    def write_candidate_node(profile: dict) -> str:
        """MERGE :Candidate node into Neo4j; return the candidate_id."""
        from neo4j import GraphDatabase

        candidate_id = profile["candidate_id"]
        driver = GraphDatabase.driver(
            os.environ.get("NEO4J_URI", "bolt://localhost:7687"),
            auth=(
                os.environ.get("NEO4J_USER", "neo4j"),
                os.environ.get("NEO4J_PASSWORD", "changeme_dev"),
            ),
        )
        try:
            with driver.session() as session:
                session.run(
                    """
                    MERGE (c:Candidate {id: $id})
                    SET c.github_url              = $github_url,
                        c.skills                  = $skills,
                        c.collaboration_vector     = $collab_vector,
                        c.domain_expertise         = $domain_expertise,
                        c.graph_position_estimate  = $graph_position_estimate,
                        c.is_temporary             = false,
                        c.extracted_at             = datetime()
                    """,
                    {
                        "id": candidate_id,
                        "github_url": profile["github_url"],
                        "skills": profile["skills"],
                        "collab_vector": profile.get("collaboration_vector", []),
                        "domain_expertise": profile.get("domain_expertise", []),
                        "graph_position_estimate": profile.get(
                            "graph_position_estimate", "generalist"
                        ),
                    },
                )
        finally:
            driver.close()

        return candidate_id

    # ── Wire up ────────────────────────────────────────────────────────────────
    raw = validate_input()
    static = extract_skills_static(raw)
    enriched = extract_skills_nlp(static)
    write_candidate_node(enriched)


stas_candidate_profile_extract_dag = stas_candidate_profile_extract()
