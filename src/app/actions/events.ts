"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getActionViewer } from "@/lib/data/viewer";
import type { ActionResult } from "@/lib/types";

const kinds = ["event", "focus", "lecture", "training", "match", "gym", "routine", "social"] as const;

const eventSchema = z
  .object({
    id: z.uuid().optional(),
    title: z.string().trim().min(1, "Give it a name.").max(200),
    kind: z.enum(kinds),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    location: z.string().trim().max(120).nullable(),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), { message: "It has to end after it starts." });

export async function saveEvent(input: z.input<typeof eventSchema>): Promise<ActionResult> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = await getActionViewer();
  if (!v) return { ok: false, error: "You're signed out. Sign in again." };

  const { id, title, kind, startsAt, endsAt, location } = parsed.data;
  const row = { title, kind, starts_at: startsAt, ends_at: endsAt, location: location || null };
  const { error } = id
    ? await v.supabase.from("events").update(row).eq("id", id)
    : await v.supabase.from("events").insert(row);
  if (error) {
    console.error("saveEvent", error.message);
    return { ok: false, error: "Couldn't save that block." };
  }
  refresh();
  return { ok: true };
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Unknown block." };
  const v = await getActionViewer();
  if (!v) return { ok: false, error: "You're signed out. Sign in again." };
  const { error } = await v.supabase.from("events").delete().eq("id", id);
  if (error) {
    console.error("deleteEvent", error.message);
    return { ok: false, error: "Couldn't delete that block." };
  }
  refresh();
  return { ok: true };
}
