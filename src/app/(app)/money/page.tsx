import type { Metadata } from "next";
import { PlannedPage } from "@/components/shell/planned-page";

export const metadata: Metadata = { title: "Money" };

export default function MoneyPage() {
  return (
    <PlannedPage
      title="Money"
      phase="Phase 5"
      lede="A term-by-term budget built around your loan instalments, ending in one number: what's left this week."
      coming={[
        "Instalments in, rent and bills committed, “£X left this week”",
        "Spend logging in a few seconds, categories, recurring income and expenses",
        "CSV import from your bank's export",
        "Savings goals linked to Goals, and simple charts",
      ]}
      limits={[
        "No bank connection. If you opt in later, only through a regulated provider.",
        "LifeOS never stores banking passwords or card details.",
      ]}
    />
  );
}
