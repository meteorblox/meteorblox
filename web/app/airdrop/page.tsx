import type { Metadata } from "next";
import { ProtocolPage } from "../protocol-page";

export const metadata: Metadata = {
  title: "Testnet Airdrop | SLVRBLOX",
  description: "SLVRBLOX Testnet participation levels and prospective DSLVR airdrop eligibility rules.",
};

export default function AirdropPage() {
  return <ProtocolPage
    eyebrow="TESTNET PARTICIPATION"
    title="Tester Airdrop"
    intro="Active SLVRBLOX Testnet participants may qualify for a future DSLVR airdrop. The program rewards consistent, useful testing—not Testnet SUI expenditure. Testnet tokens have no monetary value, and qualification does not guarantee a specific allocation."
    sections={[
      {
        title: "Qualification levels",
        items: [
          "BLOX TESTER — Complete at least 25 settled rounds across 5 different days.",
          "ACTIVE MINER — Complete at least 75 settled rounds across 10 different days.",
          "CORE TESTER — Complete at least 200 settled rounds across 20 different days.",
          "Verified, actionable bug reports may receive additional consideration regardless of level.",
        ],
      },
      {
        title: "What counts",
        items: [
          "A round counts after the wallet's deployment is confirmed and that round settles on Sui Testnet.",
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
          "SLVRBLOX may adjust thresholds, snapshots, or eligibility rules to protect testers and the project.",
        ],
      },
      {
        title: "Allocation and timing",
        items: [
          "No DSLVR amount is promised at this stage. Final allocations depend on verified participation, the approved token distribution, and Mainnet readiness.",
          "Snapshot timing, claim instructions, and final eligibility results will be announced through official SLVRBLOX channels.",
          "Participation is not a purchase, investment, or guarantee of value, listing, liquidity, or future rewards.",
        ],
      },
    ]}
  />;
}
