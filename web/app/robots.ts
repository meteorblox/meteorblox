import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/diagnostics", "/readiness"] },
    sitemap: "https://www.slvrblox.com/sitemap.xml",
    host: "https://www.slvrblox.com",
  };
}
