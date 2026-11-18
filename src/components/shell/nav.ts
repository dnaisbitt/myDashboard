import {
  CalendarDays,
  HeartPulse,
  House,
  Inbox,
  ListChecks,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; phase?: string };

/** Desktop sidebar: exactly seven sections. */
export const NAV: NavItem[] = [
  { href: "/", label: "Today", icon: House },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/tasks", label: "Tasks & Projects", icon: ListChecks },
  { href: "/planner", label: "Planner", icon: CalendarDays, phase: "Phase 4" },
  { href: "/goals", label: "Goals & Habits", icon: Target, phase: "Phase 4" },
  { href: "/money", label: "Money", icon: Wallet, phase: "Phase 5" },
  { href: "/body", label: "Body", icon: HeartPulse, phase: "Phase 5" },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
