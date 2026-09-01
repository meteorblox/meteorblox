import type { Metadata } from "next";
import { ProtocolPage } from "../protocol-page";

export const metadata: Metadata = { title: "Whitepaper | SLVRBLOX", description: "SLVRBLOX protocol overview and gameplay design." };

export default function WhitepaperPage() {
  return <ProtocolPage eyebrow="PROJECT OVERVIEW" title="SLVRBLOX Whitepaper" intro="SLVRBLOX is an on-chain mining game built on Sui. Players deploy SUI across a 25-block grid, rounds resolve using Sui randomness, and eligible activity earns unrefined DSLVR that matures through the refinery." sections={[
    { title: "How it works", items: ["Choose one or more grid blocks and deploy SUI for the current round.", "The round closes and an on-chain winning block is selected.", "Gameplay rewards enter the refinery as unrefined DSLVR.", "DSLVR matures after 24 hours and can then be claimed without an early-withdrawal penalty."] },
    { title: "On-chain operation", paragraphs: ["Round entries, settlement, reward accounting, refinement, and claims are handled through Sui Move objects and transactions. The public interface reads chain state and prompts the connected wallet for actions that require a signature."] },
    { title: "DSLVR supply", paragraphs: ["DSLVR has six decimals and a maximum supply of 5,000,000 tokens. The published allocation reserves 60% for gameplay rewards and 1% for eligible Testnet participants. Unsold presale inventory returns to treasury custody and does not enter circulation automatically. Up to 35,000 DSLVR may be funded from the Treasury & Ecosystem allocation for eligible presale bonuses; unused tokens remain in treasury."] },
    { title: "Current status", paragraphs: ["SLVRBLOX is currently a Testnet beta. Testnet assets have no monetary value. Mainnet publication remains subject to testing, security review, operational readiness, and legal and compliance review."] },
    { title: "Risk notice", paragraphs: ["Blockchain transactions are irreversible and network conditions may delay updates. Gameplay, reward rates, token parameters, and launch plans may change before Mainnet. Nothing in this document is investment advice or a promise of profit."] },
  ]} />;
}
