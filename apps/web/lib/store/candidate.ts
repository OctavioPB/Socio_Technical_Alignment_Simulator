"use client"

import { create } from "zustand"
import type { CandidateProfile } from "@/lib/api/types"

interface CandidateState {
  // Candidates loaded in this session (keyed by candidate_id)
  profiles: Record<string, CandidateProfile>
  // Candidate currently staged for simulation (not yet in graph)
  stagedCandidateId: string | null

  // Actions
  addProfile: (profile: CandidateProfile) => void
  setStagedCandidate: (id: string | null) => void
  getStagedProfile: () => CandidateProfile | null
}

export const useCandidateStore = create<CandidateState>((set, get) => ({
  profiles: {},
  stagedCandidateId: null,

  addProfile(profile) {
    set((state) => ({
      profiles: { ...state.profiles, [profile.candidate_id]: profile },
    }))
  },

  setStagedCandidate(id) {
    set({ stagedCandidateId: id })
  },

  getStagedProfile() {
    const { profiles, stagedCandidateId } = get()
    if (!stagedCandidateId) return null
    return profiles[stagedCandidateId] ?? null
  },
}))
