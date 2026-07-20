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
  /**
   * O texto de consentimento EXATO que a pessoa viu e aceitou no checkout.
   * Reproduzido aqui porque a secção 6 de `docs/legal/CONTEUDO-PAGINAS.md` o
   * exige — a prova de consentimento inclui o email de confirmação repetir o que
   * foi aceite. Ausente só se, por alguma razão, não houver registo da compra.
   */
  textoConsentido?: string;
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
  textoConsentido,
}: ReciboProps) {
  // O texto guardado separa parágrafos por linha em branco (ver
  // lib/legal/consentimentos.ts) — reproduz-se com a mesma divisão.
  const consentimento = textoConsentido?.split("\n\n").filter(Boolean) ?? [];
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

      {consentimento.length > 0 ? (
        <Section
          style={{
            ...email.surface.detailBox,
            marginTop: 18,
            padding: "14px 16px",
          }}
        >
          <Text style={email.text.eyebrow}>O que confirmaste na compra</Text>
          {consentimento.map((paragrafo, i) => (
            <Text
              key={paragrafo}
              style={{
                ...email.text.note,
                marginTop: i === 0 ? 8 : 10,
                color: email.color.foreground,
              }}
            >
              {paragrafo}
            </Text>
          ))}
        </Section>
      ) : null}

      <Text style={{ ...email.text.note, marginTop: 16 }}>
        O acesso é da tua conta ({emailConta}) — não há link para partilhar. Este endereço não
        recebe respostas: para qualquer dúvida, fala diretamente com {canalNome}.
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
  textoConsentido:
    "Este acesso é a uma transmissão em direto, com data e hora marcadas. Por ser um serviço de lazer com data marcada, a compra é considerada definitiva assim que a confirmas — não há direito de arrependimento de 14 dias, tal como acontece com um bilhete de concerto.\n\nJá percebi: depois de confirmar o pagamento, não posso cancelar esta compra por arrependimento.",
} satisfies ReciboProps;
