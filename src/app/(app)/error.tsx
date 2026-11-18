"use client";

import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-6 pt-20" role="alert">
      <h1 className="font-display text-h2 font-normal">Something didn&apos;t load</h1>
      <p className="text-body text-ink-2">
        {error.message?.startsWith("Could not") ? error.message : "There was a problem talking to the database."} Your data is safe.
        Try again, and if it keeps happening check the Supabase project isn&apos;t paused.
      </p>
      {error.digest ? <p className="text-micro text-ink-3">Reference: {error.digest}</p> : null}
      <Button variant="primary" className="self-start" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
