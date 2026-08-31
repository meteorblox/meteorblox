"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useCurrentAccount, useCurrentWallet, useDAppKit, useWalletConnection, useWallets } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { getWallets, type Wallet } from "@mysten/wallet-standard";
import { upgradeData } from "./upgrade-data";
import { dslvrPublishData } from "./dslvr-publish-data";
import { testUsdcPublishData } from "./test-usdc-publish-data";
import { rehearsalDslvrPublishData } from "./rehearsal-dslvr-publish-data";
import { rehearsalSalePublishData } from "./rehearsal-sale-publish-data";
import { walletPreferenceKey } from "./providers";

// This Testnet upgrade prepares player-triggered recovery for expired empty rounds.

const tiles = Array.from({ length: 25 }, (_, index) => index + 1);
const motherlodeRoundContribution = 0.2;
const testnetOwner = "0x55f035832afb21499461d62630ed4b1cdf6e53b2a43f907e6db55a91eb114781";
const testPaymentPackageId = "0x47e492650ee57c7254e0be3d58e5541654e2d1f3e2463fdc2dffb8cb6b81b459";
const testUsdcTreasuryCapId = "0x2baeb2774591ea31ab5ffecb9be4373c877cc18d6ee6f462ac576146453c064b";
const rehearsalTokenPackageId = "0xffb4f52b5214c79d30cb79a30c2592439e0624329be3b4f43e2013052962092c";
const rehearsalLaunchVaultId = "0x8fdaf74ef29932905bf4790ffcfca1ebbe6907929950ec4a4b0769f96e22d899";
const rehearsalAllocationAdminCapId = "0x155e58077aba225806ee75bf4c7d84cab3ea7b045eeffe6e7596ff1456d23001";
const rehearsalSalePackageId = "0xa2618c3464d570c3cc95d8c5fa2699e6d7ac929d6edc3a334a2c1f5e32f11008";
const rehearsalDslvrType = `${rehearsalTokenPackageId}::dslvr::DSLVR`;
const rehearsalTestUsdcType = `${testPaymentPackageId}::usdc::USDC`;
const rehearsalSaleId = "0x1c52af35f3ccf64f3c78a4081c3cff6ca3ae9ee04efbb9cd7157b3859aa007e3";
const rehearsalSaleAdminCapId = "0xe095af3a01f4d6402096d6a48cf10ded3ee96e614703a18bf541f4a4792088ae";
const rehearsalTestUsdcCoinId = "0x074822a2ef91a212ff844a125683e00c6007e853b99ff5435f729c0f02c6a239";
const rehearsalEndsAtMs = 1_787_733_288_489;
const rehearsalLaunchAtMs = 1_787_733_888_489;
const dslvrOriginPackageId = "0xb0097a3ef50e48294eb15a4a0fb7a1c9d2c421b217dc384e44cec478e4072771";
const packageId = "0x4beb56bfd9be58feaa10d815500e982d8b97a1cad23b2c19540c77f89a7a230a";
const continuousPackageId = packageId;
const stakingPackageId = packageId;
const upgradeBasePackageId = stakingPackageId;
const gameId = "0x2133b5403f7513b64ecd9d314d951e5969a6064f3682b3ac3d444a3ab95c2522";
const refineryId = "0x15596af5d595d85f7bde4fa9b76b2c04ec30569cf3f8b763f02524ae928f06fa";
const rewardCapId = "0x4eb2ec5b6779f3c2d5c7321350ad32871d61709a9696c126de453c13d3a4facc";
const upgradeCapId = "0xae3f9a21abae0ae5e36c943e3e4a28d10f760832d5c6c9ba68c54bc4eb6c647d";
const ledgerId = "0xc065549eb934c1b628f761d1c1549c8b638bfa3ed6bfda15c129f8d0931b4476";
const autoplayRegistryId = "0x3a9762f85ef2915f02468627cd33ce3d4b33bbe7d3b31ea15b618a378e18fa3f";
const stakingVaultId = "0xed814a5a13886244d1dc2a6e136d971cd5f52e27b33d01916c16590fcbbe5adc";
const dslvrCoinType = `${dslvrOriginPackageId}::dslvr::DSLVR`;
const suiClockId = "0x6";
const suiRandomId = "0x8";
const startingAmounts = [0.031, 0.047, 0.061, 0.04, 0.046, 0.015, 0.048, 0.056, 0.049, 0.052, 0.042, 0.046, 0.053, 0.045, 0.046, 0.043, 0.057, 0.041, 0.049, 0.049, 0.043, 0.062, 0.058, 0.055, 0.052];

type ChainState = {
  round: number; closesAtMs: number; remainingMs: number; settled: boolean; rewardsBound: boolean; winningTile: number | null;
  tileTotals: number[]; potSui: number; winningEntriesRemaining: number; claimableWinningEntries: number;
  estimatedSuiWinnings: number; estimatedMtbxWinnings: number; refinedMtbx: number; unrefinedMtbx: number;
  refinedPositions: number; unrefinedPositions: number; nextMaturityMs: number | null;
  ledgerSui: number; ledgerCreditCount: number; walletSui: number; walletDslvr: number; keeperSui: number; keeperLow: boolean;
  motherlodeDslvr: number;
  playedTiles: number[];
  autoplayPlans: Array<{ planId: number; roundsRemaining: number; tiles: number[]; tileCount: number; amountPerTileSui: number; fundedSui: number; lastRoundPlayed: number }>;
  lastRound: { round: number; winningTile: number; deployedSui: number; rewardPoolSui: number; mtbxAwarded: number; transaction: string | null } | null;
};

