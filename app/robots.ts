import type { MetadataRoute } from "next";
import { SITE_URL } from "@/components/marketing/dados";

// Áreas privadas/técnicas fora dos motores de busca; sitemap absoluto.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/conta", "/bilhetes"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
