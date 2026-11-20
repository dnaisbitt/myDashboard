import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendNotification, setVapidDetails } from "web-push";

/**
 * Web Push via VAPID. Keys are generated once (npm run gen:secrets) and stored in env:
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY (public by design), VAPID_PRIVATE_KEY (secret), VAPID_SUBJECT.
 */
export function pushConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

let configured = false;
function configure() {
  if (configured) return;
  setVapidDetails(process.env.VAPID_SUBJECT!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configured = true;
}

export type PushPayload = { title: string; body: string; url: string; tag?: string };
export type DeviceResult = { id: string; label: string | null; ok: boolean; error?: string };

/**
 * Sends to every device the user has subscribed. Dead subscriptions (404/410)
 * are removed; other failures are recorded on the device row.
 * `client` must be scoped to this user (session client) or be the admin client
 * with userId filtering, which is why userId is always passed explicitly.
 */
export async function sendToUser(client: SupabaseClient, userId: string, payload: PushPayload): Promise<DeviceResult[]> {
  if (!pushConfigured()) throw new Error("Push isn't configured on the server (VAPID keys missing).");
  configure();
  const { data: subs, error } = await client.from("push_subscriptions").select("id,endpoint,p256dh,auth,label").eq("user_id", userId);
  if (error) throw new Error(`Couldn't read devices: ${error.message}`);

  const results: DeviceResult[] = [];
  for (const s of subs ?? []) {
    try {
      // TTL: drop the message if the phone is unreachable for 12 hours (a stale reminder is worse than none).
      await sendNotification(
        { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
        JSON.stringify(payload),
        { TTL: 12 * 3600, urgency: "normal" },
      );
      await client.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), last_error: null }).eq("id", s.id).eq("user_id", userId);
      results.push({ id: s.id as string, label: s.label as string | null, ok: true });
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await client.from("push_subscriptions").delete().eq("id", s.id).eq("user_id", userId);
        results.push({ id: s.id as string, label: s.label as string | null, ok: false, error: "This device's subscription expired and was removed. Enable notifications on it again." });
      } else {
        const msg = `Push service error${status ? ` ${status}` : ""}`;
        await client.from("push_subscriptions").update({ last_error: msg }).eq("id", s.id).eq("user_id", userId);
        results.push({ id: s.id as string, label: s.label as string | null, ok: false, error: msg });
      }
    }
  }
  return results;
}
