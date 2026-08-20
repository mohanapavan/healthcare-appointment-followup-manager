"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button, ErrorBanner, Input, Label } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (result?.error) {
      setError("That email and password don't match our records.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-ink mb-1">Sign in</h1>
        <p className="text-ink-muted text-sm mb-6">Patient, doctor, and admin accounts all sign in here.</p>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && <ErrorBanner message={error} />}

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="mt-8 rounded-md border border-line bg-paper-raised px-4 py-3 text-xs text-ink-muted">
          <p className="font-medium text-ink mb-1">Demo accounts</p>
          <p>admin@clinic.test / Admin123!</p>
          <p>dr.nair@clinic.test / Doctor123!</p>
          <p>patient1@clinic.test / Patient123!</p>
        </div>
      </div>
    </main>
  );
}
