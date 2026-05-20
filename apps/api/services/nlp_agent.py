"""NLP Agent — candidate profile extraction via Claude API tool use.

Public entry point:
    await extract_candidate_profile(github_url, candidate_id, transcript) -> CandidateProfile

Design:
  - Model: claude-sonnet-4-20250514 (per CLAUDE.md — do not change without updating that file)
  - Structured output via tool use: extract_candidate_profile tool
  - Concurrency: asyncio.Semaphore(5) — max 5 parallel Claude API calls
  - Cache: Redis 24 h TTL per sha256(github_url + transcript_hash)
  - GitHub content: README + repo metadata + top-5 files by size (httpx async)
  - Zero PII in logs — never log candidate_id, github_url, or transcript content
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from datetime import datetime
from pathlib import Path

import anthropic
import httpx

from apps.api.core.config import settings
from apps.api.core.metrics import NLP_LATENCY
from apps.api.models.graph_models import (
    CandidateProfile,
    CollaborationVector,
    SkillWithProficiency,
)

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

# Per CLAUDE.md: do not change this model ID without updating CLAUDE.md.
_MODEL = "claude-sonnet-4-20250514"
_MAX_TOKENS = 4096
_CACHE_TTL = 86_400  # 24 hours in seconds
_README_CHAR_LIMIT = 3_000
_FILE_CHAR_LIMIT = 1_000
_TOP_FILES = 5

_SEMAPHORE = asyncio.Semaphore(5)

# ── Skill taxonomy ────────────────────────────────────────────────────────────

_TAXONOMY_PATH = Path(__file__).parent.parent / "data" / "skill_taxonomy.json"

def _load_flat_skill_set() -> frozenset[str]:
    """Flatten the taxonomy JSON into a set of known skill names."""
    with _TAXONOMY_PATH.open() as f:
        taxonomy: dict = json.load(f)
    skills: set[str] = set()
    for domain in taxonomy.values():
        for subdomain_skills in domain.values():
            skills.update(subdomain_skills)
    return frozenset(skills)


_KNOWN_SKILLS: frozenset[str] = _load_flat_skill_set()

# ── System prompt ─────────────────────────────────────────────────────────────

CANDIDATE_EXTRACTION_PROMPT = """\
You are an expert engineering recruiter and graph analyst for the \
Socio-Technical Alignment Simulator (STAS).

Your task: analyse a candidate's GitHub repository (and optional interview \
transcript), then call the extract_candidate_profile tool with a structured \
engineering profile. This profile predicts how the candidate will integrate \
into an existing team knowledge graph.

EXTRACTION GUIDELINES

Skills
- List concrete technical skills only. Infer from: repo languages, file \
imports, README badges, dependency files (requirements.txt, go.mod, \
package.json, Cargo.toml).
- Proficiency levels: beginner (toy/tutorial), intermediate (working \
feature code), advanced (production code, tests, CI), expert (library \
author, significant OSS contribution, novel architecture).
- Normalise skill names to lowercase. Use the canonical name \
(e.g. "python" not "Python 3", "nextjs" not "Next.js").
- Include only skills with clear evidence. Do not guess.

Collaboration vector (each dimension: float 0–1)
- async_preference: 1 = rich commit messages, detailed PR descriptions, \
written ADRs; 0 = terse messages, assumes verbal context.
- pr_review_depth: 1 = long multi-round review comments with suggestions; \
0 = LGTM-only patterns.
- documentation_habit: 1 = README, inline docs, wiki pages; 0 = bare repo.
- pairing_affinity: 1 = co-authored commits, mob session notes; \
0 = all commits solo.
- mentoring_tendency: 1 = detailed junior feedback, tutorial repos, \
conference talk repos; 0 = pure individual contributor.

Domain expertise
High-level engineering domains, e.g. "distributed systems", \
"frontend performance", "ML pipelines", "graph databases". \
Minimum 1, maximum 5.

Graph position estimate
Choose exactly one of: knowledge hub | cross-team connector | \
domain specialist | emerging contributor | generalist

