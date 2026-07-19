import type { MetadataRoute } from "next";
import { SITE_URL } from "@/components/marketing/dados";
import { channelPath, listChannels } from "@/lib/channels";

// Páginas públicas. A raiz é a visão geral da plataforma e cada canal tem rota
// própria — canais novos entram aqui sozinhos, vindos de lib/channels.ts.
// Eventos individuais entram quando houver query pública — ver PR.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    ...listChannels().map((channel) => ({
      url: `${SITE_URL}${channelPath(channel)}`,
      changeFrequency: "daily" as const,
      priority: 0.9,
    })),
    { url: `${SITE_URL}/vod`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/sobre`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/criadores`, changeFrequency: "monthly", priority: 0.8 },
  ];
}
