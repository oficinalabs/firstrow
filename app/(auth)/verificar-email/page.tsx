import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthNotice } from "@/components/auth/auth-notice";
import { humanRedirectError } from "@/components/auth/error-messages";
import { LemonLink } from "@/components/auth/lemon-link";
import { ResendVerification } from "@/components/auth/resend-verification";
import { buttonVariants } from "@/components/ui/button";
import { authCapabilities } from "@/lib/auth";
import { getCurrentUser } from "@/server/authz";

export const metadata: Metadata = { title: "Confirmar email" };
export const dynamic = "force-dynamic";

/*
 * Ativação de conta. Quatro estados, todos desenhados:
 *
 *   1. envio inativo — sem RESEND_API_KEY não sai email nenhum. Dizemos isso
 *      à letra em vez de mandar a pessoa esperar por algo que não vem.
 *   2. link falhado  — ?error=TOKEN_EXPIRED|INVALID_TOKEN|… (o Better Auth
 *      acrescenta o erro ao callbackURL) → explicação + reenviar.
 *   3. confirmado    — ?confirmado=1 sem erro → conta pronta.
 *   4. à espera      — acabou de se registar ou tentou entrar sem confirmar.
 */

type SearchParams = {
  email?: string | string[];
  error?: string | string[];
  confirmado?: string | string[];
  reenviado?: string | string[];
};

function firstValue(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ? raw.trim() : null;
}

export default async function VerificarEmailPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();

  const errorMessage = humanRedirectError(params.error);
  const confirmed = firstValue(params.confirmado) !== null && !errorMessage;
  const justResent = firstValue(params.reenviado) !== null;
  // A sessão é a fonte mais fiável; o ?email= cobre quem ainda não entrou.
  const email = user?.email ?? firstValue(params.email);

  // ── 3. Confirmado ─────────────────────────────────────────────────────────
  if (confirmed || (user?.emailVerified && !errorMessage)) {
    return (
      <AuthCard title="Email confirmado" subtitle="Está tudo pronto — a conta é tua.">
        <AuthNotice tone="success" title="Conta ativa.">
          Já podes comprar acesso e ver as lives. Boa estreia.
        </AuthNotice>
        <Link href={user ? "/conta" : "/entrar"} className={buttonVariants({ size: "lg" })}>
          {user ? "Ir para a minha conta" : "Entrar"}
        </Link>
      </AuthCard>
    );
  }

  // ── 1. Envio de email desligado ───────────────────────────────────────────
  if (!authCapabilities.email) {
    return (
      <AuthCard title="Confirmar email" subtitle="Ainda não conseguimos enviar o email.">
        <AuthNotice tone="warning" title="O envio de email ainda não está ativo.">
          Estamos a ligar este passo. Entretanto a tua conta funciona à mesma — entra normalmente.
          Se precisares de ajuda, fala connosco em{" "}
          <a
            href="mailto:ola@firstrow.pt"
            className="font-medium text-foreground underline decoration-accent decoration-2 underline-offset-2"
          >
            ola@firstrow.pt
          </a>
          .
        </AuthNotice>
        <Link href="/entrar" className={buttonVariants({ size: "lg" })}>
          Entrar
        </Link>
      </AuthCard>
    );
  }

  // ── 2. Link expirado ou inválido ──────────────────────────────────────────
  if (errorMessage) {
    return (
      <AuthCard title="Link já não serve" subtitle="Acontece — pedimos outro num instante.">
        <AuthNotice tone="warning" title={errorMessage}>
          Os links de ativação duram 24 horas e só podem ser usados uma vez.
        </AuthNotice>
        {email ? (
          <ResendVerification email={email} />
        ) : (
          <Link href="/entrar" className={buttonVariants({ size: "lg" })}>
            Entrar e pedir novo link
          </Link>
        )}
        <div className="text-center">
          <LemonLink href="/entrar" className="text-foreground-secondary decoration-transparent">
            ‹ Voltar a entrar
          </LemonLink>
        </div>
      </AuthCard>
    );
  }

  // ── 4. À espera de confirmação ────────────────────────────────────────────
  return (
    <AuthCard title="Confirma o teu email" subtitle="Falta um passo — está no teu email.">
      <AuthNotice tone={justResent ? "success" : "neutral"} title="Vê a tua caixa de entrada.">
        {email ? (
          <>
            Enviámos um link para <span className="text-foreground">{email}</span>. Abre-o e a conta
            fica ativa. Vê também o spam.
          </>
        ) : (
          <>Enviámos um link para o email da conta. Abre-o e a conta fica ativa.</>
        )}
      </AuthNotice>

      {email ? <ResendVerification email={email} /> : null}

      <div className="text-center">
        <LemonLink href="/entrar" className="text-foreground-secondary decoration-transparent">
          ‹ Voltar a entrar
        </LemonLink>
      </div>
    </AuthCard>
  );
}