Always call extract_candidate_profile. Never return free text.\
"""

# ── Tool definition ───────────────────────────────────────────────────────────

_EXTRACT_TOOL: dict = {
    "name": "extract_candidate_profile",
    "description": (
        "Extract a structured candidate engineering profile from GitHub "
        "repository content and an optional interview transcript."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "skills": {
                "type": "array",
                "description": "Technical skills with proficiency and evidence.",
                "items": {
                    "type": "object",
                    "properties": {
                        "skill": {
                            "type": "string",
                            "description": "Lowercase canonical skill name (e.g. 'python', 'nextjs').",
                        },
                        "proficiency": {
                            "type": "string",
                            "enum": ["beginner", "intermediate", "advanced", "expert"],
                        },
                        "evidence": {
                            "type": "string",
                            "description": "One sentence of evidence from the repo or transcript.",
                        },
                    },
                    "required": ["skill", "proficiency", "evidence"],
                    "additionalProperties": False,
                },
            },
            "collaboration_vector": {
                "type": "object",
                "description": "5-dimension collaboration style vector; each value in [0, 1].",
                "properties": {
                    "async_preference": {"type": "number", "minimum": 0, "maximum": 1},
                    "pr_review_depth": {"type": "number", "minimum": 0, "maximum": 1},
                    "documentation_habit": {"type": "number", "minimum": 0, "maximum": 1},
                    "pairing_affinity": {"type": "number", "minimum": 0, "maximum": 1},
                    "mentoring_tendency": {"type": "number", "minimum": 0, "maximum": 1},
                },
                "required": [
                    "async_preference",
                    "pr_review_depth",
                    "documentation_habit",
                    "pairing_affinity",
                    "mentoring_tendency",
                ],
                "additionalProperties": False,
            },
            "domain_expertise": {
                "type": "array",
                "description": "High-level engineering domains the candidate specialises in.",
                "items": {"type": "string"},
                "minItems": 1,
                "maxItems": 5,
            },
            "graph_position_estimate": {
                "type": "string",
                "enum": [
                    "knowledge hub",
                    "cross-team connector",
                    "domain specialist",
                    "emerging contributor",
                    "generalist",
                ],
                "description": "Predicted topology role in the team knowledge graph.",
            },
            "extraction_summary": {
                "type": "string",
                "description": "2–3 sentence engineering profile summary.",
            },
        },
        "required": [
            "skills",
            "collaboration_vector",
            "domain_expertise",
            "graph_position_estimate",
            "extraction_summary",
        ],
        "additionalProperties": False,
    },
}

# ── GitHub content fetcher ────────────────────────────────────────────────────

_GH_HEADERS = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}


async def _fetch_github_context(github_url: str) -> str:
    """Fetch README, repo metadata and top-N files; return as a formatted string."""
    parts = github_url.rstrip("/").split("/")
    if len(parts) < 5:
        raise ValueError(f"Cannot parse owner/repo from URL: {github_url!r}")
    owner, repo = parts[-2], parts[-1]
    base = f"https://api.github.com/repos/{owner}/{repo}"

    sections: list[str] = []

    async with httpx.AsyncClient(timeout=15.0) as client:
        # ── Repo metadata ─────────────────────────────────────────────────────
        try:
            resp = await client.get(base, headers=_GH_HEADERS)
            if resp.is_success:
                meta = resp.json()
                sections.append(
                    f"Repository: {owner}/{repo}\n"
                    f"Description: {meta.get('description') or 'N/A'}\n"
                    f"Primary language: {meta.get('language') or 'N/A'}\n"
                    f"Stars: {meta.get('stargazers_count', 0)}\n"
                    f"Open issues: {meta.get('open_issues_count', 0)}"
                )
                if meta.get("topics"):
                    sections.append(f"Topics: {', '.join(meta['topics'])}")
        except httpx.RequestError:
            sections.append(f"Repository: {owner}/{repo} (metadata unavailable)")

        # ── Languages ─────────────────────────────────────────────────────────
        try:
            resp = await client.get(f"{base}/languages", headers=_GH_HEADERS)
            if resp.is_success:
                langs = list(resp.json().keys())
                sections.append(f"Languages: {', '.join(langs)}")
        except httpx.RequestError:
            pass

        # ── README ────────────────────────────────────────────────────────────
        try:
            resp = await client.get(
                f"{base}/readme",
                headers={**_GH_HEADERS, "Accept": "application/vnd.github.raw+json"},
            )
            if resp.is_success:
                readme = resp.text[:_README_CHAR_LIMIT]
                sections.append(f"README (first {_README_CHAR_LIMIT} chars):\n{readme}")
        except httpx.RequestError:
            pass

        # ── Top N files by size ───────────────────────────────────────────────
        try:
            resp = await client.get(
                f"{base}/git/trees/HEAD?recursive=1", headers=_GH_HEADERS
            )
            if resp.is_success:
                tree = resp.json().get("tree", [])
                blobs = [
                    entry
                    for entry in tree
                    if entry.get("type") == "blob"
                    and not entry["path"].startswith(".")
                    and not entry["path"].endswith(
                        (".png", ".jpg", ".gif", ".svg", ".ico", ".lock", ".sum")
                    )
                ]
                blobs.sort(key=lambda e: e.get("size", 0), reverse=True)

                file_sections: list[str] = []
                for entry in blobs[:_TOP_FILES]:
                    try:
                        file_resp = await client.get(
                            f"{base}/contents/{entry['path']}",
                            headers={
                                **_GH_HEADERS,
                                "Accept": "application/vnd.github.raw+json",
                            },
                        )
                        if file_resp.is_success:
                            content = file_resp.text[:_FILE_CHAR_LIMIT]
                            file_sections.append(
                                f"--- {entry['path']} ---\n{content}"
                            )
                    except httpx.RequestError:
                        pass

                if file_sections:
                    sections.append("Top source files:\n" + "\n\n".join(file_sections))
        except httpx.RequestError:
            pass

    return "\n\n".join(sections) if sections else f"Repository: {github_url} (content unavailable)"


# ── Redis cache helpers ───────────────────────────────────────────────────────

async def _get_redis():  # type: ignore[return]
    try:
        import redis.asyncio as aioredis  # type: ignore[import]

        client = aioredis.from_url(settings.redis_url, decode_responses=True)
        await client.ping()
        return client
    except Exception:
        logger.warning("Redis unavailable — NLP extraction results will not be cached.")
        return None


async def _load_cached_profile(cache_key: str) -> CandidateProfile | None:
    client = await _get_redis()
    if client is None:
        return None
    try:
        raw = await client.get(cache_key)
        if raw is None:
            return None
        return CandidateProfile.model_validate(json.loads(raw))
    except Exception as exc:
        logger.warning("NLP cache read failed: %s", exc)
        return None
    finally:
        await client.aclose()


async def _cache_profile(cache_key: str, profile: CandidateProfile) -> None:
    client = await _get_redis()
    if client is None:
        return
    try:
        await client.setex(cache_key, _CACHE_TTL, profile.model_dump_json())
    except Exception as exc:
        logger.warning("NLP cache write failed: %s", exc)
    finally:
        await client.aclose()


def _make_cache_key(github_url: str, transcript_hash: str) -> str:
    url_hash = hashlib.sha256(github_url.encode()).hexdigest()[:16]
    return f"stas:nlp:{url_hash}:{transcript_hash}"


# ── Core extraction ───────────────────────────────────────────────────────────

async def _call_claude(user_content: str) -> dict:
    """Call the Claude API with tool use; return the parsed tool input dict."""
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    response = await client.messages.create(
        model=_MODEL,
        max_tokens=_MAX_TOKENS,
        system=CANDIDATE_EXTRACTION_PROMPT,
        messages=[{"role": "user", "content": user_content}],
        tools=[_EXTRACT_TOOL],
        tool_choice={"type": "tool", "name": "extract_candidate_profile"},
    )

    tool_block = next(
        (b for b in response.content if b.type == "tool_use"),
        None,
    )
    if tool_block is None:
        raise RuntimeError("Claude did not invoke extract_candidate_profile")

    return tool_block.input  # type: ignore[return-value]


async def extract_candidate_profile(
    github_url: str,
    candidate_id: str,
    transcript: str | None = None,
) -> CandidateProfile:
    """Extract a CandidateProfile from a GitHub URL and optional transcript.

    Caches results in Redis for 24 h per (github_url, transcript_hash).
    Enforces max 5 concurrent Claude API calls via semaphore.
    """
    transcript_hash = hashlib.sha256((transcript or "").encode()).hexdigest()[:16]
    cache_key = _make_cache_key(github_url, transcript_hash)

    # Fast path: cache hit before acquiring semaphore
    cached = await _load_cached_profile(cache_key)
    if cached is not None:
        logger.info("NLP cache hit")
        NLP_LATENCY.labels(cached="true").observe(0)
        return cached

    async with _SEMAPHORE:
        # Re-check after acquiring (another coroutine may have filled the cache)
        cached = await _load_cached_profile(cache_key)
        if cached is not None:
            NLP_LATENCY.labels(cached="true").observe(0)
            return cached

        github_context = await _fetch_github_context(github_url)

        user_content = f"GitHub Repository: {github_url}\n\n{github_context}"
        if transcript:
            # Transcript capped at 4000 chars — enough signal without blowing context
            user_content += f"\n\nInterview Transcript:\n{transcript[:4_000]}"

        logger.info("Calling Claude NLP extraction (model=%s)", _MODEL)
        with NLP_LATENCY.labels(cached="false").time():
            raw = await _call_claude(user_content)

        profile = CandidateProfile(
            candidate_id=candidate_id,
            github_url=github_url,
            skills=[SkillWithProficiency(**s) for s in raw["skills"]],
            collaboration_vector=CollaborationVector(**raw["collaboration_vector"]),
            domain_expertise=raw["domain_expertise"],
            graph_position_estimate=raw["graph_position_estimate"],
            extraction_summary=raw["extraction_summary"],
            extracted_at=datetime.utcnow(),
            transcript_hash=transcript_hash if transcript else None,
        )

        await _cache_profile(cache_key, profile)
        logger.info("NLP extraction complete — %d skills extracted", len(profile.skills))
        return profile


def extract_candidate_profile_sync(
    github_url: str,
    candidate_id: str,
    transcript: str | None = None,
) -> CandidateProfile:
    """Synchronous wrapper for use in Airflow tasks (asyncio.run)."""
    return asyncio.run(
        extract_candidate_profile(
            github_url=github_url,
            candidate_id=candidate_id,
            transcript=transcript,
        )
    )
