"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { fail, firstIssue, NOT_SIGNED_IN, uuid } from "@/lib/data/action-utils";
import { buildSnapshot, type ReminderProfile } from "@/lib/data/reminder-snapshot";
import { getActionViewer } from "@/lib/data/viewer";
import { pushConfigured, sendToUser, type DeviceResult } from "@/lib/push";
import { dueReminders } from "@/lib/reminders";
import type { ActionResult } from "@/lib/types";

const subSchema = z.object({
  endpoint: z.url().max(1000).refine((u) => u.startsWith("https://"), "Push endpoint must be https."),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  label: z.string().trim().max(80).nullable(),
});

/** Save this browser's push subscription (one row per device). */
export async function savePushSubscription(input: z.input<typeof subSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = subSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const s = parsed.data;
  // Same endpoint re-subscribing (e.g. after keys rotate): replace the old row.
  await v.supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
  const { data, error } = await v.supabase
    .from("push_subscriptions")
    .insert({ endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, label: s.label || null })
    .select("id")
    .single();
  if (error) return fail("Couldn't save this device.", error);
  refresh();
  return { ok: true, data: { id: data.id } };
}

export async function removePushSubscription(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown device.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase.from("push_subscriptions").delete().eq("id", id);
  if (error) return fail("Couldn't remove the device.", error);
  refresh();
  return { ok: true };
}

/** Sends a real push to every device right now, so delivery can be checked on the phone. */
export async function sendTestPush(): Promise<ActionResult<DeviceResult[]>> {
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  if (!pushConfigured()) return fail("Push isn't configured on the server yet (VAPID keys missing in Vercel).");
  try {
    const results = await sendToUser(v.supabase, v.userId, {
      title: "LifeOS test notification",
      body: "If you can read this on your phone, reminders can reach you. Go back and tap “It arrived”.",
      url: "/settings#notifications",
      tag: "test",
    });
    if (!results.length) return fail("No devices are set up yet. Enable notifications on your phone first.");
    refresh();
    return { ok: true, data: results };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't send the test.");
  }
}

/** You confirm on the device that the test actually showed up. Only then is it "verified". */
export async function confirmPushArrived(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Unknown device.");
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { error } = await v.supabase.from("push_subscriptions").update({ verified_at: new Date().toISOString() }).eq("id", id);
  if (error) return fail("Couldn't save that.", error);
  refresh();
  return { ok: true };
}

/** What would be due right now (for the Settings preview). Sends nothing. */
export async function previewDueNow(): Promise<ActionResult<Array<{ title: string; body: string; at: string }>>> {
  const v = await getActionViewer();
  if (!v) return NOT_SIGNED_IN;
  const { data: profile, error } = await v.supabase.from("profiles").select("id,timezone,tone,reminders,bedtime_target").eq("id", v.userId).single();
  if (error || !profile) return fail("Couldn't load your settings.", error);
  try {
    const due = dueReminders(await buildSnapshot(v.supabase, profile as ReminderProfile, Date.now()));
    return { ok: true, data: due.map((d) => ({ title: d.title, body: d.body, at: d.at })) };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't check reminders.");
  }
}
