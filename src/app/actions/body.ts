"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { dateKeySchema, fail, firstIssue, NOT_SIGNED_IN, uuid, viewerWithTz } from "@/lib/data/action-utils";
import { getActionViewer } from "@/lib/data/viewer";
import { addDaysToKey, dateKey, localMinutes } from "@/lib/time";
import type { ActionResult } from "@/lib/types";

// ---------------------------------------------------------------------------
// Gym
// ---------------------------------------------------------------------------

/** One tap: gym done today (full or the minimum version), or clear it. */
export async function logWorkout(onDate: string, kind: "full" | "minimum" | null): Promise<ActionResult> {
  if (!dateKeySchema.safeParse(onDate).success || (kind !== null && !["full", "minimum"].includes(kind))) return fail("Unknown session.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } =
    kind === null
      ? await v.supabase.from("workouts").delete().eq("on_date", onDate)
      : await v.supabase.from("workouts").upsert({ on_date: onDate, kind }, { onConflict: "user_id,on_date" });
  if (error) return fail("Couldn't log that.", error);
  refresh();
  return { ok: true };
}

export async function setGymBooked(onDate: string, booked: boolean): Promise<ActionResult> {
  if (!dateKeySchema.safeParse(onDate).success) return fail("Unknown day.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = booked
    ? await v.supabase.from("gym_bookings").upsert({ on_date: onDate }, { onConflict: "user_id,on_date" })
    : await v.supabase.from("gym_bookings").delete().eq("on_date", onDate);
  if (error) return fail("Couldn't update the booking.", error);
  refresh();
  return { ok: true };
}

const gymSettings = z.object({
  gymTargetPerWeek: z.number().int().min(1).max(7),
  gymQuietTimes: z.string().trim().max(300).nullable(),
});

export async function saveGymSettings(input: z.input<typeof gymSettings>): Promise<ActionResult> {
  const parsed = gymSettings.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase
    .from("profiles")
    .update({ gym_target_per_week: parsed.data.gymTargetPerWeek, gym_quiet_times: parsed.data.gymQuietTimes || null })
    .eq("id", v.userId);
  if (error) return fail("Couldn't save.", error);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sleep: one-tap "going to bed now" / "just woke up", or edit a night
// ---------------------------------------------------------------------------

/** Which night a moment belongs to: before 15:00 counts as the previous evening's night. */
function nightOf(nowMs: number, tz: string) {
  const today = dateKey(nowMs, tz);
  return localMinutes(nowMs, tz) < 15 * 60 ? addDaysToKey(today, -1) : today;
}

export async function logSleepNow(which: "bed" | "wake"): Promise<ActionResult<{ nightOf: string }>> {
  const v = await viewerWithTz();
  if (!v) return NOT_SIGNED_IN;
  const now = Date.now();
  const iso = new Date(now).toISOString();
  // Bed after 15:00 starts tonight; bed in the small hours belongs to last night.
  const night = which === "bed" ? nightOf(now, v.tz) : addDaysToKey(dateKey(now, v.tz), -1);
  const { data: existing } = await v.supabase.from("sleep_logs").select("bed_at,wake_at").eq("night_of", night).maybeSingle();
  if (which === "wake" && existing?.bed_at && Date.parse(existing.bed_at as string) >= now) return fail("That's before your logged bedtime.");
  const { error } = await v.supabase
    .from("sleep_logs")
    .upsert({ night_of: night, [which === "bed" ? "bed_at" : "wake_at"]: iso }, { onConflict: "user_id,night_of" });
  if (error) return fail("Couldn't log that.", error);
  refresh();
  return { ok: true, data: { nightOf: night } };
}

const sleepSchema = z
  .object({
    nightOf: dateKeySchema,
    bedAt: z.iso.datetime().nullable(),
    wakeAt: z.iso.datetime().nullable(),
  })
  .refine((s) => !s.bedAt || !s.wakeAt || Date.parse(s.wakeAt) > Date.parse(s.bedAt), { message: "Waking has to be after going to bed." })
  .refine((s) => !s.bedAt || !s.wakeAt || Date.parse(s.wakeAt) - Date.parse(s.bedAt) < 20 * 3_600_000, { message: "That's over 20 hours. Check the dates." });

export async function saveSleep(input: z.input<typeof sleepSchema>): Promise<ActionResult> {
  const parsed = sleepSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const s = parsed.data;
  const { error } = await v.supabase
    .from("sleep_logs")
    .upsert({ night_of: s.nightOf, bed_at: s.bedAt, wake_at: s.wakeAt }, { onConflict: "user_id,night_of" });
  if (error) return fail("Couldn't save that night.", error);
  refresh();
  return { ok: true };
}

export async function deleteSleep(nightOf: string): Promise<ActionResult> {
  if (!dateKeySchema.safeParse(nightOf).success) return fail("Unknown night.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase.from("sleep_logs").delete().eq("night_of", nightOf);
  if (error) return fail("Couldn't delete it.", error);
  refresh();
  return { ok: true };
}

export async function saveBedtimeTarget(time: string | null): Promise<ActionResult> {
  if (time !== null && !/^\d{2}:\d{2}$/.test(time)) return fail("Pick a time.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase.from("profiles").update({ bedtime_target: time }).eq("id", v.userId);
  if (error) return fail("Couldn't save.", error);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Daily check-ins and optional trackers
// ---------------------------------------------------------------------------

const checkinSchema = z.object({
  onDate: dateKeySchema,
  field: z.enum(["ate_well", "protein_hit", "calories"]),
  value: z.union([z.boolean(), z.number().int().min(0).max(20000), z.null()]),
});

export async function setCheckin(input: z.input<typeof checkinSchema>): Promise<ActionResult> {
  const parsed = checkinSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { onDate, field, value } = parsed.data;
  if (field === "calories" ? typeof value === "boolean" : typeof value === "number") return fail("Wrong value.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase.from("daily_checkins").upsert({ on_date: onDate, [field]: value }, { onConflict: "user_id,on_date" });
  if (error) return fail("Couldn't save that.", error);
  refresh();
  return { ok: true };
}

export async function saveWeighIn(onDate: string, kg: number | null): Promise<ActionResult> {
  if (!dateKeySchema.safeParse(onDate).success) return fail("Pick a date.");
  if (kg !== null && !z.number().min(25).max(300).safeParse(kg).success) return fail("Enter a weight in kg.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } =
    kg === null
      ? await v.supabase.from("weigh_ins").delete().eq("on_date", onDate)
      : await v.supabase.from("weigh_ins").upsert({ on_date: onDate, kg: Math.round(kg * 10) / 10 }, { onConflict: "user_id,on_date" });
  if (error) return fail("Couldn't save the weigh-in.", error);
  refresh();
  return { ok: true };
}

const liftSchema = z.object({
  onDate: dateKeySchema,
  lift: z.string().trim().min(1, "Which lift?").max(40),
  kg: z.number().min(0).max(500),
  reps: z.number().int().min(1).max(50),
});

export async function addLift(input: z.input<typeof liftSchema>): Promise<ActionResult> {
  const parsed = liftSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const l = parsed.data;
  const { error } = await v.supabase.from("lift_entries").insert({ on_date: l.onDate, lift: l.lift, kg: Math.round(l.kg * 10) / 10, reps: l.reps });
  if (error) return fail("Couldn't save the lift.", error);
  refresh();
  return { ok: true };
}

export async function deleteLift(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown entry.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase.from("lift_entries").delete().eq("id", id);
  if (error) return fail("Couldn't delete it.", error);
  refresh();
  return { ok: true };
}
