import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <Link
        href="/"
        className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        ← Back to landing
      </Link>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">
        Privacy Policy
      </h1>
      <p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        Placeholder only. Before production, replace with your company’s privacy
        policy and data-processing disclosures.
      </p>
      <div className="mt-8 rounded-2xl border border-black/10 bg-white p-6 text-sm leading-6 text-zinc-700 shadow-sm dark:border-white/10 dark:bg-black dark:text-zinc-300">
        <ul className="list-disc space-y-2 pl-5">
          <li>What data you collect (receipts, extracted fields, user info)</li>
          <li>How you use it (extraction, review, posting to Sage)</li>
          <li>How long you retain it, and deletion/export options</li>
          <li>Security, subprocessors, and contact information</li>
        </ul>
      </div>
    </main>
  );
}

