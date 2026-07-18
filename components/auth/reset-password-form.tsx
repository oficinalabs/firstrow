"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { checkPassword, passwordPolicyMessage } from "@/lib/password-policy";
import { AuthNotice } from "./auth-notice";
import { type AuthClientError, humanAuthError } from "./error-messages";
import { LemonLink } from "./lemon-link";
import { PasswordField } from "./password-field";

/*
 * Escolher a nova password (a partir do link do email).
 *
 * A política é a mesma do registo — mesmo módulo, mesmo checklist. Ao repor a
 * password o Better Auth fecha as outras sessões (`revokeSessionsOnPasswordReset`).
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setError(null);
    const policy = checkPassword(password);
    if (!policy.ok) {
      setError(passwordPolicyMessage(policy.failed));
      return;
    }

    setLoading(true);
    const { error: authError } = await authClient.resetPassword({ newPassword: password, token });
    setLoading(false);

    if (authError) {
      setError(
        humanAuthError(
          authError as AuthClientError,
          "Não conseguimos mudar a password. Pede um link novo.",
        ),
      );
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <AuthNotice tone="success" title="Password mudada.">
          As outras sessões foram terminadas. Entra com a password nova.
        </AuthNotice>
        <Button size="lg" onClick={() => router.push("/entrar")}>
          Entrar
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <PasswordField
        value={password}
        onChange={setPassword}
        context={{}}
        error={error}
        label="Nova password"
        autoComplete="new-password"
      />
      <Button type="submit" size="lg" disabled={loading}>
        {loading ? "A guardar…" : "Guardar password"}
      </Button>
      <div className="text-center">
        <LemonLink href="/entrar" className="text-foreground-secondary decoration-transparent">
          ‹ Voltar a entrar
        </LemonLink>
      </div>
    </form>
  );
}
