import { notFound } from "next/navigation";
import { FixturePlanner } from "./fixture-planner";

export const metadata = { title: "Design · Planner fixture" };

export default function DesignPlannerPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <FixturePlanner />;
}
