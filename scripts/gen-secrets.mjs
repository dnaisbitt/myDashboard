// Generates the secrets reminders need. Run it yourself: npm run gen:secrets
// It prints env lines to YOUR terminal only. Paste them into Vercel (and .env.local
// for local testing). Never commit them or paste them into chats.
import { randomBytes } from "node:crypto";
import { generateVAPIDKeys } from "web-push";

const vapid = generateVAPIDKeys();
const cron = randomBytes(32).toString("hex");

console.log(`
# --- Add these in Vercel → Settings → Environment Variables (Production) ---
NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapid.publicKey}
VAPID_PRIVATE_KEY=${vapid.privateKey}
VAPID_SUBJECT=https://YOUR-APP.vercel.app
CRON_SECRET=${cron}
# SUPABASE_SECRET_KEY: copy from Supabase → Project Settings → API Keys → Secret key

# --- In the Supabase SQL editor (supabase/setup/reminders-cron.sql), use the SAME CRON_SECRET ---
`);
