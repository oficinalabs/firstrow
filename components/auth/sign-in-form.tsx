"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth-client";
import { type AuthClientError, humanAuthError } from "./error-messages";

export function SignInForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    setError(null);
    setLoading(true);
    const { error: authError } = await signIn.email({ email, password });
    if (authError) {
      // Password certa, email por confirmar: o servidor já mandou um link novo
      // (sendOnSignIn). Levamos a pessoa para a página que explica o passo.
      if ((authError as AuthClientError).code === "EMAIL_NOT_VERIFIED") {
        router.push(`/verificar-email?email=${encodeURIComponent(email)}&reenviado=1`);
        return;
      }
      setError(
        humanAuthError(authError as AuthClientError, "Não conseguimos entrar. Tenta outra vez."),
      );
      setLoading(false);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={error ? true : undefined}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="password">Password</FieldLabel>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "signin-error" : undefined}
        />
        <FieldError id="signin-error">{error}</FieldError>
      </Field>
      <Button type="submit" size="lg" disabled={loading}>
        {loading ? "A entrar…" : "Entrar"}
      </Button>
    </form>
  );
}
