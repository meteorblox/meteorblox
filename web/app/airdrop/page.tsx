import type { Metadata } from "next";
import { ProtocolPage } from "../protocol-page";
import { AirdropProgress } from "./airdrop-progress";

export const metadata: Metadata = {
  title: "Testnet Airdrop | SLVRBLOX",
  description: "SLVRBLOX Testnet participation levels and prospective DSLVR airdrop eligibility rules.",
};

export default function AirdropPage() {
  return <ProtocolPage
    eyebrow="TESTNET PARTICIPATION"
    title="Tester Airdrop"
    intro="Active SLVRBLOX Testnet participants can qualify for a future DSLVR airdrop. The program rewards consistent, useful testing—not Testnet SUI expenditure. Testnet tokens have no monetary value, and qualification does not guarantee a specific allocation."
    sections={[
      {
        title: "Qualification levels",
        items: [
          "BLOX TESTER — Complete at least 25 settled rounds across 5 different days.",
          "ACTIVE MINER — Complete at least 75 settled rounds across 10 different days.",
          "CORE TESTER — Complete at least 200 settled rounds across 20 different days.",
          "MASTER MINER — Complete at least 1,000 qualifying settled rounds across 30 different days and complete at least one verified manual test action.",
          "Verified, actionable bug reports may receive additional consideration regardless of level.",
        ],
      },
      {
        title: "What counts",
        items: [
          "A round counts after the wallet's deployment is confirmed and that round settles on Sui Testnet.",
          "A maximum of 50 settled rounds per wallet per UTC day count toward qualification. Autoplay may count within that cap; idle simulation never counts.",
          "Activity is measured by participating wallet address using available on-chain records and project logs.",
          "Playing with more Testnet SUI does not increase eligibility; consistency and useful participation matter.",
        ],
      },
      {
        title: "Fair-use rules",
        items: [
          "One participant may not use multiple wallets to manufacture eligibility.",
          "Automated spam, coordinated farming, exploits, wash activity, and manipulated rounds may be excluded.",
          "Wallets must comply with applicable restrictions and successfully complete any required verification.",
          "Master Miner status shown before the snapshot is provisional until a claim, early withdrawal, autoplay cancellation, qualifying bug report, or other approved manual test action is verified.",
          "SLVRBLOX may adjust thresholds, snapshots, or eligibility rules to protect testers and the project.",
        ],
      },
      {
        title: "Allocation and timing",
        items: [
          "The airdrop pool is capped at 50,000 DSLVR: 45,000 DSLVR for level-based participation and 5,000 DSLVR reserved for verified, actionable bug reports.",
          "Level weights are BLOX TESTER 1 share, ACTIVE MINER 3 shares, CORE TESTER 8 shares, and MASTER MINER 25 shares. Only the highest verified level counts.",
          "Each eligible wallet's provisional level allocation equals 45,000 DSLVR multiplied by its shares and divided by all eligible shares at the final snapshot.",
          "Illustrative example only: with 200 Blox Testers, 80 Active Miners, 30 Core Testers, and 10 Master Miners, potential allocations would be approximately 48.39, 145.16, 387.10, and 1,209.68 DSLVR per eligible wallet, respectively.",
          "Final amounts depend on verified participation and may be adjusted to exclude abuse, resolve eligibility, or protect the fixed pool; no specific DSLVR amount or value is guaranteed.",
          "Snapshot timing, claim instructions, and final eligibility results will be announced through official SLVRBLOX channels.",
          "Participation is not a purchase, investment, or guarantee of value, listing, liquidity, or future rewards.",
        ],
      },
    ]}
  >
    <AirdropProgress />
  </ProtocolPage>;
}
