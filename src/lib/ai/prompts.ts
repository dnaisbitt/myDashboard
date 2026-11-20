import type { AssistantContext } from "./context";

/**
 * Stable instructions. Kept byte-identical between requests so they cache.
 * Anything that changes (date, data) goes in the context block after this.
 */
export const RULES = `You are the planning assistant inside LifeOS, a private planner used by one university student in the UK (second-year computer science and AI). Your job is to help them decide what to do, plan realistic days and weeks, and notice when they are overcommitting.

What you know about them, from their own brief:
- Goals this year: a first-class degree; win BUCS with their korfball team; find and start a small side hustle (still exploring ideas); a serious gym and food routine (lose fat, gain muscle); less phone time and doomscrolling.
- Korfball training 2–4 times a week plus weekend matches. Gym target: 4 days a week is the committed baseline, 5–6 only as a bonus when the week allows. A 30-minute minimum session still counts.
- They focus in 30–60 minute blocks, each with one specific, concrete task. Group rooms are lower-focus; solo work suits the library or home. 10:00–16:00 is their drift window (phone, scrolling): put one small, specific task there rather than leaving it open. Their energy peaks in the evening, so hard coursework fits there.
- They follow external commitments (alarms, training, bookings, timed blocks) far better than intentions, so prefer anchors and pre-made decisions over willpower.
- They are trying to move gradually from evening person to morning person.

How to answer:
- Use only the data in the context snapshot. Never invent tasks, events, deadlines, numbers, habits or history. If something isn't in the snapshot, say you don't have it. Items listed under notTracked are not available to you.
- You cannot see their phone, apps, email, the university portal (MyLboro), gym booking system or bank, and you cannot change anything in LifeOS. You only suggest; they decide. Never claim to have scheduled, added, moved or booked anything.
- Prefer a realistic day over a packed one. If the plan doesn't fit, say what to drop or move, plainly.
- Be direct about deadlines ("Coursework due in 3 days, 0 hours scheduled"). Be encouraging, not preachy, about habits. No guilt-tripping.
- British English. Short. Lead with the answer. Use times from their schedule (24-hour clock). Use short bullet lists (at most 7 items) and bold sparingly. No headings unless asked for a review. No emoji.
- When you suggest focus blocks, give each one a concrete task, a length (30 or 60 min), a time that is actually free, and a place if relevant.`;

export function contextBlock(ctx: AssistantContext) {
  return `Context snapshot of their LifeOS data (JSON). Generated ${ctx.generatedAt}; their time zone is ${ctx.timezone}; today is ${ctx.today}.\n${JSON.stringify(ctx)}`;
}

export const QUICK_ACTIONS = {
  focus: {
    label: "What should I focus on today?",
    prompt: "What should I focus on today? Give me the one thing that matters most, then at most two more, with why, based on my deadlines, priorities and schedule.",
  },
  plan_day: {
    label: "Plan my day",
    prompt:
      "Plan the rest of my day around my fixed schedule. Use the free gaps for focus blocks with concrete tasks from my priorities and deadlines, keep the 10:00–16:00 drift window filled with one small task, and keep it realistic. Mention habits that are due today.",
  },
  plan_week: {
    label: "Plan my week",
    prompt:
      "Help me plan the coming week. Look at deadlines, project next steps, goals that have gone quiet, and my gym target versus korfball load. Suggest which days get which focus work, and flag anything that won't fit.",
  },
  overcommit: {
    label: "Am I overcommitted?",
    prompt:
      "Am I overcommitted? Check today's schedule and load, overdue items, deadlines in the next week, active projects and the gym plus korfball load. Say plainly what's too much and what to drop, defer or shrink.",
  },
  review: {
    label: "Weekly review",
    prompt:
      "Run a five-minute weekly review with me. Cover: what got done versus what was planned, goals that have gone quiet, habits that slipped or held, money left this week, and the three most important things for next week around training and deadlines. Use short headed sections.",
  },
} as const;

export type QuickAction = keyof typeof QUICK_ACTIONS;

export const BRIEFING_PROMPT =
  "Write my morning briefing for today in 4–6 short bullet points: the one thing that matters most, what's fixed in my schedule, deadlines to watch, a suggestion for the 10:00–16:00 drift window, and one habit or body note. Then one line if anything looks overcommitted. Nothing else.";

export const BREAKDOWN_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "One sentence on how you split it up." },
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "A concrete next action, starting with a verb, under 90 characters." },
          minutes: { type: "integer", description: "Rough estimate: 15, 30, 45, 60, 90 or 120." },
          due: { type: ["string", "null"], description: "yyyy-mm-dd only if a real deadline in the context implies one, otherwise null." },
        },
        required: ["title", "minutes", "due"],
        additionalProperties: false,
      },
    },
    questions: {
      type: "array",
      items: { type: "string" },
      description: "Up to 2 short questions if something essential is unclear. Empty if not needed.",
    },
  },
  required: ["summary", "tasks", "questions"],
  additionalProperties: false,
} as const;

export function breakdownPrompt(input: { text?: string; projectTitle?: string; projectDetail?: string }) {
  const subject = input.projectTitle
    ? `my project "${input.projectTitle}"${input.projectDetail ? ` (${input.projectDetail})` : ""}`
    : `this idea: "${input.text}"`;
  return `Break ${subject} into 3–8 concrete next actions I could each do in one sitting of 15–120 minutes. Order them so the first one is easy to start today. Don't repeat tasks that already exist in the context. If it's a vague idea (like a side-hustle idea), start with small tests that check whether it's worth doing.`;
}

export const PLAN_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "One or two sentences on the shape of the plan." },
    blocks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string", description: "yyyy-mm-dd" },
          start: { type: "string", description: "HH:MM, 24-hour, local time" },
          end: { type: "string", description: "HH:MM, 24-hour, local time" },
          title: { type: "string", description: "One concrete task, specific enough to know when it's done. Under 90 characters." },
          kind: { type: "string", enum: ["focus", "gym", "routine", "event"] },
          place: { type: ["string", "null"], enum: ["library", "home", "group_room", "other", null] },
          why: { type: "string", description: "Under 15 words: which deadline, priority or goal this serves." },
        },
        required: ["date", "start", "end", "title", "kind", "place", "why"],
        additionalProperties: false,
      },
    },
    warnings: { type: "array", items: { type: "string" }, description: "Up to 3 short notes: overcommitment, things that don't fit, what to drop." },
  },
  required: ["summary", "blocks", "warnings"],
  additionalProperties: false,
} as const;

export function planPrompt(scope: "day" | "week", fromKey: string, toKey: string, fixed: string) {
  return `Propose ${scope === "day" ? "the rest of today's" : "this coming week's"} time blocks, from ${fromKey} to ${toKey}, to add to my LifeOS schedule.

Already fixed (do not overlap any of these; cancelled ones are free):
${fixed}

Rules for the blocks you propose:
- Only use free time. Nothing in the past. Leave travel and meal gaps.
- Focus blocks are 30 or 60 minutes, each with one concrete task from my deadlines, priorities or project next steps. Hard coursework goes in the evening. If 10:00–16:00 is free on a day, put one small, specific 30-minute task in it.
- ${scope === "day" ? "At most 4 blocks." : "At most 3 blocks per day and 14 in total."} A realistic plan beats a packed one; leave real breaks.
- Only add gym blocks if my weekly gym count is below target and the day isn't already heavy with training or a match.
- Don't duplicate anything already in the fixed schedule.`;
}
