"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { fail, firstIssue, NOT_SIGNED_IN, uuid } from "@/lib/data/action-utils";
import { getActionViewer } from "@/lib/data/viewer";
import type { ActionResult } from "@/lib/types";

const kinds = ["event", "focus", "lecture", "training", "match", "gym", "routine", "social"] as const;
const places = ["library", "home", "group_room", "other"] as const;

const eventSchema = z
  .object({
    id: uuid.optional(),
    title: z.string().trim().min(1, "Give it a name.").max(200),
    kind: z.enum(kinds),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    location: z.string().trim().max(120).nullable(),
    place: z.enum(places).nullable().optional(),
    taskId: uuid.nullable().optional(),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), { message: "It has to end after it starts." });

export async function saveEvent(input: z.input<typeof eventSchema>): Promise<ActionResult> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;

  const d = parsed.data;
  const row: Record<string, unknown> = {
    title: d.title,
    kind: d.kind,
    starts_at: d.startsAt,
    ends_at: d.endsAt,
    location: d.location || null,
    place: d.kind === "focus" ? (d.place ?? null) : null,
  };
  if (d.taskId !== undefined) row.task_id = d.taskId;
  const { error } = d.id
    ? await v.supabase.from("events").update(row).eq("id", d.id)
    : await v.supabase.from("events").insert(row);
  if (error) return fail("Couldn't save that block.", error);
  refresh();
  return { ok: true };
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown block.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase.from("events").delete().eq("id", id);
  if (error) return fail("Couldn't delete that block.", error);
  refresh();
  return { ok: true };
}

/** The end-of-block self-report: did you stay on it? */
export async function setFocusOutcome(id: string, outcome: "stayed" | "partly" | "drifted" | null): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown block.");
  if (outcome !== null && !["stayed", "partly", "drifted"].includes(outcome)) return fail("Unknown answer.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase
    .from("events")
    .update({ outcome, outcome_at: outcome ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return fail("Couldn't save that.", error);
  refresh();
  return { ok: true };
}

const importSchema = z
  .array(
    z.object({
      title: z.string().trim().min(1).max(200),
      startsAt: z.iso.datetime(),
      endsAt: z.iso.datetime(),
      location: z.string().trim().max(120).nullable(),
      kind: z.enum(kinds),
    }),
  )
  .min(1, "Nothing to import.")
  .max(600, "That file has too many events (600 max). Narrow the date range.");

/** .ics import: parsed in the browser, inserted here in batches. */
export async function importEvents(items: z.input<typeof importSchema>): Promise<ActionResult<{ count: number }>> {
  const parsed = importSchema.safeParse(items);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const rows = parsed.data
    .filter((e) => new Date(e.endsAt) > new Date(e.startsAt))
    .map((e) => ({ title: e.title, starts_at: e.startsAt, ends_at: e.endsAt, location: e.location, kind: e.kind }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await v.supabase.from("events").insert(rows.slice(i, i + 200));
    if (error) return fail(`Imported ${i} before an error. Try again.`, error);
  }
  refresh();
  return { ok: true, data: { count: rows.length } };
}
