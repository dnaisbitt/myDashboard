import { Wordmark } from "./wordmark";

/** Shown when the Supabase environment variables are missing. Real instructions, no fake app. */
export function SetupNotice() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <Wordmark />
      <h1 className="font-display text-h1 tracking-[-0.02em]">Connect your database</h1>
      <p className="text-ink-2">
        LifeOS needs a Supabase project to store your data. Nothing is shown here until it&apos;s connected. There is no demo
        data.
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-body">
        <li>Create a free Supabase project (region: London).</li>
        <li>
          Run the SQL in <code className="rounded bg-sunken px-1 text-small">supabase/migrations</code> in the SQL editor.
        </li>
        <li>
          Copy <code className="rounded bg-sunken px-1 text-small">.env.example</code> to{" "}
          <code className="rounded bg-sunken px-1 text-small">.env.local</code> and fill in the URL and publishable key.
        </li>
        <li>Restart the dev server.</li>
      </ol>
      <p className="text-small text-ink-2">Full steps are in README.md → Setup.</p>
    </main>
  );
}
