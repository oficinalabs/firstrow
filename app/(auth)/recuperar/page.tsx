import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { RecoverForm } from "@/components/auth/recover-form";
import { authCapabilities } from "@/lib/auth";

export const metadata: Metadata = { title: "Recuperar password" };

export default function RecuperarPage() {
  return (
    <AuthCard
      title="Recuperar password"
      subtitle="Diz-nos o email da conta e enviamos-te um link para criar uma nova."
    >
      <RecoverForm emailEnabled={authCapabilities.email} />
    </AuthCard>
  );
}
