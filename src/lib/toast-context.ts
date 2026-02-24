import { createContext, useContext } from "react"

export type ToastType = "success" | "error" | "info"

export interface ToastMessage {
  id: number
  header: string
  text: string
  type: ToastType
  durationMs: number
}

export interface ToastContextValue {
  toasts: ToastMessage[]
  showToast: (header: string, text: string, type?: ToastType, durationMs?: number) => void
  dismissToast: (id: number) => void
  dismissAll: () => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error("useToast must be called within a ToastProvider")
  }
  return ctx
}
