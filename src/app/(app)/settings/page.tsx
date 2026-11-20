import type { Metadata } from "next";
import { Suspense } from "react";
import { signOut } from "@/app/actions/profile";
import { PageFrame, PageHeader } from "@/components/shell/page-header";
import { SettingsForm } from "@/components/settings/settings-form";
import { ListSkeleton } from "@/components/tasks/list-skeleton";
import { Button } from "@/components/ui/button";
import { getSpend } from "@/lib/ai/budget";
import { formatUsd } from "@/lib/ai/pricing";
import { aiStatusMessage, configuredProvider, resolveAiStatus } from "@/lib/ai/provider";
import { getProfile, getViewer } from "@/lib/data/viewer";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <PageFrame>
      <PageHeader title="Settings" />
      <Suspense fallback={<ListSkeleton rows={6} />}>
        <SettingsContent />
      </Suspense>
    </PageFrame>
  );
}

async function SettingsContent() {
  const [{ email }, profile] = await Promise.all([getViewer(), getProfile()]);
  const status = resolveAiStatus(profile.ai_enabled);
  const provider = configuredProvider();
  const { supabase } = await getViewer();
  const spend = await getSpend(supabase).catch(() => null);

  return (
    <>
      <SettingsForm
        profile={profile}
        ai={{
          message: aiStatusMessage(status),
          providerConfigured: Boolean(provider?.hasKey),
          model: provider?.hasKey ? provider.model : null,
          spend: spend ? { month: formatUsd(spend.monthMicroUsd), cap: formatUsd(spend.capMicroUsd) } : null,
        }}
      />
      <section className="mt-12 flex flex-wrap items-center gap-4 border-t border-rule pt-6">
        <div className="flex-1">
          <h2 className="text-body font-semibold">Account</h2>
          <p className="text-small text-ink-2">Signed in as {email ?? "unknown"}</p>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="secondary" size="sm">
            Sign out
          </Button>
        </form>
      </section>
    </>
  );
}
