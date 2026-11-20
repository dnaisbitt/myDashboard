/* eslint-disable @typescript-eslint/no-unused-expressions -- ternary assertions read clearly here */
// Applies every SQL migration to an in-memory Postgres (PGlite) with a minimal
// stand-in for Supabase's auth schema, then checks RLS isolation and constraints.
// Run: npm run test:db
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "supabase", "migrations");
const db = new PGlite();
let failures = 0;

function ok(name) {
  console.log(`  ok   ${name}`);
}
function fail(name, detail) {
  failures++;
  console.log(`  FAIL ${name}${detail ? `: ${detail}` : ""}`);
}
async function expectError(name, sql, match) {
  try {
    await db.exec(sql);
    fail(name, "expected an error, got none");
  } catch (e) {
    if (match && !String(e.message).match(match)) fail(name, e.message);
    else ok(name);
  }
}

// --- Supabase stand-ins -----------------------------------------------------
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public to anon, authenticated;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  -- Like current Supabase projects: NO automatic table privileges for API roles.
  -- Migrations must grant explicitly (this is what caught the 42501 in production).
`);

// --- Apply migrations ---------------------------------------------------------
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
console.log(`Applying ${files.length} migration(s)`);
for (const f of files) {
  try {
    await db.exec(readFileSync(join(dir, f), "utf8"));
    ok(f);
  } catch (e) {
    fail(f, e.message);
    process.exit(1);
  }
}

// --- Behaviour checks ------------------------------------------------------------
const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
await db.exec(`insert into auth.users (id) values ('${A}'), ('${B}');`);

const asUser = (id) => `set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`;
const reset = `reset role;`;

console.log("Checks");
const profiles = await db.query(`select count(*)::int as n from public.profiles`);
profiles.rows[0].n === 2 ? ok("profile auto-created per user") : fail("profile auto-created", JSON.stringify(profiles.rows));

await db.exec(`${asUser(A)}
  insert into public.goals (id, title) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Get a first');
  insert into public.projects (id, title, goal_id) values ('aaaaaaaa-0000-0000-0000-000000000002', 'Dissertation', 'aaaaaaaa-0000-0000-0000-000000000001');
  insert into public.tasks (title, project_id) values ('Read 3 papers', 'aaaaaaaa-0000-0000-0000-000000000002');
  ${reset}`);
ok("owner can insert goal → project → task (user_id defaults to auth.uid())");

await db.exec(asUser(B));
const seen = await db.query(`select (select count(*) from public.tasks)::int as t, (select count(*) from public.goals)::int as g, (select count(*) from public.profiles)::int as p`);
const s = seen.rows[0];
s.t === 0 && s.g === 0 && s.p === 1
  ? ok("other user sees none of A's rows (and only their own profile)")
  : fail("RLS isolation", JSON.stringify(s));

const upd = await db.query(`update public.tasks set title = 'hijacked' returning id`);
upd.rows.length === 0 ? ok("other user cannot update A's tasks") : fail("RLS update isolation");
const del = await db.query(`delete from public.goals returning id`);
del.rows.length === 0 ? ok("other user cannot delete A's goals") : fail("RLS delete isolation");

await expectError(
  "other user cannot link a task to A's project (composite FK)",
  `insert into public.tasks (title, project_id) values ('sneaky', 'aaaaaaaa-0000-0000-0000-000000000002')`,
  /foreign key/,
);
await expectError(
  "cannot insert a row owned by someone else",
  `insert into public.tasks (title, user_id) values ('spoof', '${A}')`,
  /row-level security/,
);
await db.exec(reset);

await db.exec(asUser(A));
await db.exec(`insert into public.tasks (title, today_date, today_rank) values ('P1', '2026-11-18', 1)`);
await expectError(
  "only one task per priority rank per day",
  `insert into public.tasks (title, today_date, today_rank) values ('P1 again', '2026-11-18', 1)`,
  /duplicate key/,
);
await expectError("rank limited to 1..3", `insert into public.tasks (title, today_date, today_rank) values ('P4', '2026-11-18', 4)`, /check/);
await expectError("done requires completed_at", `insert into public.tasks (title, status) values ('x', 'done')`, /check/);
await expectError(
  "event must end after it starts",
  `insert into public.events (title, starts_at, ends_at) values ('x', '2026-11-18 10:00Z', '2026-11-18 09:00Z')`,
  /check/,
);

await db.exec(`delete from public.goals where id = 'aaaaaaaa-0000-0000-0000-000000000001'`);
const proj = await db.query(`select goal_id, user_id from public.projects where id = 'aaaaaaaa-0000-0000-0000-000000000002'`);
proj.rows[0]?.goal_id === null && proj.rows[0]?.user_id === A
  ? ok("deleting a goal unlinks its projects but keeps ownership")
  : fail("on delete set null (goal_id)", JSON.stringify(proj.rows));
await db.exec(reset);

// --- Phase 4 tables ---------------------------------------------------------------
await db.exec(asUser(A));
await db.exec(`
  insert into public.goals (id, title) values ('aaaaaaaa-0000-0000-0000-000000000009', 'Win BUCS');
  insert into public.timetable_sessions (id, title, weekday, start_time, end_time, starts_on, ends_on)
    values ('aaaaaaaa-0000-0000-0000-000000000010', 'ML lecture', 3, '09:00', '11:00', '2026-09-28', '2026-12-12');
  insert into public.session_exceptions (session_id, on_date) values ('aaaaaaaa-0000-0000-0000-000000000010', '2026-11-18');
  insert into public.habits (id, title, frequency, target_per_week, goal_id) values ('aaaaaaaa-0000-0000-0000-000000000011', 'Gym', 'weekly', 4, 'aaaaaaaa-0000-0000-0000-000000000009');
  insert into public.habit_logs (habit_id, on_date) values ('aaaaaaaa-0000-0000-0000-000000000011', '2026-11-18');
  insert into public.milestones (goal_id, title) values ('aaaaaaaa-0000-0000-0000-000000000009', 'Make the first team');
  insert into public.goal_updates (goal_id, body, progress) values ('aaaaaaaa-0000-0000-0000-000000000009', 'Good week', 20);
  update public.tasks set recurrence = '{"freq":"weekly","interval":1,"weekdays":[1]}', category = 'Uni' where title = 'P1';
