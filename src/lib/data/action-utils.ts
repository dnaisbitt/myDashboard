import "server-only";
import { z } from "zod";
import { DEFAULT_TZ } from "@/lib/time";
import { getActionViewer } from "./viewer";

export const NOT_SIGNED_IN = { ok: false, error: "You're signed out. Sign in again." } as const;
export const uuid = z.uuid();
export const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");
export const timeSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Pick a time.");

/** Log the real error server-side; show the user a plain sentence. */
export function fail(message: string, detail?: { message: string } | null): { ok: false; error: string } {
  if (detail) console.error(message, detail.message);
  return { ok: false, error: message };
}

export function firstIssue(e: z.ZodError) {
  return e.issues[0]?.message ?? "Invalid input.";
}

export async function viewerWithTz() {
  const v = await getActionViewer();
  if (!v) return null;
  const { data } = await v.supabase.from("profiles").select("timezone").eq("id", v.userId).maybeSingle();
  return { ...v, tz: (data?.timezone as string | undefined) ?? DEFAULT_TZ };
}

export type ActionClient = NonNullable<Awaited<ReturnType<typeof getActionViewer>>>["supabase"];
