/*
 * Config single-tenant (Fase 0): um só canal, hardcoded — demo SmokingBars.
 * Multi-tenant é Fase 2 (isto passa a vir da BD); NÃO criar tabela agora.
 *
 * Co-branding: o CANAL pinta a linha de topo, o botão Seguir e realces de
 * agenda com `accentColor`; a FIRSTROW pinta barra, ações/dinheiro, checkout,
 * player e QR (tokens em globals.css). A cor do canal NUNCA entra em botões
 * de pagamento nem em estados AO VIVO.
 */

export type Tenant = {
  slug: string;
  name: string;
  tagline: string;
  /** Cor do canal (dados de configuração, não token de design). */
  accentColor: string;
  /** Caminho público do logo do canal; null → placeholder com iniciais. */
  logoUrl: string | null;
  /** Imagem de banner do canal; null → sem banner. */
  bannerUrl: string | null;
  initials: string;
};

export const tenant: Tenant = {
  slug: "smokingbars",
  name: "SmokingBars",
  tagline: "Batalhas de rap · Lisboa",
  accentColor: "#6CC24A",
  logoUrl: null,
  bannerUrl: null,
  initials: "SB",
};
