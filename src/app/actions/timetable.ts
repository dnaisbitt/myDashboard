"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { dateKeySchema, fail, firstIssue, NOT_SIGNED_IN, timeSchema, uuid } from "@/lib/data/action-utils";
import { getActionViewer } from "@/lib/data/viewer";
import type { ActionResult } from "@/lib/types";

const sessionSchema = z
  .object({
    id: uuid.optional(),
    title: z.string().trim().min(1, "Give it a name.").max(120),
    kind: z.enum(["lecture", "lab", "seminar", "tutorial", "training", "match", "other"]),
    weekday: z.number().int().min(1).max(7),
    startTime: timeSchema,
    endTime: timeSchema,
    location: z.string().trim().max(120).nullable(),
    startsOn: dateKeySchema,
    endsOn: dateKeySchema,
  })
  .refine((s) => s.endTime.slice(0, 5) > s.startTime.slice(0, 5), { message: "It has to end after it starts." })
  .refine((s) => s.endsOn >= s.startsOn, { message: "The last week must be after the first." });

export async function saveSession(input: z.input<typeof sessionSchema>): Promise<ActionResult> {
  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const s = parsed.data;
  const row = {
    title: s.title,
    kind: s.kind,
    weekday: s.weekday,
    start_time: s.startTime,
    end_time: s.endTime,
    location: s.location || null,
    starts_on: s.startsOn,
    ends_on: s.endsOn,
  };
  const { error } = s.id
    ? await v.supabase.from("timetable_sessions").update(row).eq("id", s.id)
    : await v.supabase.from("timetable_sessions").insert(row);
  if (error) return fail("Couldn't save that session.", error);
  refresh();
  return { ok: true };
}

export async function deleteSession(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown session.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase.from("timetable_sessions").delete().eq("id", id);
  if (error) return fail("Couldn't delete that session.", error);
  refresh();
  return { ok: true };
}

/** One tap: "cancelled this week" (or restore it). */
export async function setSessionCancelled(sessionId: string, onDate: string, cancelled: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(sessionId).success || !dateKeySchema.safeParse(onDate).success) return fail("Unknown session.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = cancelled
    ? await v.supabase.from("session_exceptions").upsert({ session_id: sessionId, on_date: onDate }, { onConflict: "session_id,on_date" })
    : await v.supabase.from("session_exceptions").delete().eq("session_id", sessionId).eq("on_date", onDate);
  if (error) return fail("Couldn't update that session.", error);
  refresh();
  return { ok: true };
}