export default function Home() {
  const [view, setView] = useState<"mine" | "rewards" | "stake">("mine");
  const [stakeMode, setStakeMode] = useState<"stake" | "unstake">("stake");
  const [stakeAmount, setStakeAmount] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [tileAmounts, setTileAmounts] = useState(startingAmounts);
  const [amount, setAmount] = useState("0.01");
  const [tileCountInput, setTileCountInput] = useState("0");
  const [rounds, setRounds] = useState(1);
  const [seconds, setSeconds] = useState(60);
  const [notice, setNotice] = useState("");
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [bugReportCopied, setBugReportCopied] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [usernameDraft, setUsernameDraft] = useState("");
  const [leaderboardTab, setLeaderboardTab] = useState<"miners" | "unrefined" | "refined">("miners");
  const [lifetimeDeployed, setLifetimeDeployed] = useState(0);
  const [suiPrice, setSuiPrice] = useState<number | null>(null);
  const [chainState, setChainState] = useState<ChainState | null>(null);
  const [winningFlashTile, setWinningFlashTile] = useState<number | null>(null);
  const [simulatedTiles, setSimulatedTiles] = useState<number[]>([]);
  const lastFlashedRound = useRef<number | null>(null);
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
  const [creatingAutoplayRegistry, setCreatingAutoplayRegistry] = useState(false);
  const [creatingStakingVault, setCreatingStakingVault] = useState(false);
  const [submittingStake, setSubmittingStake] = useState(false);
  const [slushMobileUrl, setSlushMobileUrl] = useState("");
  const [nightlyMobileUrl, setNightlyMobileUrl] = useState("");
  const [stakingState, setStakingState] = useState({ availableDslvr: 0, userStakedDslvr: 0, totalStakedDslvr: 0, rewardBalanceDslvr: 0, positionCount: 0 });
  const currentAccount = useCurrentAccount();
  const currentWallet = useCurrentWallet();
  const currentAddress = currentAccount?.address;
  const dAppKit = useDAppKit();
  const walletConnection = useWalletConnection();
  const wallets = useWallets();
  const connecting = walletConnection.isConnecting;
  const slushWallet = wallets.find((wallet) => wallet.name.toLowerCase().includes("slush"));
  const nightlyWallet = wallets.find((wallet) => wallet.name.toLowerCase().includes("nightly"));
  const suietWallet = wallets.find((wallet) => wallet.name.toLowerCase().includes("suiet"));
  const standardWallets = wallets.filter((wallet) => !wallet.name.toLowerCase().includes("slush") && !wallet.name.toLowerCase().includes("nightly") && !wallet.name.toLowerCase().includes("suiet") && !wallet.name.toLowerCase().includes("phantom"));

  useEffect(() => {
    const userAgent = window.navigator.userAgent;
    const currentUrl = `${window.location.origin}${window.location.pathname}`;
    if (/Android|iPhone|iPad|iPod/i.test(userAgent) && !/Slush/i.test(userAgent)) {
      setSlushMobileUrl(`slush://browse/${currentUrl}`);
    }
    if (!/Android/i.test(userAgent)) return;
    setNightlyMobileUrl(`https://nightly.app/v1?network=sui&cluster=testnet&url=${encodeURIComponent(currentUrl)}`);
  }, []);

  useEffect(() => {
    let unregisterNightly: (() => void) | undefined;
    let attempts = 0;

    const registerInjectedNightly = () => {
      attempts += 1;
      const injected = window as typeof window & {
        nightly?: { standardWallet?: Wallet; sui?: { standardWallet?: Wallet } };
      };
      const standardWallet = injected.nightly?.sui?.standardWallet ?? injected.nightly?.standardWallet;
      if (!standardWallet) return attempts >= 20;

      const registry = getWallets();
      const alreadyRegistered = registry.get().some((wallet) => wallet === standardWallet || wallet.name.toLowerCase().includes("nightly"));
      if (!alreadyRegistered) unregisterNightly = registry.register(standardWallet);
      return true;
    };

    if (registerInjectedNightly()) return () => unregisterNightly?.();
    const timer = window.setInterval(() => {
      if (registerInjectedNightly()) window.clearInterval(timer);
    }, 250);
    return () => {
      window.clearInterval(timer);
      unregisterNightly?.();
    };
  }, []);

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
    const timer = window.setInterval(() => void refreshChainState(), 10_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [refreshChainState]);

  const refreshStakingState = useCallback(async () => {
    const query = currentAddress ? `?address=${encodeURIComponent(currentAddress)}` : "";
    try {
      const response = await fetch(`/api/staking${query}`, { cache: "no-store" });
      const data = await response.json();
      if (response.ok) setStakingState(data);
    } catch { /* Keep the last confirmed staking snapshot. */ }
  }, [currentAddress]);

  useEffect(() => {
    if (view !== "stake") return;
    void refreshStakingState();
    const timer = window.setInterval(() => void refreshStakingState(), 4_000);
    return () => window.clearInterval(timer);
  }, [view, refreshStakingState]);

  useEffect(() => {
    const result = chainState?.lastRound;
    if (!result || lastFlashedRound.current === result.round) return;
    lastFlashedRound.current = result.round;
    setWinningFlashTile(result.winningTile);
    const timer = window.setTimeout(() => setWinningFlashTile(null), 10_000);
    return () => window.clearTimeout(timer);
  }, [chainState?.lastRound?.round, chainState?.lastRound?.winningTile]);

  const idleSimulation = Boolean(
    chainState &&
    !chainState.settled &&
    chainState.potSui === 0 &&
    chainState.autoplayPlans.length === 0 &&
    chainState.playedTiles.length === 0 &&
    chainState.tileTotals.every((value) => value === 0)
  );

  useEffect(() => {
    if (!idleSimulation) {
      setSimulatedTiles([]);
      return;
    }

    const animateIdleGrid = () => {
      const shuffled = [...tiles].sort(() => Math.random() - 0.5);
      const count = 3 + Math.floor(Math.random() * 4);
      setSimulatedTiles(shuffled.slice(0, count));
    };

    animateIdleGrid();
    const timer = window.setInterval(animateIdleGrid, 2_400);
    return () => window.clearInterval(timer);
  }, [idleSimulation, chainState?.round]);

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
    const shuffled = [...tiles];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const random = new Uint32Array(1);
      window.crypto.getRandomValues(random);
      const swapIndex = (random[0] ?? 0) % (index + 1);
      const current = shuffled[index]!;
      shuffled[index] = shuffled[swapIndex]!;
      shuffled[swapIndex] = current;
    }
    setTileCountInput(String(count));
    setSelected(shuffled.slice(0, count).sort((left, right) => left - right));
    setNotice(count ? `Randomly selected ${count} unique block${count === 1 ? "" : "s"}.` : "");
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
    const result = await dAppKit.signAndExecuteTransaction({ transaction, network: "testnet" });
    if ("FailedTransaction" in result && result.FailedTransaction) {
      throw new Error(result.FailedTransaction.status.error?.message ?? "Transaction failed on Sui Testnet.");
    }
    return { digest: result.Transaction.digest };
  }

  async function recoverApprovedPlay(startedAtMs: number) {
    if (!currentAccount) return null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (attempt) await new Promise((resolve) => window.setTimeout(resolve, 1_500));
      try {
        const response = await fetch("/api/sui", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "suix_queryTransactionBlocks",
            params: [
              { filter: { FromAddress: currentAccount.address } },
              { showEffects: true, showObjectChanges: true },
              null,
              10,
              true,
            ],
          }),
        });
        const payload = await response.json() as {
          result?: { data?: Array<{ digest?: string; timestampMs?: string; effects?: { status?: { status?: string } }; objectChanges?: Array<{ objectId?: string }> }> };
        };
        const match = payload.result?.data?.find((item) =>
          Number(item.timestampMs ?? 0) >= startedAtMs - 2_000 &&
          item.effects?.status?.status === "success" &&
          item.objectChanges?.some((change) => change.objectId?.toLowerCase() === gameId)
        );
        if (match?.digest) return match.digest;
      } catch { /* The normal wallet result remains authoritative when recovery is unavailable. */ }
    }
    return null;
  }

  async function deploy() {
    if (!selected.length) return setNotice("Choose at least one block.");
    const entry = Number(amount);
    if (!Number.isFinite(entry) || entry <= 0) return setNotice("Enter a valid SUI amount.");
    const mistPerTile = suiToMist(amount);
    if (!mistPerTile || mistPerTile <= 0n) return setNotice("Enter a valid SUI amount with no more than 9 decimals.");
    if (!currentAccount) return setConnectOpen(true);
    if (rounds > 1 && !autoplayRegistryId) return setNotice("Autoplay is awaiting its one-time Testnet registry activation.");
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address);
    transaction.setGasBudget(50_000_000);
    transaction.moveCall({
      target: `${packageId}::game::prepare_round_for_entry`,
      arguments: [transaction.object(gameId), transaction.object(suiClockId)],
    });
    if (rounds > 1) {
      const totalMist = mistPerTile * BigInt(selected.length) * BigInt(rounds);
      const [payment] = transaction.splitCoins(transaction.gas, [transaction.pure.u64(totalMist)]);
      transaction.moveCall({
        target: `${packageId}::autoplay::create_plan`,
        arguments: [transaction.object(autoplayRegistryId), transaction.pure.vector("u8", selected.map((tile) => tile - 1)), transaction.pure.u64(mistPerTile), transaction.pure.u64(rounds), payment],
      });
      transaction.moveCall({
        target: `${packageId}::autoplay::execute_round`,
        arguments: [transaction.object(autoplayRegistryId), transaction.object(gameId), transaction.object(suiClockId)],
      });
    } else {
      const game = transaction.object(gameId);
      const clock = transaction.object(suiClockId);
      selected.forEach((tile) => {
        const [payment] = transaction.splitCoins(transaction.gas, [transaction.pure.u64(mistPerTile)]);
        transaction.moveCall({ target: `${packageId}::game::place`, arguments: [game, transaction.pure.u8(tile - 1), payment, clock] });
      });
    }
    setSubmittingPlay(true);
    setNotice("Waiting for Slush Testnet approval...");
    const approvalStartedAt = Date.now();
    try {
      const result = await executeWithSlush(transaction);
      if (!result) return;
      setTileAmounts((current) => current.map((value, index) => selected.includes(index + 1) ? value + entry : value));
      const deployedTotal = lifetimeDeployed + entry * selected.length * rounds;
      setLifetimeDeployed(deployedTotal);
      window.localStorage.setItem(`meteorblox:deployed:${currentAccount.address.toLowerCase()}`, String(deployedTotal));
      setNotice(rounds > 1 ? `Autoplay funded for ${rounds} rounds. Transaction: ${result.digest}` : `Testnet play confirmed. Transaction: ${result.digest}`);
      setSelected([]);
      setTileCountInput("0");
      await refreshChainState();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected wallet error";
      if (/user closed the wallet window/i.test(message)) {
        setNotice("Slush approval returned without its Chrome callback. Confirming the play on Sui Testnet...");
        const recoveredDigest = await recoverApprovedPlay(approvalStartedAt);
        if (recoveredDigest) {
          setNotice(`Testnet play confirmed on-chain. Transaction: ${recoveredDigest}`);
          setSelected([]);
          setTileCountInput("0");
          await refreshChainState();
          return;
        }
      }
      setNotice(`Testnet play failed: ${message}`);
    } finally {
      setSubmittingPlay(false);
    }
  }

  async function activateTestnetGame() {
    if (!currentAccount) return setConnectOpen(true);
    if (currentAccount.address.toLowerCase() !== testnetOwner) return setNotice("Connect the SLVRBLOX owner wallet.");
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address);
    transaction.setGasBudget(50_000_000);
    const game = transaction.object(gameId);
    transaction.moveCall({ target: `${packageId}::game::bind_dslvr_rewards`, arguments: [game, transaction.object(rewardCapId)] });
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
    if (currentAccount.address.toLowerCase() !== testnetOwner) return setNotice("Connect the SLVRBLOX owner wallet.");
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
    setNotice("Waiting for the owner wallet to approve the idle-round Testnet upgrade...");
    try {
      const result = await executeWithSlush(transaction);
      if (result) setNotice(`SLVRBLOX idle-round Testnet upgrade completed. Transaction: ${result.digest}`);
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

  async function createAutoplayRegistry() {
    if (!currentAccount) return setConnectOpen(true);
    if (currentAccount.address.toLowerCase() !== testnetOwner) return setNotice("Connect the METEORBLOX owner wallet.");
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address);
    transaction.setGasBudget(50_000_000);
    transaction.moveCall({ target: `${continuousPackageId}::autoplay::create_registry` });
    setCreatingAutoplayRegistry(true);
    setNotice("Waiting for owner approval to activate the shared autoplay registry...");
    try {
      const result = await executeWithSlush(transaction);
      if (result) setNotice(`Autoplay Registry created. Transaction: ${result.digest}`);
    } catch (error) {
      setNotice(`Autoplay Registry creation failed: ${error instanceof Error ? error.message : "Unexpected wallet error"}`);
    } finally { setCreatingAutoplayRegistry(false); }
  }

  async function createStakingVault() {
    if (!currentAccount) return setConnectOpen(true);
    if (currentAccount.address.toLowerCase() !== testnetOwner) return setNotice("Connect the SLVRBLOX owner wallet.");
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address);
    transaction.setGasBudget(50_000_000);
    transaction.moveCall({ target: `${packageId}::staking::create_vault` });
    setCreatingStakingVault(true);
    setNotice("Waiting for owner approval to create the shared DSLVR staking vault...");
    try {
      const result = await executeWithSlush(transaction);
      if (result) setNotice(`DSLVR Staking Vault created. Transaction: ${result.digest}`);
    } catch (error) {
      setNotice(`Staking Vault creation failed: ${error instanceof Error ? error.message : "Unexpected wallet error"}`);
    } finally { setCreatingStakingVault(false); }
  }

  function dslvrToUnits(value: string) {
    const normalized = value.trim();
    if (!/^\d+(\.\d{0,6})?$/.test(normalized)) return null;
    const [whole, fraction = ""] = normalized.split(".");
    return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  }

  async function submitStakeAction() {
    if (!currentAccount) return setConnectOpen(true);
    const units = dslvrToUnits(stakeAmount);
    if (!units || units <= 0n) return setNotice("Enter a valid DSLVR amount with no more than 6 decimals.");
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address);
    transaction.setGasBudget(30_000_000);
    if (stakeMode === "stake") {
      const payment = transaction.coin({ type: dslvrCoinType, balance: units });
      transaction.moveCall({ target: `${packageId}::staking::stake`, arguments: [transaction.object(stakingVaultId), payment] });
    } else {
      transaction.moveCall({ target: `${packageId}::staking::unstake`, arguments: [transaction.object(stakingVaultId), transaction.pure.u64(units)] });
    }
    setSubmittingStake(true);
    setNotice(`Waiting for wallet approval to ${stakeMode} DSLVR...`);
    try {
      const result = await executeWithSlush(transaction);
      if (result) {
        setNotice(`${stakeMode === "stake" ? "DSLVR staked" : "DSLVR unstaked"}. Transaction: ${result.digest}`);
        setStakeAmount("");
        window.setTimeout(() => void refreshStakingState(), 1_500);
      }
    } catch (error) {
      setNotice(`${stakeMode === "stake" ? "Stake" : "Unstake"} failed: ${error instanceof Error ? error.message : "Unexpected wallet error"}`);
    } finally { setSubmittingStake(false); }
  }

  async function claimLedgerSui() {
    if (!currentAccount) return setConnectOpen(true);
    if (!(chainState?.ledgerSui ?? 0)) return setNotice("No settled SUI rewards are available to claim.");
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address);
    transaction.setGasBudget(25_000_000);
    const creditCount = Math.max(1, chainState?.ledgerCreditCount ?? 1);
    for (let i = 0; i < creditCount; i += 1) {
      transaction.moveCall({ target: `${continuousPackageId}::ledger::claim_sui`, arguments: [transaction.object(ledgerId)] });
    }
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
    if (currentAccount.address.toLowerCase() !== testnetOwner) return setNotice("Connect the SLVRBLOX owner wallet.");
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address);
    transaction.setGasBudget(300_000_000);
    const upgradeCap = transaction.publish({
      modules: [...dslvrPublishData.modules],
      dependencies: [...dslvrPublishData.dependencies],
    });
    transaction.transferObjects([upgradeCap], currentAccount.address);
    setPublishingPackage(true);
    setNotice("Waiting for owner approval to publish a clean SLVRBLOX / DSLVR Testnet deployment...");
    try {
      const result = await executeWithSlush(transaction);
      if (result) setNotice(`Clean SLVRBLOX / DSLVR Testnet deployment published. Transaction: ${result.digest}`);
    } catch (error) {
      setNotice(`Clean Testnet publish failed: ${error instanceof Error ? error.message : "Unexpected wallet error"}`);
    } finally { setPublishingPackage(false); }
  }

  async function publishMockTestUsdc() {
    if (!currentAccount) return setConnectOpen(true);
    if (currentAccount.address.toLowerCase() !== testnetOwner) return setNotice("Connect the SLVRBLOX owner Testnet wallet.");
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address);
    transaction.setGasBudget(100_000_000);
    const upgradeCap = transaction.publish({
      modules: [...testUsdcPublishData.modules],
      dependencies: [...testUsdcPublishData.dependencies],
    });
    transaction.transferObjects([upgradeCap], currentAccount.address);
    setPublishingPackage(true);
    setNotice("Waiting for approval to publish mock tUSDC on Sui Testnet only...");
    try {
      const result = await executeWithSlush(transaction);
      if (result) setNotice(`Mock tUSDC published on Testnet. Transaction: ${result.digest}`);
    } catch (error) {
      setNotice(`Mock tUSDC Testnet publish failed: ${error instanceof Error ? error.message : "Unexpected wallet error"}`);
    } finally { setPublishingPackage(false); }
  }

  async function publishRehearsalDslvr() {
    if (!currentAccount) return setConnectOpen(true);
    if (currentAccount.address.toLowerCase() !== testnetOwner) return setNotice("Connect the SLVRBLOX owner Testnet wallet.");
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address);
    transaction.setGasBudget(200_000_000);
    const upgradeCap = transaction.publish({
      modules: [...rehearsalDslvrPublishData.modules],
      dependencies: [...rehearsalDslvrPublishData.dependencies],
    });
    transaction.transferObjects([upgradeCap], currentAccount.address);
    setPublishingPackage(true);
    setNotice("Waiting for approval to publish the reduced DSLVR token package on Sui Testnet only...");
    try {
      const result = await executeWithSlush(transaction);
      if (result) setNotice(`Reduced DSLVR package published on Testnet. Transaction: ${result.digest}`);
    } catch (error) {
      setNotice(`Reduced DSLVR Testnet publish failed: ${error instanceof Error ? error.message : "Unexpected wallet error"}`);
    } finally { setPublishingPackage(false); }
  }

  async function mintRehearsalTestUsdc() {
    if (!currentAccount) return setConnectOpen(true);
    if (currentAccount.address.toLowerCase() !== testnetOwner) return setNotice("Connect the SLVRBLOX owner Testnet wallet.");
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address);
    transaction.setGasBudget(20_000_000);
    transaction.moveCall({
      target: `${testPaymentPackageId}::usdc::mint`,
      arguments: [
        transaction.object(testUsdcTreasuryCapId),
        transaction.pure.u64(20_000_000),
        transaction.pure.address(testnetOwner),
      ],
    });
    setRoundAction(true);
    setNotice("Waiting for approval to mint exactly 20 valueless tUSDC on Testnet...");
    try {
      const result = await executeWithSlush(transaction);
      if (result) setNotice(`Minted 20 mock tUSDC on Testnet. Transaction: ${result.digest}`);
    } catch (error) {
      setNotice(`Mock tUSDC mint failed: ${error instanceof Error ? error.message : "Unexpected wallet error"}`);
    } finally { setRoundAction(false); }
  }

  async function publishRehearsalSale() {
    if (!currentAccount) return setConnectOpen(true);
    if (currentAccount.address.toLowerCase() !== testnetOwner) return setNotice("Connect the SLVRBLOX owner Testnet wallet.");
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address);
    transaction.setGasBudget(100_000_000);
    const upgradeCap = transaction.publish({
      modules: [...rehearsalSalePublishData.modules],
      dependencies: [...rehearsalSalePublishData.dependencies],
    });
    transaction.transferObjects([upgradeCap], currentAccount.address);
    setPublishingPackage(true);
    setNotice("Waiting for approval to publish the presale contract on Sui Testnet only...");
    try {
      const result = await executeWithSlush(transaction);
      if (result) setNotice(`Presale contract published on Testnet. Transaction: ${result.digest}`);
    } catch (error) {
      setNotice(`Presale Testnet publish failed: ${error instanceof Error ? error.message : "Unexpected wallet error"}`);
    } finally { setPublishingPackage(false); }
  }

  async function configureAndCreateRehearsalSale() {
    if (!currentAccount) return setConnectOpen(true);
    if (currentAccount.address.toLowerCase() !== testnetOwner) return setNotice("Connect the SLVRBLOX owner Testnet wallet.");
    const now = Date.now();
    const startsAtMs = now + 60_000;
    const endsAtMs = now + 10 * 60_000;
    const launchAtMs = now + 20 * 60_000;
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address);
    transaction.setGasBudget(50_000_000);
    transaction.moveCall({
      target: `${rehearsalTokenPackageId}::dslvr::configure_launch`,
      arguments: [
        transaction.object(rehearsalLaunchVaultId),
        transaction.object(rehearsalAllocationAdminCapId),
        transaction.pure.u64(launchAtMs),
        transaction.pure.address(testnetOwner),
        transaction.pure.address(testnetOwner),
        transaction.pure.address(testnetOwner),
        transaction.object(suiClockId),
      ],
    });
    const inventory = transaction.moveCall({
      target: `${rehearsalTokenPackageId}::dslvr::take_presale_inventory`,
      arguments: [transaction.object(rehearsalLaunchVaultId), transaction.object(rehearsalAllocationAdminCapId)],
    });
    transaction.moveCall({
      target: `${rehearsalSalePackageId}::sale::create`,
      typeArguments: [rehearsalDslvrType, rehearsalTestUsdcType],
      arguments: [
        inventory,
        transaction.pure.address(testnetOwner),
        transaction.pure.address(testnetOwner),
        transaction.pure.u64(startsAtMs),
        transaction.pure.u64(endsAtMs),
        transaction.object(suiClockId),
      ],
    });
    setRoundAction(true);
    setNotice("Waiting for approval to configure the Testnet launch vault and create the funded rehearsal sale...");
    try {
      const result = await executeWithSlush(transaction);
      if (result) setNotice(`Funded Testnet presale created. Transaction: ${result.digest}`);
    } catch (error) {
      setNotice(`Testnet presale creation failed: ${error instanceof Error ? error.message : "Unexpected wallet error"}`);
    } finally { setRoundAction(false); }
  }

  async function completeRehearsalPurchase() {
    if (!currentAccount) return setConnectOpen(true);
    if (currentAccount.address.toLowerCase() !== testnetOwner) return setNotice("Connect the SLVRBLOX owner Testnet wallet.");
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address);
    transaction.setGasBudget(30_000_000);
    transaction.moveCall({
      target: `${rehearsalSalePackageId}::sale::set_eligible`,
      typeArguments: [rehearsalDslvrType, rehearsalTestUsdcType],
      arguments: [transaction.object(rehearsalSaleId), transaction.object(rehearsalSaleAdminCapId), transaction.pure.address(testnetOwner), transaction.pure.bool(true)],
    });
    transaction.moveCall({
      target: `${rehearsalSalePackageId}::sale::set_paused`,
      typeArguments: [rehearsalDslvrType, rehearsalTestUsdcType],
      arguments: [transaction.object(rehearsalSaleId), transaction.object(rehearsalSaleAdminCapId), transaction.pure.bool(false)],
    });
    transaction.moveCall({
      target: `${rehearsalSalePackageId}::sale::purchase`,
      typeArguments: [rehearsalDslvrType, rehearsalTestUsdcType],
      arguments: [transaction.object(rehearsalSaleId), transaction.object(rehearsalTestUsdcCoinId), transaction.object(suiClockId)],
    });
    setRoundAction(true);
    setNotice("Waiting for approval to authorize the Testnet buyer and purchase exactly 20 DSLVR for 20 mock tUSDC...");
    try {
      const result = await executeWithSlush(transaction);
      if (result) setNotice(`Testnet presale purchase completed. Transaction: ${result.digest}`);
    } catch (error) {
      setNotice(`Testnet presale purchase failed: ${error instanceof Error ? error.message : "Unexpected wallet error"}`);
    } finally { setRoundAction(false); }
  }

  async function finalizeRehearsalSale() {
    if (!currentAccount) return setConnectOpen(true);
    if (currentAccount.address.toLowerCase() !== testnetOwner) return setNotice("Connect the SLVRBLOX owner Testnet wallet.");
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address);
    transaction.setGasBudget(20_000_000);
    transaction.moveCall({
      target: `${rehearsalSalePackageId}::sale::finalize`,
      typeArguments: [rehearsalDslvrType, rehearsalTestUsdcType],
      arguments: [transaction.object(rehearsalSaleId), transaction.object(rehearsalSaleAdminCapId), transaction.pure.u64(rehearsalLaunchAtMs), transaction.object(suiClockId)],
    });
    setRoundAction(true);
    setNotice("Waiting for approval to finalize the completed Testnet rehearsal sale...");
    try {
      const result = await executeWithSlush(transaction);
      if (result) setNotice(`Testnet presale finalized. Transaction: ${result.digest}`);
    } catch (error) {
      setNotice(`Testnet presale finalization failed: ${error instanceof Error ? error.message : "Unexpected wallet error"}`);
    } finally { setRoundAction(false); }
  }

  async function completeRehearsalLaunch() {
    if (!currentAccount) return setConnectOpen(true);
    if (currentAccount.address.toLowerCase() !== testnetOwner) return setNotice("Connect the SLVRBLOX owner Testnet wallet.");
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address);
    transaction.setGasBudget(30_000_000);
    const [claimed] = transaction.moveCall({
      target: `${rehearsalSalePackageId}::sale::claim`,
      typeArguments: [rehearsalDslvrType, rehearsalTestUsdcType],
      arguments: [transaction.object(rehearsalSaleId), transaction.object(suiClockId)],
    });
    transaction.transferObjects([claimed], currentAccount.address);
    transaction.moveCall({
      target: `${rehearsalSalePackageId}::sale::send_unsold_to_treasury`,
      typeArguments: [rehearsalDslvrType, rehearsalTestUsdcType],
      arguments: [transaction.object(rehearsalSaleId), transaction.object(rehearsalSaleAdminCapId)],
    });
    setRoundAction(true);
    setNotice("Waiting for approval to claim the launch unlock and return unsold Testnet DSLVR...");
    try {
      const result = await executeWithSlush(transaction);
      if (result) setNotice(`Launch claim completed and unsold Testnet DSLVR returned. Transaction: ${result.digest}`);
    } catch (error) {
      setNotice(`Testnet launch completion failed: ${error instanceof Error ? error.message : "Unexpected wallet error"}`);
    } finally { setRoundAction(false); }
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
    setRoundAction(true); setNotice("Waiting for wallet approval to claim SUI and award DSLVR...");
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
    if (autoplayRegistryId) {
      transaction.moveCall({ target: `${packageId}::autoplay::execute_round`, arguments: [transaction.object(autoplayRegistryId), transaction.object(gameId), transaction.object(suiClockId)] });
    }
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
    if (!count) return setNotice(early ? "No unrefined DSLVR is available for early withdrawal." : "No refined DSLVR is available to claim.");
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address); transaction.setGasBudget(50_000_000);
    const target = `${packageId}::dslvr::${early ? "claim_early" : "claim_refined"}`;
    for (let index = 0; index < count; index += 1) transaction.moveCall({ target, arguments: [transaction.object(refineryId), transaction.object(suiClockId)] });
    setRoundAction(true); setNotice(`Waiting for wallet approval to ${early ? "withdraw" : "claim"} DSLVR...`);
    try {
      const result = await executeWithSlush(transaction);
      if (result) { setNotice(`DSLVR ${early ? "withdrawal" : "claim"} confirmed. Transaction: ${result.digest}`); await refreshChainState(); }
    } catch (error) { setNotice(`DSLVR claim failed: ${error instanceof Error ? error.message : "Unexpected wallet error"}`); }
    finally { setRoundAction(false); }
  }

  const latestTransaction = notice.match(/Transaction:\s*([A-Za-z0-9]+)/)?.[1] ?? chainState?.lastRound?.transaction ?? "None";
  const bugReport = [
    "SLVRBLOX Testnet bug report",
    `Time: ${new Date().toISOString()}`,
    `Page: ${typeof window === "undefined" ? "/" : window.location.href}`,
    `View: ${view}`,
    `Wallet: ${currentWallet?.name ?? "Not connected"}`,
    `Address: ${currentAddress ?? "Not connected"}`,
    `Round: ${chainState?.round ?? "Unavailable"}`,
    `Round status: ${chainState?.settled ? "Settled" : "Open"}`,
    `Time left: ${seconds}s`,
    `Latest transaction: ${latestTransaction}`,
    `Last message: ${notice || "None"}`,
    `Browser: ${typeof navigator === "undefined" ? "Unavailable" : navigator.userAgent}`,
    "What happened: ",
    "What you expected: ",
  ].join("\n");

  async function copyBugReport() {
    await navigator.clipboard.writeText(bugReport);
    setBugReportCopied(true);
    window.setTimeout(() => setBugReportCopied(false), 1800);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand slvr-brand" href="#" aria-label="SLVRBLOX home" onClick={() => setView("mine")}><img src="/brand/slvrblox-logo-trimmed.png" alt="SLVRBLOX" /></a>
        <nav className="main-nav" aria-label="Main navigation"><button className={view === "mine" ? "active" : ""} onClick={() => setView("mine")}>Mine</button><button className={view === "rewards" ? "active" : ""} onClick={() => setView("rewards")}>Rewards</button><button className={view === "stake" ? "active" : ""} onClick={() => setView("stake")}>Stake</button><Link href="/explore">Explore</Link><Link href="/airdrop">Airdrop</Link><a href="https://sale.slvrblox.com">Presale</a></nav>
        <div className="top-actions">
          <div className="protocol-links" aria-label="SLVRBLOX community links">
            <a href="https://x.com/slvrblox" target="_blank" rel="noreferrer" title="SLVRBLOX on X" aria-label="SLVRBLOX on X"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 2H22l-6.77 7.74L23.2 22h-6.24l-4.89-6.39L6.48 22H3.36l7.25-8.29L2.97 2h6.4l4.42 5.84L18.9 2Zm-1.1 17.84h1.73L8.43 4.05H6.58L17.8 19.84Z" /></svg></a>
            <a href="https://github.com/meteorblox/meteorblox" target="_blank" rel="noreferrer" title="SLVRBLOX on GitHub" aria-label="View the SLVRBLOX source code on GitHub"><svg viewBox="0 0 24 24" aria-hidden="true"><path fillRule="evenodd" d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.71.5.1.68-.22.68-.49l-.01-1.92c-2.78.62-3.37-1.22-3.37-1.22-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.56 2.35 1.11 2.92.85.09-.66.35-1.11.64-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.35 9.35 0 0 1 12 6.93c.85 0 1.7.12 2.5.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.94.68 1.9l-.01 2.81c0 .27.18.59.69.49A10.23 10.23 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z" clipRule="evenodd" /></svg></a>
            <a href="https://discord.gg/G7Uc3Ck66" target="_blank" rel="noreferrer" title="SLVRBLOX Discord" aria-label="Join SLVRBLOX on Discord"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.54 5.34A17.3 17.3 0 0 0 15.29 4l-.52 1.06a15.77 15.77 0 0 0-5.54 0L8.7 4A17.45 17.45 0 0 0 4.45 5.34C1.76 9.43 1.03 13.42 1.4 17.35a17.1 17.1 0 0 0 5.21 2.69l1.26-1.76a11.1 11.1 0 0 1-1.98-.97l.49-.38c3.82 1.8 7.96 1.8 11.73 0l.5.38c-.64.38-1.3.7-1.99.97l1.26 1.76a17.03 17.03 0 0 0 5.21-2.69c.43-4.56-.73-8.51-3.55-12.01ZM8.68 14.93c-1.15 0-2.1-1.08-2.1-2.4s.93-2.4 2.1-2.4c1.18 0 2.12 1.09 2.1 2.4 0 1.32-.93 2.4-2.1 2.4Zm6.64 0c-1.15 0-2.1-1.08-2.1-2.4s.93-2.4 2.1-2.4c1.18 0 2.12 1.09 2.1 2.4 0 1.32-.92 2.4-2.1 2.4Z" /></svg></a>
          </div>
          <div className="asset-tickers" aria-label="Token prices">
            <span className="price-chip mtbx-chip" title="DSLVR simulated Testnet value"><img className="ticker-slvr-core" src="/brand/dslvr-coin.png" alt="DSLVR" /><strong>$10.00</strong></span>
            <span className="price-chip sui-chip" title="SUI price"><i className="ticker-sui" aria-hidden="true"><svg viewBox="0 0 32 40"><path d="M16 1.8C13.3 5.5 4.2 16.5 4.2 23.9A11.8 11.8 0 0 0 16 35.8a11.8 11.8 0 0 0 11.8-11.9C27.8 16.5 18.7 5.5 16 1.8Zm0 29.6a7.5 7.5 0 0 1-7.5-7.5c0-3.7 4.2-10.2 7.5-14.7 3.3 4.5 7.5 11 7.5 14.7a7.5 7.5 0 0 1-7.5 7.5Z"/><path d="M11 24.5c1.4 2.6 4.5 3.7 7.2 2.4 1.1-.5 2-1.4 2.6-2.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg></i><strong>{suiPrice === null ? "Loading" : `$${suiPrice.toFixed(2)}`}</strong></span>
          </div>
          <span className="network"><i /> Sui Testnet</span><button className="wallet" onClick={openAccountDrawer}>{currentAccount ? `${currentAccount.address.slice(0, 6)}...${currentAccount.address.slice(-4)}` : "Sign in"}</button>
        </div>
      </header>

      <aside className="beta-banner" aria-label="Testnet beta notice">
        <strong>TESTNET BETA</strong>
        <span>Test tokens have no monetary value. Bugs and resets may occur.<b className="tester-airdrop">AIRDROP · Active Testnet participants may qualify for a future DSLVR airdrop.</b></span>
        <button type="button" onClick={() => setBugReportOpen((open) => !open)}>Report a bug</button>
      </aside>
      {bugReportOpen && <section className="bug-report-panel" aria-label="Bug report diagnostics"><div><strong>DIAGNOSTIC REPORT</strong><span>Copy this report and paste it in Discord with a screenshot. It never includes wallet keys.</span></div><pre>{bugReport}</pre><footer><button type="button" onClick={copyBugReport}>{bugReportCopied ? "Copied" : "Copy report"}</button><a href="https://discord.gg/G7Uc3Ck66" target="_blank" rel="noreferrer">Open Discord ↗</a></footer></section>}
      {chainState?.keeperLow && <aside className="keeper-alert" role="alert"><strong>AUTOPLAY PAUSED</strong><span>The Testnet automation wallet is low on gas. Existing autoplay funds remain safe while service is restored.</span></aside>}

      <section className="round-strip" aria-label={`Current round ${chainState?.round ?? "loading"}`}>
        <div><strong className="deployed-total"><i className="round-sui-icon" aria-hidden="true"><svg viewBox="0 0 32 40"><path d="M16 1.8C13.3 5.5 4.2 16.5 4.2 23.9A11.8 11.8 0 0 0 16 35.8a11.8 11.8 0 0 0 11.8-11.9C27.8 16.5 18.7 5.5 16 1.8Zm0 29.6a7.5 7.5 0 0 1-7.5-7.5c0-3.7 4.2-10.2 7.5-14.7 3.3 4.5 7.5 11 7.5 14.7a7.5 7.5 0 0 1-7.5-7.5Z"/></svg></i>{chainLoading ? "—" : (chainState?.potSui ?? 0).toFixed(4)}</strong><small>DEPLOYED</small></div>
        <div><strong className="meteor-shower-total"><img className="round-slvr-core" src="/brand/dslvr-coin.png" alt="DSLVR" />{(chainState?.motherlodeDslvr ?? 0).toFixed(2)}</strong><small>MOTHERLODE</small></div>
        <div><strong>{chainState?.settled ? "SETTLED" : `${seconds}s`}</strong><small>TIME</small></div>
      </section>

      <section className="last-round" aria-label="Last settled round">
        <Link className="last-round-toggle" href="/explore">
          <span><small>LAST ROUND</small><strong>{chainState?.lastRound ? `#${String(chainState.lastRound.round).padStart(6, "0")}` : "Waiting for settlement"}</strong></span>
          <span className="last-round-summary">{chainState?.lastRound && <b>BLOCK {chainState.lastRound.winningTile}</b>}<i aria-hidden="true">›</i></span>
        </Link>
      </section>

      {view === "mine" ? <div className="workspace">
        <section className="mine-panel">
          <div className="section-heading"><div><p>LIVE GRID &middot; {idleSimulation ? "IDLE SIMULATION" : "TESTNET"}</p><h1>Choose your impact zone.</h1>{idleSimulation && <span className="simulation-note">Visual demo only &middot; no SUI, rewards, or simulated players</span>}</div>
            <button className="text-button" onClick={toggleAllTiles}>{selected.length === 25 ? "Clear" : "Select all"}</button>
          </div>
          <div className="grid" aria-label="Mining grid">
            {tiles.map((tile) => {
              const isSelected = selected.includes(tile);
              const isPlayed = chainState?.playedTiles.includes(tile) ?? false;
              const isWinning = winningFlashTile === tile;
              const isLastWinner = chainState?.lastRound?.winningTile === tile;
              const isSimulated = idleSimulation && simulatedTiles.includes(tile);
              const selectedAmount = isSelected && Number.isFinite(Number(amount)) ? Number(amount) : 0;
              const previewAmount = tileAmounts[tile - 1] + selectedAmount;
              const tileClasses = ["tile", isSelected ? "selected" : isPlayed ? "played" : isSimulated ? "simulated" : "", isWinning ? "winning" : !isWinning && isLastWinner ? "last-winner" : ""].filter(Boolean).join(" ");
              return <button key={tile} className={tileClasses} aria-label={`Block ${tile}, ${previewAmount.toFixed(3)} SUI${isPlayed ? ", played this round" : isSimulated ? ", simulated idle activity" : ""}`} aria-pressed={isSelected} onClick={() => toggleTile(tile)}><span className="tile-number">{tile}</span>{isSelected && <span className="tile-check" aria-hidden="true">✓</span>}{!isSelected && isPlayed && <span className="tile-played-badge" aria-hidden="true">PLAYED</span>}{!isSelected && !isPlayed && isSimulated && <span className="tile-simulated-badge" aria-hidden="true">SIM</span>}<img className="slvr-core" src="/brand/dslvr-coin.png" alt="" aria-hidden="true" /><span className="tile-balance"><i className="sui-icon" aria-hidden="true"><span /></i><strong>{previewAmount.toFixed(3)}</strong></span></button>;
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
          <dl className="summary"><div><dt>Selected tiles</dt><dd>{selected.length}</dd></div><div><dt>Rounds</dt><dd>{rounds}</dd></div><div><dt>Per round</dt><dd>{(Number(amount) * selected.length || 0).toFixed(4)} SUI</dd></div><div><dt>Total deployment</dt><dd>{total.toFixed(4)} SUI</dd></div></dl>
          {(chainState?.autoplayPlans.length ?? 0) > 0 && <section className="autoplay-status" aria-live="polite"><span><small>AUTOPLAY ACTIVE</small><strong>{chainState!.autoplayPlans.reduce((sum, plan) => sum + plan.roundsRemaining, 0)} rounds left</strong></span><span>{chainState!.autoplayPlans.length} active {chainState!.autoplayPlans.length === 1 ? "plan" : "plans"}</span></section>}
          <button className="deploy" disabled={submittingPlay || !chainState || chainState.settled || (seconds === 0 && (chainState?.potSui ?? 0) > 0)} onClick={deploy}>{submittingPlay ? "Waiting for wallet approval…" : !chainState?.rewardsBound ? "Owner activation required" : chainState.settled ? "Round is settled" : seconds === 0 ? "Start next round & deploy" : "Deploy to live grid"}</button>{notice && <p className="notice" role="status">{notice}</p>}
          <button className="rewards-link" onClick={() => setView("rewards")}><span><small>YOUR CLAIMABLE ON-CHAIN REWARDS</small><strong><span><img className="reward-dslvr-icon" src="/brand/dslvr-coin.png" alt="" aria-hidden="true" />{((chainState?.unrefinedMtbx ?? 0) + (chainState?.refinedMtbx ?? 0)).toFixed(6)} DSLVR in refinery</span><span><i className="reward-sui-icon" aria-hidden="true"><svg viewBox="0 0 32 40"><path d="M16 1.8C13.3 5.5 4.2 16.5 4.2 23.9A11.8 11.8 0 0 0 16 35.8a11.8 11.8 0 0 0 11.8-11.9C27.8 16.5 18.7 5.5 16 1.8Zm0 29.6a7.5 7.5 0 0 1-7.5-7.5c0-3.7 4.2-10.2 7.5-14.7 3.3 4.5 7.5 11 7.5 14.7a7.5 7.5 0 0 1-7.5-7.5Z" /></svg></i>{(chainState?.ledgerSui ?? 0).toFixed(6)} claimable SUI</span></strong></span><b>View &amp; claim &rarr;</b></button>
          <p className="disclaimer">Sui Testnet only. A confirmed play uses test SUI and writes your selected tiles on-chain.</p>
        </aside>
      </div> : view === "rewards" ? <section className="rewards-page">
        <div className="rewards-title"><p className="eyebrow">LIVE SUI TESTNET REWARDS</p><h1>Your SUI and DSLVR winnings.</h1><p>Balances below are read from the published Game and Refinery objects. A winning claim sends SUI immediately and starts the DSLVR refining period.</p></div>
        <div className="reward-assets">
          <article className="claim-card refining-card"><div className="claim-icon asset-claim-icon"><img src="/brand/dslvr-coin.png" alt="DSLVR" /></div><small><span className="dslvr-word">DSLVR</span> REFINERY</small><div className="refinery-balances"><div><span>UNREFINED</span><strong className="asset-balance"><img src="/brand/dslvr-coin.png" alt="" aria-hidden="true" />{(chainState?.unrefinedMtbx ?? 0).toFixed(6)} <span className="dslvr-word">DSLVR</span></strong></div><div><span>REFINED</span><strong className="asset-balance"><img src="/brand/dslvr-coin.png" alt="" aria-hidden="true" />{(chainState?.refinedMtbx ?? 0).toFixed(6)} <span className="dslvr-word">DSLVR</span></strong></div></div><div className="refine-time"><span>IN WALLET</span><strong>{(chainState?.walletDslvr ?? 0).toFixed(6)} DSLVR</strong></div><div className="refine-time"><span>Status</span><strong>{(chainState?.unrefinedPositions ?? 0) > 0 ? "Refining · within 24h" : (chainState?.refinedPositions ?? 0) > 0 ? "Ready to claim" : "No active positions"}</strong></div>{(chainState?.unrefinedPositions ?? 0) > 0 && <div className="refine-track" aria-label="DSLVR refining period"><i /></div>}<p className="refine-copy"><span className="dslvr-word">DSLVR</span> becomes fully transferable after 24 hours. Early withdrawal mints 90% and permanently forfeits 10%.</p><button className="deploy" disabled={roundAction || !(chainState?.refinedPositions)} onClick={() => claimMtbx(false)}>Claim refined <span className="dslvr-word">DSLVR</span></button><button className="early-withdraw" disabled={roundAction || !(chainState?.unrefinedPositions)} onClick={() => claimMtbx(true)}>Withdraw unrefined early</button><p className="penalty-copy"><strong>10% penalty</strong> applies only to early withdrawal.</p></article>
          <article className="claim-card sui-claim"><div className="claim-icon sui-claim-icon" aria-label="Sui"><svg viewBox="0 0 32 40"><path d="M16 1.8C13.3 5.5 4.2 16.5 4.2 23.9A11.8 11.8 0 0 0 16 35.8a11.8 11.8 0 0 0 11.8-11.9C27.8 16.5 18.7 5.5 16 1.8Zm0 29.6a7.5 7.5 0 0 1-7.5-7.5c0-3.7 4.2-10.2 7.5-14.7 3.3 4.5 7.5 11 7.5 14.7a7.5 7.5 0 0 1-7.5 7.5Z" /></svg></div><small>SETTLED SUI REWARDS</small><strong className="asset-balance sui-asset-balance"><i className="reward-sui-icon" aria-hidden="true"><svg viewBox="0 0 32 40"><path d="M16 1.8C13.3 5.5 4.2 16.5 4.2 23.9A11.8 11.8 0 0 0 16 35.8a11.8 11.8 0 0 0 11.8-11.9C27.8 16.5 18.7 5.5 16 1.8Zm0 29.6a7.5 7.5 0 0 1-7.5-7.5c0-3.7 4.2-10.2 7.5-14.7 3.3 4.5 7.5 11 7.5 14.7a7.5 7.5 0 0 1-7.5 7.5Z" /></svg></i>{(chainState?.ledgerSui ?? 0).toFixed(6)} SUI</strong><span>Credited automatically after each settlement</span><button className="deploy sui-button" disabled={roundAction || !(chainState?.ledgerSui)} onClick={claimLedgerSui}>Claim SUI</button></article>
        </div>
        {(chainState?.claimableWinningEntries ?? 0) > 0 && <article className="claim-card testnet-publish"><small>WINNING ENTRY READY</small><h2>Claim round #{String(chainState?.round ?? 0).padStart(6, "0")} winnings</h2><p>This credits your settled SUI reward and starts the 24-hour DSLVR refining period.</p><button className="deploy" disabled={roundAction} onClick={claimRoundWinnings}>{roundAction ? "Waiting for Slush approval..." : `Claim ${chainState?.claimableWinningEntries ?? 0} winning ${chainState?.claimableWinningEntries === 1 ? "entry" : "entries"}`}</button></article>}
        {!chainState?.settled && seconds === 0 && <button className="claim-all" disabled={roundAction} onClick={settleRound}>Reveal winning block with Sui randomness</button>}
        <article className="claim-card testnet-publish"><small>TESTNET ROUND AUTOMATION</small><h2>Idle-round system live</h2><p>Empty rounds pause without keeper transactions. The next player starts a fresh round automatically as part of their play.</p></article>
        {currentAccount?.address.toLowerCase() === testnetOwner && <article className="claim-card testnet-publish"><small>PRESALE REHEARSAL · TESTNET ONLY</small><h2>Publish mock tUSDC</h2><p>Disposable six-decimal payment token for testing the presale flow. It has no value and cannot be used on Mainnet.</p><button className="deploy" disabled={publishingPackage} onClick={publishMockTestUsdc}>{publishingPackage ? "Waiting for wallet approval..." : "Publish Mock tUSDC — Testnet"}</button></article>}
        {currentAccount?.address.toLowerCase() === testnetOwner && <article className="claim-card testnet-publish"><small>PRESALE REHEARSAL · TESTNET ONLY</small><h2>Publish reduced DSLVR</h2><p>Token and allocation-vault package for the isolated presale rehearsal. This creates disposable Testnet objects only.</p><button className="deploy" disabled={publishingPackage} onClick={publishRehearsalDslvr}>{publishingPackage ? "Waiting for wallet approval..." : "Publish Reduced DSLVR — Testnet"}</button></article>}
        {currentAccount?.address.toLowerCase() === testnetOwner && <article className="claim-card testnet-publish"><small>PRESALE REHEARSAL · TESTNET ONLY</small><h2>Mint 20 mock tUSDC</h2><p>Creates exactly 20 valueless Testnet tUSDC for the minimum-size rehearsal purchase. No real USDC is involved.</p><button className="deploy" disabled={roundAction} onClick={mintRehearsalTestUsdc}>{roundAction ? "Waiting for wallet approval..." : "Mint 20 tUSDC — Testnet"}</button></article>}
        {currentAccount?.address.toLowerCase() === testnetOwner && <article className="claim-card testnet-publish"><small>PRESALE REHEARSAL · TESTNET ONLY</small><h2>Publish presale contract</h2><p>Publishes the tested generic sale and buyer-vesting contract on Testnet. It cannot receive Mainnet USDC.</p><button className="deploy" disabled={publishingPackage} onClick={publishRehearsalSale}>{publishingPackage ? "Waiting for wallet approval..." : "Publish Presale Contract — Testnet"}</button></article>}
        {currentAccount?.address.toLowerCase() === testnetOwner && <article className="claim-card testnet-publish"><small>PRESALE REHEARSAL · TESTNET ONLY</small><h2>Create funded rehearsal sale</h2><p>Atomically configures the Testnet launch vault and locks the exact 150,000 DSLVR presale allocation into a ten-minute rehearsal sale.</p><button className="deploy" disabled={roundAction} onClick={configureAndCreateRehearsalSale}>{roundAction ? "Waiting for wallet approval..." : "Configure + Create Sale — Testnet"}</button></article>}
        {currentAccount?.address.toLowerCase() === testnetOwner && <article className="claim-card testnet-publish"><small>PRESALE REHEARSAL · TESTNET ONLY</small><h2>Complete 20-DSLVR purchase</h2><p>Authorizes the rehearsal buyer, opens the sale, and spends exactly 20 valueless tUSDC to purchase 20 vested DSLVR.</p><button className="deploy" disabled={roundAction} onClick={completeRehearsalPurchase}>{roundAction ? "Waiting for wallet approval..." : "Buy 20 DSLVR for 20 tUSDC — Testnet"}</button></article>}
        {currentAccount?.address.toLowerCase() === testnetOwner && <article className="claim-card testnet-publish"><small>PRESALE REHEARSAL · TESTNET ONLY</small><h2>Finalize rehearsal sale</h2><p>Closes the completed Testnet sale after its purchase window and fixes the launch vesting schedule.</p><button className="deploy" disabled={roundAction || Date.now() < rehearsalEndsAtMs} onClick={finalizeRehearsalSale}>{roundAction ? "Waiting for wallet approval..." : "Finalize Presale — Testnet"}</button></article>}
        {currentAccount?.address.toLowerCase() === testnetOwner && <article className="claim-card testnet-publish"><small>PRESALE REHEARSAL · TESTNET ONLY</small><h2>Complete rehearsal launch</h2><p>Claims the buyer's 20% launch unlock and returns only unsold Testnet DSLVR to the treasury. The remaining buyer allocation stays locked in vesting.</p><button className="deploy" disabled={roundAction || Date.now() < rehearsalLaunchAtMs} onClick={completeRehearsalLaunch}>{roundAction ? "Waiting for wallet approval..." : "Claim launch unlock + return unsold"}</button></article>}
        <section className="miners-board"><div className="miners-heading"><div><p className="eyebrow">TESTNET ACTIVITY</p><h2>Miners</h2></div><span>Global Sui indexing next</span></div><div className="miners-tabs" role="tablist" aria-label="Miner leaderboard"><button className={leaderboardTab === "miners" ? "active" : ""} onClick={() => setLeaderboardTab("miners")}>Miners</button><button className={leaderboardTab === "unrefined" ? "active" : ""} onClick={() => setLeaderboardTab("unrefined")}>Unrefined</button><button className={leaderboardTab === "refined" ? "active" : ""} onClick={() => setLeaderboardTab("refined")}>Refined</button></div><div className="miners-table" role="table" aria-label="Testnet miners"><div className="miners-row miners-header" role="row"><span role="columnheader">Rank</span><span role="columnheader">Miner</span><span role="columnheader">{leaderboardTab === "miners" ? "Total deployed" : leaderboardTab === "unrefined" ? "Unrefined DSLVR" : "Refined DSLVR"}</span></div>{currentAccount ? <div className="miners-row" role="row"><strong role="cell">#1</strong><span role="cell"><i className="miner-avatar">M</i><b>{username || `${currentAccount.address.slice(0, 7)}...${currentAccount.address.slice(-5)}`}</b><small>You</small></span><strong role="cell">{leaderboardTab === "miners" ? `${lifetimeDeployed.toFixed(4)} SUI` : "Pending index"}</strong></div> : <div className="miners-empty">Connect a Testnet wallet to join the leaderboard.</div>}</div><p>Rankings will be rebuilt from confirmed EntryPlaced and RewardAwarded events so every miner and total is independently verifiable.</p></section>
        {currentAccount?.address.toLowerCase() === testnetOwner && !chainState?.rewardsBound && <article className="claim-card testnet-publish"><small>OWNER TESTNET MILESTONE</small><h2>Activate the live game</h2><p>One-time setup binds the unique DSLVR RewardCap to the shared Game and opens the first playable 60-second Testnet round.</p><button className="deploy" disabled={activatingGame} onClick={activateTestnetGame}>{activatingGame ? "Waiting for wallet approval…" : "Activate live Testnet round"}</button></article>}
        {currentAccount?.address.toLowerCase() === testnetOwner && chainState?.rewardsBound && chainState.settled && chainState.winningEntriesRemaining === 0 && <article className="claim-card testnet-publish"><small>OWNER ROUND CONTROL</small><h2>Open the next round</h2><p>The previous round is settled and all winning entries are claimed.</p><button className="deploy" disabled={roundAction} onClick={openNextRound}>Open next 60-second round</button></article>}
        {notice && <p className="notice rewards-notice" role="status">{notice}</p>}<p className="disclaimer rewards-disclaimer">Live Sui Testnet state. Test SUI has no monetary value. Contract logic is unaudited and must not be used on Mainnet yet.</p>
        <button className="back-link" onClick={() => { setView("mine"); setNotice(""); }}>Back to mining grid</button>
      </section> : <section className="stake-page">
        <div className="stake-hero"><p className="eyebrow">TESTNET BETA</p><h1>Stake DSLVR</h1><p>Stake freely. Earn DSLVR rewards.</p></div>
        <div className="stake-simple">
          <div className="stake-summary"><span><small>YOUR STAKE</small><strong>{stakingState.userStakedDslvr.toFixed(6)} DSLVR</strong></span><span><small>VAULT REWARDS</small><strong>{stakingState.rewardBalanceDslvr.toFixed(6)} DSLVR</strong></span></div>
          <article className="stake-card">
            <div className="stake-tabs"><button className={stakeMode === "stake" ? "active" : ""} onClick={() => setStakeMode("stake")}>Stake</button><button className={stakeMode === "unstake" ? "active" : ""} onClick={() => setStakeMode("unstake")}>Unstake</button></div>
            <div className="stake-balance"><span>{stakeMode === "stake" ? "AVAILABLE" : "STAKED"}</span><strong>{(stakeMode === "stake" ? stakingState.availableDslvr : stakingState.userStakedDslvr).toFixed(6)} DSLVR</strong></div>
            <label htmlFor="stake-amount">Amount</label><div className="stake-input"><input id="stake-amount" inputMode="decimal" placeholder="0.00" value={stakeAmount} onChange={(event) => setStakeAmount(event.target.value.replace(/[^0-9.]/g, ""))} /><span>DSLVR</span><button type="button" onClick={() => setStakeAmount((stakeMode === "stake" ? stakingState.availableDslvr : stakingState.userStakedDslvr).toFixed(6))}>MAX</button></div>
            <div className="stake-note"><span>No lockup</span><span>Withdraw anytime</span></div>
            <button className="deploy stake-submit" disabled={submittingStake || !stakeAmount || (stakeMode === "unstake" && stakingState.userStakedDslvr <= 0)} onClick={submitStakeAction}>{submittingStake ? "Waiting for wallet approval..." : stakeMode === "stake" ? "Stake DSLVR" : "Unstake DSLVR"}</button>
          </article>
          <button className="claim-yield" disabled>Claim rewards</button>
          <section className="stake-market-summary" aria-label="Staking summary">
            <h2>Summary</h2>
            <dl>
              <div><dt>APR</dt><dd>&mdash;</dd></div>
              <div><dt>Total deposits</dt><dd className="stake-dslvr-value"><img src="/brand/dslvr-coin.png" alt="" aria-hidden="true" />{stakingState.totalStakedDslvr.toFixed(6)} DSLVR</dd></div>
              <div><dt>TVL</dt><dd>$0.00</dd></div>
            </dl>
            <p>{stakingState.positionCount} active staking position{stakingState.positionCount === 1 ? "" : "s"}. APR appears after real reward activity exists.</p>
          </section>
        </div>
        <p className="stake-warning">Sui Testnet beta. No lockup; withdrawals are available at any time.</p>
        <button className="back-link" onClick={() => setView("mine")}>Back to mining grid</button>
      </section>}
      <footer><p><strong>SLVRBLOX / DSLVR</strong> &middot; Live on Sui Testnet</p><nav aria-label="Project documents"><Link href="/whitepaper">Whitepaper</Link><Link href="/roadmap">Roadmap</Link><Link href="/tokenomics">Tokenomics</Link></nav></footer>

      {connectOpen && <div className="connect-backdrop" role="presentation" onMouseDown={() => setConnectOpen(false)}><section className="connect-card" role="dialog" aria-modal="true" aria-labelledby="connect-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="connect-close" aria-label="Close sign in" onClick={() => setConnectOpen(false)}>×</button><span className="connect-orbit" aria-hidden="true"><i /></span>
        <p className="eyebrow">WELCOME TO SLVRBLOX</p><h2 id="connect-title">Enter the grid.</h2><p className="connect-copy">Choose Slush, Nightly, or Suiet—or connect another compatible Sui wallet.</p>
        {slushMobileUrl && <a className="sui-connect wallet-choice wallet-install slush-mobile-choice" href={slushMobileUrl}><span className="sui-wallet-mark">S</span><b>Open SLVRBLOX in Slush app ↗</b></a>}
        <button className="google-connect" disabled={!slushWallet || connecting} onClick={() => slushWallet && connectWallet(slushWallet)}><span className="google-mark">G</span><b>{connecting ? "Connecting…" : "Continue with Google via Slush"}</b></button>
        <div className="connect-divider"><span>or</span></div>
        {nightlyWallet ? <button className="sui-connect wallet-choice nightly-choice" onClick={() => connectWallet(nightlyWallet)}>{nightlyWallet.icon ? <img className="wallet-choice-icon" src={nightlyWallet.icon} alt="" /> : <span className="sui-wallet-mark">N</span>}<b>Connect Nightly</b></button> : <a className="sui-connect wallet-choice wallet-install nightly-choice" href={nightlyMobileUrl || "https://nightly.app"} target="_blank" rel="noreferrer"><span className="sui-wallet-mark">N</span><b>{nightlyMobileUrl ? "Open SLVRBLOX in Nightly ↗" : "Get Nightly wallet ↗"}</b></a>}
        {suietWallet ? <button className="sui-connect wallet-choice suiet-choice" onClick={() => connectWallet(suietWallet)}>{suietWallet.icon ? <img className="wallet-choice-icon" src={suietWallet.icon} alt="" /> : <span className="sui-wallet-mark">S</span>}<b>Connect Suiet</b></button> : <a className="sui-connect wallet-choice wallet-install suiet-choice" href="https://suiet.app/install" target="_blank" rel="noreferrer"><span className="sui-wallet-mark">S</span><b>Get Suiet wallet ↗</b></a>}
        {standardWallets.map((wallet) => <button className="sui-connect wallet-choice" key={wallet.name} onClick={() => connectWallet(wallet)}>{wallet.icon ? <img className="wallet-choice-icon" src={wallet.icon} alt="" /> : <span className="sui-wallet-mark">S</span>}<b>Connect {wallet.name}</b></button>)}
        <div className="onboarding-note"><strong>SUI TESTNET</strong><span>On mobile, open SLVRBLOX inside the wallet app and select Testnet there before approving. Testnet tokens have no monetary value.</span></div>
      </section></div>}

      {accountOpen && currentAccount && <div className="account-backdrop" role="presentation" onMouseDown={() => setAccountOpen(false)}><aside className="account-drawer" role="dialog" aria-modal="true" aria-labelledby="account-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="account-close" aria-label="Close wallet panel" onClick={() => setAccountOpen(false)}>×</button>
        <div className="account-avatar" aria-hidden="true"><span>M</span><i /></div>
        <p className="eyebrow">CONNECTED WALLET</p><h2 id="account-title">{username || "SLVRBLOX profile"}</h2>
        <div className="username-editor"><label htmlFor="wallet-username">Username</label><div><input id="wallet-username" value={usernameDraft} maxLength={20} placeholder="Create username" onChange={(event) => setUsernameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveUsername(); }} /><button onClick={saveUsername}>Save</button></div><small>3–20 letters, numbers, _ or - · saved on this device</small></div>
        <dl className="account-details"><div><dt>Address</dt><dd><span>{`${currentAccount.address.slice(0, 8)}...${currentAccount.address.slice(-6)}`}</span><button aria-label="Copy wallet address" onClick={copyAddress}>Copy</button></dd></div><div><dt>Network</dt><dd><span className="account-network"><i /> Sui Testnet</span></dd></div><div><dt>Wallet</dt><dd>{currentWallet?.name ?? "Sui wallet"}</dd></div></dl>
        <section className="account-portfolio"><h3>Portfolio</h3><dl><div><dt>SUI deployed</dt><dd>{lifetimeDeployed.toFixed(4)} SUI</dd></div><div><dt>DSLVR refined</dt><dd>On-chain</dd></div><div><dt>DSLVR unrefined</dt><dd>On-chain</dd></div><div className="portfolio-total"><dt>Game access</dt><dd>Live Testnet</dd></div></dl></section>
        <a className="account-explorer" href={`https://suiscan.xyz/testnet/account/${currentAccount.address}`} target="_blank" rel="noreferrer">View wallet on SuiScan ↗</a>
        <button className="account-disconnect" onClick={() => { window.localStorage.removeItem(walletPreferenceKey); void dAppKit.disconnectWallet(); setAccountOpen(false); setNotice("Wallet disconnected."); }}>Disconnect wallet</button>
      </aside></div>}
    </main>
  );
}
