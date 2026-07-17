"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { type AuthClientError, humanAuthError } from "./error-messages";
import { LemonLink } from "./lemon-link";

type State =
  | { kind: "idle" }
  | { kind: "sent"; email: string }
  | { kind: "disabled" }
  | { kind: "error"; message: string };

export function RecoverForm() {
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();

    setLoading(true);
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/entrar" });
    setLoading(false);

    if (!error) {
      setState({ kind: "sent", email });
      return;
    }
    // O envio de email ainda não está configurado no servidor (sem Resend):
    // estado honesto, não fabricamos sucesso.
    if ((error as AuthClientError).code === "RESET_PASSWORD_DISABLED") {
      setState({ kind: "disabled" });
      return;
    }
    setState({
      kind: "error",
      message: humanAuthError(
        error as AuthClientError,
        "Não conseguimos enviar o email. Tenta outra vez.",
      ),
    });
  }

  if (state.kind === "sent") {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-sm border border-success bg-success/10 px-4 py-3.5">
          <p className="text-2sm font-semibold text-foreground">Email a caminho.</p>
          <p className="mt-1 text-2sm leading-relaxed text-foreground-secondary">
            Se houver conta com <span className="font-medium text-foreground">{state.email}</span>,
            enviámos um link para criar uma nova password. Vê também o spam.
          </p>
        </div>
        <div className="text-center">
          <LemonLink href="/entrar">‹ Voltar a entrar</LemonLink>
        </div>
      </div>
    );
  }

  if (state.kind === "disabled") {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-sm border border-warning bg-warning/10 px-4 py-3.5">
          <p className="text-2sm font-semibold text-foreground">
            O envio de email ainda não está ativo.
          </p>
          <p className="mt-1 text-2sm leading-relaxed text-foreground-secondary">
            Estamos a ligar este passo. Para já, fala connosco em{" "}
            <a
              href="mailto:ola@firstrow.pt"
              className="font-medium text-foreground underline decoration-accent decoration-2 underline-offset-2"
            >
              ola@firstrow.pt
            </a>{" "}
            e repomos a tua password à mão.
          </p>
        </div>
        <div className="text-center">
          <LemonLink href="/entrar">‹ Voltar a entrar</LemonLink>
        </div>
      </div>
    );
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
          placeholder="o email da tua conta"
          required
          aria-invalid={state.kind === "error" ? true : undefined}
          aria-describedby={state.kind === "error" ? "recover-error" : undefined}
        />
        {state.kind === "error" ? (
          <FieldError id="recover-error">{state.message}</FieldError>
        ) : null}
      </Field>
      <Button type="submit" size="lg" disabled={loading}>
        {loading ? "A enviar…" : "Enviar link"}
      </Button>
      <div className="text-center">
        <LemonLink href="/entrar" className="text-foreground-secondary decoration-transparent">
          ‹ Voltar a entrar
        </LemonLink>
      </div>
    </form>
  );
}
