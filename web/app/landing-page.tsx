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

  return <main className="landing-page">
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
      <div className="landing-coin" aria-hidden="true"><img src="/brand/dslvr-coin.png" alt="" /></div>
      <div className="landing-copy">
        <p><span /> SUI TESTNET · LIVE</p>
        <h1>Mine the grid.<br />Claim the <em>load.</em></h1>
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

    <footer className="landing-footer"><span>SLVRBLOX · BUILT ON SUI</span><div><Link href="/status">System status</Link><Link href="/chat">Community</Link><Link href="/roadmap">Roadmap</Link></div><small>TESTNET</small></footer>
  </main>;
}
