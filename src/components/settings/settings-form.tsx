"use client";

import { useState, useTransition, type ReactNode } from "react";
import { updateProfile } from "@/app/actions/profile";
import { ThemeControl } from "@/components/theme/theme-control";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import type { Profile, Tone, ToneArea } from "@/lib/types";

const TONE_AREAS: Array<{ key: ToneArea; label: string; example: Record<Tone, string> }> = [
  {
    key: "habits",
    label: "Habits you're building (gym routine)",
    example: { gentle: "Gym's pencilled in at 17:00. Even 30 minutes counts.", direct: "Gym at 17:00.", quiet: "No nudge. Shown on Today only." },
  },
  {
    key: "wake",
    label: "Wake time and bedtime",
    example: { gentle: "Wind-down in 20 minutes, so tomorrow's 07:45 feels easier.", direct: "Bed by 23:30.", quiet: "No nudge." },
  },
  {
    key: "deadlines",
    label: "Deadlines",
    example: { gentle: "Coursework is due in 3 days. Want to block an evening?", direct: "Coursework due in 3 days, 0 hours scheduled.", quiet: "Listed on Today only." },
  },
  {
    key: "exams",
    label: "Exams",
    example: { gentle: "ML exam in 12 days. A first revision block this week?", direct: "ML exam in 12 days, 2 of 8 topics covered.", quiet: "Listed on Today only." },
  },
  {
    key: "optional",
    label: "Optional trackers",
    example: { gentle: "Protein target today?", direct: "Log protein.", quiet: "No nudge." },
  },
];

function Section({ id, title, aside, children }: { id?: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="grid grid-cols-1 scroll-mt-20 gap-4 border-t border-rule py-8 md:grid-cols-[220px_1fr] md:gap-10">
      <div>
        <h2 className="text-body font-semibold">{title}</h2>
        {aside ? <div className="mt-1 text-small text-ink-2">{aside}</div> : null}
      </div>
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </section>
  );
}

