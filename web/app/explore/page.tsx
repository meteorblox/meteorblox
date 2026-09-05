"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCurrentAccount } from "@mysten/dapp-kit-react";

type ExploreState = { round: number; potSui: number; motherlodeDslvr: number; playedTiles: number[]; settled: boolean };
type ExploreActivity = {
  packageId: string; indexedEntries: number; indexedMiners: number; indexedDeployedSui: number;
  rounds: Array<{ round: number; winningTile: number; winnerType: "split" | "individual" | "pending"; winnerAddress: string | null; winnerCount: number; winningEntries: number; deployedSui: number; vaultedSui: number; winningsSui: number; dslvrWinnings: number; rewardPoolSui: number; transaction: string | null; timestamp: string | null }>;
  motherlodes: Array<{ round: number; winningTile: number; addedDslvr: number; balanceDslvr: number; hit: boolean; transaction: string | null; timestamp: string | null }>;
  personal: Array<{ round: number; tiles: number[]; deployedSui: number; winningsSui: number; dslvrWinnings: number; won: boolean; transaction: string | null; timestamp: string | null }>;
  audit: Array<{ round: number; expectedWinnerPoolSui: number; actualWinnerPoolSui: number; treasurySui: number; rewardsSui: number; opsSui: number; paidSui: number; paidDslvr: number; winnerClaims: number; status: "pass" | "mismatch" | "pending" }>;
  auditSummary: { checked: number; passed: number; mismatches: number; pending: number };
};

const dateLabel = (timestamp: string | null) => timestamp ? new Date(timestamp).toLocaleString() : "Confirmed";
const shortAddress = (address: string | null) => address ? `${address.slice(0, 5)}…${address.slice(-4)}` : "Indexing";
const SuiDrop = () => <i className="activity-sui-icon" aria-hidden="true"><svg viewBox="0 0 32 40"><path d="M16 1.8C13.3 5.5 4.2 16.5 4.2 23.9A11.8 11.8 0 0 0 16 35.8a11.8 11.8 0 0 0 11.8-11.9C27.8 16.5 18.7 5.5 16 1.8Zm0 29.6a7.5 7.5 0 0 1-7.5-7.5c0-3.7 4.2-10.2 7.5-14.7 3.3 4.5 7.5 11 7.5 14.7a7.5 7.5 0 0 1-7.5 7.5Z" /></svg></i>;

