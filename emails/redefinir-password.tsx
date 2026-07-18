import { Button, Text } from "@react-email/components";
import { EmailLayout } from "@/emails/components/EmailLayout";
import { email } from "@/emails/tokens";

export type RedefinirPasswordProps = {
  nome?: string;
  /** Link de redefinição (válido 1 h) — gerado pelo Better Auth. */
  urlRedefinicao: string;
};

// Pedido de nova password (ecrã /recuperar).
export default function RedefinirPassword({ nome, urlRedefinicao }: RedefinirPasswordProps) {
  return (
    <EmailLayout preview="Criar uma nova password — FirstRow">
      <Text style={email.text.heading}>Criar uma nova password</Text>
      <Text style={{ ...email.text.body, marginTop: 6 }}>
        Olá{nome ? ` ${nome}` : ""} — pediste para repor a password da tua conta. Carrega no botão
        para escolher uma nova.
      </Text>

      <Button href={urlRedefinicao} style={{ ...email.surface.button, marginTop: 18 }}>
        Escolher nova password
      </Button>

      <Text style={{ ...email.text.note, marginTop: 16 }}>
        O link é válido durante 1 hora e só pode ser usado uma vez.
      </Text>
      <Text style={{ ...email.text.note, marginTop: 10 }}>
        Não foste tu que pediste? Ignora este email — a password atual continua a funcionar.
      </Text>
    </EmailLayout>
  );
}

RedefinirPassword.PreviewProps = {
  nome: "Rui",
  urlRedefinicao: "https://firstrow.arestadigital.pt/redefinir-password?token=exemplo",
} satisfies RedefinirPasswordProps;
