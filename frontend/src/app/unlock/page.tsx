"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

import { unlock } from "@/lib/api";

export default function UnlockPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await unlock(password, remember);
      if (result.success) {
        router.push("/");
      } else {
        setError(result.error || "Invalid password");
        setPassword("");
      }
    } catch {
      setError("Connection error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg-primary p-4">
      <div className="w-full max-w-sm rounded-2xl bg-bg-card p-6 shadow-lg">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/20">
            <Lock size={24} className="text-accent" />
          </div>
          <h1 className="text-lg font-semibold text-text-primary">Unlock</h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            required
            className="rounded-2xl border border-warm-silver/40 bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />

          {error && (
            <p className="text-center text-sm text-danger">{error}</p>
          )}

          <label className="flex items-center gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="rounded accent-accent"
            />
            Remember this device
          </label>

          <button
            type="submit"
            disabled={loading || !password}
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? "..." : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
