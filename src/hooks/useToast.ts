import { useState, useCallback, useRef, useEffect } from "react"
import type { ToastMessage, ToastType, ToastContextValue } from "../lib/toast-context.js"

let nextId = 1

/** Default durations per toast type (ms) */
const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 3000,
  info: 4000,
  error: 6000,
}

export function useToastState(): ToastContextValue {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const dismissAll = useCallback(() => {
    setToasts([])
    for (const timer of timersRef.current.values()) {
      clearTimeout(timer)
    }
    timersRef.current.clear()
  }, [])

  const showToast = useCallback((header: string, text: string, type: ToastType = "success", durationMs?: number) => {
    const id = nextId++
    const duration = durationMs ?? DEFAULT_DURATIONS[type]
    const toast: ToastMessage = { id, header, text, type, durationMs: duration }

    setToasts((prev) => [...prev, toast])

    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      timersRef.current.delete(id)
    }, duration)
    timersRef.current.set(id, timer)

    return id
  }, [])

  // Clean up all timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer)
      }
    }
  }, [])

  return { toasts, showToast, dismissToast, dismissAll }
}
