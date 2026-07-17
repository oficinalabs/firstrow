import { Button, Column, Row, Section, Text } from "@react-email/components";
import { EmailLayout } from "@/emails/components/EmailLayout";
import { email } from "@/emails/tokens";
import { formatDateTime, formatEuro, formatPhone } from "@/lib/format";

export type ReciboProps = {
  nome?: string;
  eventoTitulo: string;
  canalNome: string;
  eventoData: Date;
  valorCents: number;
  telemovel?: string;
  numeroRecibo?: string;
  emailConta: string;
  urlEvento: string;
};

// Recibo de compra (MB WAY). O acesso é da conta — não há link para partilhar.
export default function Recibo({
  nome,
  eventoTitulo,
  canalNome,
  eventoData,
  valorCents,
  telemovel,
  numeroRecibo,
  emailConta,
  urlEvento,
}: ReciboProps) {
  const meta = [
    numeroRecibo ? `nº ${numeroRecibo}` : null,
    telemovel ? formatPhone(telemovel) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <EmailLayout preview={`Recibo — ${eventoTitulo}`}>
      <Text style={email.text.heading}>Recibo da tua compra</Text>
      <Text style={{ ...email.text.body, marginTop: 6 }}>
        Olá{nome ? ` ${nome}` : ""} — está tudo tratado. O acesso já está na tua conta.
      </Text>

      <Section style={email.surface.detailBox}>
        <Section style={email.surface.detailRow}>
          <Row>
            <Column style={{ verticalAlign: "top" }}>
              <Text style={email.text.itemTitle}>Acesso à live — {eventoTitulo}</Text>
              <Text style={email.text.itemSub}>
                {canalNome} ·{" "}
                {/* data em maiúsculas como no design; o canal fica em caixa normal */}
                <span style={{ textTransform: "uppercase" }}>{formatDateTime(eventoData)}</span>
              </Text>
            </Column>
            <Column style={{ verticalAlign: "top", textAlign: "right" }}>
              <Text style={email.text.price}>{formatEuro(valorCents)}</Text>
            </Column>
          </Row>
        </Section>
        <Section style={email.surface.detailRowLast}>
          <Row>
            <Column>
              <Text style={email.text.totalLabel}>Total pago por MB WAY</Text>
            </Column>
            <Column style={{ textAlign: "right" }}>
              <Text style={email.text.totalValue}>{formatEuro(valorCents)}</Text>
            </Column>
          </Row>
        </Section>
      </Section>

      {meta ? <Text style={{ ...email.text.meta, marginTop: 12 }}>{meta}</Text> : null}

      <Button href={urlEvento} style={{ ...email.surface.button, marginTop: 18 }}>
        Ver o evento
      </Button>

      <Text style={{ ...email.text.note, marginTop: 16 }}>
        O acesso é da tua conta ({emailConta}) — não há link para partilhar. Dúvidas? Responde a
        este email.
      </Text>
    </EmailLayout>
  );
}

Recibo.PreviewProps = {
  nome: "Rui",
  eventoTitulo: "SB Clash #14 — Final de Verão",
  canalNome: "SmokingBars",
  eventoData: new Date("2026-07-26T21:00:00+01:00"),
  valorCents: 750,
  telemovel: "+351 912 345 678",
  numeroRecibo: "FR-2026-08412",
  emailConta: "rui.m@gmail.com",
  urlEvento: "https://joinfirstrow.com/eventos/sb-clash-14",
} satisfies ReciboProps;
