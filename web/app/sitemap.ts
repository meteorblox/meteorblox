import type { MetadataRoute } from "next";

const origin = "https://www.slvrblox.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Date();
  return [
    { url: `${origin}/`, lastModified: updated, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/mine`, lastModified: updated, changeFrequency: "daily", priority: 0.95 },
    { url: `${origin}/explore`, lastModified: updated, changeFrequency: "daily", priority: 0.85 },
    { url: `${origin}/airdrop`, lastModified: updated, changeFrequency: "daily", priority: 0.85 },
    { url: `${origin}/tokenomics`, lastModified: updated, changeFrequency: "monthly", priority: 0.75 },
    { url: `${origin}/whitepaper`, lastModified: updated, changeFrequency: "monthly", priority: 0.75 },
    { url: `${origin}/roadmap`, lastModified: updated, changeFrequency: "monthly", priority: 0.65 },
    { url: `${origin}/chat`, lastModified: updated, changeFrequency: "daily", priority: 0.55 },
    { url: `${origin}/status`, lastModified: updated, changeFrequency: "hourly", priority: 0.45 },
  ];
}
