import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthNotice } from "@/components/auth/auth-notice";
import { humanRedirectError } from "@/components/auth/error-messages";
import { GoogleButton } from "@/components/auth/google-button";
import { LemonLink } from "@/components/auth/lemon-link";
import { OrDivider } from "@/components/auth/or-divider";
import { resolveNext, withNext } from "@/components/auth/redirect";
import { SignInForm } from "@/components/auth/sign-in-form";
import { buttonVariants } from "@/components/ui/button";
import { authCapabilities } from "@/lib/auth";
import { requireUser } from "@/server/auth-helper";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
    redirect?: string | string[];
    error?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const redirectTo = resolveNext(params);
  // Um salto falhado pelo Google volta aqui com ?error= — tipicamente
  // account_not_linked (já existe conta com password e email por confirmar).
  const errorMessage = humanRedirectError(params.error);

  const user = await requireUser();
  if (user) redirect(redirectTo);

  return (
    <AuthCard title="Entrar" subtitle="A tua conta é o teu acesso — 1 sessão de cada vez.">
      {errorMessage ? (
        <AuthNotice tone="warning" title="Não deu para entrar com o Google.">
          {errorMessage}
        </AuthNotice>
      ) : null}
      <SignInForm redirectTo={redirectTo} />
      <div className="text-center">
        <LemonLink href="/recuperar">Esqueci-me da password</LemonLink>
      </div>
      <OrDivider />
      {authCapabilities.google ? <GoogleButton redirectTo={redirectTo} /> : null}
      <Link
        href={withNext("/registar", redirectTo)}
        className={buttonVariants({ variant: "secondary", size: "lg" })}
      >
        Criar conta
      </Link>
    </AuthCard>
  );
}
