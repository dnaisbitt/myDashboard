import type { Metadata } from "next";
import { Suspense } from "react";
import { SetupNotice } from "@/components/shell/setup-notice";
import { Wordmark } from "@/components/shell/wordmark";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-16">
      <Wordmark className="text-[1.75rem]" />
      <h1 className="mt-10 font-display text-h1 font-normal tracking-[-0.02em]">Sign in</h1>
      <p className="mt-2 text-body text-ink-2">Private to you. There&apos;s no public sign-up.</p>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
