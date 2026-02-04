"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

function getApiUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

export default function ForgotPasswordPage() {
  const apiUrl = useMemo(() => getApiUrl(), []);
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await fetch(`${apiUrl}/auth/forgot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      setSubmitted(true);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-16">
      <Link
        href="/auth/login"
        className="mb-8 text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        ← Back to login
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">Forgot password</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        Enter your email and we’ll send a reset link (once enabled).
      </p>

      <div className="mt-8 rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
        {submitted ? (
          <div className="text-sm text-zinc-700 dark:text-zinc-300">
            If an account exists for that email, you’ll receive instructions
            shortly.
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Email
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 block w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-zinc-950 shadow-sm outline-none ring-0 focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
              />
            </label>
            <button
              type="submit"
              className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Send reset link
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

