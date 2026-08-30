import type { Metadata } from "next";
import { ProtocolPage } from "../protocol-page";

export const metadata: Metadata = { title: "Roadmap | SLVRBLOX", description: "Current SLVRBLOX development roadmap." };

export default function RoadmapPage() {
  return <ProtocolPage eyebrow="DEVELOPMENT PLAN" title="Roadmap" intro="The roadmap is milestone-based. Dates will be announced only after the preceding safety and reliability requirements are met." sections={[
    { title: "1. Testnet beta — active", items: ["Validate multi-block play, autoplay, round settlement, rewards, and refinery claims.", "Exercise idle-round recovery and keeper reliability under real Testnet conditions.", "Collect tester feedback and correct user-interface and transaction failures."] },
    { title: "2. Mainnet readiness", items: ["Complete independent Move security review and remediation.", "Run full token, allocation, treasury, vesting, and sale rehearsals on Testnet.", "Finalize operational monitoring, incident procedures, and legal and compliance review."] },
    { title: "3. Mainnet launch", items: ["Publish the reviewed DSLVR token and allocation contracts.", "Establish approved treasury custody and launch liquidity.", "Open Mainnet gameplay only after deployed contracts and integrations are verified."] },
    { title: "4. Post-launch", items: ["Monitor live economics and protocol reliability before expanding features.", "Evaluate staking rewards, ecosystem integrations, and community-led improvements."] },
  ]} />;
}
