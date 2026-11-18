import { notFound } from "next/navigation";
import { Gallery } from "./gallery";

export const metadata = { title: "Design system" };

/** Dev-only component gallery: tokens, type and every primitive in both themes. */
export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Gallery />;
}
