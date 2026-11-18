"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Planned, SectionHeader } from "@/components/ui/misc";
import { useShell } from "@/components/shell/shell-context";

/** The AI briefing slot. Shows real status only, never sample output. */
export function Briefing({ ready, message }: { ready: boolean; message: string }) {
  const { openAssistant } = useShell();
  return (
    <section aria-labelledby="briefing-title" className="flex flex-col gap-2">
      <SectionHeader id="briefing-title" title="Briefing" action={<Planned phase="Phase 6" />} />
      <div className="flex items-start gap-3 rounded-md border border-dashed border-rule px-4 py-4">
        <Sparkles size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
        <div className="flex flex-col gap-2">
          <p className="text-body font-medium">{ready ? "Assistant ready" : "Assistant not configured"}</p>
          <p className="text-small text-ink-2">{message}</p>
          <Button size="sm" variant="ghost" className="-ml-3 self-start" onClick={openAssistant}>
            Open assistant panel
          </Button>
        </div>
      </div>
    </section>
  );
}
