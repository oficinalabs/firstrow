import { Button, Section, Text } from "@react-email/components";
import { EmailLayout } from "@/emails/components/EmailLayout";
import { email } from "@/emails/tokens";

export type VerificarEmailProps = {
  nome?: string;
  /** Link de ativação (válido 24 h) — gerado em `lib/auth.ts`. */
  urlVerificacao: string;
  /** Email da conta, para a pessoa confirmar que é mesmo a dela. */
  emailConta: string;
};

// Ativação de conta. Enviado no registo e sempre que a pessoa pede reenvio.
export default function VerificarEmail({ nome, urlVerificacao, emailConta }: VerificarEmailProps) {
  return (
    <EmailLayout preview="Confirma o teu email — FirstRow">
      <Text style={email.text.heading}>Confirma o teu email</Text>
      <Text style={{ ...email.text.body, marginTop: 6 }}>
        Olá{nome ? ` ${nome}` : ""} — falta um passo para a conta ficar pronta. Carrega no botão e
        já está.
      </Text>

      <Button href={urlVerificacao} style={{ ...email.surface.button, marginTop: 18 }}>
        Confirmar o meu email
      </Button>

      <Section style={{ ...email.surface.detailBox, marginTop: 18 }}>
        <Section style={email.surface.detailRowLast}>
          <Text style={email.text.itemSub}>Conta</Text>
          <Text style={{ ...email.text.itemTitle, marginTop: 2 }}>{emailConta}</Text>
        </Section>
      </Section>

      <Text style={{ ...email.text.note, marginTop: 16 }}>
        O link é válido durante 24 horas. Se expirar, pedes outro na página de confirmação.
      </Text>
      <Text style={{ ...email.text.note, marginTop: 10 }}>
        Não foste tu que criaste esta conta? Ignora este email — sem confirmação, não acontece nada.
      </Text>
    </EmailLayout>
  );
}

VerificarEmail.PreviewProps = {
  nome: "Rui",
  urlVerificacao: "https://firstrow.arestadigital.pt/api/auth/verify-email?token=exemplo",
  emailConta: "rui.m@gmail.com",
} satisfies VerificarEmailProps;
