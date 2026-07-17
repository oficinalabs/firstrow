import type { MetadataRoute } from "next";
import { SITE_URL } from "@/components/marketing/dados";

// Páginas públicas estáticas. Eventos/canais dinâmicos entram quando houver
// query pública (frente do espectador) — ver PR.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/sobre`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/criadores`, changeFrequency: "monthly", priority: 0.8 },
  ];
}
