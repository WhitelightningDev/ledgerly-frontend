import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-zinc-950 dark:bg-black dark:text-zinc-50">
      <header className="border-b border-black/5 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-zinc-950 dark:text-zinc-50"
          >
            Ledgerly
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/auth/login"
              className="rounded-full px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
            >
              Login
            </Link>
            <Link
              href="/auth/register"
              className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(24,24,27,0.06),transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.08),transparent_55%)]" />
          <div className="relative mx-auto w-full max-w-6xl px-6 py-16 sm:py-24">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3 py-1 text-xs font-medium text-zinc-700 backdrop-blur dark:border-white/10 dark:bg-black/40 dark:text-zinc-300">
                Built for small teams on Sage
              </div>
              <h1 className="mt-6 text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
                Snap receipts. Auto-post to Sage.
              </h1>
              <p className="mt-5 text-pretty text-lg leading-8 text-zinc-600 dark:text-zinc-300">
                Upload or snap a receipt, let AI extract key fields, then approve
                and post to Sage with an audit trail.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/auth/register"
                  className="inline-flex h-12 w-full items-center justify-center rounded-full bg-zinc-950 px-6 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 sm:w-auto"
                >
                  Start Free Trial
                </Link>
                <Link
                  href="/auth/login"
                  className="inline-flex h-12 w-full items-center justify-center rounded-full border border-black/10 bg-white px-6 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5 sm:w-auto"
                >
                  Login
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 py-14 sm:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Upload → AI → Post
            </h2>
            <p className="mt-3 text-base leading-7 text-zinc-600 dark:text-zinc-300">
              A tight workflow: inbox, extraction, approval, and Sage sync.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <StepCard
              number="1"
              title="Upload"
              description="Drop a PDF or snap a photo from your phone."
            />
            <StepCard
              number="2"
              title="AI"
              description="Extract vendor, date, totals, and suggest category/tax."
            />
            <StepCard
              number="3"
              title="Post"
              description="Bookkeeper approves, then it posts to Sage with the receipt attached."
            />
          </div>
        </section>

        <section className="border-y border-black/5 bg-zinc-50 dark:border-white/10 dark:bg-white/5">
          <div className="mx-auto w-full max-w-6xl px-6 py-14 sm:py-20">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Everything you need for the MVP
              </h2>
              <p className="mt-3 text-base leading-7 text-zinc-600 dark:text-zinc-300">
                Keep receipts moving with clear statuses and a clean approval
                queue.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FeatureCard
                title="Inbox"
                description="A single place to collect receipts and track status."
              />
              <FeatureCard
                title="Approval"
                description="Review, edit fields, approve or reject with confidence."
              />
              <FeatureCard
                title="Sage Sync"
                description="Post approved entries to Sage and attach the receipt."
              />
              <FeatureCard
                title="Audit Log"
                description="Every change is recorded: who did what, and when."
              />
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 py-14 sm:py-20">
          <div className="grid items-center gap-8 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Simple pricing, built for small companies
              </h2>
              <p className="mt-3 text-base leading-7 text-zinc-600 dark:text-zinc-300">
                Start with a free trial. Upgrade when you’re ready to bring your
                whole workflow into one inbox.
              </p>
            </div>
            <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
              <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Pricing teaser
              </div>
              <div className="mt-2 text-xl font-semibold tracking-tight">
                Transparent plans, no surprises
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                Designed for the MVP: inbox + extraction + approval + Sage sync +
                audit trail.
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/auth/register"
                  className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  Start Free Trial
                </Link>
                <Link
                  href="/auth/login"
                  className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-50 dark:hover:bg-white/5"
                >
                  Login
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-black/5 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            © {new Date().getFullYear()} Ledgerly
          </div>
          <div className="flex items-center gap-5 text-sm">
            <Link
              href="/terms"
              className="text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              className="text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-950 text-sm font-semibold text-white dark:bg-white dark:text-black">
          {number}
        </div>
        <div className="text-base font-semibold tracking-tight">{title}</div>
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        {description}
      </p>
    </div>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
      <div className="text-base font-semibold tracking-tight">{title}</div>
      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        {description}
      </p>
    </div>
  );
}
