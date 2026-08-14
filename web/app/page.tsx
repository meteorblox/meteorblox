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
const autoplayRegistryId = process.env.NEXT_PUBLIC_SUI_AUTOPLAY_REGISTRY_ID ?? "";
const suiClockId = "0x6";
const suiRandomId = "0x8";
const startingAmounts = [0.031, 0.047, 0.061, 0.04, 0.046, 0.015, 0.048, 0.056, 0.049, 0.052, 0.042, 0.046, 0.053, 0.045, 0.046, 0.043, 0.057, 0.041, 0.049, 0.049, 0.043, 0.062, 0.058, 0.055, 0.052];

type ChainState = {
  round: number; closesAtMs: number; remainingMs: number; settled: boolean; rewardsBound: boolean; winningTile: number | null;
  tileTotals: number[]; potSui: number; winningEntriesRemaining: number; claimableWinningEntries: number;
  estimatedSuiWinnings: number; estimatedMtbxWinnings: number; refinedMtbx: number; unrefinedMtbx: number;
  refinedPositions: number; unrefinedPositions: number; nextMaturityMs: number | null;
  ledgerSui: number;
  lastRound: { round: number; winningTile: number; deployedSui: number; rewardPoolSui: number; mtbxAwarded: number; transaction: string | null } | null;
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
  const [creatingAutoplayRegistry, setCreatingAutoplayRegistry] = useState(false);
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
    const mistPerTile = suiToMist(amount);
    if (!mistPerTile || mistPerTile <= 0n) return setNotice("Enter a valid SUI amount with no more than 9 decimals.");
    if (!currentAccount) return setConnectOpen(true);
    if (rounds > 1 && !autoplayRegistryId) return setNotice("Autoplay is awaiting its one-time Testnet registry activation.");
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address);
    transaction.setGasBudget(50_000_000);
    if (rounds > 1) {
      const totalMist = mistPerTile * BigInt(selected.length) * BigInt(rounds);
      const [payment] = transaction.splitCoins(transaction.gas, [transaction.pure.u64(totalMist)]);
      transaction.moveCall({
        target: `${packageId}::autoplay::create_plan`,
        arguments: [transaction.object(autoplayRegistryId), transaction.pure.vector("u8", selected.map((tile) => tile - 1)), transaction.pure.u64(mistPerTile), transaction.pure.u64(rounds), payment],
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
      dependencies: [...upgradeData.depende„›˘∂âûÀk∫wµÁQ•ÿ¯Ò¿˘1%YÅI%Äôµ•ëëΩ–ÏÅ5<Ω¿¯Ò†ƒ˘°ΩΩÕîÅÂΩ’»Å•µ¡Öç–ÅÈΩπî∏Ω†ƒ¯Ωë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏Åç±ÖÕÕ9ÖµîÙâ—ï·–µâ’——Ω∏àÅΩπ±•ç¨ıÌ—Ωùù±ï±±Q•±ïÕÙ˘ÌÕï±ïç—ïêπ±ïπù—†ÄÙÙÙÄ»‘Ä¸Äâ±ïÖ»àÄËÄâMï±ïç–ÅÖ±∞âÙΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯4(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâù…•êàÅÖ…•Ñµ±Öâï∞Ùâ5•π•πúÅù…•êà¯4(ÄÄÄÄÄÄÄÄÄÄÄÅÌ—•±ïÃπµÖ¿†°—•±î§ÄÙ¯ÅÏ4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å•ÕMï±ïç—ïêÄÙÅÕï±ïç—ïêπ•πç±’ëïÃ°—•±î§Ï4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å¡…ïŸ•ï›µΩ’π–ÄÙÅ—•±ïµΩ’π—Õm—•±îÄ¥Ä≈tÄ¨Ä°•ÕMï±ïç—ïêÄòòÅ9’µâï»π•Õ•π•—î°9’µâï»°ÖµΩ’π–§§Ä¸Å9’µâï»°ÖµΩ’π–§ÄËÄ¿§Ï4(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ï—’…∏ÄÒâ’——Ω∏Å≠ï‰ıÌ—•±ïÙÅç±ÖÕÕ9ÖµîıÌ•ÕMï±ïç—ïêÄ¸Äâ—•±îÅÕï±ïç—ïêàÄËÄâ—•±îâÙÅÖ…•Ñµ±Öâï∞ıÌÅ	±Ωç¨ÄëÌ—•±ïÙ∞ÄëÌ¡…ïŸ•ï›µΩ’π–π—Ω•·ïê†Ã•ÙÅMU%ÅÙÅÖ…•Ñµ¡…ïÕÕïêıÌ•ÕMï±ïç—ïëÙÅΩπ±•ç¨ıÏ†§ÄÙ¯Å—Ωùù±ïQ•±î°—•±î•Ù¯ÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâ—•±îµπ’µâï»à˘Ì—•±ïÙΩÕ¡Ö∏˘Ì•ÕMï±ïç—ïêÄòòÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâ—•±îµç°ïç¨àÅÖ…•Ñµ°•ëëï∏Ùâ—…’îà˚ärLΩÕ¡Ö∏˘ÙÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâµï—ïΩ»àÅÖ…•Ñµ°•ëëï∏Ùâ—…’îà¯Ò§Äº¯ÒàÄº¯ΩÕ¡Ö∏¯ÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâ—•±îµâÖ±Öπçîà¯Ò§Åç±ÖÕÕ9ÖµîÙâÕ’§µ•çΩ∏àÅÖ…•Ñµ°•ëëï∏Ùâ—…’îà¯ÒÕ¡Ö∏Äº¯Ω§¯ÒÕ—…Ωπú˘Ì¡…ïŸ•ï›µΩ’π–π—Ω•·ïê†Ã•ÙΩÕ—…Ωπú¯ΩÕ¡Ö∏¯Ωâ’——Ω∏¯Ï4(ÄÄÄÄÄÄÄÄÄÄÄÅÙ•Ù4(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯4(ÄÄÄÄÄÄÄÄΩÕïç—•Ω∏¯4(4(ÄÄÄÄÄÄÄÄÒÖÕ•ëîÅç±ÖÕÕ9ÖµîÙâïπ—…‰µ¡Öπï∞à¯4(ÄÄÄÄÄÄÄÄÄÄÒ¿Åç±ÖÕÕ9ÖµîÙâïÂïâ…Ω‹à˘59U0Å9QIdΩ¿¯Ò†»˘ï¡±Ω‰ÅMU$Ω†»¯Ò±Öâï∞Å°—µ±Ω»ÙâÖµΩ’π–à˘µΩ’π–Å¡ï»Åâ±Ωç¨Ω±Öâï∞¯4(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâÖµΩ’π–µ•π¡’–à¯Ò•π¡’–Å•êÙâÖµΩ’π–àÅ•π¡’—5ΩëîÙâëïç•µÖ∞àÅŸÖ±’îıÌÖµΩ’π—ÙÅΩπ°ÖπùîıÏ°ïŸïπ–§ÄÙ¯ÅÕï—µΩ’π–°ïŸïπ–π—Ö…ùï–πŸÖ±’î•ÙÄº¯ÒÕ¡Ö∏˘MU$ΩÕ¡Ö∏¯Ωë•ÿ¯4(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ≈’•ç¨µŸÖ±’ïÃà˘Ìlà¿∏¿¿ƒà∞Äà¿∏¿ƒà∞Äà¿∏ƒâtπµÖ¿†°ŸÖ±’î§ÄÙ¯ÄÒâ’——Ω∏Å≠ï‰ıÌŸÖ±’ïÙÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—µΩ’π–°ŸÖ±’î•Ù˘ÌŸÖ±’ïÙΩâ’——Ω∏¯•ÙΩë•ÿ¯4(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ…Ω’πëÃµçΩπ—…Ω∞Å—•±îµçΩ’π–µçΩπ—…Ω∞à¯Òë•ÿÅç±ÖÕÕ9ÖµîÙâ…Ω’πëÃµ±Öâï∞à¯Ò±Öâï∞Å°—µ±Ω»Ùâ—•±îµçΩ’π–à˘Q•±ïÃΩ±Öâï∞¯ÒÕµÖ±∞˘’—ºµÕï±ïç–Åù…•êÅ≈’Öπ—•—‰ΩÕµÖ±∞¯Ωë•ÿ¯Òë•ÿÅç±ÖÕÕ9ÖµîÙâ…Ω’πëÃµÕ—ï¡¡ï»à¯Òâ’——Ω∏ÅÖ…•Ñµ±Öâï∞ÙâIïµΩŸîÅΩπîÅ—•±îàÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï±ïç—Q•±ïΩ’π–°Õï±ïç—ïêπ±ïπù—†Ä¥Äƒ•Ù¯ôµ•π’ÃÏΩâ’——Ω∏¯Ò•π¡’–Å•êÙâ—•±îµçΩ’π–àÅÖ…•Ñµ±Öâï∞ÙâQ•±ïÃàÅ—Â¡îÙâ—ï·–àÅ¡Ö——ï…∏Ùâl¿¥Ât®àÅµÖ·1ïπù—†ıÏ…ÙÅ•π¡’—5ΩëîÙâπ’µï…•åàÅŸÖ±’îıÌ—•±ïΩ’π—%π¡’—ÙÅΩπΩç’ÃıÏ°ïŸïπ–§ÄÙ¯ÅïŸïπ–πç’……ïπ—QÖ…ùï–πÕï±ïç–†•ÙÅΩπ°ÖπùîıÏ°ïŸïπ–§ÄÙ¯Åç°ÖπùïQ•±ïΩ’π–°ïŸïπ–π—Ö…ùï–πŸÖ±’î•ÙÅΩπ	±’»ıÏ†§ÄÙ¯ÅÏÅ•òÄ°—•±ïΩ’π—%π¡’–ÄÙÙÙÄàà§ÅÕï—Q•±ïΩ’π—%π¡’–°M—…•πú°Õï±ïç—ïêπ±ïπù—†§§ÏÅıÙÄº¯Òâ’——Ω∏ÅÖ…•Ñµ±Öâï∞ÙâëêÅΩπîÅ—•±îàÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï±ïç—Q•±ïΩ’π–°Õï±ïç—ïêπ±ïπù—†Ä¨Äƒ•Ù¯¨Ωâ’——Ω∏¯Ωë•ÿ¯Ωë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ…Ω’πêµ¡…ïÕï—ÃÅ—•±îµ¡…ïÕï—Ãà¯Òâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï±ïç—Q•±ïΩ’π–†ƒ•Ù¯ƒΩâ’——Ω∏¯Òâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï±ïç—Q•±ïΩ’π–†‘•Ù¯‘Ωâ’——Ω∏¯Òâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï±ïç—Q•±ïΩ’π–†ƒ¿•Ù¯ƒ¿Ωâ’——Ω∏¯Òâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï±ïç—Q•±ïΩ’π–†»‘•Ù¯»‘Ωâ’——Ω∏¯Ωë•ÿ¯4(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ…Ω’πëÃµçΩπ—…Ω∞à¯Òë•ÿÅç±ÖÕÕ9ÖµîÙâ…Ω’πëÃµ±Öâï∞à¯Ò±Öâï∞Å°—µ±Ω»Ùâ…Ω’πëÃà˘IΩ’πëÃΩ±Öâï∞¯ÒÕµÖ±∞˘Iï¡ïÖ–ÅÕï±ïç—ïêÅ—•±ïÃΩÕµÖ±∞¯Ωë•ÿ¯Òë•ÿÅç±ÖÕÕ9ÖµîÙâ…Ω’πëÃµÕ—ï¡¡ï»à¯Òâ’——Ω∏ÅÖ…•Ñµ±Öâï∞ÙâIïµΩŸîÅΩπîÅ…Ω’πêàÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—IΩ’πëÃ†°ŸÖ±’î§ÄÙ¯Å5Ö—†πµÖ‡†ƒ∞ÅŸÖ±’îÄ¥Äƒ§•Ù¯ôµ•π’ÃÏΩâ’——Ω∏¯Ò•π¡’–Å•êÙâ…Ω’πëÃàÅ—Â¡îÙâπ’µâï»àÅµ•∏ÙàƒàÅ•π¡’—5ΩëîÙâπ’µï…•åàÅŸÖ±’îıÌ…Ω’πëÕÙÅΩπ°ÖπùîıÏ°ïŸïπ–§ÄÙ¯ÅÕï—IΩ’πëÃ°5Ö—†πµÖ‡†ƒ∞Å5Ö—†πô±ΩΩ»°9’µâï»°ïŸïπ–π—Ö…ùï–πŸÖ±’î§ÅÒÄƒ§§•ÙÄº¯Òâ’——Ω∏ÅÖ…•Ñµ±Öâï∞ÙâëêÅΩπîÅ…Ω’πêàÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—IΩ’πëÃ†°ŸÖ±’î§ÄÙ¯ÅŸÖ±’îÄ¨Äƒ•Ù¯¨Ωâ’——Ω∏¯Ωë•ÿ¯Ωë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ…Ω’πêµ¡…ïÕï—Ãà¯Òâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—IΩ’πëÃ†ƒ•Ù¯ƒΩâ’——Ω∏¯Òâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—IΩ’πëÃ†ƒ¿•Ù¯ƒ¿Ωâ’——Ω∏¯Òâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—IΩ’πëÃ†»‘•Ù¯»‘Ωâ’——Ω∏¯Òâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—IΩ’πëÃ†°ŸÖ±’î§ÄÙ¯ÅŸÖ±’îÄ¨Äƒ¿¿•Ù¯¨ƒ¿¿Ωâ’——Ω∏¯Ωë•ÿ¯4(ÄÄÄÄÄÄÄÄÄÄÒë∞Åç±ÖÕÕ9ÖµîÙâÕ’µµÖ…‰à¯Òë•ÿ¯Òë–˘Mï±ïç—ïêÅ—•±ïÃΩë–¯Òëê˘ÌÕï±ïç—ïêπ±ïπù—°ÙΩëê¯Ωë•ÿ¯Òë•ÿ¯Òë–˘IΩ’πëÃΩë–¯Òëê˘Ì…Ω’πëÕÙΩëê¯Ωë•ÿ¯Òë•ÿ¯Òë–˘Aï»Å…Ω’πêΩë–¯Òëê˘Ï°9’µâï»°ÖµΩ’π–§Ä®ÅÕï±ïç—ïêπ±ïπù—†ÅÒÄ¿§π—Ω•·ïê†–•ÙÅMU$Ωëê¯Ωë•ÿ¯Òë•ÿ¯Òë–˘QΩ—Ö∞Åëï¡±ΩÂµïπ–Ωë–¯Òëê˘Ì—Ω—Ö∞π—Ω•·ïê†–•ÙÅMU$Ωëê¯Ωë•ÿ¯Òë•ÿ¯Òë–˘]•ππ•πúÅ…ï›Ö…êΩë–¯Òëê˘Ìµ—â·IΩ’πëIï›Ö…êπ—Ω•·ïê†»•ÙÅ5Q	`Ä¨ÅMU$Ωëê¯Ωë•ÿ¯Ωë∞¯(ÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏Åç±ÖÕÕ9ÖµîÙâëï¡±Ω‰àÅë•ÕÖâ±ïêıÌÕ’âµ•——•πùA±Ö‰ÅÒÄÖç°Ö•πM—Ö—îÅÒÅç°Ö•πM—Ö—îπÕï——±ïêÅÒÅÕïçΩπëÃÄÙÙÙÄ¡ÙÅΩπ±•ç¨ıÌëï¡±ΩÂÙ˘ÌÕ’âµ•——•πùA±Ö‰Ä¸Äâ]Ö•—•πúÅôΩ»ÅM±’Õ£äòàÄËÄÖç°Ö•πM—Ö—î¸π…ï›Ö…ëÕ	Ω’πêÄ¸Äâ=›πï»ÅÖç—•ŸÖ—•Ω∏Å…ï≈’•…ïêàÄËÅç°Ö•πM—Ö—îπÕï——±ïêÄ¸ÄâIΩ’πêÅ•ÃÅÕï——±ïêàÄËÅÕïçΩπëÃÄÙÙÙÄ¿Ä¸Äâ]Ö•—•πúÅôΩ»ÅÕï——±ïµïπ–àÄËÄâï¡±Ω‰Å—ºÅ±•ŸîÅù…•êâÙΩâ’——Ω∏˘ÌπΩ—•çîÄòòÄÒ¿Åç±ÖÕÕ9ÖµîÙâπΩ—•çîàÅ…Ω±îÙâÕ—Ö—’Ãà˘ÌπΩ—•çïÙΩ¿˘Ù(ÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏Åç±ÖÕÕ9ÖµîÙâ…ï›Ö…ëÃµ±•π¨àÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—Y•ï‹†â…ï›Ö…ëÃà•Ù¯ÒÕ¡Ö∏¯ÒÕµÖ±∞˘e=UHÅ=8µ!%8ÅI]ILΩÕµÖ±∞¯ÒÕ—…Ωπú˘Ï†°ç°Ö•πM—Ö—î¸π’π…ïô•πïë5—â‡Ä¸¸Ä¿§Ä¨Ä°ç°Ö•πM—Ö—î¸π…ïô•πïë5—â‡Ä¸¸Ä¿§Ä¨Ä°ç°Ö•πM—Ö—î¸πïÕ—•µÖ—ïë5—â·]•ππ•πùÃÄ¸¸Ä¿§§π—Ω•·ïê†ÿ•ÙÅ5Q	`Ä¨ÅÏ°ç°Ö•πM—Ö—î¸πïÕ—•µÖ—ïëM’•]•ππ•πùÃÄ¸¸Ä¿§π—Ω•·ïê†ÿ•ÙÅMU$ΩÕ—…Ωπú¯ΩÕ¡Ö∏¯Òà˘Y•ï‹ÄôÖµ¿ÏÅç±Ö•¥Äô…Ö…»ÏΩà¯Ωâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÒ¿Åç±ÖÕÕ9ÖµîÙâë•Õç±Ö•µï»à˘M’§ÅQïÕ—πï–ÅΩπ±‰∏ÅÅçΩπô•…µïêÅ¡±Ö‰Å’ÕïÃÅ—ïÕ–ÅMU$ÅÖπêÅ›…•—ïÃÅÂΩ’»ÅÕï±ïç—ïêÅ—•±ïÃÅΩ∏µç°Ö•∏∏Ω¿¯(ÄÄÄÄÄÄÄÄΩÖÕ•ëî¯4(ÄÄÄÄÄÄΩë•ÿ¯ÄËÄÒÕïç—•Ω∏Åç±ÖÕÕ9ÖµîÙâ…ï›Ö…ëÃµ¡Öùîà¯4(ÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ…ï›Ö…ëÃµ—•—±îà¯Ò¿Åç±ÖÕÕ9ÖµîÙâïÂïâ…Ω‹à˘1%YÅMU$ÅQMQ9PÅI]ILΩ¿¯Ò†ƒ˘eΩ’»ÅMU$ÅÖπêÅ5Q	`Å›•ππ•πùÃ∏Ω†ƒ¯Ò¿˘	Ö±ÖπçïÃÅâï±Ω‹ÅÖ…îÅ…ïÖêÅô…Ω¥Å—°îÅ¡’â±•Õ°ïêÅÖµîÅÖπêÅIïô•πï…‰ÅΩâ©ïç—Ã∏ÅÅ›•ππ•πúÅç±Ö•¥ÅÕïπëÃÅMU$Å•µµïë•Ö—ï±‰ÅÖπêÅÕ—Ö…—ÃÅ—°îÅ5Q	`Å…ïô•π•πúÅ¡ï…•Ωê∏Ω¿¯Ωë•ÿ¯(ÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ…ï›Ö…êµÖÕÕï—Ãà¯4(ÄÄÄÄÄÄÄÄÄÄÒÖ…—•ç±îÅç±ÖÕÕ9ÖµîÙâç±Ö•¥µçÖ…êÅ…ïô•π•πúµçÖ…êà¯Òë•ÿÅç±ÖÕÕ9ÖµîÙâç±Ö•¥µ•çΩ∏à˘4Ωë•ÿ¯ÒÕµÖ±∞˘5Q	`ÅI%9IdΩÕµÖ±∞¯Òë•ÿÅç±ÖÕÕ9ÖµîÙâ…ïô•πï…‰µâÖ±ÖπçïÃà¯Òë•ÿ¯ÒÕ¡Ö∏˘U9I%9ΩÕ¡Ö∏¯ÒÕ—…Ωπú˘Ï°ç°Ö•πM—Ö—î¸π’π…ïô•πïë5—â‡Ä¸¸Ä¿§π—Ω•·ïê†ÿ•ÙÅ5Q	`ΩÕ—…Ωπú¯Ωë•ÿ¯Òë•ÿ¯ÒÕ¡Ö∏˘I%9ΩÕ¡Ö∏¯ÒÕ—…Ωπú˘Ï°ç°Ö•πM—Ö—î¸π…ïô•πïë5—â‡Ä¸¸Ä¿§π—Ω•·ïê†ÿ•ÙÅ5Q	`ΩÕ—…Ωπú¯Ωë•ÿ¯Ωë•ÿ¯Òë•ÿÅç±ÖÕÕ9ÖµîÙâ…ïô•πîµ—•µîà¯ÒÕ¡Ö∏˘9ï·–ÅµÖ—’…•—‰ΩÕ¡Ö∏¯ÒÕ—…Ωπú˘Ìç°Ö•πM—Ö—î¸ππï·—5Ö—’…•—Â5ÃÄ¸Äâ]•—°•∏Ä»—†àÄËÄãäPâÙΩÕ—…Ωπú¯Ωë•ÿ¯Òë•ÿÅç±ÖÕÕ9ÖµîÙâ…ïô•πîµ—…Öç¨àÅÖ…•Ñµ±Öâï∞Ùâ5Q	`Å…ïô•π•πúÅ¡ï…•Ωêà¯Ò§Äº¯Ωë•ÿ¯Ò¿Åç±ÖÕÕ9ÖµîÙâ…ïô•πîµçΩ¡‰à˘5Q	`ÅâïçΩµïÃÅô’±±‰Å—…ÖπÕôï…Öâ±îÅÖô—ï»Ä»–Å°Ω’…Ã∏ÅÖ…±‰Å›•—°ë…Ö›Ö∞Åµ•π—ÃÄ‰¿îÅÖπêÅ¡ï…µÖπïπ—±‰ÅôΩ…ôï•—ÃÄƒ¿î∏Ω¿¯Òâ’——Ω∏Åç±ÖÕÕ9ÖµîÙâëï¡±Ω‰àÅë•ÕÖâ±ïêıÌ…Ω’πëç—•Ω∏ÅÒÄÑ°ç°Ö•πM—Ö—î¸π…ïô•πïëAΩÕ•—•ΩπÃ•ÙÅΩπ±•ç¨ıÏ†§ÄÙ¯Åç±Ö•µ5—â‡°ôÖ±Õî•Ù˘±Ö•¥Å…ïô•πïêÅ5Q	`Ωâ’——Ω∏¯Òâ’——Ω∏Åç±ÖÕÕ9ÖµîÙâïÖ…±‰µ›•—°ë…Ö‹àÅë•ÕÖâ±ïêıÌ…Ω’πëç—•Ω∏ÅÒÄÑ°ç°Ö•πM—Ö—î¸π’π…ïô•πïëAΩÕ•—•ΩπÃ•ÙÅΩπ±•ç¨ıÏ†§ÄÙ¯Åç±Ö•µ5—â‡°—…’î•Ù˘]•—°ë…Ö‹Å’π…ïô•πïêÅïÖ…±‰Ωâ’——Ω∏¯Ò¿Åç±ÖÕÕ9ÖµîÙâ¡ïπÖ±—‰µçΩ¡‰à¯ÒÕ—…Ωπú¯ƒ¿îÅ¡ïπÖ±—‰ΩÕ—…Ωπú¯ÅÖ¡¡±•ïÃÅΩπ±‰Å—ºÅïÖ…±‰Å›•—°ë…Ö›Ö∞∏Ω¿¯ΩÖ…—•ç±î¯(ÄÄÄÄÄÄÄÄÄÄÒÖ…—•ç±îÅç±ÖÕÕ9ÖµîÙâç±Ö•¥µçÖ…êÅÕ’§µç±Ö•¥à¯Òë•ÿÅç±ÖÕÕ9ÖµîÙâç±Ö•¥µ•çΩ∏ÅÕ’§µç±Ö•¥µ•çΩ∏à˘LΩë•ÿ¯ÒÕµÖ±∞˘MQQ1ÅMU$ÅI]ILΩÕµÖ±∞¯ÒÕ—…Ωπú˘Ï°ç°Ö•πM—Ö—î¸π±ïëùï…M’§Ä¸¸Ä¿§π—Ω•·ïê†ÿ•ÙÅMU$ΩÕ—…Ωπú¯ÒÕ¡Ö∏˘…ïë•—ïêÅÖ’—ΩµÖ—•çÖ±±‰ÅÖô—ï»ÅïÖç†ÅÕï——±ïµïπ–ΩÕ¡Ö∏¯Òâ’——Ω∏Åç±ÖÕÕ9ÖµîÙâëï¡±Ω‰ÅÕ’§µâ’——Ω∏àÅë•ÕÖâ±ïêıÌ…Ω’πëç—•Ω∏ÅÒÄÑ°ç°Ö•πM—Ö—î¸π±ïëùï…M’§•ÙÅΩπ±•ç¨ıÌç±Ö•µ1ïëùï…M’•Ù˘±Ö•¥ÅMU$Ωâ’——Ω∏¯ΩÖ…—•ç±î¯(ÄÄÄÄÄÄÄÄΩë•ÿ¯4(ÄÄÄÄÄÄÄÅÏÖç°Ö•πM—Ö—î¸πÕï——±ïêÄòòÅÕïçΩπëÃÄÙÙÙÄ¿ÄòòÄÒâ’——Ω∏Åç±ÖÕÕ9ÖµîÙâç±Ö•¥µÖ±∞àÅë•ÕÖâ±ïêıÌ…Ω’πëç—•ΩπÙÅΩπ±•ç¨ıÌÕï——±ïIΩ’πëÙ˘IïŸïÖ∞Å›•ππ•πúÅâ±Ωç¨Å›•—†ÅM’§Å…ÖπëΩµπïÕÃΩâ’——Ω∏˘Ù(ÄÄÄÄÄÄÄÄÒÖ…—•ç±îÅç±ÖÕÕ9ÖµîÙâç±Ö•¥µçÖ…êÅ—ïÕ—πï–µ¡’â±•Õ†à¯ÒÕµÖ±∞˘=]9HÅQMQ9PÅUAIΩÕµÖ±∞¯Ò†»˘πÖâ±îÅ…ï±•Öâ±îÄÿ¿µÕïçΩπêÅ…Ω’πëÃΩ†»¯Ò¿˘%πÕ—Ö±∞Å—°îÅ±Ö—ïÕ–Å—ïÕ—ïêÅ¡Öç≠Öùî∞Å—°ï∏ÅÖç—•ŸÖ—îÅ—°îÅÕ°Ö…ïêÅÖ’—Ω¡±Ö‰Å…ïù•Õ—…‰ÅΩπçî∏ÅQ°îÅΩ›πï»Å›Ö±±ï–Å•ÃÅ…ï≈’•…ïê∏Ω¿¯Òâ’——Ω∏Åç±ÖÕÕ9ÖµîÙâëï¡±Ω‰àÅë•ÕÖâ±ïêıÌ’¡ù…Öë•πùAÖç≠ÖùïÙÅΩπ±•ç¨ıÌ’¡ù…ÖëïQïÕ—πï—AÖç≠ÖùïÙ˘Ì’¡ù…Öë•πùAÖç≠ÖùîÄ¸Äâ]Ö•—•πúÅôΩ»ÅM±’Õ†ÅÖ¡¡…ΩŸÖ∞∏∏∏àÄËÄâU¡ù…ÖëîÅQïÕ—πï–âÙΩâ’——Ω∏¯Òâ’——Ω∏Åç±ÖÕÕ9ÖµîÙâëï¡±Ω‰àÅë•ÕÖâ±ïê˘Iï›Ö…ëÃÅ1ïëùï»ÅÖç—•ŸîΩâ’——Ω∏˘Ìç’……ïπ—ççΩ’π–¸πÖëë…ïÕÃπ—Ω1Ω›ï…ÖÕî†§ÄÙÙÙÅ—ïÕ—πï—=›πï»ÄòòÄÖÖ’—Ω¡±ÖÂIïù•Õ—…Â%êÄòòÄÒâ’——Ω∏Åç±ÖÕÕ9ÖµîÙâëï¡±Ω‰àÅë•ÕÖâ±ïêıÌç…ïÖ—•πù’—Ω¡±ÖÂIïù•Õ—…ÂÙÅΩπ±•ç¨ıÌç…ïÖ—ï’—Ω¡±ÖÂIïù•Õ—…ÂÙ˘Ìç…ïÖ—•πù’—Ω¡±ÖÂIïù•Õ—…‰Ä¸Äâ]Ö•—•πúÅôΩ»ÅM±’Õ†ÅÖ¡¡…ΩŸÖ∞∏∏∏àÄËÄâ…ïÖ—îÅ’—Ω¡±Ö‰ÅIïù•Õ—…‰âÙΩâ’——Ω∏˘ıÌç’……ïπ—ççΩ’π–¸πÖëë…ïÕÃπ—Ω1Ω›ï…ÖÕî†§ÄÙÙÙÅ—ïÕ—πï—=›πï»ÄòòÄÖç°Ö•πM—Ö—î¸πÕï——±ïêÄòòÅÕïçΩπëÃÄÙÙÙÄ¿ÄòòÅç°Ö•πM—Ö—î¸π¡Ω—M’§ÄÙÙÙÄ¿ÄòòÄÒâ’——Ω∏Åç±ÖÕÕ9ÖµîÙâëï¡±Ω‰àÅë•ÕÖâ±ïêıÌ…Ω’πëç—•ΩπÙÅΩπ±•ç¨ıÌç±ΩÕïµ¡—ÂIΩ’πëÙ˘Ì…Ω’πëç—•Ω∏Ä¸Äâ]Ö•—•πúÅôΩ»ÅM±’Õ†ÅÖ¡¡…ΩŸÖ∞∏∏∏àÄËÄâ±ΩÕîÅç’……ïπ–Åïµ¡—‰Å…Ω’πêâÙΩâ’——Ω∏˘ÙΩÖ…—•ç±î¯(ÄÄÄÄÄÄÄÄÒÕïç—•Ω∏Åç±ÖÕÕ9ÖµîÙâµ•πï…ÃµâΩÖ…êà¯Òë•ÿÅç±ÖÕÕ9ÖµîÙâµ•πï…Ãµ°ïÖë•πúà¯Òë•ÿ¯Ò¿Åç±ÖÕÕ9ÖµîÙâïÂïâ…Ω‹à˘QMQ9PÅQ%Y%QdΩ¿¯Ò†»˘5•πï…ÃΩ†»¯Ωë•ÿ¯ÒÕ¡Ö∏˘±ΩâÖ∞ÅM’§Å•πëï·•πúÅπï·–ΩÕ¡Ö∏¯Ωë•ÿ¯Òë•ÿÅç±ÖÕÕ9ÖµîÙâµ•πï…Ãµ—ÖâÃàÅ…Ω±îÙâ—Öâ±•Õ–àÅÖ…•Ñµ±Öâï∞Ùâ5•πï»Å±ïÖëï…âΩÖ…êà¯Òâ’——Ω∏Åç±ÖÕÕ9ÖµîıÌ±ïÖëï…âΩÖ…ëQÖàÄÙÙÙÄâµ•πï…ÃàÄ¸ÄâÖç—•ŸîàÄËÄàâÙÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—1ïÖëï…âΩÖ…ëQÖà†âµ•πï…Ãà•Ù˘5•πï…ÃΩâ’——Ω∏¯Òâ’——Ω∏Åç±ÖÕÕ9ÖµîıÌ±ïÖëï…âΩÖ…ëQÖàÄÙÙÙÄâ’π…ïô•πïêàÄ¸ÄâÖç—•ŸîàÄËÄàâÙÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—1ïÖëï…âΩÖ…ëQÖà†â’π…ïô•πïêà•Ù˘Uπ…ïô•πïêΩâ’——Ω∏¯Òâ’——Ω∏Åç±ÖÕÕ9ÖµîıÌ±ïÖëï…âΩÖ…ëQÖàÄÙÙÙÄâ…ïô•πïêàÄ¸ÄâÖç—•ŸîàÄËÄàâÙÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—1ïÖëï…âΩÖ…ëQÖà†â…ïô•πïêà•Ù˘Iïô•πïêΩâ’——Ω∏¯Ωë•ÿ¯Òë•ÿÅç±ÖÕÕ9ÖµîÙâµ•πï…Ãµ—Öâ±îàÅ…Ω±îÙâ—Öâ±îàÅÖ…•Ñµ±Öâï∞ÙâQïÕ—πï–Åµ•πï…Ãà¯Òë•ÿÅç±ÖÕÕ9ÖµîÙâµ•πï…Ãµ…Ω‹Åµ•πï…Ãµ°ïÖëï»àÅ…Ω±îÙâ…Ω‹à¯ÒÕ¡Ö∏Å…Ω±îÙâçΩ±’µπ°ïÖëï»à˘IÖπ¨ΩÕ¡Ö∏¯ÒÕ¡Ö∏Å…Ω±îÙâçΩ±’µπ°ïÖëï»à˘5•πï»ΩÕ¡Ö∏¯ÒÕ¡Ö∏Å…Ω±îÙâçΩ±’µπ°ïÖëï»à˘Ì±ïÖëï…âΩÖ…ëQÖàÄÙÙÙÄâµ•πï…ÃàÄ¸ÄâQΩ—Ö∞Åëï¡±ΩÂïêàÄËÅ±ïÖëï…âΩÖ…ëQÖàÄÙÙÙÄâ’π…ïô•πïêàÄ¸ÄâUπ…ïô•πïêÅ5Q	`àÄËÄâIïô•πïêÅ5Q	`âÙΩÕ¡Ö∏¯Ωë•ÿ˘Ìç’……ïπ—ççΩ’π–Ä¸ÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâµ•πï…Ãµ…Ω‹àÅ…Ω±îÙâ…Ω‹à¯ÒÕ—…ΩπúÅ…Ω±îÙâçï±∞à¯åƒΩÕ—…Ωπú¯ÒÕ¡Ö∏Å…Ω±îÙâçï±∞à¯Ò§Åç±ÖÕÕ9ÖµîÙâµ•πï»µÖŸÖ—Ö»à˘4Ω§¯Òà˘Ì’Õï…πÖµîÅÒÅÄëÌç’……ïπ—ççΩ’π–πÖëë…ïÕÃπÕ±•çî†¿∞Ä‹•Ù∏∏∏ëÌç’……ïπ—ççΩ’π–πÖëë…ïÕÃπÕ±•çî†¥‘•ıÅÙΩà¯ÒÕµÖ±∞˘eΩ‘ΩÕµÖ±∞¯ΩÕ¡Ö∏¯ÒÕ—…ΩπúÅ…Ω±îÙâçï±∞à˘Ì±ïÖëï…âΩÖ…ëQÖàÄÙÙÙÄâµ•πï…ÃàÄ¸ÅÄëÌ±•ôï—•µïï¡±ΩÂïêπ—Ω•·ïê†–•ÙÅMU%ÄÄËÄâAïπë•πúÅ•πëï‡âÙΩÕ—…Ωπú¯Ωë•ÿ¯ÄËÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâµ•πï…Ãµïµ¡—‰à˘Ωππïç–ÅÑÅQïÕ—πï–Å›Ö±±ï–Å—ºÅ©Ω•∏Å—°îÅ±ïÖëï…âΩÖ…ê∏Ωë•ÿ˘ÙΩë•ÿ¯Ò¿˘IÖπ≠•πùÃÅ›•±∞ÅâîÅ…ïâ’•±–Åô…Ω¥ÅçΩπô•…µïêÅπ—…ÂA±ÖçïêÅÖπêÅIï›Ö…ë›Ö…ëïêÅïŸïπ—ÃÅÕºÅïŸï…‰Åµ•πï»ÅÖπêÅ—Ω—Ö∞Å•ÃÅ•πëï¡ïπëïπ—±‰ÅŸï…•ô•Öâ±î∏Ω¿¯ΩÕïç—•Ω∏¯(ÄÄÄÄÄÄÄÅÌç’……ïπ—ççΩ’π–¸πÖëë…ïÕÃπ—Ω1Ω›ï…ÖÕî†§ÄÙÙÙÅ—ïÕ—πï—=›πï»ÄòòÄÖç°Ö•πM—Ö—î¸π…ï›Ö…ëÕ	Ω’πêÄòòÄÒÖ…—•ç±îÅç±ÖÕÕ9ÖµîÙâç±Ö•¥µçÖ…êÅ—ïÕ—πï–µ¡’â±•Õ†à¯ÒÕµÖ±∞˘=]9HÅQMQ9PÅ5%1MQ=9ΩÕµÖ±∞¯Ò†»˘ç—•ŸÖ—îÅ—°îÅ±•ŸîÅùÖµîΩ†»¯Ò¿˘=πîµ—•µîÅÕï—’¿Åâ•πëÃÅ—°îÅ’π•≈’îÅ5Q	`ÅIï›Ö…ëÖ¿Å—ºÅ—°îÅÕ°Ö…ïêÅÖµîÅÖπêÅΩ¡ïπÃÅ—°îÅô•…Õ–Å¡±ÖÂÖâ±îÄÿ¿µÕïçΩπêÅQïÕ—πï–Å…Ω’πê∏Ω¿¯Òâ’——Ω∏Åç±ÖÕÕ9ÖµîÙâëï¡±Ω‰àÅë•ÕÖâ±ïêıÌÖç—•ŸÖ—•πùÖµïÙÅΩπ±•ç¨ıÌÖç—•ŸÖ—ïQïÕ—πï—ÖµïÙ˘ÌÖç—•ŸÖ—•πùÖµîÄ¸Äâ]Ö•—•πúÅôΩ»ÅM±’Õ†ÅÖ¡¡…ΩŸÖ≥äòàÄËÄâç—•ŸÖ—îÅ±•ŸîÅQïÕ—πï–Å…Ω’πêâÙΩâ’——Ω∏¯ΩÖ…—•ç±î˘Ù(ÄÄÄÄÄÄÄÅÌç’……ïπ—ççΩ’π–¸πÖëë…ïÕÃπ—Ω1Ω›ï…ÖÕî†§ÄÙÙÙÅ—ïÕ—πï—=›πï»ÄòòÅç°Ö•πM—Ö—î¸π…ï›Ö…ëÕ	Ω’πêÄòòÅç°Ö•πM—Ö—îπÕï——±ïêÄòòÅç°Ö•πM—Ö—îπ›•ππ•πùπ—…•ïÕIïµÖ•π•πúÄÙÙÙÄ¿ÄòòÄÒÖ…—•ç±îÅç±ÖÕÕ9ÖµîÙâç±Ö•¥µçÖ…êÅ—ïÕ—πï–µ¡’â±•Õ†à¯ÒÕµÖ±∞˘=]9HÅI=U9Å=9QI=0ΩÕµÖ±∞¯Ò†»˘=¡ï∏Å—°îÅπï·–Å…Ω’πêΩ†»¯Ò¿˘Q°îÅ¡…ïŸ•Ω’ÃÅ…Ω’πêÅ•ÃÅÕï——±ïêÅÖπêÅÖ±∞Å›•ππ•πúÅïπ—…•ïÃÅÖ…îÅç±Ö•µïê∏Ω¿¯Òâ’——Ω∏Åç±ÖÕÕ9ÖµîÙâëï¡±Ω‰àÅë•ÕÖâ±ïêıÌ…Ω’πëç—•ΩπÙÅΩπ±•ç¨ıÌΩ¡ïπ9ï·—IΩ’πëÙ˘=¡ï∏Åπï·–Äÿ¿µÕïçΩπêÅ…Ω’πêΩâ’——Ω∏¯ΩÖ…—•ç±î˘Ù(ÄÄÄÄÄÄÄÅÌπΩ—•çîÄòòÄÒ¿Åç±ÖÕÕ9ÖµîÙâπΩ—•çîÅ…ï›Ö…ëÃµπΩ—•çîàÅ…Ω±îÙâÕ—Ö—’Ãà˘ÌπΩ—•çïÙΩ¿˘ÙÒ¿Åç±ÖÕÕ9ÖµîÙâë•Õç±Ö•µï»Å…ï›Ö…ëÃµë•Õç±Ö•µï»à˘1•ŸîÅM’§ÅQïÕ—πï–ÅÕ—Ö—î∏ÅQïÕ–ÅMU$Å°ÖÃÅπºÅµΩπï—Ö…‰ÅŸÖ±’î∏ÅΩπ—…Öç–Å±Ωù•åÅ•ÃÅ’πÖ’ë•—ïêÅÖπêÅµ’Õ–ÅπΩ–ÅâîÅ’ÕïêÅΩ∏Å5Ö•ππï–ÅÂï–∏Ω¿¯(ÄÄÄÄÄÄÄÄÒâ’——Ω∏Åç±ÖÕÕ9ÖµîÙââÖç¨µ±•π¨àÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÏÅÕï—Y•ï‹†âµ•πîà§ÏÅÕï—9Ω—•çî†àà§ÏÅıÙ˚ä@Å	Öç¨Å—ºÅµ•π•πúÅù…•êΩâ’——Ω∏¯4(ÄÄÄÄÄÄΩÕïç—•Ω∏˘Ù4(ÄÄÄÄÄÄÒôΩΩ—ï»¯Ò¿¯ÒÕ—…Ωπú¯ë5Q	`ΩÕ—…Ωπú¯Äôµ•ëëΩ–ÏÅ•ù•—Ö∞Å…Ö…îÅµï—Ö∞ÅΩ∏ÅM’§Ω¿¯ÒπÖÿÅÖ…•Ñµ±Öâï∞ÙâΩΩ—ï»à¯ÒÑÅ°…ïòÙàç°Ω‹à˘!Ω‹Å•–Å›Ω…≠ÃΩÑ¯ÒÑÅ°…ïòÙàç—Ω≠ï∏à˘QΩ≠ï∏ΩÑ¯ÒÑÅ°…ïòÙàçôÖƒà˘DΩÑ¯ΩπÖÿ¯ΩôΩΩ—ï»¯(4(ÄÄÄÄÄÅÌçΩππïç—=¡ï∏ÄòòÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâçΩππïç–µâÖç≠ë…Ω¿àÅ…Ω±îÙâ¡…ïÕïπ—Ö—•Ω∏àÅΩπ5Ω’ÕïΩ›∏ıÏ†§ÄÙ¯ÅÕï—Ωππïç—=¡ï∏°ôÖ±Õî•Ù¯ÒÕïç—•Ω∏Åç±ÖÕÕ9ÖµîÙâçΩππïç–µçÖ…êàÅ…Ω±îÙâë•Ö±ΩúàÅÖ…•ÑµµΩëÖ∞Ùâ—…’îàÅÖ…•Ñµ±Öâï±±ïëâ‰ÙâçΩππïç–µ—•—±îàÅΩπ5Ω’ÕïΩ›∏ıÏ°ïŸïπ–§ÄÙ¯ÅïŸïπ–πÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†•Ù¯(ÄÄÄÄÄÄÄÄÒâ’——Ω∏Åç±ÖÕÕ9ÖµîÙâçΩππïç–µç±ΩÕîàÅÖ…•Ñµ±Öâï∞Ùâ±ΩÕîÅÕ•ù∏Å•∏àÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—Ωππïç—=¡ï∏°ôÖ±Õî•Ù˚\Ωâ’——Ω∏¯ÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâçΩππïç–µΩ…â•–àÅÖ…•Ñµ°•ëëï∏Ùâ—…’îà¯Ò§Äº¯ΩÕ¡Ö∏¯4(ÄÄÄÄÄÄÄÄÒ¿Åç±ÖÕÕ9ÖµîÙâïÂïâ…Ω‹à˘]1=5ÅQ<Å5Q=I	1=`Ω¿¯Ò†»Å•êÙâçΩππïç–µ—•—±îà˘π—ï»Å—°îÅù…•ê∏Ω†»¯Ò¿Åç±ÖÕÕ9ÖµîÙâçΩππïç–µçΩ¡‰à˘UÕîÅΩΩù±îÅ—°…Ω’ù†ÅM±’Õ†ÅôΩ»ÅÑÅÕ•µ¡±îÅM’§Å›Ö±±ï–Åï·¡ï…•ïπçî∞ÅΩ»ÅçΩππïç–ÅÖπΩ—°ï»ÅM’§Å›Ö±±ï–∏Ω¿¯4(ÄÄÄÄÄÄÄÄÒâ’——Ω∏Åç±ÖÕÕ9ÖµîÙâùΩΩù±îµçΩππïç–àÅë•ÕÖâ±ïêıÏÖÕ±’Õ°]Ö±±ï–ÅÒÅçΩππïç—•πùÙÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕ±’Õ°]Ö±±ï–ÄòòÅçΩππïç—]Ö±±ï–°Õ±’Õ°]Ö±±ï–•Ù¯ÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâùΩΩù±îµµÖ…¨à˘ΩÕ¡Ö∏¯Òà˘ÌçΩππïç—•πúÄ¸ÄâΩππïç—•πüäòàÄËÄâΩπ—•π’îÅ›•—†ÅΩΩù±îÅŸ•ÑÅM±’Õ†âÙΩà¯Ωâ’——Ω∏¯4(ÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâçΩππïç–µë•Ÿ•ëï»à¯ÒÕ¡Ö∏˘Ω»ΩÕ¡Ö∏¯Ωë•ÿ¯4(ÄÄÄÄÄÄÄÅÌÕ—ÖπëÖ…ë]Ö±±ï—Ãπ±ïπù—†Ä¸ÅÕ—ÖπëÖ…ë]Ö±±ï—ÃπµÖ¿†°›Ö±±ï–§ÄÙ¯ÄÒâ’——Ω∏Åç±ÖÕÕ9ÖµîÙâÕ’§µçΩππïç–Å›Ö±±ï–µç°Ω•çîàÅ≠ï‰ıÌ›Ö±±ï–ππÖµïÙÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅçΩππïç—]Ö±±ï–°›Ö±±ï–•Ù¯ÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâÕ’§µ›Ö±±ï–µµÖ…¨à˘LΩÕ¡Ö∏¯Òà˘Ωππïç–ÅÌ›Ö±±ï–ππÖµïÙΩà¯Ωâ’——Ω∏¯§ÄËÄÒÑÅç±ÖÕÕ9ÖµîÙâÕ’§µçΩππïç–Å›Ö±±ï–µ•πÕ—Ö±∞àÅ°…ïòÙâ°——¡ÃËºΩÕ±’Õ†πÖ¡¿ºàÅ—Ö…ùï–Ùâ}â±Öπ¨àÅ…ï∞ÙâπΩ…ïôï……ï»à¯ÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâÕ’§µ›Ö±±ï–µµÖ…¨à˘LΩÕ¡Ö∏¯Òà˘ï–ÅÑÅM’§Å›Ö±±ï–Ωà¯ΩÑ˘Ù4(ÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâΩπâΩÖ…ë•πúµπΩ—îà¯ÒÕ—…Ωπú˘MU$ÅQMQ9PΩÕ—…Ωπú¯ÒÕ¡Ö∏˘M±’Õ†Å¡…ΩŸ•ëïÃÅΩΩù±îÅÈ≠1Ωù•∏ÅÖπêÅÑÅÕï±òµç’Õ—Ωë•Ö∞ÅM’§ÅÖëë…ïÕÃÅ›•—†ÅπºÅπΩ≠§ÅÕ’âÕç…•¡—•Ω∏∏Å5•π•πúÅ…ïµÖ•πÃÅÕ•µ’±Ö—ïêÅ’π—•∞Å—°îÅ5ΩŸîÅçΩπ—…Öç—ÃÅÖ…îÅëï¡±ΩÂïê∏ΩÕ¡Ö∏¯Ωë•ÿ¯(ÄÄÄÄÄÄΩÕïç—•Ω∏¯Ωë•ÿ˘Ù((ÄÄÄÄÄÅÌÖççΩ’π—=¡ï∏ÄòòÅç’……ïπ—ççΩ’π–ÄòòÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâÖççΩ’π–µâÖç≠ë…Ω¿àÅ…Ω±îÙâ¡…ïÕïπ—Ö—•Ω∏àÅΩπ5Ω’ÕïΩ›∏ıÏ†§ÄÙ¯ÅÕï—ççΩ’π—=¡ï∏°ôÖ±Õî•Ù¯ÒÖÕ•ëîÅç±ÖÕÕ9ÖµîÙâÖççΩ’π–µë…Ö›ï»àÅ…Ω±îÙâë•Ö±ΩúàÅÖ…•ÑµµΩëÖ∞Ùâ—…’îàÅÖ…•Ñµ±Öâï±±ïëâ‰ÙâÖççΩ’π–µ—•—±îàÅΩπ5Ω’ÕïΩ›∏ıÏ°ïŸïπ–§ÄÙ¯ÅïŸïπ–πÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†•Ù¯(ÄÄÄÄÄÄÄÄÒâ’——Ω∏Åç±ÖÕÕ9ÖµîÙâÖççΩ’π–µç±ΩÕîàÅÖ…•Ñµ±Öâï∞Ùâ±ΩÕîÅ›Ö±±ï–Å¡Öπï∞àÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—ççΩ’π—=¡ï∏°ôÖ±Õî•Ù˚\Ωâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâÖççΩ’π–µÖŸÖ—Ö»àÅÖ…•Ñµ°•ëëï∏Ùâ—…’îà¯ÒÕ¡Ö∏˘4ΩÕ¡Ö∏¯Ò§Äº¯Ωë•ÿ¯(ÄÄÄÄÄÄÄÄÒ¿Åç±ÖÕÕ9ÖµîÙâïÂïâ…Ω‹à˘=99QÅ]11PΩ¿¯Ò†»Å•êÙâÖççΩ’π–µ—•—±îà˘Ì’Õï…πÖµîÅÒÄâ5ï—ïΩ…	±Ω‡Å¡…Ωô•±îâÙΩ†»¯(ÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ’Õï…πÖµîµïë•—Ω»à¯Ò±Öâï∞Å°—µ±Ω»Ùâ›Ö±±ï–µ’Õï…πÖµîà˘UÕï…πÖµîΩ±Öâï∞¯Òë•ÿ¯Ò•π¡’–Å•êÙâ›Ö±±ï–µ’Õï…πÖµîàÅŸÖ±’îıÌ’Õï…πÖµï…Öô—ÙÅµÖ·1ïπù—†ıÏ»¡ÙÅ¡±Öçï°Ω±ëï»Ùâ…ïÖ—îÅ’Õï…πÖµîàÅΩπ°ÖπùîıÏ°ïŸïπ–§ÄÙ¯ÅÕï—UÕï…πÖµï…Öô–°ïŸïπ–π—Ö…ùï–πŸÖ±’î•ÙÅΩπ-ïÂΩ›∏ıÏ°ïŸïπ–§ÄÙ¯ÅÏÅ•òÄ°ïŸïπ–π≠ï‰ÄÙÙÙÄâπ—ï»à§ÅÕÖŸïUÕï…πÖµî†§ÏÅıÙÄº¯Òâ’——Ω∏ÅΩπ±•ç¨ıÌÕÖŸïUÕï…πÖµïÙ˘MÖŸîΩâ’——Ω∏¯Ωë•ÿ¯ÒÕµÖ±∞¯œäL»¿Å±ï——ï…Ã∞Åπ’µâï…Ã∞Å|ÅΩ»Ä¥É
‹ÅÕÖŸïêÅΩ∏Å—°•ÃÅëïŸ•çîΩÕµÖ±∞¯Ωë•ÿ¯(ÄÄÄÄÄÄÄÄÒë∞Åç±ÖÕÕ9ÖµîÙâÖççΩ’π–µëï—Ö•±Ãà¯Òë•ÿ¯Òë–˘ëë…ïÕÃΩë–¯Òëê¯ÒÕ¡Ö∏˘ÌÄëÌç’……ïπ—ççΩ’π–πÖëë…ïÕÃπÕ±•çî†¿∞Ä‡•Ù∏∏∏ëÌç’……ïπ—ççΩ’π–πÖëë…ïÕÃπÕ±•çî†¥ÿ•ıÅÙΩÕ¡Ö∏¯Òâ’——Ω∏ÅÖ…•Ñµ±Öâï∞ÙâΩ¡‰Å›Ö±±ï–ÅÖëë…ïÕÃàÅΩπ±•ç¨ıÌçΩ¡Âëë…ïÕÕÙ˘Ω¡‰Ωâ’——Ω∏¯Ωëê¯Ωë•ÿ¯Òë•ÿ¯Òë–˘9ï—›Ω…¨Ωë–¯Òëê¯ÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâÖççΩ’π–µπï—›Ω…¨à¯Ò§Äº¯ÅM’§ÅQïÕ—πï–ΩÕ¡Ö∏¯Ωëê¯Ωë•ÿ¯Òë•ÿ¯Òë–˘]Ö±±ï–Ωë–¯Òëê˘M±’Õ†Ωëê¯Ωë•ÿ¯Ωë∞¯(ÄÄÄÄÄÄÄÄÒÕïç—•Ω∏Åç±ÖÕÕ9ÖµîÙâÖççΩ’π–µ¡Ω…—ôΩ±•ºà¯Ò†Ã˘AΩ…—ôΩ±•ºΩ†Ã¯Òë∞¯Òë•ÿ¯Òë–˘MU$Åëï¡±ΩÂïêΩë–¯Òëê˘Ì±•ôï—•µïï¡±ΩÂïêπ—Ω•·ïê†–•ÙÅMU$Ωëê¯Ωë•ÿ¯Òë•ÿ¯Òë–˘5Q	`Å…ïô•πïêΩë–¯Òëê˘=∏µç°Ö•∏Ωëê¯Ωë•ÿ¯Òë•ÿ¯Òë–˘5Q	`Å’π…ïô•πïêΩë–¯Òëê˘=∏µç°Ö•∏Ωëê¯Ωë•ÿ¯Òë•ÿÅç±ÖÕÕ9ÖµîÙâ¡Ω…—ôΩ±•ºµ—Ω—Ö∞à¯Òë–˘ÖµîÅÖççïÕÃΩë–¯Òëê˘1•ŸîÅQïÕ—πï–Ωëê¯Ωë•ÿ¯Ωë∞¯ΩÕïç—•Ω∏¯(ÄÄÄÄÄÄÄÄÒÑÅç±ÖÕÕ9ÖµîÙâÖççΩ’π–µï·¡±Ω…ï»àÅ°…ïòıÌÅ°——¡ÃËºΩÕ’•ÕçÖ∏π·ÂËΩ—ïÕ—πï–ΩÖççΩ’π–ºëÌç’……ïπ—ççΩ’π–πÖëë…ïÕÕıÅÙÅ—Ö…ùï–Ùâ}â±Öπ¨àÅ…ï∞ÙâπΩ…ïôï……ï»à˘Y•ï‹Å›Ö±±ï–ÅΩ∏ÅM’•MçÖ∏Éä\ΩÑ¯(ÄÄÄÄÄÄÄÄÒâ’——Ω∏Åç±ÖÕÕ9ÖµîÙâÖççΩ’π–µë•ÕçΩππïç–àÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÏÅŸΩ•êÅë¡¡-•–πë•ÕçΩππïç—]Ö±±ï–†§ÏÅÕï—ççΩ’π—=¡ï∏°ôÖ±Õî§ÏÅÕï—9Ω—•çî†â]Ö±±ï–Åë•ÕçΩππïç—ïê∏à§ÏÅıÙ˘•ÕçΩππïç–Å›Ö±±ï–Ωâ’——Ω∏¯(ÄÄÄÄÄÄΩÖÕ•ëî¯Ωë•ÿ˘Ù(ÄÄÄÄΩµÖ•∏¯(ÄÄ§Ï4)Ù4(