import { asc, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { writeAuditLog } from "./audit.js";

export interface StoreDTO {
  id: number;
  code: string;
  name: string;
  display_name: string;
  opening_time: string;
  closing_time: string;
  closed_days: number[];
  created_at: number;
}

function rowToDTO(row: typeof schema.stores.$inferSelect): StoreDTO {
  let closedDays: number[] = [];
  if (row.closedDays) {
    try {
      const parsed = JSON.parse(row.closedDays);
      if (Array.isArray(parsed)) {
        closedDays = parsed.filter((v) => typeof v === "number");
      }
    } catch {
      closedDays = [];
    }
  }
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    display_name: row.displayName,
    opening_time: row.openingTime,
    closing_time: row.closingTime,
    closed_days: closedDays,
    created_at: row.createdAt,
  };
}

export function listStores(): StoreDTO[] {
  const rows = db.select().from(schema.stores).orderBy(asc(schema.stores.id)).all();
  return rows.map(rowToDTO);
}

export function getStore(id: number): StoreDTO | null {
  const row = db.select().from(schema.stores).where(eq(schema.stores.id, id)).get();
  return row ? rowToDTO(row) : null;
}

export interface CreateStoreInput {
  code: string;
  name: string;
  display_name: string;
  opening_time: string;
  closing_time: string;
  closed_days?: number[];
}

export function createStore(input: CreateStoreInput, actorId: number): StoreDTO {
  const now = Date.now();
  const result = db
    .insert(schema.stores)
    .values({
      code: input.code,
      name: input.name,
      displayName: input.display_name,
      openingTime: input.opening_time,
      closingTime: input.closing_time,
      closedDays: input.closed_days ? JSON.stringify(input.closed_days) : null,
      createdAt: now,
    })
    .returning()
    .get();
  const dto = rowToDTO(result);
  writeAuditLog({
    actorId,
    action: "store.create",
    entityType: "store",
    entityId: dto.id,
    before: null,
    after: dto,
    occurredAt: now,
  });
  return dto;
}

export interface UpdateStoreInput {
  code?: string;
  name?: string;
  display_name?: string;
  opening_time?: string;
  closing_time?: string;
  closed_days?: number[];
}

export function updateStore(id: number, patch: UpdateStoreInput, actorId: number): StoreDTO | null {
  const before = db.select().from(schema.stores).where(eq(schema.stores.id, id)).get();
  if (!before) return null;
  const beforeDTO = rowToDTO(before);

  const updates: Partial<typeof schema.stores.$inferInsert> = {};
  if (patch.code !== undefined) updates.code = patch.code;
  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.display_name !== undefined) updates.displayName = patch.display_name;
  if (patch.opening_time !== undefined) updates.openingTime = patch.opening_time;
  if (patch.closing_time !== undefined) updates.closingTime = patch.closing_time;
  if (patch.closed_days !== undefined) updates.closedDays = JSON.stringify(patch.closed_days);

  if (Object.keys(updates).length === 0) {
    return beforeDTO;
  }

  db.update(schema.stores).set(updates).where(eq(schema.stores.id, id)).run();
  const after = db.select().from(schema.stores).where(eq(schema.stores.id, id)).get();
  if (!after) return null;
  const afterDTO = rowToDTO(after);

  writeAuditLog({
    actorId,
    action: "store.update",
    entityType: "store",
    entityId: id,
    before: beforeDTO,
    after: afterDTO,
    occurredAt: Date.now(),
  });
  return afterDTO;
}
