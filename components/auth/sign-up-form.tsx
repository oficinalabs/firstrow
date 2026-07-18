"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signUp } from "@/lib/auth-client";
import { checkPassword, passwordPolicyMessage } from "@/lib/password-policy";
import { type AuthClientError, humanAuthError } from "./error-messages";
import { PasswordField } from "./password-field";

export function SignUpForm({
  redirectTo,
  verificationRequired,
}: {
  redirectTo: string;
  /** O login vai exigir email confirmado? Decide para onde vamos a seguir. */
  verificationRequired: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setError(null);
    setPasswordError(null);

    // Mesma regra do servidor (lib/password-policy.ts): evita uma ida ao
    // servidor só para ouvir o que o checklist já está a dizer.
    const policy = checkPassword(password, { email, name });
    if (!policy.ok) {
      setPasswordError(passwordPolicyMessage(policy.failed));
      return;
    }

    setLoading(true);
    const { error: authError } = await signUp.email({
      name: name.trim(),
      email: email.trim(),
      password,
    });

    if (authError) {
      const message = humanAuthError(
        authError as AuthClientError,
        "Não conseguimos criar a conta. Tenta outra vez.",
      );
      if ((authError as AuthClientError).code === "PASSWORD_POLICY") setPasswordError(message);
      else setError(message);
      setLoading(false);
      return;
    }

    if (verificationRequired) {
      // Sem email confirmado não há sessão — a conta fica à espera do link.
      router.push(`/verificar-email?email=${encodeURIComponent(email.trim())}`);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field>
        <FieldLabel htmlFor="name">Nome</FieldLabel>
        <Input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "signup-error" : undefined}
        />
      </Field>

      <PasswordField
        value={password}
        onChange={setPassword}
        context={{ email, name }}
        error={passwordError}
      />

      {error ? (
        <p id="signup-error" role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={loading}>
        {loading ? "A criar conta…" : "Criar conta"}
      </Button>
    </form>
  );
}
