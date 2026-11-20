import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { buildSnapshot, type ReminderProfile } from "@/lib/data/reminder-snapshot";
import { pushConfigured, sendToUser } from "@/lib/push";
import { dueReminders } from "@/lib/reminders";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

/**
 * The reminder job. Called every 15 minutes by Supabase pg_cron (POST) and once a
 * day by Vercel Cron as a backup (GET). Both send `Authorization: Bearer CRON_SECRET`.
 * For each user with a subscribed device: work out what's due now, record it in
 * notification_log (unique per type/thing/day, so nothing sends twice), then push.
 */
function authorised(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

async function run(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "not_configured", message: "SUPABASE_SECRET_KEY is not set." }, { status: 503 });
  if (!pushConfigured()) return NextResponse.json({ error: "not_configured", message: "VAPID keys are not set." }, { status: 503 });

  const nowMs = Date.now();
  const { data: subs, error } = await db.from("push_subscriptions").select("user_id");
  if (error) return NextResponse.json({ error: "db", message: error.message }, { status: 500 });
  const userIds = [...new Set((subs ?? []).map((s) => s.user_id as string))];

  const summary = { users: userIds.length, due: 0, sent: 0, skippedAlreadySent: 0, failed: 0 };
  for (const uid of userIds) {
    try {
      const { data: profile, error: pErr } = await db.from("profiles").select("id,timezone,tone,reminders,bedtime_target").eq("id", uid).single();
      if (pErr || !profile) throw new Error(pErr?.message ?? "no profile");
      const snap = await buildSnapshot(db, profile as ReminderProfile, nowMs);
      const due = dueReminders(snap);
      summary.due += due.length;
      for (const r of due) {
        // Claim it first: the unique key makes a second run in the same window a no-op.
        const { data: logged, error: logErr } = await db
          .from("notification_log")
          .upsert(
            { user_id: uid, type: r.type, ref_key: r.refKey, local_date: snap.todayKey, title: r.title.slice(0, 120), body: r.body.slice(0, 300), url: r.url },
            { onConflict: "user_id,type,ref_key,local_date", ignoreDuplicates: true },
          )
          .select("id");
        if (logErr) throw new Error(logErr.message);
        if (!logged?.length) {
          summary.skippedAlreadySent++;
          continue;
        }
        const id = logged[0].id as string;
        const results = await sendToUser(db, uid, {
          title: r.title,
          body: r.body,
          url: `/api/push/open?id=${id}&to=${encodeURIComponent(r.url)}`,
          tag: `${r.type}:${r.refKey}`,
        });
        const delivered = results.filter((x) => x.ok).length;
        await db.from("notification_log").update({ delivered }).eq("id", id).eq("user_id", uid);
        if (delivered) summary.sent++;
        else summary.failed++;
      }
    } catch (e) {
      console.error("reminders: user failed", uid, e);
      summary.failed++;
    }
  }
  return NextResponse.json(summary);
}

export const GET = run;
export const POST = run;
