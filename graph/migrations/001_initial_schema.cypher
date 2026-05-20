// Migration 001 — Initial schema (Sprint 1)
// Idempotent: safe to run multiple times via IF NOT EXISTS guards.

CREATE CONSTRAINT engineer_id_unique IF NOT EXISTS
FOR (e:Engineer) REQUIRE e.id IS UNIQUE;

CREATE CONSTRAINT candidate_id_unique IF NOT EXISTS
FOR (c:Candidate) REQUIRE c.id IS UNIQUE;

CREATE CONSTRAINT graph_snapshot_id_unique IF NOT EXISTS
FOR (s:GraphSnapshot) REQUIRE s.id IS UNIQUE;

CREATE INDEX engineer_team_idx IF NOT EXISTS
FOR (e:Engineer) ON (e.team);

CREATE INDEX engineer_seniority_idx IF NOT EXISTS
FOR (e:Engineer) ON (e.seniority);

CREATE INDEX engineer_skills_idx IF NOT EXISTS
FOR (e:Engineer) ON (e.skills);

CREATE INDEX candidate_skills_idx IF NOT EXISTS
FOR (c:Candidate) ON (c.skills);

CREATE INDEX candidate_is_temporary_idx IF NOT EXISTS
FOR (c:Candidate) ON (c.is_temporary);
