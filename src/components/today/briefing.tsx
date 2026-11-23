"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Markdown } from "@/components/ai/markdown";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/misc";
import { formatTime } from "@/lib/time";

/**
 * Today's AI briefing. Written only when you press the button (so opening the
 * app never costs anything), then kept for the rest of the day.
 */
export function Briefing({
  ready,
  message,
  briefing,
  tz,
}: {
  ready: boolean;
  message: string;
  briefing: { content: string; createdAt: string } | null;
  tz: string;
}) {
  const { openAssistant } = useShell();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function write() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/ai/briefing", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "Couldn't write the briefing.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't write the briefing.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="briefing-title" className="flex flex-col gap-2">
      <SectionHeader
        id="briefing-title"
        title="Briefing"
        count={briefing ? `written ${formatTime(briefing.createdAt, tz)}` : undefined}
        action={
          ready ? (
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={openAssistant}>
              Ask
            </Button>
          ) : null
        }
      />
      {!ready ? (
        <div className="flex items-start gap-3 rounded-md border border-dashed border-rule px-4 py-4">
          <Sparkles size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
          <div className="flex flex-col gap-1">
            <p className="text-body font-medium">Assistant not configured</p>
            <p className="text-small text-ink-2">{message}</p>
          </div>
        </div>
      ) : briefing ? (
        <div className="flex flex-col gap-3 border-y border-rule py-3 text-body leading-relaxed">
          <Markdown text={briefing.content} />
          <button type="button" onClick={write} disabled={loading} className="self-start text-micro text-ink-3 hover:text-ink">
            {loading ? "Rewriting…" : "Rewrite with the latest data"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-rule px-4 py-4">
          <p className="text-small text-ink-2">A short read of today from your own data.</p>
          <Button size="sm" variant="secondary" pending={loading} onClick={write}>
            <Sparkles size={14} aria-hidden />
            Write today&apos;s briefing
          </Button>
        </div>
      )}
      {error ? <p className="text-small text-danger">{error}</p> : null}
    </section>
  );
}
