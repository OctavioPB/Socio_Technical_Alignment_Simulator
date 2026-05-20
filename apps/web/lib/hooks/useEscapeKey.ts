"use client"

import { useEffect } from "react"

/**
 * Calls `callback` whenever the Escape key is pressed while `enabled` is true.
 * The handler is attached to `window`, so it fires regardless of focus.
 */
export function useEscapeKey(callback: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") callback()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [callback, enabled])
}
