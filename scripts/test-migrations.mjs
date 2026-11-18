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

await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`);
await expectError("anonymous role has no table access", `select * from public.tasks`, /permission denied/);
await db.exec(reset);

console.log(failures ? `\n${failures} check(s) failed` : "\nAll database checks passed");
process.exit(failures ? 1 : 0);
