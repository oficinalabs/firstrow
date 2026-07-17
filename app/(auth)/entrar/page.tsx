import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { LemonLink } from "@/components/auth/lemon-link";
import { OrDivider } from "@/components/auth/or-divider";
import { resolveNext, withNext } from "@/components/auth/redirect";
import { SignInForm } from "@/components/auth/sign-in-form";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/server/auth-helper";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; redirect?: string | string[] }>;
}) {
  const redirectTo = resolveNext(await searchParams);

  const user = await requireUser();
  if (user) redirect(redirectTo);

  return (
    <AuthCard title="Entrar" subtitle="A tua conta é o teu acesso — 1 sessão de cada vez.">
      <SignInForm redirectTo={redirectTo} />
      <div className="text-center">
        <LemonLink href="/recuperar">Esqueci-me da password</LemonLink>
      </div>
      <OrDivider />
      <Link
        href={withNext("/registar", redirectTo)}
        className={buttonVariants({ variant: "secondary", size: "lg" })}
      >
        Criar conta
      </Link>
    </AuthCard>
  );
}