`);
ok("owner can use timetable, exceptions, habits, logs, milestones, goal updates");
await expectError("one log per habit per day", `insert into public.habit_logs (habit_id, on_date) values ('aaaaaaaa-0000-0000-0000-000000000011', '2026-11-18')`, /duplicate key/);
await expectError("weekly habit needs a target", `insert into public.habits (title, frequency) values ('x', 'weekly')`, /check/);
await expectError("milestone needs exactly one parent", `insert into public.milestones (title) values ('orphan')`, /check/);
await expectError("bad recurrence rejected", `update public.tasks set recurrence = '{"freq":"hourly"}' where title = 'P1'`, /check/);
await db.exec(reset);
await db.exec(asUser(B));
const leak = await db.query(`select (select count(*) from public.timetable_sessions)::int a, (select count(*) from public.habits)::int b, (select count(*) from public.habit_logs)::int c, (select count(*) from public.milestones)::int d, (select count(*) from public.goal_updates)::int e, (select count(*) from public.session_exceptions)::int f`);
Object.values(leak.rows[0]).every((n) => n === 0) ? ok("phase 4 tables isolated between users") : fail("phase 4 isolation", JSON.stringify(leak.rows[0]));
await expectError(
  "cannot log against someone else's habit",
  `insert into public.habit_logs (habit_id, on_date) values ('aaaaaaaa-0000-0000-0000-000000000011', '2026-11-19')`,
  /foreign key/,
);
await db.exec(reset);

// --- Phase 5 tables ---------------------------------------------------------------
await db.exec(asUser(A));
await db.exec(`
  insert into public.budget_periods (title, starts_on, ends_on, opening_pence) values ('Term 1', '2026-09-28', '2026-12-12', 25000);
  insert into public.money_plan_items (kind, title, amount_pence, cadence, first_on) values ('income', 'Loan instalment', 300000, 'once', '2026-09-28');
  insert into public.transactions (occurred_on, amount_pence, category, import_key, source) values ('2026-11-18', 450, 'Food', 'k1', 'csv');
  insert into public.savings_goals (title, target_pence, goal_id) values ('Summer trip', 40000, 'aaaaaaaa-0000-0000-0000-000000000009');
  insert into public.workouts (on_date, kind) values ('2026-11-18', 'minimum');
  insert into public.sleep_logs (night_of, bed_at, wake_at) values ('2026-11-17', '2026-11-18 00:30Z', '2026-11-18 08:15Z');
  insert into public.daily_checkins (on_date, ate_well) values ('2026-11-18', true);
  insert into public.weigh_ins (on_date, kg) values ('2026-11-18', 78.4);
  insert into public.lift_entries (on_date, lift, kg, reps) values ('2026-11-18', 'Squat', 90, 5);
  insert into public.recipes (id, title, status) values ('aaaaaaaa-0000-0000-0000-000000000020', 'Bolognese', 'staple');
  insert into public.meal_plan (on_date, recipe_id) values ('2026-11-18', 'aaaaaaaa-0000-0000-0000-000000000020');
  insert into public.shopping_items (name) values ('Oats');
  insert into public.timetable_sessions (title, kind, weekday, start_time, end_time, starts_on, ends_on) values ('Gym', 'gym', 2, '17:00', '18:00', '2026-09-28', '2026-12-12');
