import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-6">
      <h1 className="font-display text-h1 font-normal">Not here</h1>
      <p className="text-ink-2">That page doesn&apos;t exist.</p>
      <Link href="/" className="text-body underline underline-offset-4">
        Back to Today
      </Link>
    </main>
  );
}
