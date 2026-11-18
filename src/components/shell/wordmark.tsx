import { cn } from "@/lib/cn";

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display text-[1.375rem] leading-none font-medium tracking-[-0.02em]", className)}>
      Life<span className="italic">OS</span>
    </span>
  );
}
