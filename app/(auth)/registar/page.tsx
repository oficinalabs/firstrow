import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { GoogleButton } from "@/components/auth/google-button";
import { OrDivider } from "@/components/auth/or-divider";
import { resolveNext, withNext } from "@/components/auth/redirect";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { buttonVariants } from "@/components/ui/button";
import { authCapabilities } from "@/lib/auth";
import { requireUser } from "@/server/auth-helper";

export const metadata: Metadata = { title: "Criar conta" };
export const dynamic = "force-dynamic";

export default async function RegistarPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; redirect?: string | string[] }>;
}) {
  const redirectTo = resolveNext(await searchParams);

  const user = await requireUser();
  if (user) redirect(redirectTo);

  return (
    <AuthCard title="Criar conta" subtitle="A tua conta é o teu acesso — 1 sessão de cada vez.">
      <SignUpForm
        redirectTo={redirectTo}
        verificationRequired={authCapabilities.emailVerificationRequired}
      />
      <OrDivider />
      {authCapabilities.google ? <GoogleButton redirectTo={redirectTo} /> : null}
      <Link
        href={withNext("/entrar", redirectTo)}
        className={buttonVariants({ variant: "secondary", size: "lg" })}
      >
        Já tenho conta — entrar
      </Link>
    </AuthCard>
  );
}
