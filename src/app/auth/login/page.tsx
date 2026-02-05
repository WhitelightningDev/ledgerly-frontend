"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { getApiUrl } from "../../_lib/apiUrl";

export default function AuthLoginPage() {
  const router = useRouter();
  const apiUrl = useMemo(() => getApiUrl(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { access_token?: string; detail?: string };
      if (!res.ok || !data.access_token) {
        throw new Error(data.detail || "Login failed.");
      }
      localStorage.setItem("ledgerly_access_token", data.access_token);
      router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-16">
      <Link
        href="/"
        className="mb-8 text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        ← Back to landing
      </Link>

      <h1 className="text-3xl font-semibold tracking-tight">Login</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        Sign in to review receipts and post approved entries to Sage.
      </p>

      <form
        onSubmit={onSubmit}
        className="mt-8 rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black"
      >
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

        <label className="mt-4 block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 block w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-zinc-950 shadow-sm outline-none ring-0 focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
          />
        </label>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {submitting ? "Signing in..." : "Sign in"}
        </button>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
          <Link
            href="/auth/register"
            className="text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
          >
            Create account
          </Link>
          <Link
            href="/auth/forgot"
            className="text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
          >
            Forgot password
          </Link>
        </div>
      </form>
    </main>
  );
}
