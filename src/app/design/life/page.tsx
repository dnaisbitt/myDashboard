import { notFound } from "next/navigation";
import { FixtureLife } from "./fixture-life";

export const metadata = { title: "Design · Money & Body fixture" };

export default function DesignLifePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <FixtureLife />;
}