export function SettingsForm({
  profile,
  ai,
}: {
  profile: Profile;
  ai: { message: string; providerConfigured: boolean; model: string | null; spend: { month: string; cap: string } | null };
}) {
  const { notify } = useToast();
  const [pending, start] = useTransition();
  const [name, setName] = useState(profile.display_name ?? "");
  const [timezone, setTimezone] = useState(profile.timezone);
  const [tone, setTone] = useState(profile.tone);
  const [trackers, setTrackers] = useState(profile.trackers);
  const [aiEnabled, setAiEnabled] = useState(profile.ai_enabled);

  const save = (patch: Parameters<typeof updateProfile>[0], message = "Saved") =>
    start(async () => {
      const res = await updateProfile(patch);
      notify(res.ok ? message : res.error, { tone: res.ok ? "ok" : "error" });
    });

  return (
    <div className="flex flex-col">
      <Section title="Profile" aside="Used for your greeting and every date and time.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save({ display_name: name, timezone });
          }}
        >
          <Field label="Name">
            {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />}
          </Field>
          <Field label="Time zone" hint="IANA name, e.g. Europe/London. Keep this when travelling unless you move.">
            {(id, d) => <Input id={id} aria-describedby={d} value={timezone} onChange={(e) => setTimezone(e.target.value)} />}
          </Field>
          <Button type="submit" variant="primary" size="sm" className="self-start" pending={pending}>
            Save profile
          </Button>
        </form>
      </Section>

      <Section title="Appearance" aside="Theme is saved per device, so the laptop and phone can differ.">
        <ThemeControl />
      </Section>

      <Section
        title="Tone"
        aside="How reminders talk to you, per area. Fewer, better-timed nudges usually beat a different tone. Reminders themselves arrive in Phase 7."
      >
        {TONE_AREAS.map((area) => (
          <div key={area.key} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-body">{area.label}</span>
              <Segmented<Tone>
                label={area.label}
                value={tone[area.key]}
                disabled={pending}
                onChange={(v) => {
                  const next = { ...tone, [area.key]: v };
                  setTone(next);
                  save({ tone: next }, "Tone saved");
                }}
                options={[
                  { value: "gentle", label: "Gentle" },
                  { value: "direct", label: "Direct" },
                  { value: "quiet", label: "Quiet" },
                ]}
              />
            </div>
            <p className="text-small text-ink-2 italic">“{area.example[tone[area.key]]}”</p>
          </div>
        ))}
      </Section>

      <Section title="Optional trackers" aside="All off by default. They appear in Body (Phase 5) only if switched on.">
        {(
          [
            ["calories", "Calorie tracking", "Detailed tracking is tedious. Leave off unless you want it."],
            ["protein", "Daily protein target (yes/no)", "One tap a day."],
            ["lifts", "Strength progress on key lifts", "Log a top set when you feel like it."],
          ] as const
        ).map(([key, label, hint]) => (
          <div key={key} className="flex items-start justify-between gap-4">
            <div>
              <p className="text-body">{label}</p>
              <p className="text-small text-ink-2">{hint}</p>
            </div>
            <Switch
              label={label}
              checked={trackers[key]}
              disabled={pending}
              onChange={(v) => {
                const next = { ...trackers, [key]: v };
                setTrackers(next);
                save({ trackers: next });
              }}
            />
          </div>
        ))}
      </Section>

      <Section id="assistant" title="Assistant" aside="Off by default. Reads a snapshot of your LifeOS data per request and only suggests.">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-body">Use the AI assistant</p>
            <p className="text-small text-ink-2">{ai.message}</p>
          </div>
          <Switch
            label="Use the AI assistant"
            checked={aiEnabled}
            disabled={pending}
            onChange={(v) => {
              setAiEnabled(v);
              save({ ai_enabled: v }, v ? "Assistant switched on" : "Assistant switched off");
            }}
          />
        </div>
        <div className="rounded-md bg-sunken/60 px-4 py-3 text-small text-ink-2">
          <p>
            Server provider key: <span className="font-medium text-ink">{ai.providerConfigured ? "present" : "not set"}</span>
            {ai.model ? (
              <>
                {" "}· model <span className="font-medium text-ink">{ai.model}</span>
              </>
            ) : null}
            . Keys live only in server environment variables and never reach this page.
          </p>
          {ai.spend ? (
            <p className="mt-2">
              This month: <span className="font-medium text-ink">{ai.spend.month}</span> of the {ai.spend.cap} app limit (an estimate from
              token counts). When the limit is reached the assistant pauses until the 1st.
            </p>
          ) : null}
          <p className="mt-2">
            Each time you ask, a snapshot of your LifeOS data (tasks, schedule, habits, goals, money and body summaries) is sent to
            Anthropic to answer. Nothing is sent while the assistant is off or when you don&apos;t ask.
          </p>
          <p className="mt-2">Conversations aren&apos;t saved. Only token counts and the estimated cost of each request are stored, plus today&apos;s briefing.</p>
          <p className="mt-2">
            A Claude Pro subscription doesn&apos;t include API access. API use is billed per token through the Claude Console. Set a
            monthly spend limit there (around £5) before adding a key.
          </p>
        </div>
      </Section>

      <Section title="Honest limits">
        <ul className="flex flex-col gap-2 text-small text-ink-2">
          <li>No automatic MyLboro sync. Timetable is entered once; optional .ics import.</li>
          <li>No phone blocking or screen-time monitoring. The phone goal is a self-report.</li>
          <li>No gym-booking integration. Reminders only.</li>
          <li>Android battery optimisation can delay push notifications.</li>
          <li>No bank connection unless you opt in later through a regulated provider.</li>
          <li>The assistant is off until it&apos;s configured.</li>
          <li>Reminders depend on Android delivering them; battery optimisation can delay them.</li>
        </ul>
      </Section>
    </div>
  );
}
