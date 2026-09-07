"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type LiveState = { round?: number; potSui?: number; motherlodeDslvr?: number };

export function LandingPage() {
  const [live, setLive] = useState<LiveState | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/landing", { cache: "no-store", signal: controller.signal })
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
      <div className="landing-socials" aria-label="SLVRBLOX community links">
        <a href="https://discord.gg/G7Uc3Ck66" target="_blank" rel="noreferrer" title="Join SLVRBLOX on Discord" aria-label="Join SLVRBLOX on Discord"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.54 5.34A17.3 17.3 0 0 0 15.29 4l-.52 1.06a15.77 15.77 0 0 0-5.54 0L8.7 4A17.45 17.45 0 0 0 4.45 5.34C1.76 9.43 1.03 13.42 1.4 17.35a17.1 17.1 0 0 0 5.21 2.69l1.26-1.76a11.1 11.1 0 0 1-1.98-.97l.49-.38c3.82 1.8 7.96 1.8 11.73 0l.5.38c-.64.38-1.3.7-1.99.97l1.26 1.76a17.03 17.03 0 0 0 5.21-2.69c.43-4.56-.73-8.51-3.55-12.01ZM8.68 14.93c-1.15 0-2.1-1.08-2.1-2.4s.93-2.4 2.1-2.4c1.18 0 2.12 1.09 2.1 2.4 0 1.32-.93 2.4-2.1 2.4Zm6.64 0c-1.15 0-2.1-1.08-2.1-2.4s.93-2.4 2.1-2.4c1.18 0 2.12 1.09 2.1 2.4 0 1.32-.92 2.4-2.1 2.4Z" /></svg></a>
        <a href="https://t.me/+0Nh5q0wj2IY3OTkx" target="_blank" rel="noreferrer" title="Follow SLVRBLOX on Telegram" aria-label="Follow SLVRBLOX on Telegram"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.7 3.3a1.4 1.4 0 0 0-1.45-.2L2.9 9.8c-1.18.46-1.16 1.13-.2 1.43l4.45 1.39 1.72 5.27c.21.58.11.82.73.82.48 0 .69-.22.96-.48l2.13-2.07 4.43 3.27c.82.45 1.41.22 1.61-.76l2.92-13.76c.3-1.2-.46-1.75.05-1.61ZM8.62 12.3l8.68-5.48c.43-.26.82-.12.5.17l-7.16 6.46-.28 3.03-1.74-4.18Z" /></svg></a>
      </div>
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
