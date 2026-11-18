"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getActionViewer } from "@/lib/data/viewer";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const tone = z.enum(["gentle", "direct", "quiet"]);

const profileSchema = z.object({
  display_name: z.string().trim().max(60).nullable().optional(),
  timezone: z
    .string()
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en-GB", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Unknown time zone.")
    .optional(),
  tone: z.object({ habits: tone, wake: tone, deadlines: tone, exams: tone, optional: tone }).optional(),
  trackers: z.object({ calories: z.boolean(), protein: z.boolean(), lifts: z.boolean() }).optional(),
  ai_enabled: z.boolean().optional(),
});

export async function updateProfile(input: z.input<typeof profileSchema>): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = await getActionViewer();
  if (!v) return { ok: false, error: "You're signed out. Sign in again." };
  const patch = { ...parsed.data };
  if (patch.display_name !== undefined) patch.display_name = patch.display_name || null;
  const { error } = await v.supabase.from("profiles").update(patch).eq("id", v.userId);
  if (error) {
    console.error("updateProfile", error.message);
    return { ok: false, error: "Couldn't save settings." };
  }
  refresh();
  return { ok: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
