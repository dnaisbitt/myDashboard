import type { Metadata } from "next";
import { PlannedPage } from "@/components/shell/planned-page";

export const metadata: Metadata = { title: "Goals & Habits" };

export default function GoalsPage() {
  return (
    <PlannedPage
      title="Goals & Habits"
      phase="Phase 4"
      lede="The five ambitions for this year, and the daily behaviour that moves them."
      coming={[
        "Goals with target, deadline, milestones, steps, status updates and progress",
        "Links: task → project → goal, habit → goal, savings target → goal",
        "Habits with daily, weekly or custom frequency, streaks, history and statistics",
        "Side hustle as an open project: capture ideas, test them, pick one",
        "Phone-down daily check-in (self-report)",
      ]}
      limits={["LifeOS can't block apps or read screen time. The phone goal is tracked as an honest daily self-report."]}
    />
  );
}
