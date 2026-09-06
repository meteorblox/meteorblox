import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SLVRBLOX",
    short_name: "SLVRBLOX",
    description: "Mine the grid, compete for rewards, and refine DSLVR on Sui.",
    start_url: "/",
    display: "standalone",
    background_color: "#030509",
    theme_color: "#07111a",
    icons: [{ src: "/brand/dslvr-coin.png", sizes: "512x512", type: "image/png" }],
  };
}
