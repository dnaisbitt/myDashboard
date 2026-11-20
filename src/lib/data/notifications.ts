import "server-only";
import { pushConfigured } from "@/lib/push";
import { summariseLearning, type SentReminder } from "@/lib/reminder-learning";
import { scheduleFor, type ReminderPrefs, type ReminderType } from "@/lib/reminders";
import { addDaysToKey } from "@/lib/time";
import { getClock, getViewer } from "./viewer";

export type Device = {
  id: string;
  endpoint: string;
  label: string | null;
  created_at: string;
  last_success_at: string | null;
  last_error: string | null;
  verified_at: string | null;
};

type LogRow = { id: string; type: ReminderType; ref_key: string; local_date: string; title: string; sent_at: string; delivered: number; opened_at: string | null };

const H = 3_600_000;

/** "Acted on" = you did the thing the reminder was about, soon after it arrived. */
function actedOn(
  r: LogRow,
  ev: {
    habitLogs: Array<{ habit_id: string; created_at: string }>;
    bookings: Array<{ created_at: string }>;
    beds: Array<{ bed_at: string | null }>;
    taskTouches: Array<{ id: string; updated_at: string }>;
    priorities: Array<{ today_date: string; updated_at: string }>;
  },
) {
  const t = Date.parse(r.sent_at);
  const within = (iso: string | null, hours: number) => (iso ? Date.parse(iso) >= t && Date.parse(iso) <= t + hours * H : false);
  switch (r.type) {
    case "habits":
      return ev.habitLogs.some((l) => l.habit_id === r.ref_key && within(l.created_at, 4));
    case "gym_booking":
      return ev.bookings.some((b) => within(b.created_at, 12));
    case "bedtime":
      return ev.beds.some((b) => within(b.bed_at, 3));
    case "deadlines":
      return ev.taskTouches.some((x) => x.id === r.ref_key && within(x.updated_at, 24));
    case "overdue":
      return ev.taskTouches.some((x) => within(x.updated_at, 24));
    case "daily_plan":
      return ev.priorities.some((p) => p.today_date === r.local_date && within(p.updated_at, 4));
    default:
      return false;
  }
}

export async function getNotificationSettings() {
  const { supabase } = await getViewer();
  const { profile, tz, todayKey } = await getClock();
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();

  const [devices, log] = await Promise.all([
    supabase.from("push_subscriptions").select("id,endpoint,label,created_at,last_success_at,last_error,verified_at").order("created_at"),
    supabase.from("notification_log").select("id,type,ref_key,local_date,title,sent_at,delivered,opened_at").gte("sent_at", since).order("sent_at", { ascending: false }).limit(500),
  ]);
  const err = devices.error ?? log.error;
  if (err) throw new Error(`Could not load notification settings: ${err.message}`);
  const rows = (log.data ?? []) as LogRow[];

  const [habitLogs, bookings, beds, taskTouches, priorities] = rows.length
    ? await Promise.all([
        supabase.from("habit_logs").select("habit_id,created_at").gte("created_at", since),
        supabase.from("gym_bookings").select("created_at").gte("created_at", since),
        supabase.from("sleep_logs").select("bed_at").gte("night_of", addDaysToKey(todayKey, -61)),
        supabase.from("tasks").select("id,updated_at").gte("updated_at", since).limit(2000),
        supabase.from("tasks").select("today_date,updated_at").not("today_date", "is", null).gte("updated_at", since).limit(2000),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const ev = {
    habitLogs: (habitLogs.data ?? []) as Array<{ habit_id: string; created_at: string }>,
    bookings: (bookings.data ?? []) as Array<{ created_at: string }>,
    beds: (beds.data ?? []) as Array<{ bed_at: string | null }>,
    taskTouches: (taskTouches.data ?? []) as Array<{ id: string; updated_at: string }>,
    priorities: (priorities.data ?? []) as Array<{ today_date: string; updated_at: string }>,
  };
  const hourOf = (iso: string) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date(iso)));
  const learningRows: SentReminder[] = rows
    .filter((r) => r.delivered > 0)
    .map((r) => ({ type: r.type, hour: hourOf(r.sent_at), opened: Boolean(r.opened_at), acted: actedOn(r, ev) }));

  const prefs = (profile.reminders ?? {}) as ReminderPrefs;
  return {
    tz,
    pushReady: pushConfigured(),
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
    schedulerConfigured: Boolean(process.env.CRON_SECRET && process.env.SUPABASE_SECRET_KEY),
    devices: (devices.data ?? []) as Device[],
    recent: rows.slice(0, 15).map((r) => ({ id: r.id, title: r.title, sent_at: r.sent_at, delivered: r.delivered, opened: Boolean(r.opened_at) })),
    schedule: scheduleFor({ prefs, bedtimeTarget: profile.bedtime_target ? profile.bedtime_target.slice(0, 5) : null, tone: profile.tone }),
    prefs,
    learning: summariseLearning(learningRows, prefs),
  };
}
