import { addDaysToKey, isoWeekday, localToIso } from "./time";

/**
 * Minimal, dependency-free .ics reader for timetable imports.
 * Handles: VEVENT, SUMMARY, LOCATION, DTSTART/DTEND (UTC "Z", TZID=…, floating,
 * all-day dates are skipped), RRULE FREQ=WEEKLY with INTERVAL / BYDAY / UNTIL / COUNT,
 * and EXDATE. Anything else is ignored rather than guessed.
 */
export type IcsEvent = { title: string; startsAt: string; endsAt: string; location: string | null };

type Raw = Record<string, { value: string; params: Record<string, string> }[]>;

function unfold(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function unescape(v: string) {
  return v.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}

function parseLine(line: string) {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const [name, ...paramParts] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const [k, v] = p.split("=");
    if (k && v) params[k.toUpperCase()] = v.replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

function validZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** ICS date-time → { key, hhmm, iso }. Returns null for all-day values. */
function toInstant(value: string, params: Record<string, string>, fallbackTz: string) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m || params.VALUE === "DATE" || !m[4]) return null;
  const key = `${m[1]}-${m[2]}-${m[3]}`;
  const hhmm = `${m[4]}:${m[5]}`;
  if (m[7] === "Z") {
    const iso = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))).toISOString();
    return { key, hhmm, iso, utc: true };
  }
  const tz = params.TZID && validZone(params.TZID) ? params.TZID : fallbackTz;
  return { key, hhmm, iso: localToIso(key, hhmm, tz), utc: false, tz };
}

const BYDAY: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };

export function parseIcs(text: string, opts: { tz: string; fromKey: string; toKey: string; max?: number }): { events: IcsEvent[]; skipped: number } {
  const lines = unfold(text).split("\n");
  const raws: Raw[] = [];
  let cur: Raw | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") {
      if (cur) raws.push(cur);
      cur = null;
    } else if (cur) {
      const p = parseLine(line);
      if (p) (cur[p.name] ??= []).push({ value: p.value, params: p.params });
    }
  }

  const out: IcsEvent[] = [];
  let skipped = 0;
  const max = opts.max ?? 600;

  for (const r of raws) {
    const title = unescape(r.SUMMARY?.[0]?.value ?? "") || "Untitled";
    const location = r.LOCATION?.[0] ? unescape(r.LOCATION[0].value) || null : null;
    const ds = r.DTSTART?.[0];
    const de = r.DTEND?.[0];
    const start = ds ? toInstant(ds.value, ds.params, opts.tz) : null;
    if (!start) {
      skipped++;
      continue;
    }
    const end = de ? toInstant(de.value, de.params, opts.tz) : null;
    const durationMs = end ? Date.parse(end.iso) - Date.parse(start.iso) : 60 * 60_000;
    if (durationMs <= 0) {
      skipped++;
      continue;
    }

    const exdates = new Set(
      (r.EXDATE ?? []).flatMap((x) => x.value.split(",").map((v) => toInstant(v, x.params, opts.tz)?.iso).filter(Boolean) as string[]),
    );
    const push = (iso: string) => {
      if (exdates.has(iso)) return;
      const key = iso.slice(0, 10);
      if (key < opts.fromKey || key > addDaysToKey(opts.toKey, 1)) return;
      out.push({ title, location, startsAt: iso, endsAt: new Date(Date.parse(iso) + durationMs).toISOString() });
    };

    const rrule = r.RRULE?.[0]?.value;
    if (!rrule) {
      push(start.iso);
      continue;
    }
    const rule = Object.fromEntries(rrule.split(";").map((p) => p.split("=") as [string, string]));
    if (rule.FREQ !== "WEEKLY") {
      // Only weekly repeats are expanded (that's what timetables use); the first occurrence is still imported.
      push(start.iso);
      skipped++;
      continue;
    }
    const interval = Math.max(1, Number(rule.INTERVAL) || 1);
    const days = rule.BYDAY ? rule.BYDAY.split(",").map((d) => BYDAY[d.slice(-2)]).filter(Boolean) : [isoWeekday(start.key)];
    const until = rule.UNTIL ? toInstant(rule.UNTIL.length === 8 ? `${rule.UNTIL}T235959Z` : rule.UNTIL, {}, opts.tz)?.key : null;
    const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
    const lastKey = until && until < opts.toKey ? until : opts.toKey;
    const weekStart = addDaysToKey(start.key, 1 - isoWeekday(start.key));
    let produced = 0;
    for (let w = 0; produced < count; w += interval) {
      const ws = addDaysToKey(weekStart, 7 * w);
      if (ws > lastKey) break;
      for (const d of [...days].sort()) {
        const key = addDaysToKey(ws, d - 1);
        if (key < start.key || key > lastKey || produced >= count) continue;
        produced++;
        const iso = start.utc
          ? new Date(Date.parse(start.iso) + (Date.parse(`${key}T00:00:00Z`) - Date.parse(`${start.key}T00:00:00Z`))).toISOString()
          : localToIso(key, start.hhmm, start.tz ?? opts.tz);
        push(iso);
      }
      if (out.length > max) break;
    }
  }
  out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { events: out.slice(0, max), skipped };
}
