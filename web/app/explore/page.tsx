"use client";

import { useEffect, useState } from "react";

type ExploreState = { round: number; potSui: number; playedTiles: number[]; settled: boolean };
type ExploreActivity = {
  packageId: string; indexedEntries: number; indexedMiners: number; indexedDeployedSui: number;
  rounds: Array<{ round: number; winningTile: number; deployedSui: number; rewardPoolSui: number; transaction: string | null; timestamp: string | null }>;
  rewards: Array<{ owner: string; amountDslvr: number; transaction: string | null; timestamp: string | null }>;
};

const shortAddress = (address: string) => address ? `${address.slice(0, 7)}...${address.slice(-5)}` : "Unknown";
const dateLabel = (timestamp: string | null) => timestamp ? new Date(timestamp).toLocaleString() : "Confirmed";

export default function ExplorePage() {
  const [data, setData] = useState<ExploreState | null>(null);
  const [activity, setActivity] = useState<ExploreActivity | null>(null);
  const [tab, setTab] = useState<"rounds" | "motherloads">("rounds");
  const [reportOpen, setReportOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [gameResponse, activityResponse] = await Promise.all([
        fetch("/api/game", { cache: "no-store" }), fetch("/api/explore", { cache: "no-store" }),
      ]);
      if (gameResponse.ok && active) setData(await gameResponse.json());
      if (activityResponse.ok && active) setActivity(await activityResponse.json());
    };
    load().catch(() => undefined);
    const timer = window.setInterval(() => load().catch(() => undefined), 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const diagnosticReport = [
    "SLVRBLOX Testnet bug report", `Time: ${new Date().toISOString()}`,
    `Page: ${typeof window === "undefined" ? "/explore" : window.location.href}`,
    "App: Explore / Testnet beta", `Round: ${data?.round ?? "Unavailable"}`,
    `Round status: ${data?.settled ? "Settled" : "Open"}`,
    `Package: ${activity?.packageId ?? "Unavailable"}`,
    `Latest settlement: ${activity?.rounds[0]?.transaction ?? "None"}`,
    `Browser: ${typeof navigator === "undefined" ? "Unavailable" : navigator.userAgent}`,
    "What happened: ", "What you expected: ",
  ].join("\n");

  async function copyReport() {
    await navigator.clipboard.writeText(diagnosticReport);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return <main className="explore-page">
    <header className="explore-topbar">
      <a className="explore-brand" href="/"><img src="/brand/slvrblox-logo-trimmed.png" alt="SLVRBLOX" /></a>
      <nav><a href="/">Mine</a><a href="/?view=stake">Stake</a><a className="active" href="/explore">Explore</a></nav>
      <span className="explore-network"><i /> Sui Testnet</span>
    </header>

    <section className="explore-hero"><p>PROTOCOL</p><h1>Explore</h1><span>Review confirmed SLVRBLOX Testnet stats and activity.</span></section>

    <section className="explore-stats">
      <article><h2>Market</h2><dl><div><dt>DSLVR TEST VALUE</dt><dd>$10.00 <small>simulated</small></dd></div><div><dt>NETWORK</dt><dd>Sui Testnet</dd></div><div><dt>STATUS</dt><dd className="status-live">Live beta</dd></div></dl></article>
      <article><h2>Mining</h2><dl><div><dt>CURRENT ROUND</dt><dd>#{String(data?.round ?? 0).padStart(6, "0")}</dd></div><div><dt>CURRENTLY DEPLOYED</dt><dd>{(data?.potSui ?? 0).toFixed(4)} SUI</dd></div><div><dt>BLOCKS PLAYED</dt><dd>{data?.playedTiles?.length ?? 0} / 25</dd></div></dl></article>
      <article><h2>Indexed activity</h2><dl><div><dt>ENTRY EVENTS</dt><dd>{activity?.indexedEntries ?? "—"}</dd></div><div><dt>UNIQUE MINERS</dt><dd>{activity?.indexedMiners ?? "—"}</dd></div><div><dt>DEPLOYED IN INDEX</dt><dd>{activity ? `${activity.indexedDeployedSui.toFixed(4)} SUI` : "—"}</dd></div></dl></article>
      <article><h2>Supply</h2><dl><div><dt>MAX DSLVR</dt><dd className="coin-value"><img src="/brand/dslvr-coin.png" alt="" />5,000,000</dd></div><div><dt>CIRCULATING</dt><dd>Testnet</dd></div><div><dt>REFINING</dt><dd>Time locked</dd></div></dl></article>
    </section>

    <section className="explore-activity"><h2>Verified activity</h2>
      <div className="explore-tabs"><button className={tab === "rounds" ? "active" : ""} onClick={() => setTab("rounds")}>Rounds</button><button className={tab === "motherloads" ? "active" : ""} onClick={() => setTab("motherloads")}>Motherloads</button></div>
      {tab === "rounds" ? <div className="activity-table">
        <div className="activity-row activity-head"><span>ROUND</span><span>WINNING BLOCK</span><span>DEPLOYED</span><span>REWARD POOL</span><span>SETTLEMENT</span></div>
        {(activity?.rounds ?? []).map((round) => <div className="activity-row" key={`${round.round}-${round.transaction}`}><strong>#{String(round.round).padStart(6, "0")}</strong><span>Block {round.winningTile}</span><span>{round.deployedSui.toFixed(4)} SUI</span><span>{round.rewardPoolSui.toFixed(4)} SUI</span>{round.transaction ? <a href={`https://testnet.suivision.xyz/txblock/${round.transaction}`} target="_blank" rel="noreferrer" title={dateLabel(round.timestamp)}>View ↗</a> : <span>Confirmed</span>}</div>)}
        {!activity?.rounds.length && <p className="activity-empty">Waiting for the next settlement.</p>}
      </div> : <div className="reward-list">
        <div className="activity-row activity-head"><span>MINER</span><span>DSLVR AWARDED</span><span>TIME</span><span>STATUS</span><span>TRANSACTION</span></div>
        {(activity?.rewards ?? []).map((reward, index) => <div className="activity-row" key={`${reward.transaction}-${index}`}><strong>{shortAddress(reward.owner)}</strong><span>{reward.amountDslvr.toFixed(6)} DSLVR</span><span>{dateLabel(reward.timestamp)}</span><span className="status-live">Confirmed</span>{reward.transaction ? <a href={`https://testnet.suivision.xyz/txblock/${reward.transaction}`} target="_blank" rel="noreferrer">View ↗</a> : <span>—</span>}</div>)}
        {!activity?.rewards.length && <p className="activity-empty">Confirmed DSLVR rewards will appear here.</p>}
      </div>}
    </section>

    <section className="diagnostic-card"><div><p>TESTNET SUPPORT</p><h2>Found something wrong?</h2><span>Copy the current round, package, settlement and browser details—never private keys.</span></div><button onClick={() => setReportOpen((open) => !open)}>{reportOpen ? "Close report" : "Report a bug"}</button>{reportOpen && <div className="diagnostic-report"><pre>{diagnosticReport}</pre><div><button onClick={copyReport}>{copied ? "Copied" : "Copy diagnostic report"}</button><a href="https://discord.gg/G7Uc3Ck66" target="_blank" rel="noreferrer">Open Discord ↗</a></div></div>}</section>
    <footer className="explore-footer"><span>SLVRBLOX · Sui Testnet</span><a href="/">Back to mining grid →</a></footer>
  </main>;
}
