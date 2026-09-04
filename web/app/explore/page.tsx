"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ExploreState = { round: number; potSui: number; motherlodeDslvr: number; playedTiles: number[]; settled: boolean };
type ExploreActivity = {
  packageId: string; indexedEntries: number; indexedMiners: number; indexedDeployedSui: number;
  rounds: Array<{ round: number; winningTile: number; winnerType: "split" | "individual" | "pending"; winnerAddress: string | null; winnerCount: number; winningEntries: number; deployedSui: number; vaultedSui: number; winningsSui: number; dslvrWinnings: number; rewardPoolSui: number; transaction: string | null; timestamp: string | null }>;
  motherlodes: Array<{ round: number; winningTile: number; addedDslvr: number; balanceDslvr: number; hit: boolean; transaction: string | null; timestamp: string | null }>;
  audit: Array<{ round: number; expectedWinnerPoolSui: number; actualWinnerPoolSui: number; treasurySui: number; rewardsSui: number; opsSui: number; paidSui: number; paidDslvr: number; winnerClaims: number; status: "pass" | "mismatch" | "pending" }>;
  auditSummary: { checked: number; passed: number; mismatches: number; pending: number };
};

const dateLabel = (timestamp: string | null) => timestamp ? new Date(timestamp).toLocaleString() : "Confirmed";
const shortAddress = (address: string | null) => address ? `${address.slice(0, 5)}…${address.slice(-4)}` : "Indexing";

export default function ExplorePage() {
  const [data, setData] = useState<ExploreState | null>(null);
  const [activity, setActivity] = useState<ExploreActivity | null>(null);
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
      <Link className="explore-brand" href="/"><img src="/brand/slvrblox-logo-trimmed.png" alt="SLVRBLOX" /></Link>
      <nav><Link href="/">Mine</Link><Link href="/?view=stake">Stake</Link><Link className="active" href="/explore">Explore</Link><Link href="/status">Status</Link></nav>
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
      <div className="explore-tabs"><button className="active">Rounds</button></div>
      <div className="activity-table">
        <div className="activity-row activity-head"><span>ROUND</span><span>TILE</span><span>DSLVR WINNER</span><span>WINNERS</span><span>DEPLOYED</span><span>VAULTED</span><span>WINNINGS</span><span>TIME</span></div>
        {(activity?.rounds ?? []).map((round) => <div className="activity-row" key={`${round.round}-${round.transaction}`}><strong>#{String(round.round).padStart(6, "0")}</strong><span>#{round.winningTile}</span><span>{round.winnerType === "split" ? <b className="winner-split">Split</b> : round.winnerType === "individual" ? <b className="winner-wallet" title={round.winnerAddress ?? undefined}>{shortAddress(round.winnerAddress)}</b> : <b className="winner-pending">Indexing</b>}</span><span title={`${round.winningEntries} winning ${round.winningEntries === 1 ? "entry" : "entries"}`}>{round.winnerCount}</span><span>{round.deployedSui.toFixed(4)} SUI</span><span>{round.vaultedSui.toFixed(4)} SUI</span><span><strong>{round.winningsSui.toFixed(4)} SUI</strong><small>{round.dslvrWinnings.toFixed(4)} DSLVR</small></span>{round.transaction ? <a href={`https://testnet.suivision.xyz/txblock/${round.transaction}`} target="_blank" rel="noreferrer" title="View settlement transaction">{dateLabel(round.timestamp)}</a> : <span>{dateLabel(round.timestamp)}</span>}</div>)}
        {!activity?.rounds.length && <p className="activity-empty">Waiting for the next settlement.</p>}
      </div>
    </section>

    <section className="accounting-audit"><div className="audit-heading"><div><p>ON-CHAIN ACCOUNTING</p><h2>Round integrity audit</h2><span>Recomputes the 90/5/2/3 SUI allocation and reconciles winner SUI plus the 0.25 DSLVR round reward.</span></div><strong className={(activity?.auditSummary.mismatches ?? 0) ? "audit-bad" : "audit-good"}>{activity ? `${activity.auditSummary.passed}/${activity.auditSummary.checked} verified` : "Checking…"}</strong></div>
      <div className="audit-table"><div className="audit-row audit-head"><span>ROUND</span><span>WINNER POOL</span><span>FEES 5/2/3</span><span>PAID</span><span>STATUS</span></div>{(activity?.audit ?? []).map((item) => <div className="audit-row" key={item.round}><strong>#{String(item.round).padStart(6, "0")}</strong><span>{item.actualWinnerPoolSui.toFixed(6)} SUI</span><span>{item.treasurySui.toFixed(6)} / {item.rewardsSui.toFixed(6)} / {item.opsSui.toFixed(6)}</span><span>{item.paidSui.toFixed(6)} SUI · {item.paidDslvr.toFixed(6)} DSLVR</span><b className={`audit-${item.status}`}>{item.status === "pass" ? "VERIFIED" : item.status.toUpperCase()}</b></div>)}</div>
      {!!activity?.auditSummary.pending && <p className="audit-note">Pending means indexed winner events are not yet available; it is not counted as a mismatch.</p>}
    </section>

    <section className="diagnostic-card"><div><p>TESTNET SUPPORT</p><h2>Found something wrong?</h2><span>Copy the current round, package, settlement and browser details—never private keys.</span></div><button onClick={() => setReportOpen((open) => !open)}>{reportOpen ? "Close report" : "Report a bug"}</button>{reportOpen && <div className="diagnostic-report"><pre>{diagnosticReport}</pre><div><button onClick={copyReport}>{copied ? "Copied" : "Copy diagnostic report"}</button><a href="https://discord.gg/G7Uc3Ck66" target="_blank" rel="noreferrer">Open Discord ↗</a></div></div>}</section>
    <footer className="explore-footer"><span>SLVRBLOX · Sui Testnet</span><Link href="/">Back to mining grid →</Link></footer>
  </main>;
}
