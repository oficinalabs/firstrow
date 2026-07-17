"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signUp } from "@/lib/auth-client";
import { type AuthClientError, humanAuthError } from "./error-messages";

export function SignUpForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    setError(null);
    setLoading(true);
    const { error: authError } = await signUp.email({ name, email, password });
    if (authError) {
      setError(
        humanAuthError(
          authError as AuthClientError,
          "Não conseguimos criar a conta. Tenta outra vez.",
        ),
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
        <FieldLabel htmlFor="name">Nome</FieldLabel>
        <Input id="name" name="name" type="text" autoComplete="name" required />
      </Field>
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
          autoComplete="new-password"
          minLength={8}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "signup-error" : "signup-hint"}
        />
        {error ? (
          <FieldError id="signup-error">{error}</FieldError>
        ) : (
          <p id="signup-hint" className="text-xs text-muted-foreground">
            Pelo menos 8 caracteres.
          </p>
        )}
      </Field>
      <Button type="submit" size="lg" disabled={loading}>
        {loading ? "A criar conta…" : "Criar conta"}
      </Button>
    </form>
  );
}
