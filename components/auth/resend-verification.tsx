"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { AuthNotice } from "./auth-notice";
import { type AuthClientError, humanAuthError } from "./error-messages";

/*
 * Botão de reenvio do link de ativação.
 *
 * Anti-spam em duas camadas: aqui um intervalo de 60 s entre pedidos (e o
 * botão desativado enquanto corre), no servidor a regra de rate limit em
 * lib/auth.ts (3 pedidos por minuto). A do servidor é a que conta.
 *
 * A frase de sucesso é deliberadamente vaga ("se houver conta…"): o endpoint
 * responde sempre o mesmo para não revelar que emails existem, e a UI não
 * pode prometer mais do que o servidor confirma.
 */

const COOLDOWN_SECONDS = 60;

export function ResendVerification({ email }: { email: string }) {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyVerified, setAlreadyVerified] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function onClick() {
    if (loading || cooldown > 0) return;
    setLoading(true);
    setError(null);

    const { error: authError } = await authClient.sendVerificationEmail({ email });
    setLoading(false);

    if (authError) {
      // "Já está confirmado" é boa notícia, não uma falha — não a pintamos de
      // vermelho nem deixamos a pessoa a carregar no botão sem saber porquê.
      if ((authError as AuthClientError).code === "EMAIL_ALREADY_VERIFIED") {
        setAlreadyVerified(true);
        return;
      }
      setError(
        humanAuthError(
          authError as AuthClientError,
          "Não conseguimos enviar o email. Tenta daqui a pouco.",
        ),
      );
      return;
    }
    setSent(true);
    setCooldown(COOLDOWN_SECONDS);
  }

  if (alreadyVerified) {
    return (
      <AuthNotice tone="success" title="Este email já está confirmado.">
        Não é preciso mais nada — já podes entrar na tua conta.
      </AuthNotice>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {sent && !error ? (
        <AuthNotice tone="success" title="Link a caminho.">
          Se houver uma conta por confirmar com <span className="text-foreground">{email}</span>, o
          link chega dentro de momentos. Vê também o spam.
        </AuthNotice>
      ) : null}
      {error ? (
        <AuthNotice tone="error" title="Não deu.">
          {error}
        </AuthNotice>
      ) : null}

      <Button variant="secondary" size="lg" onClick={onClick} disabled={loading || cooldown > 0}>
        {loading
          ? "A enviar…"
          : cooldown > 0
            ? `Pedir outro link (${cooldown} s)`
            : "Reenviar o link"}
      </Button>
    </div>
  );
}
