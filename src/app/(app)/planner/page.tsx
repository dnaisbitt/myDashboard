import type { Metadata } from "next";
import { PlannedPage } from "@/components/shell/planned-page";

export const metadata: Metadata = { title: "Planner" };

export default function PlannerPage() {
  return (
    <PlannedPage
      title="Planner"
      phase="Phase 4"
      lede="Your week around fixed anchors: lectures, training, matches. Then focus blocks and gym days pencilled into the gaps."
      coming={[
        "Weekly lecture timetable, entered once, with one-tap “cancelled this week”",
        "Day, week and month views with drag-to-reschedule",
        "30 and 60-minute focus blocks, each with one concrete task and a location tag",
        "Morning and evening routines, and gentle wake-time shifting (about 15 minutes a week)",
        "Rescheduling unfinished tasks, and an overload warning before a day gets unrealistic",
        "Optional .ics import",
      ]}
      limits={["MyLboro has no calendar export, so there's no automatic timetable sync. You enter it once, or import an .ics file if one becomes available."]}
    />
  );
}
