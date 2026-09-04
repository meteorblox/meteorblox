"use client";

import Link from "next/link";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { useEffect, useState } from "react";

type Progress = {
  qualifyingRounds: number;
  activeDays: number;
  currentLevel: string;
  nextLevel: { name: string; rounds: number; days: number } | null;
  progress: number;
};

type Tester = { rank: number; address: string; username: string; qualifyingRounds: number; activeDays: number; currentLevel: string };
type Leaderboard = { testers: Tester[]; totalTesters: number; updatedAt: string };

function shortAddress(address: string) { return `${address.slice(0, 8)}...${address.slice(-6)}`; }

function TopTestersLeaderboard() {
  const [data, setData] = useState<Leaderboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/airdrop?leaderboard=1", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Leaderboard unavailable");
        if (active) setData(payload);
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Leaderboard unavailable"); });
    return () => { active = false; };
  }, []);

  return <section className="airdrop-leaderboard" aria-label="Top Testnet testers">
    <div className="airdrop-leaderboard-heading"><div><p>TOP TESTERS</p><h2>Testnet Leaderboard</h2></div><span>{data ? `${data.totalTesters} participating wallets` : "Verified on Sui Testnet"}</span></div>
    {error ? <p className="airdrop-progress-error">{error}. Please refresh in a moment.</p> :
      <div className="airdrop-leaderboard-table">
        <div className="airdrop-leaderboard-row head"><span>RANK</span><span>WALLET</span><span>LEVEL</span><span>ROUNDS</span><span>DAYS</span></div>
        {data?.testers.map((tester) => <div className={`airdrop-leaderboard-row rank-${tester.rank}`} key={tester.address}>
          <strong>#{tester.rank}</strong><span className="leaderboard-wallet"><b>{tester.username || "Anonymous"}</b><code title={tester.address}>{shortAddress(tester.address)}</code></span><span>{tester.currentLevel}</span><b>{tester.qualifyingRounds}</b><b>{tester.activeDays}</b>
        </div>) ?? <div className="airdrop-leaderboard-loading">Reading verified Testnet activity…</div>}
        {data?.testers.length === 0 && <div className="airdrop-leaderboard-loading">No settled tester activity yet.</div>}
      </div>}
    <small>Ranked by achieved level, active testing days, then unique settled rounds. Rankings remain subject to fair-use review and do not guarantee a DSLVR allocation.</small>
  </section>;
}

export function AirdropProgress() {
  const account = useCurrentAccount();
  const [data, setData] = useState<Progress | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!account?.address) { setData(null); setError(""); return; }
    let active = true;
    setData(null);
    setError("");
    fetch(`/api/airdrop?address=${encodeURIComponent(account.address)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Progress unavailable");
        if (active) setData(payload);
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Progress unavailable"); });
    return () => { active = false; };
  }, [account?.address]);

  return <>
    {!account ? <section className="airdrop-progress-card signed-out" aria-label="Airdrop progress">
      <p>YOUR TESTNET PROGRESS</p><h2>Connect your wallet to view your level.</h2>
      <span>Progress follows your Sui wallet across devices.</span><Link href="/">Connect on the mining grid →</Link>
    </section> : <section className="airdrop-progress-card" aria-label="Airdrop progress">
      <div className="airdrop-progress-heading"><div><p>YOUR TESTNET PROGRESS</p><h2>{data?.currentLevel ?? (error ? "Progress unavailable" : "Reading Sui history…")}</h2></div><code>{shortAddress(account.address)}</code></div>
      {error ? <p className="airdrop-progress-error">{error}. Please refresh in a moment.</p> : <>
        <div className="airdrop-progress-stats"><div><strong>{data?.qualifyingRounds ?? "—"}</strong><span>QUALIFYING ROUNDS</span></div><div><strong>{data?.activeDays ?? "—"}</strong><span>ACTIVE DAYS (UTC)</span></div></div>
        <div className="airdrop-level-track"><i style={{ width: `${data?.progress ?? 0}%` }} /></div>
        <div className="airdrop-next"><span>{data?.nextLevel ? `Next: ${data.nextLevel.name}` : "Highest level achieved"}</span><strong>{data?.nextLevel ? `${data.qualifyingRounds}/${data.nextLevel.rounds} rounds · ${data.activeDays}/${data.nextLevel.days} days` : "100%"}</strong></div>
      </>}
    </section>}
    <TopTestersLeaderboard />
  </>;
}
