"use client";

import { Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { IconButton } from "@/components/ui/button";

/**
 * Slide-out assistant panel. Until Phase 6 it only states its real status.
 * It never shows sample conversations or invented output.
 */
export function AssistantDrawer({
  open,
  onClose,
  ready,
  message,
}: {
  open: boolean;
  onClose: () => void;
  ready: boolean;
  message: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="assistant-title"
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-[420px] bg-transparent p-0 text-ink"
    >
      {open ? (
        <div className="flex h-full animate-[rise_200ms_var(--ease-out-soft)] flex-col border-l border-rule bg-surface shadow-float">
          <div className="flex items-center gap-2 border-b border-rule px-5 py-4">
            <Sparkles size={16} aria-hidden />
            <h2 id="assistant-title" className="flex-1 text-body font-semibold">
              Assistant
            </h2>
            <IconButton label="Close assistant" size="sm" onClick={onClose}>
              <X size={16} aria-hidden />
            </IconButton>
          </div>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-6">
            <p className="text-body font-medium">{ready ? "Ready" : "Not configured"}</p>
            <p className="text-small text-ink-2">{message}</p>
            <div className="rounded-md border border-dashed border-rule p-4 text-small text-ink-2">
              <p className="font-medium text-ink">When it&apos;s switched on (Phase 6) it will</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>plan your day and week from your real tasks and schedule</li>
                <li>break projects into concrete steps</li>
                <li>flag overcommitment before you commit</li>
                <li>run your Sunday weekly review with you</li>
              </ul>
              <p className="mt-3">It only sees what LifeOS stores. It can&apos;t see your phone, email, MyLboro or bank.</p>
            </div>
          </div>
          <div className="border-t border-rule px-5 py-4">
            <label htmlFor="assistant-input" className="sr-only">
              Message the assistant
            </label>
            <input
              id="assistant-input"
              disabled
              placeholder={ready ? "Ask about your day…" : "Assistant is off"}
              className="h-10 w-full rounded-sm border border-rule bg-canvas px-3 text-body placeholder:text-ink-3 disabled:opacity-60"
            />
            <p className="mt-2 text-micro text-ink-3">
              <Link href="/settings#assistant" onClick={onClose} className="underline underline-offset-2 hover:text-ink">
                Assistant settings
              </Link>
            </p>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
