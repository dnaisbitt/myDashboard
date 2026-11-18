"use client";

/** Last-resort boundary (errors in the root layout). Plain HTML: the app's CSS may not have loaded. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-GB">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f3f4f1", color: "#15171a", padding: "64px 24px" }}>
        <main style={{ maxWidth: 520, margin: "0 auto" }}>
          <h1 style={{ fontWeight: 500 }}>LifeOS couldn&apos;t start</h1>
          <p style={{ color: "#5c6168" }}>
            {error.message?.startsWith("Could not") ? error.message : "Something went wrong while loading the app."}
          </p>
          {error.digest ? <p style={{ color: "#8a8f95", fontSize: 12 }}>Reference: {error.digest}</p> : null}
          <button onClick={reset} style={{ marginTop: 16, padding: "8px 16px" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
