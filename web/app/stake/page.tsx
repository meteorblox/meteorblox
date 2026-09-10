import type { Metadata } from "next";
import { Game } from "../page";

export const metadata: Metadata = {
  title: "Stake DSLVR | SLVRBLOX",
  description: "Stake DSLVR on Sui Testnet, review vault activity, and manage your staking position.",
  alternates: { canonical: "/stake" },
};

export default function StakePage() {
  return <Game initialView="stake" />;
}
