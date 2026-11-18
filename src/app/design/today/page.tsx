import { notFound } from "next/navigation";
import { FixtureToday } from "./fixture-today";

export const metadata = { title: "Design · Today fixture" };

/** Dev-only. Renders the real Today components from a labelled fixture. */
export default function DesignTodayPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <FixtureToday />;
}
