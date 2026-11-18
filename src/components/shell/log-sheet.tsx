"use client";

import { BedDouble, Dumbbell, Smartphone, Utensils } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Planned } from "@/components/ui/misc";

const LOGS = [
  { icon: Dumbbell, label: "Gym done", phase: "Phase 5" },
  { icon: Utensils, label: "Cooked and ate well", phase: "Phase 5" },
  { icon: BedDouble, label: "Bedtime / wake time", phase: "Phase 5" },
  { icon: Smartphone, label: "Phone-down check-in", phase: "Phase 4" },
];

/** One-tap logging. The buttons are drawn but disabled until their tables exist. */
export function LogSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Quick log" description="One tap, then close the app.">
      <ul className="grid grid-cols-2 gap-2">
        {LOGS.map(({ icon: Icon, label, phase }) => (
          <li key={label}>
            <button
              type="button"
              disabled
              aria-disabled
              className="flex h-24 w-full flex-col items-start justify-between rounded-md border border-rule bg-canvas p-3 text-left text-small opacity-80"
            >
              <Icon size={18} strokeWidth={1.75} aria-hidden className="text-ink-2" />
              <span className="font-medium">{label}</span>
              <Planned phase={phase} />
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-small text-ink-2">
        The phone-down check-in is a self-report. LifeOS can&apos;t see or block other apps on your phone.
      </p>
    </Dialog>
  );
}
