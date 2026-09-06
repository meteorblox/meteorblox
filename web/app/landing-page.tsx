"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type LiveState = { round?: number; potSui?: number; motherlodeDslvr?: number };

export function LandingPage() {
  const [live, setLive] = useState<LiveState | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/game", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((value) => { if (value) setLive(value as LiveState); })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": "https://www.slvrblox.com/#website", url: "https://www.slvrblox.com/", name: "SLVRBLOX", description: "A live mining game and community ecosystem built on Sui." },
      { "@type": "SoftwareApplication", "@id": "https://www.slvrblox.com/#game", name: "SLVRBLOX", applicationCategory: "GameApplication", operatingSystem: "Web", url: "https://www.slvrblox.com/mine", description: "Deploy SUI across a 25-block mining grid, compete for SUI and DSLVR rewards, and refine DSLVR on Sui Testnet.", image: "https://www.slvrblox.com/og.png", offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Public Testnet access; Testnet tokens have no monetary value." } }
    ]
  };

  return <main className="landing-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
    <header className="landing-nav">
      <Link href="/" className="landing-logo" aria-label="SLVRBLOX home"><img src="/brand/slvrblox-logo-trimmed.png" alt="SLVRBLOX" /></Link>
      <nav aria-label="Main navigation">
        <Link href="/mine">Mine</Link>
        <Link href="/explore">Explore</Link>
        <Link href="/airdrop">Airdrop</Link>
        <Link href="/tokenomics">Tokenomics</Link>
      </nav>
      <a className="landing-presale" href="https://sale.slvrblox.com">Presale <span>↗</span></a>
    </header>

    <section className="landing-hero">
      <div className="landing-orbit" aria-hidden="true"><i /><i /><i /></div>
      <p className="landing-live"><span /> SUI TESTNET · LIVE</p>
      <div className="landing-coin" aria-hidden="true"><img src="/brand/dslvr-coin.png" alt="" /></div>
      <div className="landing-copy">
        <h1>Mine the grid.<br />Claim the <em>blox.</em></h1>
        <div className="landing-actions">
          <Link className="landing-primary" href="/mine">Enter the mine <b>→</b></Link>
          <Link className="landing-secondary" href="/whitepaper">Explore the protocol</Link>
        </div>
      </div>
    </section>

    <section className="landing-metrics" aria-label="Protocol overview">
      <article><span>LIVE ROUND</span><strong>{live?.round ? `#${live.round.toLocaleString()}` : "SYNCING"}</strong></article>
      <article><span>ROUND DEPLOYED</span><strong>{live ? `${Number(live.potSui ?? 0).toFixed(3)} SUI` : "—"}</strong></article>
      <article><span>MOTHERLOAD</span><strong>{live ? `${Number(live.motherlodeDslvr ?? 0).toFixed(1)} DSLVR` : "—"}</strong></article>
      <article><span>AIRDROP POOL</span><strong>50,000 DSLVR</strong></article>
    </section>

    <section className="landing-seo" aria-labelledby="landing-about-title">
      <div><p>BUILT ON SUI</p><h2 id="landing-about-title">A live mining game driven by every block.</h2></div>
      <div className="landing-seo-grid">
        <article><span>01</span><h3>Deploy across 25 blocks</h3><p>Select grid positions, deploy SUI, and compete in transparent rounds settled on Sui Testnet.</p><Link href="/mine">Start mining →</Link></article>
        <article><span>02</span><h3>Earn and refine DSLVR</h3><p>Winning rounds can award SUI and DSLVR. DSLVR follows a gradual seven-day refinery process.</p><Link href="/whitepaper">Read the protocol →</Link></article>
        <article><span>03</span><h3>Track airdrop progress</h3><p>Verified Testnet participation, qualifying rounds, and active days are recorded on the public leaderboard.</p><Link href="/airdrop">View airdrop levels →</Link></article>
      </div>
    </section>

    <footer className="landing-footer"><span>SLVRBLOX · BUILT ON SUI</span><div><Link href="/status">System status</Link><Link href="/chat">Community</Link><Link href="/roadmap">Roadmap</Link></div><small>TESTNET</small></footer>
  </main>;
}
