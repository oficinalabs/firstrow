import type { MetadataRoute } from "next";
import { SITE_URL } from "@/components/marketing/dados";
import { channelPath } from "@/lib/channels";
import { listChannels } from "@/server/channels";

// Os canais vêm da base de dados, por isso o sitemap não pode ficar congelado
// no build — um canal novo tem de entrar sem esperar por um deploy. Uma hora
// chega de sobra para SEO. (Mesma razão de `app/(marketing)/sobre/page.tsx`.)
export const revalidate = 3600;

// Páginas públicas. A raiz é a visão geral da plataforma e cada canal tem rota
// própria — canais novos entram aqui sozinhos, agora vindos da tabela
// `channels`. Eventos individuais entram quando houver query pública — ver PR.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const channels = await listChannels().catch(() => []);

  return [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    ...channels.map((channel) => ({
      url: `${SITE_URL}${channelPath(channel)}`,
      changeFrequency: "daily" as const,
      priority: 0.9,
    })),
    { url: `${SITE_URL}/vod`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/sobre`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/criadores`, changeFrequency: "monthly", priority: 0.8 },
  ];
}
