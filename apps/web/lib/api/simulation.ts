import type { SimulationResult } from "@/lib/api/types"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export async function fetchSimulationResult(resultId: string): Promise<SimulationResult | null> {
  const res = await fetch(`${BASE}/simulation/results/${resultId}`, {
    next: { revalidate: 0 },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to fetch simulation result: ${res.statusText}`)
  return res.json() as Promise<SimulationResult>
}
