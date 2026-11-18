import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

/** A fresh Supabase client per request, acting as the signed-in user (RLS applies). */
export async function createClient() {
  // Read cookies first: marks the caller as request-time so it is never prerendered.
  const cookieStore = await cookies();
  const env = supabaseEnv();
  if (!env) throw new Error("Supabase is not configured. See README → Setup.");

  return createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session on every request, so this is safe to ignore.
        }
      },
    },
  });
}
