import { Suspense } from "react";
import { AppShell, ViewerSync } from "@/components/shell/app-shell";
import { SetupNotice } from "@/components/shell/setup-notice";
import { aiStatusMessage, resolveAiStatus } from "@/lib/ai/provider";
import { getProfile } from "@/lib/data/viewer";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * The shell (sidebar, bars) is static and prerendered. Anything that reads the
 * session streams in behind Suspense, so navigation stays instant.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  return (
    <AppShell
      bridge={
        <Suspense fallback={null}>
          <ViewerBridge />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}

async function ViewerBridge() {
  const profile = await getProfile();
  const status = resolveAiStatus(profile.ai_enabled);
  return (
    <ViewerSync
      viewer={{
        tz: profile.timezone,
        name: profile.display_name,
        aiReady: status.state === "ready",
        aiMessage: aiStatusMessage(status),
      }}
    />
  );
}
