import { Button, Img, Section, Text } from "@react-email/components";
import { EmailLayout } from "@/emails/components/EmailLayout";
import { email } from "@/emails/tokens";
import { formatTime } from "@/lib/format";

export type VaiComecarProps = {
  eventoTitulo: string;
  canalNome: string;
  comecaAs: Date;
  urlEvento: string;
  cartazUrl?: string;
  antecedenciaLabel?: string;
};

// Lembrete "vai começar" (~1h antes). CTA abre a live à hora certa.
export default function VaiComecar({
  eventoTitulo,
  canalNome,
  comecaAs,
  urlEvento,
  cartazUrl,
  antecedenciaLabel = "Começa daqui a 1 hora",
}: VaiComecarProps) {
  const hora = formatTime(comecaAs);

  return (
    <EmailLayout preview={`${eventoTitulo} — começa às ${hora}`}>
      <Text style={email.text.eyebrow}>{antecedenciaLabel}</Text>
      <Text style={{ ...email.text.headingLg, marginTop: 8 }}>{eventoTitulo}</Text>
      <Text style={{ ...email.text.body, marginTop: 6 }}>
        Hoje às {hora} · {canalNome} · o teu lugar já está garantido.
      </Text>

      {cartazUrl ? (
        <Section style={{ marginTop: 16 }}>
          <Img
            src={cartazUrl}
            alt={`Cartaz — ${eventoTitulo}`}
            width="552"
            style={{ width: "100%", borderRadius: email.radius, display: "block" }}
          />
        </Section>
      ) : null}

      <Button href={urlEvento} style={{ ...email.surface.button, marginTop: 18 }}>
        Abrir a live às {hora}
      </Button>

      <Text style={{ ...email.text.note, marginTop: 16 }}>
        Entra com a tua conta. Lembra-te: 1 sessão de cada vez — se abrires noutro dispositivo, a
        primeira pára.
      </Text>
    </EmailLayout>
  );
}

VaiComecar.PreviewProps = {
  eventoTitulo: "SB Clash #14 — Final de Verão",
  canalNome: "SmokingBars",
  comecaAs: new Date("2026-07-26T21:00:00+01:00"),
  urlEvento: "https://joinfirstrow.com/eventos/sb-clash-14/ver",
} satisfies VaiComecarProps;
