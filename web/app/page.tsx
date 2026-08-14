"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCurrentAccount, useDAppKit, useWalletConnection, useWallets } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { upgradeData } from "./upgrade-data";

// The current Testnet upgrade includes the automatic empty-round rollover fix.

const tiles = Array.from({ length: 25 }, (_, index) => index + 1);
const mtbxRoundReward = 0.25;
const testnetOwner = "0x55f035832afb21499461d62630ed4b1cdf6e53b2a43f907e6db55a91eb114781";
const packageId = "0x9073976791cd99b492144abc91268709b241dfc9f9c142c72490f9b0cee02c3e";
const continuousPackageId = packageId;
const upgradeBasePackageId = continuousPackageId;
const gameId = "0xbf0cc524c08bb56d806c2e760b9b1de2c757a74aed3034737a5784cb292257c9";
const refineryId = "0x26588ea54aa0a0be7081177c172e7e5fa7dfb986a53aa672f66b77a092b90c71";
const rewardCapId = "0x86aa770a5d635470c55f5b17b776a3dc68152228d1146600ffac37035e1f1d80";
const upgradeCapId = "0xe6759658c4f3e412ee0d88142671eff44c3149a8c188364b1ab0e9ff4fd143a4";
const ledgerId = "0xa02b0a9574fc9255d5ef6c86cd9968df6e7a7913944d343ffcca1c586a22ef9c";
const suiClockId = "0x6";
const suiRandomId = "0x8";
const startingAmounts = [0.031, 0.047, 0.061, 0.04, 0.046, 0.015, 0.048, 0.056, 0.049, 0.052, 0.042, 0.046, 0.053, 0.045, 0.046, 0.043, 0.057, 0.041, 0.049, 0.049, 0.043, 0.062, 0.058, 0.055, 0.052];

type ChainState = {
  round: number; closesAtMs: number; remainingMs: number; settled: boolean; rewardsBound: boolean; winningTile: number | null;
  tileTotals: number[]; potSui: number; winningEntriesRemaining: number; claimableWinningEntries: number;
  estimatedSuiWinnings: number; estimatedMtbxWinnings: number; refinedMtbx: number; unrefinedMtbx: number;
  refinedPositions: number; unrefinedPositions: number; nextMaturityMs: number | null;
  ledgerSui: number;
};

