import type { Metadata } from "next";
import { PlannedPage } from "@/components/shell/planned-page";

export const metadata: Metadata = { title: "Body" };

export default function BodyPage() {
  return (
    <PlannedPage
      title="Body"
      phase="Phase 5"
      lede="Gym, food and sleep together, because they pull on each other."
      coming={[
        "Pre-decided gym days around lectures and korfball, with a 30-minute minimum version that still counts",
        "Weekly load view: gym plus training plus matches, with 4 days as the committed baseline",
        "“Book your slot” reminders and your notes on quieter gym times",
        "Recipe library (staple / want to try / cooked it), meal plan with linked leftover lunches, shopping list",
        "Bedtime and wake-time log, a wind-down reminder, and an optional weigh-in whenever you get the chance",
        "Optional trackers, off by default: calories, protein target, key lifts",
      ]}
      limits={["There's no gym-booking integration, only reminders."]}
    />
  );
}