`);
ok("owner can use money, body and food tables (gym as a timetable kind)");
await expectError("CSV rows de-duplicate on import key", `insert into public.transactions (occurred_on, amount_pence, import_key) values ('2026-11-18', 450, 'k1')`, /duplicate key/);
await expectError("zero-amount transaction rejected", `insert into public.transactions (occurred_on, amount_pence) values ('2026-11-18', 0)`, /check/);
await expectError("sleep must end after it starts", `insert into public.sleep_logs (night_of, bed_at, wake_at) values ('2026-11-10', '2026-11-11 08:00Z', '2026-11-11 07:00Z')`, /check/);
await expectError("one dinner per evening", `insert into public.meal_plan (on_date, note) values ('2026-11-18', 'pasta')`, /duplicate key/);
await db.exec(reset);
await db.exec(asUser(B));
const leak5 = await db.query(`select
  (select count(*) from public.budget_periods)::int a, (select count(*) from public.transactions)::int b,
  (select count(*) from public.savings_goals)::int c, (select count(*) from public.workouts)::int d,
  (select count(*) from public.sleep_logs)::int e, (select count(*) from public.weigh_ins)::int f,
  (select count(*) from public.recipes)::int g, (select count(*) from public.meal_plan)::int h,
  (select count(*) from public.shopping_items)::int i, (select count(*) from public.money_plan_items)::int j,
  (select count(*) from public.daily_checkins)::int k, (select count(*) from public.lift_entries)::int l`);
Object.values(leak5.rows[0]).every((n) => n === 0) ? ok("phase 5 tables isolated between users") : fail("phase 5 isolation", JSON.stringify(leak5.rows[0]));
await expectError(
  "cannot plan a meal with someone else's recipe",
  `insert into public.meal_plan (on_date, recipe_id) values ('2026-11-19', 'aaaaaaaa-0000-0000-0000-000000000020')`,
  /foreign key/,
);
await db.exec(reset);

// --- Phase 6 tables ---------------------------------------------------------------
await db.exec(asUser(A));
await db.exec(`
  insert into public.ai_usage (kind, model, input_tokens, output_tokens, cost_micro_usd) values ('chat', 'claude-opus-5-5', 5000, 400, 28000);
  insert into public.ai_briefings (on_date, content, model) values ('2026-11-19', 'Focus on coursework.', 'claude-opus-5-5');
`);
ok("owner can record AI usage and a briefing");
await expectError("usage ledger can't be edited (append-only)", `update public.ai_usage set cost_micro_usd = 0`, /permission denied/);
await expectError("usage ledger can't be deleted from the app", `delete from public.ai_usage`, /permission denied/);
await expectError("one briefing per day", `insert into public.ai_briefings (on_date, content, model) values ('2026-11-19', 'x', 'm')`, /duplicate key/);
await db.exec(reset);
await db.exec(asUser(B));
const leak6 = await db.query(`select (select count(*) from public.ai_usage)::int a, (select count(*) from public.ai_briefings)::int b`);
leak6.rows[0].a === 0 && leak6.rows[0].b === 0 ? ok("AI tables isolated between users") : fail("phase 6 isolation");
await db.exec(reset);

await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`);
await expectError("anonymous role has no table access", `select * from public.tasks`, /permission denied/);
await db.exec(reset);

console.log(failures ? `\n${failures} check(s) failed` : "\nAll database checks passed");
process.exit(failures ? 1 : 0);
