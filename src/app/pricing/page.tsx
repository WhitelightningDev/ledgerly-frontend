import Link from "next/link";

type Plan = {
  name: "Starter" | "Pro" | "Accountant";
  price: string;
  blurb: string;
  features: string[];
  highlight?: boolean;
};

const plans: Plan[][] = [
  [
    {
      name: "Starter",
      price: "$29/mo",
      blurb: "For small teams getting receipts out of email and into one inbox.",
      features: [
        "Receipt inbox",
        "AI extraction (key fields)",
        "Approval queue",
        "Basic search & filters",
        "Audit log",
      ],
    },
    {
      name: "Pro",
      price: "$79/mo",
      blurb: "For growing teams that need smoother review and Sage sync.",
      features: [
        "Everything in Starter",
        "Sage posting + receipt attachment",
        "Retry + failure visibility",
        "Team roles (submitter/admin)",
        "Priority support (email)",
      ],
      highlight: true,
    },
    {
      name: "Accountant",
      price: "$199/mo",
      blurb: "For bookkeepers managing multiple clients and higher volume.",
      features: [
        "Everything in Pro",
        "Multiple companies",
        "Stronger audit + export",
        "Dedicated onboarding",
        "Priority support (SLA)",
      ],
    },
  ],
];

export default function PricingPage() {
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
              Start Trial
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-14 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Pricing
          </h1>
          <p className="mt-4 text-base leading-7 text-zinc-600 dark:text-zinc-300">
            Start with the MVP essentials: inbox, extraction, approval, Sage sync,
            and audit trail.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {plans[0].map((plan) => (
            <PlanCard key={plan.name} plan={plan} />
          ))}
        </div>

        <div className="mt-12 flex justify-center">
          <Link
            href="/auth/register"
            className="inline-flex h-12 items-center justify-center rounded-full bg-zinc-950 px-6 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Start Trial
          </Link>
        </div>
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

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div
      className={[
        "relative rounded-2xl border bg-white p-6 shadow-sm dark:bg-black",
        plan.highlight
          ? "border-zinc-950 ring-1 ring-zinc-950 dark:border-white dark:ring-white"
          : "border-black/10 dark:border-white/10",
      ].join(" ")}
    >
      {plan.highlight ? (
        <div className="absolute right-5 top-5 rounded-full bg-zinc-950 px-3 py-1 text-xs font-medium text-white dark:bg-white dark:text-black">
          Most popular
        </div>
      ) : null}

      <div className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
        {plan.name}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">
        {plan.price}
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        {plan.blurb}
      </p>

      <ul className="mt-6 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-zinc-950 dark:bg-white" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <Link
          href="/auth/register"
          className={[
            "inline-flex h-11 w-full items-center justify-center rounded-full px-5 text-sm font-medium transition-colors",
            plan.highlight
              ? "bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              : "border border-black/10 bg-white text-zinc-950 hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5",
          ].join(" ")}
        >
          Start Trial
        </Link>
      </div>
    </div>
  );
}
