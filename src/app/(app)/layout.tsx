import { unstable_rethrow } from "next/navigation";
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
  // A failure here must not take down the whole layout: the page below has its
  // own error boundary that shows the real reason. Keep the shell's defaults.
  let profile;
  try {
    profile = await getProfile();
  } catch (e) {
    unstable_rethrow(e); // let redirects (e.g. to /login) and dynamic-render signals through
    console.error("ViewerBridge:", e);
    return null;
  }
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
