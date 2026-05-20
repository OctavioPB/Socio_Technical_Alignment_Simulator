"use client"

/**
 * Simulation store — manages two independent candidate slots (A and B)
 * for solo simulation and side-by-side comparison.
 *
 * Each slot tracks its own SSE stream lifecycle, progress, and result.
 * History retains the last 10 completed results this session.
 */

import { create } from "zustand"
import type { SimulationResult } from "@/lib/api/types"

export type SimulationStatus = "idle" | "running" | "complete" | "error"
export type Slot = "A" | "B"

interface SlotState {
  candidateId: string | null
  candidateName: string
  status: SimulationStatus
  progress: number        // 0–1
  iterationCount: number
  result: SimulationResult | null
  error: string | null
  streamController: AbortController | null
}

const EMPTY_SLOT: SlotState = {
  candidateId: null,
  candidateName: "",
  status: "idle",
  progress: 0,
  iterationCount: 0,
  result: null,
  error: null,
  streamController: null,
}

interface SimulationState {
  slotA: SlotState
  slotB: SlotState
  history: SimulationResult[]   // last 10 completed

  // Slot lifecycle
  stageCandidate: (slot: Slot, id: string, name: string) => void
  startSlot: (slot: Slot, controller: AbortController) => void
  updateSlotProgress: (slot: Slot, progress: number, iterations: number) => void
  setSlotResult: (slot: Slot, result: SimulationResult) => void
  setSlotError: (slot: Slot, error: string) => void
  clearSlot: (slot: Slot) => void
  resetAll: () => void

  // Derived helpers
  activeSlotCount: () => number
  isComparisonMode: () => boolean
  getSlot: (slot: Slot) => SlotState
}

function withSlot(
  state: SimulationState,
  slot: Slot,
  update: Partial<SlotState>,
): Partial<SimulationState> {
  return slot === "A" ? { slotA: { ...state.slotA, ...update } }
                      : { slotB: { ...state.slotB, ...update } }
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  slotA: { ...EMPTY_SLOT },
  slotB: { ...EMPTY_SLOT },
  history: [],

  stageCandidate(slot, id, name) {
    set((s) => withSlot(s, slot, { candidateId: id, candidateName: name, status: "idle" }))
  },

  startSlot(slot, controller) {
    set((s) => withSlot(s, slot, {
      status: "running", progress: 0, iterationCount: 0,
      result: null, error: null, streamController: controller,
    }))
  },

  updateSlotProgress(slot, progress, iterations) {
    set((s) => withSlot(s, slot, { progress, iterationCount: iterations }))
  },

  setSlotResult(slot, result) {
    set((s) => ({
      ...withSlot(s, slot, { status: "complete", progress: 1, result, streamController: null }),
      history: [result, ...s.history].slice(0, 10),
    }))
  },

  setSlotError(slot, error) {
    set((s) => withSlot(s, slot, { status: "error", error, streamController: null }))
  },

  clearSlot(slot) {
    const current = get()[slot === "A" ? "slotA" : "slotB"]
    current.streamController?.abort()
    set((s) => withSlot(s, slot, { ...EMPTY_SLOT }))
  },

  resetAll() {
    get().slotA.streamController?.abort()
    get().slotB.streamController?.abort()
    set({ slotA: { ...EMPTY_SLOT }, slotB: { ...EMPTY_SLOT } })
  },

  activeSlotCount() {
    const { slotA, slotB } = get()
    return (slotA.candidateId ? 1 : 0) + (slotB.candidateId ? 1 : 0)
  },

  isComparisonMode() {
    const { slotA, slotB } = get()
    return !!(slotA.candidateId && slotB.candidateId)
  },

  getSlot(slot) {
    return slot === "A" ? get().slotA : get().slotB
  },
}))
