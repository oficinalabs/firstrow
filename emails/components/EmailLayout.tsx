import { Body, Container, Head, Html, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";
import { email } from "@/emails/tokens";

/*
 * Moldura partilhada dos emails (design Transversal.dc.html): cartão de 600px
 * sobre fundo neutro, barra FirstRow em tinta no topo, rodapé com linha limão.
 * Os dois emails (recibo, vai-começar) reutilizam isto — zero copy-paste.
 */
export function EmailLayout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="pt">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={email.surface.body}>
        <Container style={{ width: "100%", maxWidth: 600, margin: "0 auto", padding: 24 }}>
          <Section style={email.surface.card}>
            <Section style={email.surface.bar}>
              <Text style={email.text.wordmark}>FirstRow</Text>
            </Section>
            <Section style={email.surface.content}>{children}</Section>
            <Section style={email.surface.footer}>
              <Text style={email.text.footer}>
                FirstRow · joinfirstrow.com · Termos · Privacidade
              </Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