export default function Home() {
  const [view, setView] = useState<"mine" | "rewards">("mine");
  const [selected, setSelected] = useState<number[]>([]);
  const [tileAmounts, setTileAmounts] = useState(startingAmounts);
  const [amount, setAmount] = useState("0.01");
  const [tileCountInput, setTileCountInput] = useState("0");
  const [rounds, setRounds] = useState(1);
  const [seconds, setSeconds] = useState(60);
  const [notice, setNotice] = useState("");
  const [connectOpen, setConnectOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [usernameDraft, setUsernameDraft] = useState("");
  const [leaderboardTab, setLeaderboardTab] = useState<"miners" | "unrefined" | "refined">("miners");
  const [lastRoundOpen, setLastRoundOpen] = useState(false);
  const [lifetimeDeployed, setLifetimeDeployed] = useState(0);
  const [suiPrice, setSuiPrice] = useState<number | null>(null);
  const [chainState, setChainState] = useState<ChainState | null>(null);
  const [chainLoading, setChainLoading] = useState(true);
  const refreshInFlight = useRef(false);
  const latestRound = useRef(-1);
  const roundDeadline = useRef(Date.now() + 60_000);
  const [submittingPlay, setSubmittingPlay] = useState(false);
  const [activatingGame, setActivatingGame] = useState(false);
  const [roundAction, setRoundAction] = useState(false);
  const [upgradingPackage, setUpgradingPackage] = useState(false);
  const [creatingLedger, setCreatingLedger] = useState(false);
  const [publishingPackage, setPublishingPackage] = useState(false);
  const currentAccount = useCurrentAccount();
  const currentAddress = currentAccount?.address;
  const dAppKit = useDAppKit();
  const walletConnection = useWalletConnection();
  const wallets = useWallets();
  const connecting = walletConnection.isConnecting;
  const slushWallet = wallets.find((wallet) => wallet.name.toLowerCase().includes("slush"));
  const standardWallets = wallets.filter((wallet) => !wallet.name.toLowerCase().includes("slush"));

  async function connectWallet(wallet: (typeof wallets)[number]) {
    try {
      await dAppKit.connectWallet({ wallet });
      setConnectOpen(false);
      setNotice("Sui Testnet wallet connected.");
    } catch (error) {
      setNotice(`Connection cancelled: ${error instanceof Error ? error.message : "Unexpected wallet error"}`);
    }
  }

  useEffect(() => {
    const update = () => setSeconds(chainState?.settled ? 0 : Math.max(0, Math.ceil((roundDeadline.current - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [chainState?.round, chainState?.remainingMs, chainState?.settled]);

  useEffect(() => {
    let active = true;
    fetch("/api/market").then((response) => response.json()).then((data) => {
      if (active && typeof data.suiUsd === "number") setSuiPrice(data.suiUsd);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const refreshChainState = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const query = currentAddress ? `?address=${encodeURIComponent(currentAddress)}` : "";
      const response = await fetch(`/api/game${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to read Sui Testnet");
      const next = data as ChainState;
      if (next.round >= latestRound.current) {
        latestRound.current = next.round;
        roundDeadline.current = Date.now() + next.remainingMs;
        setChainState(next);
        setTileAmounts(next.tileTotals);
      }
    } catch (error) {
      setNotice(error instanceof Error ? `Chain state unavailable: ${error.message}` : "Chain state unavailable.");
    } finally {
      refreshInFlight.current = false;
      setChainLoading(false);
    }
  }, [currentAddress]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refreshChainState(), 0);
    const timer = window.setInterval(() => void refreshChainState(), 2_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [refreshChainState]);

  const total = useMemo(() => {
    const value = Number(amount);
    return Number.isFinite(value) ? value * selected.length * rounds : 0;
  }, [amount, selected, rounds]);

  function toggleTile(tile: number) {
    const next = selected.includes(tile) ? selected.filter((item) => item !== tile) : [...selected, tile];
    setSelected(next);
    setTileCountInput(String(next.length));
    setNotice("");
  }

  async function copyAddress() {
    if (!currentAccount) return;
    await navigator.clipboard.writeText(currentAccount.address);
    setNotice("Wallet address copied.");
  }

  function openAccountDrawer() {
    if (!currentAccount) return setConnectOpen(true);
    const saved = window.localStorage.getItem(`meteorblox:username:${currentAccount.address.toLowerCase()}`) ?? "";
    setUsername(saved);
    setUsernameDraft(saved);
    setLifetimeDeployed(Number(window.localStorage.getItem(`meteorblox:deployed:${currentAccount.address.toLowerCase()}`) ?? "0"));
    setAccountOpen(true);
  }

  function saveUsername() {
    if (!currentAccount) return;
    const cleaned = usernameDraft.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20);
    if (cleaned.length < 3) return setNotice("Username must contain at least 3 letters, numbers, _ or -.");
    window.localStorage.setItem(`meteorblox:username:${currentAccount.address.toLowerCase()}`, cleaned);
    setUsername(cleaned);
    setUsernameDraft(cleaned);
    setNotice(`Username saved as ${cleaned}.`);
  }

  function selectTileCount(requested: number) {
    const count = Math.max(0, Math.min(25, Math.floor(requested || 0)));
    setTileCountInput(String(count));
    setSelected((current) => {
      const kept = current.slice(0, count);
      if (kept.length === count) return kept;
      const available = tiles.filter((tile) => !kept.includes(tile));
      return [...kept, ...available.slice(0, count - kept.length)];
    });
    setNotice("");
  }

  function toggleAllTiles() {
    const next = selected.length === 25 ? [] : tiles;
    setSelected(next);
    setTileCountInput(String(next.length));
  }

  function changeTileCount(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 2);
    setTileCountInput(digits);
    if (digits === "") return;
    const requested = Number(digits);
    if (Number.isFinite(requested)) selectTileCount(requested);
  }

  function suiToMist(value: string) {
    const normalized = value.trim();
    if (!/^\d+(\.\d{0,9})?$/.test(normalized)) return null;
    const [whole, fraction = ""] = normalized.split(".");
    return BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0"));
  }

  async function executeWithSlush(transaction: Transaction) {
    if (!currentAccount) { setConnectOpen(true); return null; }
    const result = await dAppKit.signAndExecuteTransaction({ transaction });
    if ("FailedTransaction" in result) {
      throw new Error(result.FailedTransaction.status.error?.message ?? "Transaction failed on Sui Testnet.");
    }
    return { digest: result.Transaction.digest };
  }

  async function deploy() {
    if (!selected.length) return setNotice("Choose at least one block.");
    const entry = Number(amount);
    if (!Number.isFinite(entry) || entry <= 0) return setNotice("Enter a valid SUI amount.");
    if (rounds !== 1) return setNotice("Live Testnet play currently supports one round per approval. Set Rounds to 1.");
    const mistPerTile = suiToMist(amount);
    if (!mistPerTile || mistPerTile <= 0n) return setNotice("Enter a valid SUI amount with no more than 9 decimals.");
    if (!currentAccount) return setConnectOpen(true);
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address);
    transaction.setGasBudget(50_000_000);
    const game = transaction.object(gameId);
    const clock = transaction.object(suiClockId);
    selected.forEach((tile) => {
      const [payment] = transaction.splitCoins(transaction.gas, [transaction.pure.u64(mistPerTile)]);
      transaction.moveCall({ target: `${packageId}::game::place`, arguments: [game, transaction.pure.u8(tile - 1), payment, clock] });
    });
    setSubmittingPlay(true);
    setNotice("Waiting for Slush Testnet approval...");
    try {
      const result = await executeWithSlush(transaction);
      if (!result) return;
      setTileAmounts((current) => current.map((value, index) => selected.includes(index + 1) ? value + entry : value));
      const deployedTotal = lifetimeDeployed + entry * selected.length;
      setLifetimeDeployed(deployedTotal);
      window.localStorage.setItem(`meteorblox:deployed:${currentAccount.address.toLowerCase()}`, String(deployedTotal));
      setNotice(`Testnet play confirmed. Transaction: ${result.digest}`);
      setSelected([]);
      setTileCountInput("0");
      await refreshChainState();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected wallet error";
      setNotice(`Testnet play failed: ${message}`);
    } finally {
      setSubmittingPlay(false);
    }
  }

  async function activateTestnetGame() {
    if (!currentAccount) return setConnectOpen(true);
    if (currentAccount.address.toLowerCase() !== testnetOwner) return setNotice("Connect the METEORBLOX owner wallet.");
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address);
    transaction.setGasBudget(50_000_000);
    const game = transaction.object(gameId);
    transaction.moveCall({ target: `${packageId}::game::bind_mtbx_rewards`, arguments: [game, transaction.object(rewardCapId)] });
    transaction.moveCall({ target: `${packageId}::game::open_next_round`, arguments: [game, transaction.object(suiClockId)] });
    setActivatingGame(true);
    setNotice("Waiting for Slush to activate the first live round...");
    try {
      const result = await executeWithSlush(transaction);
      if (result) { setNotice(`Live Testnet round activated. Transaction: ${result.digest}`); await refreshChainState(); }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected wallet error";
      setNotice(`Game activation failed: ${message}`);
    } finally {
      setActivatingGame(false);
    }
  }

  async function settleRound() {
    if (!currentAccount) return setConnectOpen(true);
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address);
    transaction.setGasBudget(50_000_000);
    transaction.moveCall({ target: `${packageId}::game::settle`, arguments: [transaction.object(gameId), transaction.object(refineryId), transaction.object(suiRandomId), transaction.object(suiClockId)] });
    setRoundAction(true); setNotice("Waiting for wallet approval to reveal the winning block...");
    try {
      const result = await executeWithSlush(transaction);
      if (result) { setNotice(`Round settled on Sui. Transaction: ${result.digest}`); await refreshChainState(); }
    } catch (error) { setNotice(`Settlement failed: ${error instanceof Error ? error.message : "Unexpected wallet error"}`); }
    finally { setRoundAction(false); }
  }

  async function upgradeTestnetPackage() {
    if (!currentAccount) return setConnectOpen(true);
    if (currentAccount.address.toLowerCase() !== testnetOwner) return setNotice("Connect the METEORBLOX owner wallet.");
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address);
    transaction.setGasBudget(150_000_000);
    const cap = transaction.object(upgradeCapId);
    const ticket = transaction.moveCall({
      target: "0x2::package::authorize_upgrade",
      arguments: [cap, transaction.pure.u8(0), transaction.pure.vector("u8", upgradeData.digest)],
    });
    const receipt = transaction.upgrade({
      modules: [...upgradeData.modules],
      dependencies: [...upgradeData.dependencies],
      package: upgradeBasePackageId,
      ticket,
    });
    transaction.moveCall({ target: "0x2::package::commit_upgrade", arguments: [cap, receipt] });
    setUpgradingPackage(true);
    setNotice("Waiting for the owner wallet to approve the continuous-round Testnet upgrade...");
    try {
      const result = await executeWithSlush(transaction);
      if (result) setNotice(`METEORBLOX Testnet upgraded. Transaction: ${result.digest}`);
    } catch (error) {
      setNotice(`Testnet upgrade failed: ${error instanceof Error ? error.message : "Unexpected wallet error"}`);
    } finally { setUpgradingPackage(false); }
  }

  async function createRewardsLedger() {
    if (!currentAccount) return setConnectOpen(true);
    if (currentAccount.address.toLowerCase() !== testnetOwner) return setNotice("Connect the METEORBLOX owner wallet.");
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address);
    transaction.setGasBudget(50_000_000);
    transaction.moveCall({ target: `${continuousPackageId}::game::create_rewards_ledger`, arguments: [transaction.object(gameId)] });
    setCreatingLedger(true);
    setNotice("Waiting for owner approval to create the Rewards Ledger...");
    try {
      const result = await executeWithSlush(transaction);
      if (result) setNotice(`Rewards Ledger created. Transaction: ${result.digest}`);
    } catch (error) {
      setNotice(`Rewards Ledger creation failed: ${error instanceof Error ? error.message : "Unexpected wallet error"}`);
    } finally { setCreatingLedger(false); }
  }

  async function claimLedgerSui() {
    if (!currentAccount) return setConnectOpen(true);
    if (!(chainState?.ledgerSui ?? 0)) return setNotice("No settled SUI rewards are available to claim.");
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address);
    transaction.setGasBudget(25_000_000);
    transaction.moveCall({ target: `${continuousPackageId}::ledger::claim_sui`, arguments: [transaction.object(ledgerId)] });
    setRoundAction(true);
    setNotice("Waiting for wallet approval to claim SUI rewards...");
    try {
      const result = await executeWithSlush(transaction);
      if (result) { setNotice(`SUI rewards claimed. Transaction: ${result.digest}`); await refreshChainState(); }
    } catch (error) {
      setNotice(`SUI claim failed: ${error instanceof Error ? error.message : "Unexpected wallet error"}`);
    } finally { setRoundAction(false); }
  }

  async function publishCleanTestnetPackage() {
    if (!currentAccount) return setConnectOpen(true);
    if (currentAccount.address.toLowerCase() !== testnetOwner) return setNotice("Connect the METEORBLOX owner wallet.");
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address);
    transaction.setGasBudget(300_000_000);
    const upgradeCap = transaction.publish({
      modules: [...upgradeData.modules],
      dependencies: [...upgradeData.dependencies],
    });
    transaction.transferObjects([upgradeCap], currentAccount.address);
    setPublishingPackage(true);
    setNotice("Waiting for owner approval to publish a clean METEORBLOX Testnet deployment...");
    try {
      const result = await executeWithSlush(transaction);
      if (result) setNotice(`Clean METEORBLOX Testnet deployment published. Transaction: ${result.digest}`);
    } catch (error) {
      setNotice(`Clean Testnet publish failed: ${error instanceof Error ? error.message : "Unexpected wallet error"}`);
    } finally { setPublishingPackage(false); }
  }

  async function closeEmptyRound() {
    if (!currentAccount) return setConnectOpen(true);
    if (currentAccount.address.toLowerCase() !== testnetOwner) return setNotice("Connect the METEORBLOX owner wallet.");
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address);
    transaction.setGasBudget(50_000_000);
    transaction.moveCall({ target: `${packageId}::game::close_empty_round`, arguments: [transaction.object(gameId), transaction.object(suiClockId)] });
    setRoundAction(true);
    setNotice("Waiting for owner approval to close the empty round...");
    try {
      const result = await executeWithSlush(transaction);
      if (result) { setNotice(`Empty round closed. Transaction: ${result.digest}`); await refreshChainState(); }
    } catch (error) {
      setNotice(`Empty-round recovery failed: ${error instanceof Error ? error.message : "Unexpected wallet error"}`);
    } finally { setRoundAction(false); }
  }

  async function claimRoundWinnings() {
    if (!currentAccount) return setConnectOpen(true);
    const count = chainState?.claimableWinningEntries ?? 0;
    if (!count) return setNotice("This wallet has no winning entries to claim in the current round.");
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address); transaction.setGasBudget(50_000_000);
    for (let index = 0; index < count; index += 1) transaction.moveCall({ target: `${packageId}::game::claim`, arguments: [transaction.object(gameId), transaction.object(refineryId), transaction.object(suiClockId)] });
    setRoundAction(true); setNotice("Waiting for wallet approval to claim SUI and award MTBX...");
    try {
      const result = await executeWithSlush(transaction);
      if (result) { setNotice(`Winnings claimed. Transaction: ${result.digest}`); await refreshChainState(); }
    } catch (error) { setNotice(`Winnings claim failed: ${error instanceof Error ? error.message : "Unexpected wallet error"}`); }
    finally { setRoundAction(false); }
  }

  async function openNextRound() {
    if (!currentAccount) return setConnectOpen(true);
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address); transaction.setGasBudget(50_000_000);
    transaction.moveCall({ target: `${packageId}::game::open_next_round`, arguments: [transaction.object(gameId), transaction.object(suiClockId)] });
    setRoundAction(true); setNotice("Waiting for owner approval to open the next round...");
    try {
      const result = await executeWithSlush(transaction);
      if (result) { setNotice(`Next round opened. Transaction: ${result.digest}`); await refreshChainState(); }
    } catch (error) { setNotice(`Open round failed: ${error instanceof Error ? error.message : "Unexpected wallet error"}`); }
    finally { setRoundAction(false); }
  }

  async function claimMtbx(early: boolean) {
    if (!currentAccount) return setConnectOpen(true);
    const count = early ? chainState?.unrefinedPositions ?? 0 : chainState?.refinedPositions ?? 0;
    if (!count) return setNotice(early ? "No unrefined MTBX is available for early withdrawal." : "No refined MTBX is available to claim.");
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address); transaction.setGasBudget(50_000_000);
    const target = `${packageId}::mtbx::${early ? "claim_early" : "claim_refined"}`;
    for (let index = 0; index < count; index += 1) transaction.moveCall({ target, arguments: [transaction.object(refineryId), transaction.object(suiClockId)] });
    setRoundAction(true); setNotice(`Waiting for wallet approval to ${early ? "withdraw" : "claim"} MTBX...`);
    try {
      const result = await executeWithSlush(transaction);
      if (result) { setNotice(`MTBX ${early ? "withdrawal" : "claim"} confirmed. Transaction: ${result.digest}`); await refreshChainState(); }
    } catch (error) { setNotice(`MTBX claim failed: ${error instanceof Error ? error.message : "Unexpected wallet error"}`); }
    finally { setRoundAction(false); }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="MeteorBlox home" onClick={() => setView("mine")}><span className="brand-meteor" aria-hidden="true"><i /><b /><em /></span><span className="wordmark"><strong>METEOR</strong><b>BLOX</b></span></a>
        <nav className="main-nav" aria-label="Main navigation"><button className={view === "mine" ? "active" : ""} onClick={() => setView("mine")}>Mine</button><button className={view === "rewards" ? "active" : ""} onClick={() => setView("rewards")}>Rewards</button></nav>
        <div className="top-actions">
          <div className="protocol-links" aria-label="MeteorBlox community links">
            <button title="MeteorBlox on X - coming soon" aria-label="MeteorBlox on X, coming soon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 2H22l-6.77 7.74L23.2 22h-6.24l-4.89-6.39L6.48 22H3.36l7.25-8.29L2.97 2h6.4l4.42 5.84L18.9 2Zm-1.1 17.84h1.73L8.43 4.05H6.58L17.8 19.84Z" /></svg></button>
            <button title="MeteorBlox on GitHub - coming soon" aria-label="MeteorBlox on GitHub, coming soon"><svg viewBox="0 0 24 24" aria-hidden="true"><path fillRule="evenodd" d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.71.5.1.68-.22.68-.49l-.01-1.92c-2.78.62-3.37-1.22-3.37-1.22-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.56 2.35 1.11 2.92.85.09-.66.35-1.11.64-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.35 9.35 0 0 1 12 6.93c.85 0 1.7.12 2.5.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.94.68 1.9l-.01 2.81c0 .27.18.59.69.49A10.23 10.23 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z" clipRule="evenodd" /></svg></button>
            <button title="MeteorBlox Discord - coming soon" aria-label="MeteorBlox Discord, coming soon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.54 5.34A17.3 17.3 0 0 0 15.29 4l-.52 1.06a15.77 15.77 0 0 0-5.54 0L8.7 4A17.45 17.45 0 0 0 4.45 5.34C1.76 9.43 1.03 13.42 1.4 17.35a17.1 17.1 0 0 0 5.21 2.69l1.26-1.76a11.1 11.1 0 0 1-1.98-.97l.49-.38c3.82 1.8 7.96 1.8 11.73 0l.5.38c-.64.38-1.3.7-1.99.97l1.26 1.76a17.03 17.03 0 0 0 5.21-2.69c.43-4.56-.73-8.51-3.55-12.01ZM8.68 14.93c-1.15 0-2.1-1.08-2.1-2.4s.93-2.4 2.1-2.4c1.18 0 2.12 1.09 2.1 2.4 0 1.32-.93 2.4-2.1 2.4Zm6.64 0c-1.15 0-2.1-1.08-2.1-2.4s.93-2.4 2.1-2.4c1.18 0 2.12 1.09 2.1 2.4 0 1.32-.92 2.4-2.1 2.4Z" /></svg></button>
          </div>
          <div className="asset-tickers" aria-label="Token prices">
            <span className="price-chip mtbx-chip" title="MTBX price"><i className="ticker-meteor" aria-hidden="true"><i /><b /><em /></i><strong>$0.00</strong></span>
            <span className="price-chip sui-chip" title="SUI price"><i className="ticker-sui" aria-hidden="true"><svg viewBox="0 0 32 40"><path d="M16 1.8C13.3 5.5 4.2 16.5 4.2 23.9A11.8 11.8 0 0 0 16 35.8a11.8 11.8 0 0 0 11.8-11.9C27.8 16.5 18.7 5.5 16 1.8Zm0 29.6a7.5 7.5 0 0 1-7.5-7.5c0-3.7 4.2-10.2 7.5-14.7 3.3 4.5 7.5 11 7.5 14.7a7.5 7.5 0 0 1-7.5 7.5Z"/><path d="M11 24.5c1.4 2.6 4.5 3.7 7.2 2.4 1.1-.5 2-1.4 2.6-2.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg></i><strong>{suiPrice === null ? "Loading" : `$${suiPrice.toFixed(2)}`}</strong></span>
          </div>
          <span className="network"><i /> Sui Testnet</span><button className="wallet" onClick={openAccountDrawer}>{currentAccount ? `${currentAccount.address.slice(0, 6)}...${currentAccount.address.slice(-4)}` : "Sign in"}</button>
        </div>
      </header>

      <section className="round-strip" aria-label="Current round">
        <div><small>ROUND</small><strong>{chainLoading ? "-" : `#${String(chainState?.round ?? 0).padStart(6, "0")}`}</strong></div><div><small>TIME LEFT</small><strong>{chainState?.settled ? "SETTLED" : `${seconds}s`}</strong></div>
        <div><small>DEPLOYED</small><strong className="deployed-total"><i className="round-sui-icon" aria-hidden="true"><svg viewBox="0 0 32 40"><path d="M16 1.8C13.3 5.5 4.2 16.5 4.2 23.9A11.8 11.8 0 0 0 16 35.8a11.8 11.8 0 0 0 11.8-11.9C27.8 16.5 18.7 5.5 16 1.8Zm0 29.6a7.5 7.5 0 0 1-7.5-7.5c0-3.7 4.2-10.2 7.5-14.7 3.3 4.5 7.5 11 7.5 14.7a7.5 7.5 0 0 1-7.5 7.5Z"/></svg></i>{chainLoading ? "-" : (chainState?.potSui ?? 0).toFixed(4)}</strong></div>
        <div><small>METEOR SHOWER</small><strong className="meteor-shower-total"><i className="round-meteor-icon" aria-hidden="true"><i /><b /></i>{mtbxRoundReward.toFixed(2)}</strong></div>
      </section>

      <section className={lastRoundOpen ? "last-round open" : "last-round"} aria-label="Last settled round">
        <button className="last-round-toggle" type="button" aria-expanded={lastRoundOpen} onClick={() => setLastRoundOpen((open) => !open)}>
          <span><small>LAST ROUND</small><strong>{chainState?.lastRound ? `#${String(chainState.lastRound.round).padStart(6, "0")}` : "Waiting for settlement"}</strong></span>
          {chainState?.lastRound && <span className="last-round-summary"><b>BLOCK {chainState.lastRound.winningTile}</b><i aria-hidden="true">{lastRoundOpen ? "−" : "+"}</i></span>}
        </button>
        {lastRoundOpen && <div className="last-round-details">{chainState?.lastRound ? <>
          <div><small>WINNING BLOCK</small><strong>{chainState.lastRound.winningTile}</strong></div>
          <div><small>DEPLOYED</small><strong>{chainState.lastRound.deployedSui.toFixed(4)} SUI</strong></div>
          <div><small>SUI REWARD POOL</small><strong>{chainState.lastRound.rewardPoolSui.toFixed(4)} SUI</strong></div>
          <div><small>MTBX AWARDED</small><strong>{chainState.lastRound.mtbxAwarded.toFixed(2)} MTBX</strong></div>
          {chainState.lastRound.transaction && <a href={`https://testnet.suivision.xyz/txblock/${chainState.lastRound.transaction}`} target="_blank" rel="noreferrer">View settlement ↗</a>}
        </> : <p>The first completed round will appear here automatically.</p>}</div>}
      </section>

      {view === "mine" ? <div className="workspace">
        <section className="mine-panel">
          <div className="section-heading"><div><p>LIVE GRID &middot; DEMO</p><h1>Choose your impact zone.</h1></div>
            <button className="text-button" onClick={toggleAllTiles}>{selected.length === 25 ? "Clear" : "Select all"}</button>
          </div>
          <div className="grid" aria-label="Mining grid">
            {tiles.map((tile) => {
              const isSelected = selected.includes(tile);
              const previewAmount = tileAmounts[tile - 1] + (isSelected && Number.isFinite(Number(amount)) ? Number(amount) : 0);
              return <button key={tile} className={isSelected ? "tile selected" : "tile"} aria-label={`Block ${tile}, ${previewAmount.toFixed(3)} SUI`} aria-pressed={isSelected} onClick={() => toggleTile(tile)}><span className="tile-number">{tile}</span>{isSelected && <span className="tile-check" aria-hidden="true">&#10003;</span>}<span className="meteor" aria-hidden="true"><i /><b /></span><span className="tile-balance"><i className="sui-icon" aria-hidden="true"><span /></i><strong>{previewAmount.toFixed(3)}</strong></span></button>;
            })}
          </div>
        </section>

        <aside className="entry-panel">
          <p className="eyebrow">MANUAL ENTRY</p><h2>Deploy SUI</h2><label htmlFor="amount">Amount per block</label>
          <div className="amount-input"><input id="amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /><span>SUI</span></div>
          <div className="quick-values">{["0.001", "0.01", "0.1"].map((value) => <button key={value} onClick={() => setAmount(value)}>{value}</button>)}</div>
          <div className="rounds-control tile-count-control"><div className="rounds-label"><label htmlFor="tile-count">Tiles</label><small>Auto-select grid quantity</small></div><div className="rounds-stepper"><button aria-label="Remove one tile" onClick={() => selectTileCount(selected.length - 1)}>&minus;</button><input id="tile-count" aria-label="Tiles" type="text" pattern="[0-9]*" maxLength={2} inputMode="numeric" value={tileCountInput} onFocus={(event) => event.currentTarget.select()} onChange={(event) => changeTileCount(event.target.value)} onBlur={() => { if (tileCountInput === "") setTileCountInput(String(selected.length)); }} /><button aria-label="Add one tile" onClick={() => selectTileCount(selected.length + 1)}>+</button></div></div>
          <div className="round-presets tile-presets"><button onClick={() => selectTileCount(1)}>1</button><button onClick={() => selectTileCount(5)}>5</button><button onClick={() => selectTileCount(10)}>10</button><button onClick={() => selectTileCount(25)}>25</button></div>
          <div className="rounds-control"><div className="rounds-label"><label htmlFor="rounds">Rounds</label><small>Repeat selected tiles</small></div><div className="rounds-stepper"><button aria-label="Remove one round" onClick={() => setRounds((value) => Math.max(1, value - 1))}>&minus;</button><input id="rounds" type="number" min="1" inputMode="numeric" value={rounds} onChange={(event) => setRounds(Math.max(1, Math.floor(Number(event.target.value) || 1)))} /><button aria-label="Add one round" onClick={() => setRounds((value) => value + 1)}>+</button></div></div>
          <div className="round-presets"><button onClick={() => setRounds(1)}>1</button><button onClick={() => setRounds(10)}>10</button><button onClick={() => setRounds(25)}>25</button><button onClick={() => setRounds((value) => value + 100)}>+100</button></div>
          <dl className="summary"><div><dt>Selected tiles</dt><dd>{selected.length}</dd></div><div><dt>Rounds</dt><dd>{rounds}</dd></div><div><dt>Per round</dt><dd>{(Number(amount) * selected.length || 0).toFixed(4)} SUI</dd></div><div><dt>Total deployment</dt><dd>{total.toFixed(4)} SUI</dd></div><div><dt>Winning reward</dt><dd>{mtbxRoundReward.toFixed(2)} MTBX + SUI</dd></div></dl>
          <button className="deploy" disabled={submittingPlay || !chainState || chainState.settled || seconds === 0} onClick={deploy}>{submittingPlay ? "Waiting for Slush..." : !chainState?.rewardsBound ? "Owner activation required" : chainState.settled ? "Round is settled" : seconds === 0 ? "Waiting for settlement" : "Deploy to live grid"}</button>{notice && <p className="notice" role="status">{notice}</p>}
          <button className="rewards-link" onClick={() => setView("rewards")}><span><small>YOUR ON-CHAIN REWARDS</small><strong>{((chainState?.unrefinedMtbx ?? 0) + (chainState?.refinedMtbx ?? 0) + (chainState?.estimatedMtbxWinnings ?? 0)).toFixed(6)} MTBX + {(chainState?.estimatedSuiWinnings ?? 0).toFixed(6)} SUI</strong></span><b>View &amp; claim &rarr;</b></button>
          <p className="disclaimer">Sui Testnet only. A confirmed play uses test SUI and writes your selected tiles on-chain.</p>
        </aside>
      </div> : <section className="rewards-page">
        <div className="rewards-title"><p className="eyebrow">LIVE SUI TESTNET REWARDS</p><h1>Your SUI and MTBX winnings.</h1><p>Balances below are read from the published Game and Refinery objects. A winning claim sends SUI immediately and starts the MTBX refining period.</p></div>
        <div className="reward-assets">
          <article className="claim-card refining-card"><div className="claim-icon">M</div><small>MTBX REFINERY</small><div className="refinery-balances"><div><span>UNREFINED</span><strong>{(chainState?.unrefinedMtbx ?? 0).toFixed(6)} MTBX</strong></div><div><span>REFINED</span><strong>{(chainState?.refinedMtbx ?? 0).toFixed(6)} MTBX</strong></div></div><div className="refine-time"><span>Next maturity</span><strong>{chainState?.nextMaturityMs ? "Within 24h" : "-"}</strong></div><div className="refine-track" aria-label="MTBX refining period"><i /></div><p className="refine-copy">MTBX becomes fully transferable after 24 hours. Early withdrawal mints 90% and permanently forfeits 10%.</p><button className="deploy" disabled={roundAction || !(chainState?.refinedPositions)} onClick={() => claimMtbx(false)}>Claim refined MTBX</button><button className="early-withdraw" disabled={roundAction || !(chainState?.unrefinedPositions)} onClick={() => claimMtbx(true)}>Withdraw unrefined early</button><p className="penalty-copy"><strong>10% penalty</strong> applies only to early withdrawal.</p></article>
          <article className="claim-card sui-claim"><div className="claim-icon sui-claim-icon">S</div><small>SETTLED SUI REWARDS</small><strong>{(chainState?.ledgerSui ?? 0).toFixed(6)} SUI</strong><span>Credited automatically after each settlement</span><button className="deploy sui-button" disabled={roundAction || !(chainState?.ledgerSui)} onClick={claimLedgerSui}>Claim SUI</button></article>
        </div>
        {!chainState?.settled && seconds === 0 && <button className="claim-all" disabled={roundAction} onClick={settleRound}>Reveal winning block with Sui randomness</button>}
        <article className="claim-card testnet-publish"><small>OWNER TESTNET UPGRADE</small><h2>Enable reliable 60-second rounds</h2><p>Install the tested empty-round rollover fix, then keep the existing Rewards Ledger. The owner wallet is required to approve this transaction.</p><button className="deploy" disabled={upgradingPackage} onClick={upgradeTestnetPackage}>{upgradingPackage ? "Waiting for Slush approval..." : "Upgrade Testnet"}</button><button className="deploy" disabled>Rewards Ledger active</button>{currentAccount?.address.toLowerCase() === testnetOwner && !chainState?.settled && seconds === 0 && chainState?.potSui === 0 && <button className="deploy" disabled={roundAction} onClick={closeEmptyRound}>{roundAction ? "Waiting for Slush approval..." : "Close current empty round"}</button>}</article>
        <section className="miners-board"><div className="miners-heading"><div><p className="eyebrow">TESTNET ACTIVITY</p><h2>Miners</h2></div><span>Global Sui indexing next</span></div><div className="miners-tabs" role="tablist" aria-label="Miner leaderboard"><button className={leaderboardTab === "miners" ? "active" : ""} onClick={() => setLeaderboardTab("miners")}>Miners</button><button className={leaderboardTab === "unrefined" ? "active" : ""} onClick={() => setLeaderboardTab("unrefined")}>Unrefined</button><button className={leaderboardTab === "refined" ? "active" : ""} onClick={() => setLeaderboardTab("refined")}>Refined</button></div><div className="miners-table" role="table" aria-label="Testnet miners"><div className="miners-row miners-header" role="row"><span role="columnheader">Rank</span><span role="columnheader">Miner</span><span role="columnheader">{leaderboardTab === "miners" ? "Total deployed" : leaderboardTab === "unrefined" ? "Unrefined MTBX" : "Refined MTBX"}</span></div>{currentAccount ? <div className="miners-row" role="row"><strong role="cell">#1</strong><span role="cell"><i className="miner-avatar">M</i><b>{username || `${currentAccount.address.slice(0, 7)}...${currentAccount.address.slice(-5)}`}</b><small>You</small></span><strong role="cell">{leaderboardTab === "miners" ? `${lifetimeDeployed.toFixed(4)} SUI` : "Pending index"}</strong></div> : <div className="miners-empty">Connect a Testnet wallet to join the leaderboard.</div>}</div><p>Rankings will be rebuilt from confirmed EntryPlaced and RewardAwarded events so every miner and total is independently verifiable.</p></section>
        {currentAccount?.address.toLowerCase() === testnetOwner && !chainState?.rewardsBound && <article className="claim-card testnet-publish"><small>OWNER TESTNET MILESTONE</small><h2>Activate the live game</h2><p>One-time setup binds the unique MTBX RewardCap to the shared Game and opens the first playable 60-second Testnet round.</p><button className="deploy" disabled={activatingGame} onClick={activateTestnetGame}>{activatingGame ? "Waiting for Slush approval..." : "Activate live Testnet round"}</button></article>}
        {currentAccount?.address.toLowerCase() === testnetOwner && chainState?.rewardsBound && chainState.settled && chainState.winningEntriesRemaining === 0 && <article className="claim-card testnet-publish"><small>OWNER ROUND CONTROL</small><h2>Open the next round</h2><p>The previous round is settled and all winning entries are claimed.</p><button className="deploy" disabled={roundAction} onClick={openNextRound}>Open next 60-second round</button></article>}
        {notice && <p className="notice rewards-notice" role="status">{notice}</p>}<p className="disclaimer rewards-disclaimer">Live Sui Testnet state. Test SUI has no monetary value. Contract logic is unaudited and must not be used on Mainnet yet.</p>
        <button className="back-link" onClick={() => { setView("mine"); setNotice(""); }}>&larr; Back to mining grid</button>
      </section>}
      <footer><p><strong>$MTBX</strong> &middot; Digital rare metal on Sui</p><nav aria-label="Footer"><a href="#how">How it works</a><a href="#token">Token</a><a href="#faq">FAQ</a></nav></footer>

      {connectOpen && <div className="connect-backdrop" role="presentation" onMouseDown={() => setConnectOpen(false)}><section className="connect-card" role="dialog" aria-modal="true" aria-labelledby="connect-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="connect-close" aria-label="Close sign in" onClick={() => setConnectOpen(false)}>&times;</button><span className="connect-orbit" aria-hidden="true"><i /></span>
        <p className="eyebrow">WELCOME TO METEORBLOX</p><h2 id="connect-title">Enter the grid.</h2><p className="connect-copy">Use Google through Slush for a simple Sui wallet experience, or connect another Sui wallet.</p>
        <button className="google-connect" disabled={!slushWallet || connecting} onClick={() => slushWallet && connectWallet(slushWallet)}><span className="google-mark">G</span><b>{connecting ? "Connecting..." : "Continue with Google via Slush"}</b></button>
        <div className="connect-divider"><span>or</span></div>
        {standardWallets.length ? standardWallets.map((wallet) => <button className="sui-connect wallet-choice" key={wallet.name} onClick={() => connectWallet(wallet)}><span className="sui-wallet-mark">S</span><b>Connect {wallet.name}</b></button>) : <a className="sui-connect wallet-install" href="https://slush.app/" target="_blank" rel="noreferrer"><span className="sui-wallet-mark">S</span><b>Get a Sui wallet</b></a>}
        <div className="onboarding-note"><strong>SUI TESTNET</strong><span>Slush provides Google zkLogin and a self-custodial Sui address with no Enoki subscription. Mining remains simulated until the Move contracts are deployed.</span></div>
      </section></div>}

      {accountOpen && currentAccount && <div className="account-backdrop" role="presentation" onMouseDown={() => setAccountOpen(false)}><aside className="account-drawer" role="dialog" aria-modal="true" aria-labelledby="account-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="account-close" aria-label="Close wallet panel" onClick={() => setAccountOpen(false)}>&times;</button>
        <div className="account-avatar" aria-hidden="true"><span>M</span><i /></div>
        <p className="eyebrow">CONNECTED WALLET</p><h2 id="account-title">{username || "MeteorBlox profile"}</h2>
        <div className="username-editor"><label htmlFor="wallet-username">Username</label><div><input id="wallet-username" value={usernameDraft} maxLength={20} placeholder="Create username" onChange={(event) => setUsernameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveUsername(); }} /><button onClick={saveUsername}>Save</button></div><small>3&ndash;20 letters, numbers, _ or - &middot; saved on this device</small></div>
        <dl className="account-details"><div><dt>Address</dt><dd><span>{`${currentAccount.address.slice(0, 8)}...${currentAccount.address.slice(-6)}`}</span><button aria-label="Copy wallet address" onClick={copyAddress}>Copy</button></dd></div><div><dt>Network</dt><dd><span className="account-network"><i /> Sui Testnet</span></dd></div><div><dt>Wallet</dt><dd>Slush</dd></div></dl>
        <section className="account-portfolio"><h3>Portfolio</h3><dl><div><dt>SUI deployed</dt><dd>{lifetimeDeployed.toFixed(4)} SUI</dd></div><div><dt>MTBX refined</dt><dd>On-chain</dd></div><div><dt>MTBX unrefined</dt><dd>On-chain</dd></div><div className="portfolio-total"><dt>Game access</dt><dd>Live Testnet</dd></div></dl></section>
        <a className="account-explorer" href={`https://suiscan.xyz/testnet/account/${currentAccount.address}`} target="_blank" rel="noreferrer">View wallet on SuiScan &nearr;</a>
        <button className="account-disconnect" onClick={() => { void dAppKit.disconnectWallet(); setAccountOpen(false); setNotice("Wallet disconnected."); }}>Disconnect wallet</button>
      </aside></div>}
    </main>
  );
}

