"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { AuthNotice } from "./auth-notice";
import { type AuthClientError, humanAuthError } from "./error-messages";
import { LemonLink } from "./lemon-link";

type State =
  | { kind: "idle" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

export function RecoverForm({ emailEnabled }: { emailEnabled: boolean }) {
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();

    setLoading(true);
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/redefinir-password",
    });
    setLoading(false);

    if (!error) {
      setState({ kind: "sent", email });
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

  /*
   * Sem RESEND_API_KEY não sai email nenhum: dizemos isso à cara em vez de um
   * formulário que responde "enviado" e não envia nada. O endpoint devolve
   * sempre sucesso (para não revelar que emails existem), por isso a verdade
   * sobre o envio só pode vir do servidor — ver `authCapabilities`.
   */
  if (!emailEnabled) {
    return (
      <div className="flex flex-col gap-4">
        <AuthNotice tone="warning" title="O envio de email ainda não está ativo.">
          Estamos a ligar este passo. Para já, fala connosco em{" "}
          <a
            href="mailto:ola@firstrow.pt"
            className="alvo-toque font-medium text-foreground underline decoration-accent decoration-2 underline-offset-2"
          >
            ola@firstrow.pt
          </a>{" "}
          e repomos a tua password à mão.
        </AuthNotice>
        <div className="text-center">
          <LemonLink href="/entrar">‹ Voltar a entrar</LemonLink>
        </div>
      </div>
    );
  }

  if (state.kind === "sent") {
    return (
      <div className="flex flex-col gap-4">
        <AuthNotice tone="success" title="Email a caminho.">
          Se houver conta com <span className="font-medium text-foreground">{state.email}</span>,
          enviámos um link para criar uma nova password. Vê também o spam.
        </AuthNotice>
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
