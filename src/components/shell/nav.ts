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

export type NavItem = { href: string; label: string; icon: LucideIcon; phase?: string; also?: string[] };

/** Desktop sidebar: exactly seven sections. */
export const NAV: NavItem[] = [
  { href: "/", label: "Today", icon: House },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/tasks", label: "Tasks & Projects", icon: ListChecks, also: ["/projects"] },
  { href: "/planner", label: "Planner", icon: CalendarDays },
  { href: "/goals", label: "Goals & Habits", icon: Target, also: ["/habits"] },
  { href: "/money", label: "Money", icon: Wallet, phase: "Phase 5" },
  { href: "/body", label: "Body", icon: HeartPulse, phase: "Phase 5" },
];

function matches(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function isActive(pathname: string, href: string, also: string[] = []) {
  return matches(pathname, href) || also.some((a) => matches(pathname, a));
}
