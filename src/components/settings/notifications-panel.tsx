"use client";

import { BellRing, Check, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { updateProfile } from "@/app/actions/profile";
import { confirmPushArrived, previewDueNow, removePushSubscription, savePushSubscription, sendTestPush } from "@/app/actions/push";
import { Button, IconButton } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import type { Device } from "@/lib/data/notifications";
import type { DeviceResult } from "@/lib/push";
import type { LearningSummary } from "@/lib/reminder-learning";
import type { ReminderPrefs, ReminderType } from "@/lib/reminders";
import { formatShortDay, formatTime } from "@/lib/time";

type ScheduleRow = { type: ReminderType; label: string; detail: string; on: boolean; time: string | null; muted: boolean };

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function deviceLabel() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "Android phone";
  if (/iPhone|iPad/i.test(ua)) return "iPhone";
  if (/Windows/i.test(ua)) return "Windows laptop";
  if (/Mac OS X/i.test(ua)) return "Mac";
  return "This browser";
}

export function NotificationsPanel({
  tz,
  pushReady,
  vapidPublicKey,
  schedulerConfigured,
  devices,
  recent,
  schedule,
  prefs,
  learning,
}: {
  tz: string;
  pushReady: boolean;
  vapidPublicKey: string | null;
  schedulerConfigured: boolean;
  devices: Device[];
  recent: Array<{ id: string; title: string; sent_at: string; delivered: number; opened: boolean }>;
  schedule: ScheduleRow[];
  prefs: ReminderPrefs;
  learning: LearningSummary;
}) {
  const { notify } = useToast();
  const [pending, start] = useTransition();
  const [support, setSupport] = useState<"unknown" | "unsupported" | "ok">("unknown");
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null);
  const [results, setResults] = useState<DeviceResult[] | null>(null);
  const [preview, setPreview] = useState<Array<{ title: string; body: string; at: string }> | null>(null);
  const [localPrefs, setLocalPrefs] = useState<ReminderPrefs>(prefs);

  useEffect(() => {
    const t = window.setTimeout(async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setSupport("unsupported");
        return;
      }
      setSupport("ok");
      setPermission(Notification.permission);
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setThisEndpoint(sub?.endpoint ?? null);
    });
    return () => window.clearTimeout(t);
  }, []);

  const thisDevice = devices.find((d) => d.endpoint === thisEndpoint) ?? null;
  const verified = devices.filter((d) => d.verified_at);

  const enable = () =>
    start(async () => {
      if (!vapidPublicKey) return notify("Push keys aren't configured on the server yet.", { tone: "error" });
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return notify("Notifications are blocked for LifeOS in this browser's settings.", { tone: "error" });
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const r = await savePushSubscription({ endpoint: json.endpoint, keys: json.keys, label: deviceLabel() });
      if (!r.ok) return notify(r.error, { tone: "error" });
      setThisEndpoint(json.endpoint);
      notify("Notifications on for this device. Now send a test.");
    });

  const disable = (d: Device) =>
    start(async () => {
      if (d.endpoint === thisEndpoint) {
        const reg = await navigator.serviceWorker.getRegistration();
        await (await reg?.pushManager.getSubscription())?.unsubscribe();
        setThisEndpoint(null);
      }
      const r = await removePushSubscription(d.id);
      notify(r.ok ? "Device removed" : r.error, { tone: r.ok ? "ok" : "error" });
    });

  const savePref = (type: ReminderType, patch: { on?: boolean; at?: string }) => {
    const next = { ...localPrefs, [type]: { ...localPrefs[type], ...patch } };
    setLocalPrefs(next);
    start(async () => {
      const r = await updateProfile({ reminders: next as Record<ReminderType, { on?: boolean; at?: string }> });
      if (!r.ok) notify(r.error, { tone: "error" });
    });
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Status: say plainly what does and doesn't work yet. */}
      <div className="flex flex-col gap-1.5 rounded-md bg-sunken/60 px-4 py-3 text-small">
        <StatusLine ok={pushReady} yes="Push keys configured on the server." no="Push keys (VAPID) aren't set in Vercel yet, so nothing can be sent." />
        <StatusLine
          ok={schedulerConfigured}
          yes="Scheduler secrets set. Reminders send automatically once the Supabase schedule is created (see README)."
          no="Scheduler not set up yet: reminders won't send on their own. Test notifications still work."
        />
        <StatusLine
          ok={verified.length > 0}
          yes={`Delivery confirmed on ${verified.map((d) => d.label ?? "a device").join(", ")}.`}
          no="Delivery not confirmed on any device yet. Send a test and tap “It arrived” when it shows up."
        />
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-body font-medium">This device</p>
        {support === "unsupported" ? (
          <p className="text-small text-ink-2">This browser can&apos;t receive push notifications. On your Pixel, use the installed LifeOS app (Chrome).</p>
        ) : permission === "denied" ? (
          <p className="text-small text-danger">
            Notifications are blocked for LifeOS here. On Android: long-press the LifeOS icon → App info → Notifications → allow, then reload.
          </p>
        ) : thisDevice ? (
          <p className="text-small text-ink-2">On for this device ({thisDevice.label ?? "unnamed"}).</p>
        ) : (
          <Button variant="primary" className="self-start" onClick={enable} pending={pending} disabled={!pushReady || support !== "ok"}>
            <BellRing size={15} aria-hidden />
            Turn on notifications here
          </Button>
        )}
      </div>

      {devices.length ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <p className="flex-1 text-body font-medium">Devices</p>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await sendTestPush();
                  if (!r.ok) return notify(r.error, { tone: "error" });
                  setResults(r.data!);
                  notify("Test sent. Check your phone.");
                })
              }
            >
              Send a test notification
            </Button>
          </div>
          <ul className="flex flex-col divide-y divide-rule border-y border-rule">
            {devices.map((d) => {
              const res = results?.find((x) => x.id === d.id);
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block">
                      {d.label ?? "Device"}
                      {d.endpoint === thisEndpoint ? <span className="text-small text-ink-2"> · this one</span> : null}
                    </span>
                    <span className="text-micro text-ink-2">
                      {d.verified_at ? `Delivery confirmed ${formatShortDay(d.verified_at, tz)}` : "Delivery not confirmed"}
                      {d.last_success_at ? ` · last sent ${formatShortDay(d.last_success_at, tz)} ${formatTime(d.last_success_at, tz)}` : ""}
                      {d.last_error ? ` · ${d.last_error}` : ""}
                    </span>
                    {res && !res.ok ? <span className="block text-micro text-danger">{res.error}</span> : null}
                  </span>
                  {res?.ok && !d.verified_at ? (
                    <>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() =>
                          start(async () => {
                            const r = await confirmPushArrived(d.id);
                            notify(r.ok ? "Delivery confirmed" : r.error, { tone: r.ok ? "ok" : "error" });
                          })
                        }
                      >
                        <Check size={14} aria-hidden />
                        It arrived
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => notify("See “If it doesn't arrive” below.", { tone: "error" })}>
                        It didn&apos;t
                      </Button>
                    </>
                  ) : null}
                  <IconButton label={`Remove ${d.label ?? "device"}`} size="sm" onClick={() => disable(d)}>
                    <X size={14} aria-hidden />
                  </IconButton>
                </li>
              );
            })}
          </ul>
          <details className="text-small text-ink-2">
            <summary className="cursor-pointer text-ink">If it doesn&apos;t arrive (Pixel / Android)</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Long-press the LifeOS icon → App info → Notifications: make sure they&apos;re allowed.</li>
              <li>Settings → Apps → Chrome → App battery usage → Unrestricted. Battery optimisation is the usual cause of late or missing reminders.</li>
              <li>Do Not Disturb and Bedtime mode hold notifications until they end.</li>
              <li>Remove the device here, then “Turn on notifications here” again on the phone.</li>
            </ul>
            <p className="mt-2">Even with all of that, Android can delay notifications by a few minutes. LifeOS can&apos;t guarantee exact timing.</p>
          </details>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <p className="flex-1 text-body font-medium">Reminders</p>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await previewDueNow();
                if (!r.ok) return notify(r.error, { tone: "error" });
                setPreview(r.data!);
              })
            }
          >
            What&apos;s due right now?
          </Button>
        </div>
        {preview ? (
          <div className="rounded-md border border-rule px-4 py-3 text-small">
            {preview.length ? (
              <ul className="flex flex-col gap-1.5">
                {preview.map((p, i) => (
                  <li key={i}>
                    <span className="font-medium">{p.title}</span> <span className="text-ink-2">· {p.body}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-2">Nothing is due in this 15-minute slot. (This only previews; it sends nothing.)</p>
            )}
          </div>
        ) : null}
        <ul className="flex flex-col divide-y divide-rule border-y border-rule">
          {schedule.map((r) => {
            const p = localPrefs[r.type];
            const on = p?.on ?? r.on;
            const time = r.type === "bedtime" ? r.time : (p?.at ?? r.time);
            return (
              <li key={r.type} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block">{r.label}</span>
                  <span className="text-micro text-ink-2">
                    {r.detail}
                    {r.muted ? " Muted: its tone is set to Quiet." : ""}
                  </span>
                </span>
                {r.type === "bedtime" ? (
                  <span className="text-small text-ink-2">{time ?? "set a bedtime target"}</span>
                ) : (
                  <input
                    type="time"
                    aria-label={`${r.label} time`}
                    value={time ?? ""}
                    disabled={!on}
                    onChange={(e) => e.target.value && savePref(r.type, { at: e.target.value })}
                    className="h-8 rounded-sm border border-rule bg-surface px-2 text-small disabled:opacity-50"
                  />
                )}
                <Switch label={`${r.label} on`} checked={on} onChange={(v) => savePref(r.type, { on: v })} />
              </li>
            );
          })}
        </ul>
        <p className="text-micro text-ink-3">Times are {tz}. Each reminder sends at most once a day, within about 15 minutes of its time.</p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-body font-medium">What you respond to</p>
        <ul className="flex flex-col gap-1 text-small text-ink-2">
          {learning.sentences.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        {learning.suggestions.length ? (
          <ul className="flex flex-col gap-2">
            {learning.suggestions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-md border border-rule px-3 py-2 text-small">
                <span className="flex-1">{s.text}</span>
                <Button
                  size="sm"
                  onClick={() => {
                    savePref(s.change.type, { ...(s.change.on !== undefined ? { on: s.change.on } : {}), ...(s.change.at ? { at: s.change.at } : {}) });
                    notify("Applied");
                  }}
                >
                  Apply
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-micro text-ink-3">
          Counted from what you open or do after a reminder (e.g. logging the habit within 4 hours). Nothing changes unless you press Apply.
        </p>
        {recent.length ? (
          <details className="text-small text-ink-2">
            <summary className="cursor-pointer text-ink">Recent reminders</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {recent.map((r) => (
                <li key={r.id}>
                  {formatShortDay(r.sent_at, tz)} {formatTime(r.sent_at, tz)} · {r.title}
                  {r.delivered ? (r.opened ? " · opened" : "") : " · not delivered"}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function StatusLine({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <p className="flex items-start gap-2">
      <span aria-hidden className={ok ? "mt-1.5 size-1.5 shrink-0 rounded-full bg-success" : "mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-3"} />
      <span className={ok ? "text-ink" : "text-ink-2"}>{ok ? yes : no}</span>
    </p>
  );
}
