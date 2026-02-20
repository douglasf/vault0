import type { Vault0Database } from "./connection.js"
import { boards } from "./schema.js"

export function seedDefaultBoard(db: Vault0Database) {
  const existing = db.select().from(boards).limit(1).all()
  if (existing.length === 0) {
    db.insert(boards).values({
      name: "Default",
      description: "Default kanban board",
    }).run()
  }
}
