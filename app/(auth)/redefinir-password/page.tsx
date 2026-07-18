import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthNotice } from "@/components/auth/auth-notice";
import { humanRedirectError } from "@/components/auth/error-messages";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Nova password" };

/*
 * Destino do link enviado em /recuperar. O token vem no URL (?token=…) e é
 * consumido uma única vez pelo Better Auth. Sem token — ou com um token que
 * já foi usado — mostramos o caminho de volta em vez de um formulário morto.
 */
export default async function RedefinirPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const errorMessage = humanRedirectError(params.error);

  if (!token || errorMessage) {
    return (
      <AuthCard title="Link já não serve" subtitle="Pede outro e continuamos daí.">
        <AuthNotice tone="warning" title={errorMessage ?? "Falta o link de redefinição."}>
          Os links duram 1 hora e só podem ser usados uma vez.
        </AuthNotice>
        <Link href="/recuperar" className={buttonVariants({ size: "lg" })}>
          Pedir novo link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Nova password" subtitle="Escolhe uma password nova para a tua conta.">
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
