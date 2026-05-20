// ─── STAS Neo4j Schema — Sprint 1 ────────────────────────────────────────────
// Neo4j 5.x syntax. Run via graph/migrations/runner.py or apply manually.

// ─── Uniqueness constraints ───────────────────────────────────────────────────
CREATE CONSTRAINT engineer_id_unique IF NOT EXISTS
FOR (e:Engineer) REQUIRE e.id IS UNIQUE;

CREATE CONSTRAINT candidate_id_unique IF NOT EXISTS
FOR (c:Candidate) REQUIRE c.id IS UNIQUE;

CREATE CONSTRAINT graph_snapshot_id_unique IF NOT EXISTS
FOR (s:GraphSnapshot) REQUIRE s.id IS UNIQUE;

// ─── Indexes ──────────────────────────────────────────────────────────────────
// Team — hit on every team graph query
CREATE INDEX engineer_team_idx IF NOT EXISTS
FOR (e:Engineer) ON (e.team);

// Seniority — simulation stratification
CREATE INDEX engineer_seniority_idx IF NOT EXISTS
FOR (e:Engineer) ON (e.seniority);

// Skills — candidate skill-matching and knowledge gap analysis
// Note: Neo4j indexes list properties; each element is indexed individually
CREATE INDEX engineer_skills_idx IF NOT EXISTS
FOR (e:Engineer) ON (e.skills);

CREATE INDEX candidate_skills_idx IF NOT EXISTS
FOR (c:Candidate) ON (c.skills);

// Temporary candidate flag — cleanup queries
CREATE INDEX candidate_is_temporary_idx IF NOT EXISTS
FOR (c:Candidate) ON (c.is_temporary);
