import type { Metadata } from "next";
import { ProtocolPage } from "../protocol-page";

export const metadata: Metadata = { title: "Tokenomics | SLVRBLOX", description: "DSLVR supply, allocation, vesting, and utility." };

export default function TokenomicsPage() {
  return <ProtocolPage eyebrow="DSLVR SUPPLY & DISTRIBUTION" title="Tokenomics" intro="DSLVR (Digital SLVR) is the gameplay and reward token designed for SLVRBLOX. The Mainnet candidate has six decimals and an absolute maximum supply of 5,000,000 DSLVR." sections={[
    { title: "Allocation", items: ["Player rewards — 60% (3,000,000 DSLVR)", "Liquidity — 15% (750,000 DSLVR)", "Treasury and ecosystem — 10% (500,000 DSLVR)", "Staking rewards — 7% (350,000 DSLVR)", "Team — 5% (250,000 DSLVR)", "Presale and funding — 3% (150,000 DSLVR)"] },
    { title: "Release schedule", items: ["Player rewards: emitted only through gameplay, up to the lifetime allocation cap.", "Liquidity: available at launch through approved treasury custody.", "Treasury: 10% at launch, followed by 90% over 24 monthly tranches.", "Staking rewards: released over 36 monthly tranches.", "Team: 12-month cliff, followed by 24 monthly tranches.", "Presale: 20% at token launch, followed by 80% over 12 monthly tranches."] },
    { title: "Refinement", paragraphs: ["Gameplay rewards begin as unrefined DSLVR. The standard refinement period is 24 hours. An early claim applies a 10% penalty; the deducted amount is forfeited rather than redistributed to other players."] },
    { title: "Status", paragraphs: ["These parameters describe the approved Mainnet candidate design. The current application is on Testnet, and Testnet balances are not Mainnet DSLVR. Final Mainnet deployment depends on testing and independent review."] },
  ]} />;
}
