"use client"

import { useCallback } from "react"
import { useSimulationStore } from "@/lib/store/simulation"
import type { Slot } from "@/lib/store/simulation"
import type { SimulationResult } from "@/lib/api/types"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export interface CandidatePayload {
  id: string
  name: string
  skills: string[]
  github_url?: string
  collaboration_vector?: number[]
  team_id: string
}

export interface StreamRunOptions {
  candidate: CandidatePayload
  teamId: string
  nIterations?: number
  seed?: number
}

/**
 * React hook for streaming a Monte Carlo simulation via SSE (POST + ReadableStream).
 *
 * EventSource is GET-only, so we use fetch + ReadableStream to read the
 * text/event-stream response from POST /simulation/run-stream.
 *
 * SSE event shapes (from simulation.py):
 *   {"type": "progress", "pct": 0.25, "n": 250}
 *   {"type": "result",   "data": { ...SimulationResult }}
 *   {"type": "error",    "detail": "..."}
 */
export function useSimulationStream(slot: Slot) {
  const { startSlot, updateSlotProgress, setSlotResult, setSlotError, clearSlot } =
    useSimulationStore()

  const run = useCallback(
    async (opts: StreamRunOptions) => {
      const controller = new AbortController()
      startSlot(slot, controller)

      try {
        const res = await fetch(`${BASE}/simulation/run-stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidate: {
              id: opts.candidate.id,
              name: opts.candidate.name,
              skills: opts.candidate.skills,
              github_url: opts.candidate.github_url ?? "",
              collaboration_vector: opts.candidate.collaboration_vector ?? [],
              team_id: opts.candidate.team_id,
            },
            team_id: opts.teamId,
            n_iterations: opts.nIterations ?? 1000,
            seed: opts.seed ?? 42,
          }),
          signal: controller.signal,
        })

        if (!res.ok) {
          const text = await res.text()
          setSlotError(slot, `HTTP ${res.status}: ${text}`)
          return
        }

        if (!res.body) {
          setSlotError(slot, "No response body from simulation stream")
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          // Keep the last (possibly incomplete) line in the buffer
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const raw = line.slice(6).trim()
            if (!raw) continue

            let event: Record<string, unknown>
            try {
              event = JSON.parse(raw) as Record<string, unknown>
            } catch {
              continue
            }

            if (event.type === "progress") {
              updateSlotProgress(slot, (event.pct as number) ?? 0, (event.n as number) ?? 0)
            } else if (event.type === "result") {
              setSlotResult(slot, event.data as SimulationResult)
            } else if (event.type === "error") {
              setSlotError(slot, (event.detail as string) ?? "Simulation failed")
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setSlotError(slot, (err as Error).message ?? "Unknown error")
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slot],
  )

  const cancel = useCallback(() => {
    clearSlot(slot)
  }, [slot, clearSlot])

  return { run, cancel }
}
