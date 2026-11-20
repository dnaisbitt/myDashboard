import { REMINDERS, type ReminderType } from "./reminders";

/**
 * The honest "learning" feature: no hidden tuning. It counts what you opened or
 * acted on, describes it in plain words, and proposes changes you can apply or ignore.
 */
export type SentReminder = { type: ReminderType; hour: number; opened: boolean; acted: boolean };

type Rate = { sent: number; engaged: number; rate: number };
const rate = (rows: SentReminder[]): Rate => {
  const engaged = rows.filter((r) => r.opened || r.acted).length;
  return { sent: rows.length, engaged, rate: rows.length ? engaged / rows.length : 0 };
};

export type Band = "morning" | "afternoon" | "evening";
export const bandOf = (hour: number): Band => (hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening");

export type Suggestion = { id: string; text: string; change: { type: ReminderType; on?: boolean; at?: string } };

export type LearningSummary = {
  total: number;
  byType: Array<{ type: ReminderType; label: string } & Rate>;
  byBand: Record<Band, Rate>;
  sentences: string[];
  suggestions: Suggestion[];
  enoughData: boolean;
};

const MIN_TOTAL = 10;
const MIN_PER_GROUP = 5;

export function summariseLearning(rows: SentReminder[], current: Partial<Record<ReminderType, { at?: string | null; on?: boolean }>>): LearningSummary {
  const byType = (Object.keys(REMINDERS) as ReminderType[])
    .map((type) => ({ type, label: REMINDERS[type].label, ...rate(rows.filter((r) => r.type === type)) }))
    .filter((t) => t.sent > 0)
    .sort((a, b) => b.sent - a.sent);
  const byBand: Record<Band, Rate> = {
    morning: rate(rows.filter((r) => bandOf(r.hour) === "morning")),
    afternoon: rate(rows.filter((r) => bandOf(r.hour) === "afternoon")),
    evening: rate(rows.filter((r) => bandOf(r.hour) === "evening")),
  };
  const enoughData = rows.length >= MIN_TOTAL;
  const sentences: string[] = [];
  const suggestions: Suggestion[] = [];
  const pct = (r: number) => `${Math.round(r * 100)}%`;

  if (!enoughData) {
    sentences.push(`${rows.length} reminder${rows.length === 1 ? "" : "s"} so far. A summary appears after ${MIN_TOTAL}.`);
    return { total: rows.length, byType, byBand, sentences, suggestions, enoughData };
  }

  const bands = (Object.keys(byBand) as Band[]).filter((b) => byBand[b].sent >= MIN_PER_GROUP);
  if (bands.length >= 2) {
    const best = bands.reduce((a, b) => (byBand[b].rate > byBand[a].rate ? b : a));
    const worst = bands.reduce((a, b) => (byBand[b].rate < byBand[a].rate ? b : a));
    if (byBand[best].rate - byBand[worst].rate >= 0.25) {
      sentences.push(
        `You respond to ${best} reminders (${pct(byBand[best].rate)}) far more than ${worst} ones (${pct(byBand[worst].rate)}).`,
      );
      // Offer to move movable reminders out of the weak band into the strong one.
      const target = best === "morning" ? "08:30" : best === "afternoon" ? "13:00" : "19:00";
      for (const t of byType) {
        const at = current[t.type]?.at ?? REMINDERS[t.type].at;
        if (!at || t.type === "bedtime" || t.type === "weekly_review") continue;
        if (bandOf(Number(at.slice(0, 2))) === worst && t.sent >= MIN_PER_GROUP / 2) {
          suggestions.push({
            id: `move-${t.type}`,
            text: `Move “${t.label}” from ${at} to ${target}?`,
            change: { type: t.type, at: target },
          });
        }
      }
    } else {
      sentences.push("Your response is similar across the day, so timing isn't the problem.");
    }
  }

  for (const t of byType) {
    if (t.sent >= MIN_PER_GROUP && t.rate < 0.2) {
      sentences.push(`You acted on ${t.engaged} of ${t.sent} “${t.label}” reminders.`);
      suggestions.push({ id: `off-${t.type}`, text: `Turn off “${t.label}”? Fewer, better-timed nudges usually work better than more.`, change: { type: t.type, on: false } });
    } else if (t.sent >= MIN_PER_GROUP && t.rate >= 0.6) {
      sentences.push(`“${t.label}” works: you acted on ${pct(t.rate)} of them.`);
    }
  }
  if (!sentences.length) sentences.push("No strong pattern yet.");
  return { total: rows.length, byType, byBand, sentences, suggestions: suggestions.slice(0, 4), enoughData };
}