export default function ExplorePage() {
  const account = useCurrentAccount();
  const [data, setData] = useState<ExploreState | null>(null);
  const [activity, setActivity] = useState<ExploreActivity | null>(null);
  const [activityTab, setActivityTab] = useState<"rounds" | "motherlodes" | "personal">("rounds");
  const [reportOpen, setReportOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [gameResponse, activityResponse] = await Promise.all([
        fetch("/api/game", { cache: "no-store" }), fetch(`/api/explore${account?.address ? `?address=${encodeURIComponent(account.address)}` : ""}`, { cache: "no-store" }),
      ]);
      if (gameResponse.ok && active) setData(await gameResponse.json());
      if (activityResponse.ok && active) setActivity(await activityResponse.json());
    };
    load().catch(() => undefined);
    const timer = window.setInterval(() => load().catch(() => undefined), 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [account?.address]);

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
      <div className="explore-tabs"><button className={activityTab === "rounds" ? "active" : ""} onClick={() => setActivityTab("rounds")}>⚡ Rounds</button><button className={activityTab === "motherlodes" ? "active" : ""} onClick={() => setActivityTab("motherlodes")}>✦ Motherloads</button><button className={activityTab === "personal" ? "active" : ""} onClick={() => setActivityTab("personal")}>♟ Personal</button></div>
      {activityTab === "rounds" && <div className="activity-table">
        <div className="activity-row activity-head"><span>ROUND</span><span>TILE</span><span>DSLVR WINNER</span><span>WINNERS</span><span>DEPLOYED</span><span>VAULTED</span><span>WINNINGS</span><span>TIME</span></div>
        {(activity?.rounds ?? []).map((round) => <div className="activity-row" key={`${round.round}-${round.transaction}`}><strong>#{String(round.round).padStart(6, "0")}</strong><span>#{round.winningTile}</span><span>{round.winnerType === "split" ? <b className="winner-split">Split</b> : round.winnerType === "individual" ? <b className="winner-wallet" title={round.winnerAddress ?? undefined}>{shortAddress(round.winnerAddress)}</b> : <b className="winner-pending">Indexing</b>}</span><span title={`${round.winningEntries} winning ${round.winningEntries === 1 ? "entry" : "entries"}`}>{round.winnerCount}</span><span className="activity-sui"><SuiDrop />{round.deployedSui.toFixed(4)}</span><span className="activity-sui"><SuiDrop />{round.vaultedSui.toFixed(4)}</span><span><strong className="activity-sui"><SuiDrop />{round.winningsSui.toFixed(4)}</strong><small>{round.dslvrWinnings.toFixed(4)} DSLVR</small></span>{round.transaction ? <a href={`https://testnet.suivision.xyz/txblock/${round.transaction}`} target="_blank" rel="noreferrer" title="View settlement transaction">{dateLabel(round.timestamp)}</a> : <span>{dateLabel(round.timestamp)}</span>}</div>)}
        {!activity?.rounds.length && <p className="activity-empty">Waiting for the next settlement.</p>}
      </div>}
      {activityTab === "motherlodes" && <div className="motherlode-table"><p className="tab-description">Recent mining rounds where the motherload hit.</p><div className="motherlode-row motherlode-head"><span>ROUND</span><span>TILE</span><span>DSLVR WINNER</span><span>WINNERS</span><span>DEPLOYED</span><span>VAULTED</span><span>WINNINGS</span><span>MOTHERLOAD</span><span>TIME</span></div>{(activity?.motherlodes ?? []).filter((item) => item.hit).map((item) => { const round = activity?.rounds.find((candidate) => candidate.round === item.round); return <div className="motherlode-row" key={`${item.round}-${item.transaction}`}><strong>#{String(item.round).padStart(6, "0")}</strong><span>#{item.winningTile}</span><span>{round?.winnerType === "split" ? <b className="winner-split">Split</b> : round?.winnerType === "individual" ? <b className="winner-wallet" title={round.winnerAddress ?? undefined}>{shortAddress(round.winnerAddress)}</b> : <b className="winner-pending">Indexing</b>}</span><span>{round?.winnerCount ?? "—"}</span><span className="activity-sui"><SuiDrop />{round?.deployedSui.toFixed(4) ?? "—"}</span><span className="activity-sui"><SuiDrop />{round?.vaultedSui.toFixed(4) ?? "—"}</span><span><strong className="activity-sui"><SuiDrop />{round?.winningsSui.toFixed(4) ?? "—"}</strong><small>{round ? `${round.dslvrWinnings.toFixed(4)} DSLVR` : ""}</small></span><strong className="motherlode-hit">{item.balanceDslvr.toFixed(4)} DSLVR</strong>{item.transaction ? <a href={`https://testnet.suivision.xyz/txblock/${item.transaction}`} target="_blank" rel="noreferrer">{dateLabel(item.timestamp)}</a> : <span>{dateLabel(item.timestamp)}</span>}</div>})}{!(activity?.motherlodes ?? []).some((item) => item.hit) && <p className="activity-empty">No motherload hits indexed yet. The pool is still growing.</p>}</div>}
      {activityTab === "personal" && (!account ? <div className="personal-empty"><strong>Connect your wallet to view personal activity.</strong><span>Your deployments and winnings will appear here automatically.</span><Link href="/">Connect on Mine →</Link></div> : <div className="personal-table"><div className="personal-row personal-head"><span>ROUND</span><span>TILES</span><span>DEPLOYED</span><span>SUI WON</span><span>DSLVR WON</span><span>RESULT</span><span>TIME</span></div>{(activity?.personal ?? []).map((item) => <div className="personal-row" key={`${item.round}-${item.transaction}`}><strong>#{String(item.round).padStart(6, "0")}</strong><span>{item.tiles.map((tile) => `#${tile}`).join(", ")}</span><span className="activity-sui"><SuiDrop />{item.deployedSui.toFixed(4)}</span><span className="activity-sui"><SuiDrop />{item.winningsSui.toFixed(4)}</span><span>{item.dslvrWinnings.toFixed(4)} DSLVR</span><b className={item.won ? "personal-win" : "personal-played"}>{item.won ? "WON" : "PLAYED"}</b>{item.transaction ? <a href={`https://testnet.suivision.xyz/txblock/${item.transaction}`} target="_blank" rel="noreferrer">{dateLabel(item.timestamp)}</a> : <span>{dateLabel(item.timestamp)}</span>}</div>)}{!activity?.personal.length && <p className="activity-empty">No recent deployments found for {shortAddress(account.address)}.</p>}</div>)}
    </section>

    <section className="accounting-audit"><div className="audit-heading"><div><p>ON-CHAIN ACCOUNTING</p><h2>Round integrity audit</h2><span>Recomputes the 90/5/2/3 SUI allocation and reconciles winner SUI plus the 0.25 DSLVR round reward.</span></div><strong className={(activity?.auditSummary.mismatches ?? 0) ? "audit-bad" : "audit-good"}>{activity ? `${activity.auditSummary.passed}/${activity.auditSummary.checked} verified` : "Checking…"}</strong></div>
      <div className="audit-table"><div className="audit-row audit-head"><span>ROUND</span><span>WINNER POOL</span><span>FEES 5/2/3</span><span>PAID</span><span>STATUS</span></div>{(activity?.audit ?? []).map((item) => <div className="audit-row" key={item.round}><strong>#{String(item.round).padStart(6, "0")}</strong><span>{item.actualWinnerPoolSui.toFixed(6)} SUI</span><span>{item.treasurySui.toFixed(6)} / {item.rewardsSui.toFixed(6)} / {item.opsSui.toFixed(6)}</span><span>{item.paidSui.toFixed(6)} SUI · {item.paidDslvr.toFixed(6)} DSLVR</span><b className={`audit-${item.status}`}>{item.status === "pass" ? "VERIFIED" : item.status.toUpperCase()}</b></div>)}</div>
      {!!activity?.auditSummary.pending && <p className="audit-note">Pending means indexed winner events are not yet available; it is not counted as a mismatch.</p>}
    </section>

    <section className="diagnostic-card"><div><p>TESTNET SUPPORT</p><h2>Found something wrong?</h2><span>Copy the current round, package, settlement and browser details—never private keys.</span></div><button onClick={() => setReportOpen((open) => !open)}>{reportOpen ? "Close report" : "Report a bug"}</button>{reportOpen && <div className="diagnostic-report"><pre>{diagnosticReport}</pre><div><button onClick={copyReport}>{copied ? "Copied" : "Copy diagnostic report"}</button><a href="https://discord.gg/G7Uc3Ck66" target="_blank" rel="noreferrer">Open Discord ↗</a></div></div>}</section>
    <footer className="explore-footer"><span>SLVRBLOX · Sui Testnet</span><Link href="/">Back to mining grid →</Link></footer>
  </main>;
}
