"use client";

import { Check, CircleAlert } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type ToastAction = { label: string; run: () => void };
type Toast = { id: number; message: string; tone: "ok" | "error"; action?: ToastAction };
type Ctx = { notify: (message: string, opts?: { tone?: Toast["tone"]; action?: ToastAction }) => void };

const ToastContext = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const notify = useCallback<Ctx["notify"]>((message, opts) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, message, tone: opts?.tone ?? "ok", action: opts?.action }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts?.action ? 6000 : 3200);
  }, []);

  return (
    <ToastContext value={{ notify }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(80px+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex animate-rise items-center gap-2.5 rounded-md bg-ink py-2.5 pr-2 pl-3.5 text-small text-canvas shadow-float",
              !t.action && "pr-4",
            )}
          >
            {t.tone === "error" ? (
              <CircleAlert size={15} className="text-mark" aria-hidden />
            ) : (
              <Check size={15} aria-hidden />
            )}
            <span>{t.message}</span>
            {t.action ? (
              <button
                type="button"
                className="rounded-[4px] px-2 py-1 font-medium underline-offset-2 hover:underline"
                onClick={() => {
                  t.action!.run();
                  setToasts((x) => x.filter((y) => y.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
