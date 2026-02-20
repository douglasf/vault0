import { createContext, useContext } from "react"
import type { Vault0Database } from "../db/connection.js"

export const DbContext = createContext<Vault0Database | null>(null)

export function useDb() {
  const db = useContext(DbContext)
  if (!db) {
    throw new Error("useDb must be called within a DbContext provider")
  }
  return db
}
