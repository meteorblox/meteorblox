"use client";

import { useEffect, useState } from "react";

type ExploreState = {
  round: number;
  potSui: number;
  playedTiles: number[];
  settled: boolean;
  lastRound: null | {
    round: number;
    winningTile: number;
    deployedSui: number;
    rewardPoolSui: number;
    mtbxAwarded: number;
    transaction: string;
  };
};

export default function ExplorePage() {
  const [data, setData] = useState<ExploreState | null>(null);
  const [tab, setTab] = useState<"rounds" | "motherloads">("rounds");

  useEffect(() => {
    let active = true;
    const load = async () => {
      const response = await fetch("/api/game", { cache: "no-store" });
      if (response.ok && active) setData(await response.json());
    };
    load().catch(() => undefined);
    const timer = window.setInterval(() => load().catch(() => undefined), 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const last = data?.lastRound;
  return (
    <main className="explore-page">
      <header className="explore-topbar">
        <a className="explore-brand" href="/"><img src="/brand/slvrblox-logo-trimmed.png" alt="SLVRBLOX" /></a>
        <nav><a href="/">Mine</a><a href="/?view=stake">Stake</a><a className="active" href="/explore">Explore</a></nav>
        <span className="explore-network"><i /> Sui Testnet</span>
      </header>

      <section className="explore-hero"><p>PROTOCOL</p><h1>Explore</h1><span>Review SLVRBLOX Testnet stats and activity.</span></section>

      <section className="explore-stats">
        <article><h2>Market</h2><dl><div><dt>DSLVR PRICE</dt><dd>Not listed</dd></div><div><dt>NETWORK</dt><dd>Sui Testnet</dd></div><div><dt>STATUS</dt><dd className="status-live">Live beta</dd></div></dl></article>
        <article><h2>Mining</h2><dl><div><dt>CURRENT ROUND</dt><dd>#{String(data?.round ?? 0).padStart(6, "0")}</dd></div><div><dt>DEPLOYED</dt><dd>{(data?.potSui ?? 0).toFixed(4)} SUI</dd></div><div><dt>BLOCKS PLAYED</dt><dd>{data?.playedTiles?.length ?? 0} / 25</dd></div></dl></article>
        <article><h2>Staking</h2><dl><div><dt>VAULT</dt><dd>Live</dd></div><div><dt>APR</dt><dd>Dynamic</dd></div><div><dt>REWARDS</dt><dd>Protocol funded</dd></div></dl></article>
        <article><h2>Supply</h2><dl><div><dt>MAX DSLVR</dt><dd className="coin-value"><img src="/brand/dslvr-coin.png" alt="" />5,000,000</dd></div><div><dt>CIRCULATING</dt><dd>Testnet</dd></div><div><dt>REFINING</dt><dd>Time locked</dd></div></dl></article>
      </section>

      <section className="explore-activity">
        <h2>Activity</h2>
        <div className="explore-tabs"><button className={tab === "rounds" ? "active" : ""} onClick={() => setTab("rounds")}>Rounds</button><button className={tab === "motherloads" ? "active" : ""} onClick={() => setTab("motherloads")}>Motherloads</button></div>
        {tab === "rounds" ? <div className="activity-table">
          <div className="activity-row activity-head"><span>ROUND</span><span>WINNING BLOCK</span><span>DEPLOYED</span><span>REWARD POOL</span><span>SETTLEMENT</span></div>
          {last ? <div className="activity-row"><strong>#{String(last.round).padStart(6, "0")}</strong><span>Block {last.winningTile}</span><span>{last.deployedSui.toFixed(4)} SUI</span><span>{last.rewardPoolSui.toFixed(4)} SUI</span><a href={`https://testnet.suivision.xyz/txblock/${last.transaction}`} target="_blank" rel="noreferrer">View ↗</a></div> : <p className="activity-empty">Waiting for the next settlement.</p>}
        </div> : <div className="motherload-card"><img src="/brand/dslvr-coin.png" alt="DSLVR" /><div><small>LATEST DSLVR MOTHERLOAD</small><strong>{last ? `${last.mtbxAwarded.toFixed(2)} DSLVR` : "Waiting for settlement"}</strong><p>DSLVR rewards enter the refinery before becoming claimable.</p></div></div>}
      </section>
      <footer className="explore-footer"><span>SLVRBLOX · Sui Testnet</span><a href="/">Back to mining grid →</a></footer>
    </main>
  );
}
