import type { Metadata } from "next";
import { SentinelDashboard } from "./sentinel-dashboard";
import "./sentinel.css";

export const metadata: Metadata = {
  title: "Sentinel Test Nodes | SLVRBLOX",
  description: "Activate a free SLVRBLOX Sentinel test node and explore real protocol observations on Sui Testnet.",
  alternates: { canonical: "/sentinel" },
};

export default function SentinelPage() { return <SentinelDashboard />; }
