import Link from "next/link";

export default function IntegrationsPage() {
  return (
    <main className="w-full px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
        Placeholder (MVP). Sage connection will live here.
      </p>
      <div className="mt-6">
        <Link
          href="/onboarding"
          className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
        >
          Go to onboarding
        </Link>
      </div>
    </main>
  );
}
