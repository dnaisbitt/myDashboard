"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button, IconButton } from "./button";

/**
 * Native <dialog>: focus trap, Esc and an inert background for free.
 * Docks to the bottom as a sheet on phones, centred on larger screens.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

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
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby={titleId}
      className={cn(
        "m-0 max-h-[92dvh] w-full max-w-none overflow-visible bg-transparent p-0 text-ink",
        "fixed inset-x-0 top-auto bottom-0 sm:inset-0 sm:m-auto sm:h-fit sm:w-[min(92vw,520px)]",
        className,
      )}
    >
      {open ? (
        <div className="max-h-[92dvh] animate-rise overflow-y-auto rounded-t-lg border border-rule bg-surface shadow-float sm:animate-pop sm:rounded-lg">
          <div className="flex items-start gap-4 px-5 pt-5 sm:px-6">
            <div className="flex-1">
              <h2 id={titleId} className="text-title font-semibold tracking-[-0.01em]">
                {title}
              </h2>
              {description ? <div className="mt-1 text-small text-ink-2">{description}</div> : null}
            </div>
            <IconButton label="Close" size="sm" onClick={onClose} className="-mt-0.5 -mr-1.5">
              <X size={16} aria-hidden />
            </IconButton>
          </div>
          <div className="px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  body,
  confirmLabel = "Delete",
  pending,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  pending?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onCancel} title={title} description={body}>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} pending={pending} autoFocus>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
