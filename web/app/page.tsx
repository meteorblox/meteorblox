"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnectWallet, useCurrentAccount, useCurrentWallet, useDisconnectWallet, useWallets } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { signAndExecuteTransaction } from "@mysten/wallet-standard";
import { upgradeData } from "./upgrade-data";

const tiles = Array.from({ length: 25 }, (_, index) => index + 1);
const mtbxRoundReward = 0.25;
const testnetOwner = "0x55f035832afb21499461d62630ed4b1cdf6e53b2a43f907e6db55a91eb114781";
const packageId = "0xc40d6b489086ef619baac0cc2e6396159fe30c235d122e89ce9e7d4c8c2231f7";
const gameId = "0xed69d2784a34e80ac206750ddfef18ede5f447aa8c9299c4bc64c81434c1f7fe";
const refineryId = "0x6d66c03dc8b5d5994af512a66bdc09f2b22917f7c2d19d5430d6867e22c13895";
const rewardCapId = "0xe087c954bbce11162fbd1b9f7edbe9f63f1bc30e8b999fa4f7d3216a214c048c";
const upgradeCapId = "0xe8a428db6b93487e7f59ffe593bb8f6e384e56ecbad5df1fd0ddc1811d1f972c";
const suiClockId = "0x6";
const suiRandomId = "0x8";
const startingAmounts = [0.031, 0.047, 0.061, 0.04, 0.046, 0.015, 0.048, 0.056, 0.049, 0.052, 0.042, 0.046, 0.053, 0.045, 0.046, 0.043, 0.057, 0.041, 0.049, 0.049, 0.043, 0.062, 0.058, 0.055, 0.052];

type ChainState = {
  round: number; closesAtMs: number; settled: boolean; rewardsBound: boolean; winningTile: number | null;
  tileTotals: number[]; potSui: number; winningEntriesRemaining: number; claimableWinningEntries: number;
  estimatedSuiWinnings: number; estimatedMtbxWinnings: number; refinedMtbx: number; unrefinedMtbx: number;
  refinedPositions: number; unrefinedPositions: number; nextMaturityMs: number | null;
};

export default function Home() {
  const [view, setView] = useState<"mine" | "rewards">("mine");
  const [selected, setSelected] = useState<number[]>([]);
  const [tileAmounts, setTileAmounts] = useState(startingAmounts);
  const [amount, setAmount] = useState("0.01");
  const [tileCountInput, setTileCountInput] = useState("0");
  const [rounds, setRounds] = useState(1);
  const [seconds, setSeconds] = useState(42);
  const [notice, setNotice] = useState("");
  const [connectOpen, setConnectOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [usernameDraft, setUsernameDraft] = useState("");
  const [leaderboardTab, setLeaderboardTab] = useState<"miners" | "unrefined" | "refined">("miners");
  const [lifetimeDeployed, setLifetimeDeployed] = useState(0);
  const [suiPrice, setSuiPrice] = useState<number | null>(null);
  const [chainState, setChainState] = useState<ChainState | null>(null);
  const [chainLoading, setChainLoading] = useState(true);
  const [submittingPlay, setSubmittingPlay] = useState(false);
  const [activatingGame, setActivatingGame] = useState(false);
  const [roundAction, setRoundAction] = useState(false);
  const [upgradingPackage, setUpgradingPackage] = useState(false);
  const currentAccount = useCurrentAccount();
  const currentAddress = currentAccount?.address;
  const { currentWallet } = useCurrentWallet();
  const wallets = useWallets();
  const { mutate: connect, isPending: connecting } = useConnectWallet();
  const { mutate: disconnect } = useDisconnectWallet();
  const slushWallet = wallets.find((wallet) => wallet.name.toLowerCase().includes("slush"));
  const standardWallets = wallets.filter((wallet) => !wallet.name.toLowerCase().includes("slush"));

  function connectWallet(wallet: (typeof wallets)[number]) {
    connect({ wallet }, {
      onSuccess: () => { setConnectOpen(false); setNotice("Sui Testnet wallet connected."); },
      onError: (error) => setNotice(`Connection cancelled: ${error.message}`),
    });
  }

  useEffect(() => {
    const update = () => setSeconds(chainState?.settled ? 0 : Math.max(0, Math.ceil(((chainState?.closesAtMs ?? Date.now()) - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [chainState?.closesAtMs, chainState?.settled]);

  useEffect(() => {
    let active = true;
    fetch("/api/market").then((response) => response.json()).then((data) => {
      if (active && typeof data.suiUsd === "number") setSuiPrice(data.suiUsd);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const refreshChainState = useCallback(async () => {
    setChainLoading(true);
    try {
      const query = currentAddress ? `?address=${encodeURIComponent(currentAddress)}` : "";
      const response = await fetch(`/api/game${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to read Sui Testnet");
      setChainState(data as ChainState);
      setTileAmounts((data as ChainState).tileTotals);
    } catch (error) {
      setNotice(error instanceof Error ? `Chain state unavailable: ${error.message}` : "Chain state unavailable.");
    } finally { setChainLoading(false); }
  }, [currentAddress]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refreshChainState(), 0);
    const timer = window.setInterval(() => void refreshChainState(), 12_000);
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
    if (!currentWallet?.features["sui:signAndExecuteTransaction"]) {
      setNotice("Connect Slush on Sui Testnet before submitting.");
      return null;
    }
    return signAndExecuteTransaction(currentWallet, { transaction, account: currentAccount, chain: "sui:testnet" });
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
    setNotice("Waiting for Slush Testnet approvalâ€¦");
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
    setNotice("Waiting for Slush to activate the first live roundâ€¦");
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
    setRoundAction(true); setNotice("Waiting for wallet approval to reveal the winning blockâ€¦");
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
      package: packageId,
      ticket,
    });
    transaction.moveCall({ target: "0x2::package::commit_upgrade", arguments: [cap, receipt] });
    setUpgradingPackage(true);
    setNotice("Waiting for the owner wallet to approve the Testnet recovery upgradeâ€¦");
    try {
      const result = await executeWithSlush(transaction);
      if (result) setNotice(`METEORBLOX Testnet upgraded. Transaction: ${result.digest}`);
    } catch (error) {
      setNotice(`Testnet upgrade failed: ${error instanceof Error ? error.message : "Unexpected wallet error"}`);
    } finally { setUpgradingPackage(false); }
  }

  async function closeEmptyRound() {
    if (!currentAccount) return setConnectOpen(true);
    if (currentAccount.address.toLowerCase() !== testnetOwner) return setNotice("Connect the METEORBLOX owner wallet.");
    const transaction = new Transaction();
    transaction.setSender(currentAccount.address);
    transaction.setGasBudget(50_000_000);
    transaction.moveCall({ target: `${packageId}::game::close_empty_round`, arguments: [transaction.object(gameId), transaction.object(suiClockId)] });
    setRoundAction(true);
    setNotice("Waiting for owner approval to close the empty roundâ€¦");
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
    if (!count) return setNotice("This wallet has Ûu¶‰Ëkºwµçp½Íµ…±°øñÍÑÉ½¹œ±…ÍÍ9…µ”ô‰µ•Ñ•½ÈµÍ¡½İ•ÈµÑ½Ñ…°ˆøñ¤±…ÍÍ9…µ”ô‰É½Õ¹µµ•Ñ•½Èµ¥½¸ˆ…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆøñ¤€¼øñˆ€¼øğ½¤ùíµÑ‰áI½Õ¹‘I•İ…É¹Ñ½¥á• È¥ôğ½ÍÑÉ½¹œøğ½‘¥Øø(€€€€€€ğ½Í•Ñ¥½¸ø4(4(€€€€€íÙ¥•Ü€ôôô€‰µ¥¹”ˆ€ü€ñ‘¥Ø±…ÍÍ9…µ”ô‰İ½É­ÍÁ…”ˆø4(€€€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰µ¥¹”µÁ…¹•°ˆø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Í•Ñ¥½¸µ¡•…‘¥¹œˆøñ‘¥ØøñÀù1%YI%ƒ
Ü5<ğ½Àøñ Äù¡½½Í”å½ÕÈ¥µÁ…Ğé½¹”¸ğ½ Äøğ½‘¥Øø4(€€€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰Ñ•áĞµ‰ÕÑÑ½¸ˆ½¹±¥¬õíÑ½±•±±Q¥±•ÍôùíÍ•±•Ñ•¹±•¹Ñ €ôôô€ÈÔ€ü€‰±•…Èˆ€è€‰M•±•Ğ…±°‰ôğ½‰ÕÑÑ½¸ø(€€€€€€€€€€ğ½‘¥Øø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É¥ˆ…É¥„µ±…‰•°ô‰5¥¹¥¹œÉ¥ˆø4(€€€€€€€€€€€íÑ¥±•Ì¹µ…À ¡Ñ¥±”¤€ôøì4(€€€€€€€€€€€€€½¹ÍĞ¥ÍM•±•Ñ•€ôÍ•±•Ñ•¹¥¹±Õ‘•Ì¡Ñ¥±”¤ì4(€€€€€€€€€€€€€½¹ÍĞÁÉ•Ù¥•İµ½Õ¹Ğ€ôÑ¥±•µ½Õ¹ÑÍmÑ¥±”€´€Åt€¬€¡¥ÍM•±•Ñ•€˜˜9Õµ‰•È¹¥Í¥¹¥Ñ”¡9Õµ‰•È¡…µ½Õ¹Ğ¤¤€ü9Õµ‰•È¡…µ½Õ¹Ğ¤€è€À¤ì4(€€€€€€€€€€€€€É•ÑÕÉ¸€ñ‰ÕÑÑ½¸­•äõíÑ¥±•ô±…ÍÍ9…µ”õí¥ÍM•±•Ñ•€ü€‰Ñ¥±”Í•±•Ñ•ˆ€è€‰Ñ¥±”‰ô…É¥„µ±…‰•°õí	±½¬€‘íÑ¥±•ô°€‘íÁÉ•Ù¥•İµ½Õ¹Ğ¹Ñ½¥á• Ì¥ôMU%ô…É¥„µÁÉ•ÍÍ•õí¥ÍM•±•Ñ•‘ô½¹±¥¬õì ¤€ôøÑ½±•Q¥±”¡Ñ¥±”¥ôøñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ¥±”µ¹Õµ‰•ÈˆùíÑ¥±•ôğ½ÍÁ…¸ùí¥ÍM•±•Ñ•€˜˜€ñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ¥±”µ¡•¬ˆ…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆûŠrLğ½ÍÁ…¸ùôñÍÁ…¸±…ÍÍ9…µ”ô‰µ•Ñ•½Èˆ…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆøñ¤€¼øñˆ€¼øğ½ÍÁ…¸øñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ¥±”µ‰…±…¹”ˆøñ¤±…ÍÍ9…µ”ô‰ÍÕ¤µ¥½¸ˆ…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆøñÍÁ…¸€¼øğ½¤øñÍÑÉ½¹œùíÁÉ•Ù¥•İµ½Õ¹Ğ¹Ñ½¥á• Ì¥ôğ½ÍÑÉ½¹œøğ½ÍÁ…¸øğ½‰ÕÑÑ½¸øì4(€€€€€€€€€€€ô¥ô4(€€€€€€€€€€ğ½‘¥Øø4(€€€€€€€€ğ½Í•Ñ¥½¸ø4(4(€€€€€€€€ñ…Í¥‘”±…ÍÍ9…µ”ô‰•¹ÑÉäµÁ…¹•°ˆø4(€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰•å•‰É½Üˆù59U09QIdğ½Àøñ Èù•Á±½äMU$ğ½ Èøñ±…‰•°¡Ñµ±½Èô‰…µ½Õ¹Ğˆùµ½Õ¹ĞÁ•È‰±½¬ğ½±…‰•°ø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…µ½Õ¹Ğµ¥¹ÁÕĞˆøñ¥¹ÁÕĞ¥ô‰…µ½Õ¹Ğˆ¥¹ÁÕÑ5½‘”ô‰‘•¥µ…°ˆÙ…±Õ”õí…µ½Õ¹Ñô½¹¡…¹”õì¡•Ù•¹Ğ¤€ôøÍ•Ñµ½Õ¹Ğ¡•Ù•¹Ğ¹Ñ…É•Ğ¹Ù…±Õ”¥ô€¼øñÍÁ…¸ùMU$ğ½ÍÁ…¸øğ½‘¥Øø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÅÕ¥¬µÙ…±Õ•ÌˆùílˆÀ¸ÀÀÄˆ°€ˆÀ¸ÀÄˆ°€ˆÀ¸Ä‰t¹µ…À ¡Ù…±Õ”¤€ôø€ñ‰ÕÑÑ½¸­•äõíÙ…±Õ•ô½¹±¥¬õì ¤€ôøÍ•Ñµ½Õ¹Ğ¡Ù…±Õ”¥ôùíÙ…±Õ•ôğ½‰ÕÑÑ½¸ø¥ôğ½‘¥Øø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É½Õ¹‘Ìµ½¹ÑÉ½°Ñ¥±”µ½Õ¹Ğµ½¹ÑÉ½°ˆøñ‘¥Ø±…ÍÍ9…µ”ô‰É½Õ¹‘Ìµ±…‰•°ˆøñ±…‰•°¡Ñµ±½Èô‰Ñ¥±”µ½Õ¹ĞˆùQ¥±•Ìğ½±…‰•°øñÍµ…±°ùÕÑ¼µÍ•±•ĞÉ¥ÅÕ…¹Ñ¥Ñäğ½Íµ…±°øğ½‘¥Øøñ‘¥Ø±…ÍÍ9…µ”ô‰É½Õ¹‘ÌµÍÑ•ÁÁ•Èˆøñ‰ÕÑÑ½¸…É¥„µ±…‰•°ô‰I•µ½Ù”½¹”Ñ¥±”ˆ½¹±¥¬õì ¤€ôøÍ•±•ÑQ¥±•½Õ¹Ğ¡Í•±•Ñ•¹±•¹Ñ €´€Ä¥ôûŠ"Hğ½‰ÕÑÑ½¸øñ¥¹ÁÕĞ¥ô‰Ñ¥±”µ½Õ¹Ğˆ…É¥„µ±…‰•°ô‰Q¥±•ÌˆÑåÁ”ô‰Ñ•áĞˆÁ…ÑÑ•É¸ô‰lÀ´åt¨ˆµ…á1•¹Ñ õìÉô¥¹ÁÕÑ5½‘”ô‰¹Õµ•É¥ŒˆÙ…±Õ”õíÑ¥±•½Õ¹Ñ%¹ÁÕÑô½¹½ÕÌõì¡•Ù•¹Ğ¤€ôø•Ù•¹Ğ¹ÕÉÉ•¹ÑQ…É•Ğ¹Í•±•Ğ ¥ô½¹¡…¹”õì¡•Ù•¹Ğ¤€ôø¡…¹•Q¥±•½Õ¹Ğ¡•Ù•¹Ğ¹Ñ…É•Ğ¹Ù…±Õ”¥ô½¹	±ÕÈõì ¤€ôøì¥˜€¡Ñ¥±•½Õ¹Ñ%¹ÁÕĞ€ôôô€ˆˆ¤Í•ÑQ¥±•½Õ¹Ñ%¹ÁÕĞ¡MÑÉ¥¹œ¡Í•±•Ñ•¹±•¹Ñ ¤¤ìõô€¼øñ‰ÕÑÑ½¸…É¥„µ±…‰•°ô‰‘½¹”Ñ¥±”ˆ½¹±¥¬õì ¤€ôøÍ•±•ÑQ¥±•½Õ¹Ğ¡Í•±•Ñ•¹±•¹Ñ €¬€Ä¥ôø¬ğ½‰ÕÑÑ½¸øğ½‘¥Øøğ½‘¥Øø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É½Õ¹µÁÉ•Í•ÑÌÑ¥±”µÁÉ•Í•ÑÌˆøñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôøÍ•±•ÑQ¥±•½Õ¹Ğ Ä¥ôøÄğ½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôøÍ•±•ÑQ¥±•½Õ¹Ğ Ô¥ôøÔğ½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôøÍ•±•ÑQ¥±•½Õ¹Ğ ÄÀ¥ôøÄÀğ½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôøÍ•±•ÑQ¥±•½Õ¹Ğ ÈÔ¥ôøÈÔğ½‰ÕÑÑ½¸øğ½‘¥Øø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É½Õ¹‘Ìµ½¹ÑÉ½°ˆøñ‘¥Ø±…ÍÍ9…µ”ô‰É½Õ¹‘Ìµ±…‰•°ˆøñ±…‰•°¡Ñµ±½Èô‰É½Õ¹‘ÌˆùI½Õ¹‘Ìğ½±…‰•°øñÍµ…±°ùI•Á•…ĞÍ•±•Ñ•Ñ¥±•Ìğ½Íµ…±°øğ½‘¥Øøñ‘¥Ø±…ÍÍ9…µ”ô‰É½Õ¹‘ÌµÍÑ•ÁÁ•Èˆøñ‰ÕÑÑ½¸…É¥„µ±…‰•°ô‰I•µ½Ù”½¹”É½Õ¹ˆ½¹±¥¬õì ¤€ôøÍ•ÑI½Õ¹‘Ì ¡Ù…±Õ”¤€ôø5…Ñ ¹µ…à Ä°Ù…±Õ”€´€Ä¤¥ôûŠ"Hğ½‰ÕÑÑ½¸øñ¥¹ÁÕĞ¥ô‰É½Õ¹‘ÌˆÑåÁ”ô‰¹Õµ‰•Èˆµ¥¸ôˆÄˆ¥¹ÁÕÑ5½‘”ô‰¹Õµ•É¥ŒˆÙ…±Õ”õíÉ½Õ¹‘Íô½¹¡…¹”õì¡•Ù•¹Ğ¤€ôøÍ•ÑI½Õ¹‘Ì¡5…Ñ ¹µ…à Ä°5…Ñ ¹™±½½È¡9Õµ‰•È¡•Ù•¹Ğ¹Ñ…É•Ğ¹Ù…±Õ”¤ñğ€Ä¤¤¥ô€¼øñ‰ÕÑÑ½¸…É¥„µ±…‰•°ô‰‘½¹”É½Õ¹ˆ½¹±¥¬õì ¤€ôøÍ•ÑI½Õ¹‘Ì ¡Ù…±Õ”¤€ôøÙ…±Õ”€¬€Ä¥ôø¬ğ½‰ÕÑÑ½¸øğ½‘¥Øøğ½‘¥Øø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É½Õ¹µÁÉ•Í•ÑÌˆøñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôøÍ•ÑI½Õ¹‘Ì Ä¥ôøÄğ½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôøÍ•ÑI½Õ¹‘Ì ÄÀ¥ôøÄÀğ½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôøÍ•ÑI½Õ¹‘Ì ÈÔ¥ôøÈÔğ½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôøÍ•ÑI½Õ¹‘Ì ¡Ù…±Õ”¤€ôøÙ…±Õ”€¬€ÄÀÀ¥ôø¬ÄÀÀğ½‰ÕÑÑ½¸øğ½‘¥Øø4(€€€€€€€€€€ñ‘°±…ÍÍ9…µ”ô‰ÍÕµµ…Éäˆøñ‘¥Øøñ‘ĞùM•±•Ñ•Ñ¥±•Ìğ½‘Ğøñ‘ùíÍ•±•Ñ•¹±•¹Ñ¡ôğ½‘øğ½‘¥Øøñ‘¥Øøñ‘ĞùI½Õ¹‘Ìğ½‘Ğøñ‘ùíÉ½Õ¹‘Íôğ½‘øğ½‘¥Øøñ‘¥Øøñ‘ĞùA•ÈÉ½Õ¹ğ½‘Ğøñ‘ùì¡9Õµ‰•È¡…µ½Õ¹Ğ¤€¨Í•±•Ñ•¹±•¹Ñ ñğ€À¤¹Ñ½¥á• Ğ¥ôMU$ğ½‘øğ½‘¥Øøñ‘¥Øøñ‘ĞùQ½Ñ…°‘•Á±½åµ•¹Ğğ½‘Ğøñ‘ùíÑ½Ñ…°¹Ñ½¥á• Ğ¥ôMU$ğ½‘øğ½‘¥Øøñ‘¥Øøñ‘Ğù]¥¹¹¥¹œÉ•İ…Éğ½‘Ğøñ‘ùíµÑ‰áI½Õ¹‘I•İ…É¹Ñ½¥á• È¥ô5Q	`€¬MU$ğ½‘øğ½‘¥Øøğ½‘°ø(€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰‘•Á±½äˆ‘¥Í…‰±•õíÍÕ‰µ¥ÑÑ¥¹A±…äñğ€…¡…¥¹MÑ…Ñ”ñğ¡…¥¹MÑ…Ñ”¹Í•ÑÑ±•ñğÍ•½¹‘Ì€ôôô€Áô½¹±¥¬õí‘•Á±½åôùíÍÕ‰µ¥ÑÑ¥¹A±…ä€ü€‰]…¥Ñ¥¹œ™½ÈM±ÕÍ£Š˜ˆ€è€…¡…¥¹MÑ…Ñ”ü¹É•İ…É‘Í	½Õ¹€ü€‰=İ¹•È…Ñ¥Ù…Ñ¥½¸É•ÅÕ¥É•ˆ€è¡…¥¹MÑ…Ñ”¹Í•ÑÑ±•€ü€‰I½Õ¹¥ÌÍ•ÑÑ±•ˆ€èÍ•½¹‘Ì€ôôô€À€ü€‰]…¥Ñ¥¹œ™½ÈÍ•ÑÑ±•µ•¹Ğˆ€è€‰•Á±½äÑ¼±¥Ù”É¥‰ôğ½‰ÕÑÑ½¸ùí¹½Ñ¥”€˜˜€ñÀ±…ÍÍ9…µ”ô‰¹½Ñ¥”ˆÉ½±”ô‰ÍÑ…ÑÕÌˆùí¹½Ñ¥•ôğ½Àùô(€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰É•İ…É‘Ìµ±¥¹¬ˆ½¹±¥¬õì ¤€ôøÍ•ÑY¥•Ü ‰É•İ…É‘Ìˆ¥ôøñÍÁ…¸øñÍµ…±°ùe=UH=8µ!%8I]ILğ½Íµ…±°øñÍÑÉ½¹œùì ¡¡…¥¹MÑ…Ñ”ü¹Õ¹É•™¥¹•‘5Ñ‰à€üü€À¤€¬€¡¡…¥¹MÑ…Ñ”ü¹É•™¥¹•‘5Ñ‰à€üü€À¤€¬€¡¡…¥¹MÑ…Ñ”ü¹•ÍÑ¥µ…Ñ•‘5Ñ‰á]¥¹¹¥¹Ì€üü€À¤¤¹Ñ½¥á• Ø¥ô5Q	`€¬ì¡¡…¥¹MÑ…Ñ”ü¹•ÍÑ¥µ…Ñ•‘MÕ¥]¥¹¹¥¹Ì€üü€À¤¹Ñ½¥á• Ø¥ôMU$ğ½ÍÑÉ½¹œøğ½ÍÁ…¸øñˆùY¥•Ü€™…µÀì±…¥´ƒŠHğ½ˆøğ½‰ÕÑÑ½¸ø(€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰‘¥Í±…¥µ•ÈˆùMÕ¤Q•ÍÑ¹•Ğ½¹±ä¸½¹™¥Éµ•Á±…äÕÍ•ÌÑ•ÍĞMU$…¹İÉ¥Ñ•Ìå½ÕÈÍ•±•Ñ•Ñ¥±•Ì½¸µ¡…¥¸¸ğ½Àø(€€€€€€€€ğ½…Í¥‘”ø4(€€€€€€ğ½‘¥Øø€è€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰É•İ…É‘ÌµÁ…”ˆø4(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É•İ…É‘ÌµÑ¥Ñ±”ˆøñÀ±…ÍÍ9…µ”ô‰•å•‰É½Üˆù1%YMU$QMQ9PI]ILğ½Àøñ Äùe½ÕÈMU$…¹5Q	`İ¥¹¹¥¹Ì¸ğ½ ÄøñÀù	…±…¹•Ì‰•±½Ü…É”É•…™É½´Ñ¡”ÁÕ‰±¥Í¡•…µ”…¹I•™¥¹•Éä½‰©•ÑÌ¸İ¥¹¹¥¹œ±…¥´Í•¹‘ÌMU$¥µµ•‘¥…Ñ•±ä…¹ÍÑ…ÉÑÌÑ¡”5Q	`É•™¥¹¥¹œÁ•É¥½¸ğ½Àøğ½‘¥Øø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É•İ…Éµ…ÍÍ•ÑÌˆø4(€€€€€€€€€€ñ…ÉÑ¥±”±…ÍÍ9…µ”ô‰±…¥´µ…ÉÉ•™¥¹¥¹œµ…Éˆøñ‘¥Ø±…ÍÍ9…µ”ô‰±…¥´µ¥½¸ˆù4ğ½‘¥ØøñÍµ…±°ù5Q	`I%9Idğ½Íµ…±°øñ‘¥Ø±…ÍÍ9…µ”ô‰É•™¥¹•Éäµ‰…±…¹•Ìˆøñ‘¥ØøñÍÁ…¸ùU9I%9ğ½ÍÁ…¸øñÍÑÉ½¹œùì¡¡…¥¹MÑ…Ñ”ü¹Õ¹É•™¥¹•‘5Ñ‰à€üü€À¤¹Ñ½¥á• Ø¥ô5Q	`ğ½ÍÑÉ½¹œøğ½‘¥Øøñ‘¥ØøñÍÁ…¸ùI%9ğ½ÍÁ…¸øñÍÑÉ½¹œùì¡¡…¥¹MÑ…Ñ”ü¹É•™¥¹•‘5Ñ‰à€üü€À¤¹Ñ½¥á• Ø¥ô5Q	`ğ½ÍÑÉ½¹œøğ½‘¥Øøğ½‘¥Øøñ‘¥Ø±…ÍÍ9…µ”ô‰É•™¥¹”µÑ¥µ”ˆøñÍÁ…¸ù9•áĞµ…ÑÕÉ¥Ñäğ½ÍÁ…¸øñÍÑÉ½¹œùí¡…¥¹MÑ…Ñ”ü¹¹•áÑ5…ÑÕÉ¥Ñå5Ì€ü€‰]¥Ñ¡¥¸€ÈÑ ˆ€è€‹ŠP‰ôğ½ÍÑÉ½¹œøğ½‘¥Øøñ‘¥Ø±…ÍÍ9…µ”ô‰É•™¥¹”µÑÉ…¬ˆ…É¥„µ±…‰•°ô‰5Q	`É•™¥¹¥¹œÁ•É¥½ˆøñ¤€¼øğ½‘¥ØøñÀ±…ÍÍ9…µ”ô‰É•™¥¹”µ½Áäˆù5Q	`‰•½µ•Ì™Õ±±äÑÉ…¹Í™•É…‰±”…™Ñ•È€ÈĞ¡½ÕÉÌ¸…É±äİ¥Ñ¡‘É…İ…°µ¥¹ÑÌ€äÀ”…¹Á•Éµ…¹•¹Ñ±ä™½É™•¥ÑÌ€ÄÀ”¸ğ½Àøñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰‘•Á±½äˆ‘¥Í…‰±•õíÉ½Õ¹‘Ñ¥½¸ñğ€„¡¡…¥¹MÑ…Ñ”ü¹É•™¥¹•‘A½Í¥Ñ¥½¹Ì¥ô½¹±¥¬õì ¤€ôø±…¥µ5Ñ‰à¡™…±Í”¥ôù±…¥´É•™¥¹•5Q	`ğ½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰•…É±äµİ¥Ñ¡‘É…Üˆ‘¥Í…‰±•õíÉ½Õ¹‘Ñ¥½¸ñğ€„¡¡…¥¹MÑ…Ñ”ü¹Õ¹É•™¥¹•‘A½Í¥Ñ¥½¹Ì¥ô½¹±¥¬õì ¤€ôø±…¥µ5Ñ‰à¡ÑÉÕ”¥ôù]¥Ñ¡‘É…ÜÕ¹É•™¥¹••…É±äğ½‰ÕÑÑ½¸øñÀ±…ÍÍ9…µ”ô‰Á•¹…±Ñäµ½ÁäˆøñÍÑÉ½¹œøÄÀ”Á•¹…±Ñäğ½ÍÑÉ½¹œø…ÁÁ±¥•Ì½¹±äÑ¼•…É±äİ¥Ñ¡‘É…İ…°¸ğ½Àøğ½…ÉÑ¥±”ø(€€€€€€€€€€ñ…ÉÑ¥±”±…ÍÍ9…µ”ô‰±…¥´µ…ÉÍÕ¤µ±…¥´ˆøñ‘¥Ø±…ÍÍ9…µ”ô‰±…¥´µ¥½¸ÍÕ¤µ±…¥´µ¥½¸ˆùLğ½‘¥ØøñÍµ…±°ùUII9PI=U9]%99%9Lğ½Íµ…±°øñÍÑÉ½¹œùì¡¡…¥¹MÑ…Ñ”ü¹•ÍÑ¥µ…Ñ•‘MÕ¥]¥¹¹¥¹Ì€üü€À¤¹Ñ½¥á• Ø¥ôMU$ğ½ÍÑÉ½¹œøñÍÁ…¸ø¬ì¡¡…¥¹MÑ…Ñ”ü¹•ÍÑ¥µ…Ñ•‘5Ñ‰á]¥¹¹¥¹Ì€üü€À¤¹Ñ½¥á• Ø¥ôÕ¹É•™¥¹•5Q	`ğ½ÍÁ…¸øñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰‘•Á±½äÍÕ¤µ‰ÕÑÑ½¸ˆ‘¥Í…‰±•õíÉ½Õ¹‘Ñ¥½¸ñğ€„¡¡…¥¹MÑ…Ñ”ü¹±…¥µ…‰±•]¥¹¹¥¹¹ÑÉ¥•Ì¥ô½¹±¥¬õí±…¥µI½Õ¹‘]¥¹¹¥¹Íôù±…¥´É½Õ¹É•İ…É‘Ìğ½‰ÕÑÑ½¸øğ½…ÉÑ¥±”ø(€€€€€€€€ğ½‘¥Øø4(€€€€€€€ì…¡…¥¹MÑ…Ñ”ü¹Í•ÑÑ±•€˜˜Í•½¹‘Ì€ôôô€À€˜˜€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰±…¥´µ…±°ˆ‘¥Í…‰±•õíÉ½Õ¹‘Ñ¥½¹ô½¹±¥¬õíÍ•ÑÑ±•I½Õ¹‘ôùI•Ù•…°İ¥¹¹¥¹œ‰±½¬İ¥Ñ MÕ¤É…¹‘½µ¹•ÍÌğ½‰ÕÑÑ½¸ùô(€€€€€€€íÕÉÉ•¹Ñ½Õ¹Ğü¹…‘‘É•ÍÌ¹Ñ½1½İ•É…Í” ¤€ôôôÑ•ÍÑ¹•Ñ=İ¹•È€˜˜€…¡…¥¹MÑ…Ñ”ü¹Í•ÑÑ±•€˜˜Í•½¹‘Ì€ôôô€À€˜˜¡…¥¹MÑ…Ñ”ü¹Á½ÑMÕ¤€ôôô€À€˜˜€ñ…ÉÑ¥±”±…ÍÍ9…µ”ô‰±…¥´µ…ÉÑ•ÍÑ¹•ĞµÁÕ‰±¥Í ˆøñÍµ…±°ù=]9H5AQdµI=U9I=YIdğ½Íµ…±°øñ ÈùI•½Ù•ÈÑ¡”•áÁ¥É••µÁÑäÉ½Õ¹ğ½ ÈøñÀù¥ÉÍĞ…ÁÁÉ½Ù”Ñ¡”Á…­…”ÕÁÉ…‘”½¹”¸Q¡•¸±½Í”Ñ¡¥Ìé•É¼µMU$É½Õ¹…¹½Á•¸Ñ¡”¹•áĞÁ±…å…‰±”É½Õ¹¸ğ½Àøñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰‘•Á±½äˆ‘¥Í…‰±•õíÕÁÉ…‘¥¹A…­…•ô½¹±¥¬õíÕÁÉ…‘•Q•ÍÑ¹•ÑA…­…•ôùíÕÁÉ…‘¥¹A…­…”€ü€‰]…¥Ñ¥¹œ™½ÈM±ÕÍ …ÁÁÉ½Ù…³Š˜ˆ€è€‰UÁÉ…‘”Q•ÍÑ¹•ĞÉ•½Ù•Éä‰ôğ½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰‘•Á±½äˆ‘¥Í…‰±•õíÉ½Õ¹‘Ñ¥½¹ô½¹±¥¬õí±½Í•µÁÑåI½Õ¹‘ôùíÉ½Õ¹‘Ñ¥½¸€ü€‰]…¥Ñ¥¹œ™½ÈM±ÕÍ …ÁÁÉ½Ù…³Š˜ˆ€è€‰±½Í”•µÁÑäÉ½Õ¹‰ôğ½‰ÕÑÑ½¸øğ½…ÉÑ¥±”ùô(€€€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰µ¥¹•ÉÌµ‰½…Éˆøñ‘¥Ø±…ÍÍ9…µ”ô‰µ¥¹•ÉÌµ¡•…‘¥¹œˆøñ‘¥ØøñÀ±…ÍÍ9…µ”ô‰•å•‰É½ÜˆùQMQ9PQ%Y%Qdğ½Àøñ Èù5¥¹•ÉÌğ½ Èøğ½‘¥ØøñÍÁ…¸ù±½‰…°MÕ¤¥¹‘•á¥¹œ¹•áĞğ½ÍÁ…¸øğ½‘¥Øøñ‘¥Ø±…ÍÍ9…µ”ô‰µ¥¹•ÉÌµÑ…‰ÌˆÉ½±”ô‰Ñ…‰±¥ÍĞˆ…É¥„µ±…‰•°ô‰5¥¹•È±•…‘•É‰½…Éˆøñ‰ÕÑÑ½¸±…ÍÍ9…µ”õí±•…‘•É‰½…É‘Q…ˆ€ôôô€‰µ¥¹•ÉÌˆ€ü€‰…Ñ¥Ù”ˆ€è€ˆ‰ô½¹±¥¬õì ¤€ôøÍ•Ñ1•…‘•É‰½…É‘Q…ˆ ‰µ¥¹•ÉÌˆ¥ôù5¥¹•ÉÌğ½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÍ9…µ”õí±•…‘•É‰½…É‘Q…ˆ€ôôô€‰Õ¹É•™¥¹•ˆ€ü€‰…Ñ¥Ù”ˆ€è€ˆ‰ô½¹±¥¬õì ¤€ôøÍ•Ñ1•…‘•É‰½…É‘Q…ˆ ‰Õ¹É•™¥¹•ˆ¥ôùU¹É•™¥¹•ğ½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÍ9…µ”õí±•…‘•É‰½…É‘Q…ˆ€ôôô€‰É•™¥¹•ˆ€ü€‰…Ñ¥Ù”ˆ€è€ˆ‰ô½¹±¥¬õì ¤€ôøÍ•Ñ1•…‘•É‰½…É‘Q…ˆ ‰É•™¥¹•ˆ¥ôùI•™¥¹•ğ½‰ÕÑÑ½¸øğ½‘¥Øøñ‘¥Ø±…ÍÍ9…µ”ô‰µ¥¹•ÉÌµÑ…‰±”ˆÉ½±”ô‰Ñ…‰±”ˆ…É¥„µ±…‰•°ô‰Q•ÍÑ¹•Ğµ¥¹•ÉÌˆøñ‘¥Ø±…ÍÍ9…µ”ô‰µ¥¹•ÉÌµÉ½Üµ¥¹•ÉÌµ¡•…‘•ÈˆÉ½±”ô‰É½ÜˆøñÍÁ…¸É½±”ô‰½±Õµ¹¡•…‘•ÈˆùI…¹¬ğ½ÍÁ…¸øñÍÁ…¸É½±”ô‰½±Õµ¹¡•…‘•Èˆù5¥¹•Èğ½ÍÁ…¸øñÍÁ…¸É½±”ô‰½±Õµ¹¡•…‘•Èˆùí±•…‘•É‰½…É‘Q…ˆ€ôôô€‰µ¥¹•ÉÌˆ€ü€‰Q½Ñ…°‘•Á±½å•ˆ€è±•…‘•É‰½…É‘Q…ˆ€ôôô€‰Õ¹É•™¥¹•ˆ€ü€‰U¹É•™¥¹•5Q	`ˆ€è€‰I•™¥¹•5Q	`‰ôğ½ÍÁ…¸øğ½‘¥ØùíÕÉÉ•¹Ñ½Õ¹Ğ€ü€ñ‘¥Ø±…ÍÍ9…µ”ô‰µ¥¹•ÉÌµÉ½ÜˆÉ½±”ô‰É½ÜˆøñÍÑÉ½¹œÉ½±”ô‰•±°ˆøŒÄğ½ÍÑÉ½¹œøñÍÁ…¸É½±”ô‰•±°ˆøñ¤±…ÍÍ9…µ”ô‰µ¥¹•Èµ…Ù…Ñ…Èˆù4ğ½¤øñˆùíÕÍ•É¹…µ”ñğ€‘íÕÉÉ•¹Ñ½Õ¹Ğ¹…‘‘É•ÍÌ¹Í±¥” À°€Ü¥÷Š˜‘íÕÉÉ•¹Ñ½Õ¹Ğ¹…‘‘É•ÍÌ¹Í±¥” ´Ô¥õôğ½ˆøñÍµ…±°ùe½Ôğ½Íµ…±°øğ½ÍÁ…¸øñÍÑÉ½¹œÉ½±”ô‰•±°ˆùí±•…‘•É‰½…É‘Q…ˆ€ôôô€‰µ¥¹•ÉÌˆ€ü€‘í±¥™•Ñ¥µ••Á±½å•¹Ñ½¥á• Ğ¥ôMU%€€è€‰A•¹‘¥¹œ¥¹‘•à‰ôğ½ÍÑÉ½¹œøğ½‘¥Øø€è€ñ‘¥Ø±…ÍÍ9…µ”ô‰µ¥¹•ÉÌµ•µÁÑäˆù½¹¹•Ğ„Q•ÍÑ¹•Ğİ…±±•ĞÑ¼©½¥¸Ñ¡”±•…‘•É‰½…É¸ğ½‘¥Øùôğ½‘¥ØøñÀùI…¹­¥¹Ìİ¥±°‰”É•‰Õ¥±Ğ™É½´½¹™¥Éµ•¹ÑÉåA±…•…¹I•İ…É‘İ…É‘••Ù•¹ÑÌÍ¼•Ù•Éäµ¥¹•È…¹Ñ½Ñ…°¥Ì¥¹‘•Á•¹‘•¹Ñ±äÙ•É¥™¥…‰±”¸ğ½Àøğ½Í•Ñ¥½¸ø(€€€€€€€íÕÉÉ•¹Ñ½Õ¹Ğü¹…‘‘É•ÍÌ¹Ñ½1½İ•É…Í” ¤€ôôôÑ•ÍÑ¹•Ñ=İ¹•È€˜˜€…¡…¥¹MÑ…Ñ”ü¹É•İ…É‘Í	½Õ¹€˜˜€ñ…ÉÑ¥±”±…ÍÍ9…µ”ô‰±…¥´µ…ÉÑ•ÍÑ¹•ĞµÁÕ‰±¥Í ˆøñÍµ…±°ù=]9HQMQ9P5%1MQ=9ğ½Íµ…±°øñ ÈùÑ¥Ù…Ñ”Ñ¡”±¥Ù”…µ”ğ½ ÈøñÀù=¹”µÑ¥µ”Í•ÑÕÀ‰¥¹‘ÌÑ¡”Õ¹¥ÅÕ”5Q	`I•İ…É‘…ÀÑ¼Ñ¡”Í¡…É•…µ”…¹½Á•¹ÌÑ¡”™¥ÉÍĞÁ±…å…‰±”€ØÀµÍ•½¹Q•ÍÑ¹•ĞÉ½Õ¹¸ğ½Àøñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰‘•Á±½äˆ‘¥Í…‰±•õí…Ñ¥Ù…Ñ¥¹…µ•ô½¹±¥¬õí…Ñ¥Ù…Ñ•Q•ÍÑ¹•Ñ…µ•ôùí…Ñ¥Ù…Ñ¥¹…µ”€ü€‰]…¥Ñ¥¹œ™½ÈM±ÕÍ …ÁÁÉ½Ù…³Š˜ˆ€è€‰Ñ¥Ù…Ñ”±¥Ù”Q•ÍÑ¹•ĞÉ½Õ¹‰ôğ½‰ÕÑÑ½¸øğ½…ÉÑ¥±”ùô(€€€€€€€íÕÉÉ•¹Ñ½Õ¹Ğü¹…‘‘É•ÍÌ¹Ñ½1½İ•É…Í” ¤€ôôôÑ•ÍÑ¹•Ñ=İ¹•È€˜˜¡…¥¹MÑ…Ñ”ü¹É•İ…É‘Í	½Õ¹€˜˜¡…¥¹MÑ…Ñ”¹Í•ÑÑ±•€˜˜¡…¥¹MÑ…Ñ”¹İ¥¹¹¥¹¹ÑÉ¥•ÍI•µ…¥¹¥¹œ€ôôô€À€˜˜€ñ…ÉÑ¥±”±…ÍÍ9…µ”ô‰±…¥´µ…ÉÑ•ÍÑ¹•ĞµÁÕ‰±¥Í ˆøñÍµ…±°ù=]9HI=U9=9QI=0ğ½Íµ…±°øñ Èù=Á•¸Ñ¡”¹•áĞÉ½Õ¹ğ½ ÈøñÀùQ¡”ÁÉ•Ù¥½ÕÌÉ½Õ¹¥ÌÍ•ÑÑ±•…¹…±°İ¥¹¹¥¹œ•¹ÑÉ¥•Ì…É”±…¥µ•¸ğ½Àøñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰‘•Á±½äˆ‘¥Í…‰±•õíÉ½Õ¹‘Ñ¥½¹ô½¹±¥¬õí½Á•¹9•áÑI½Õ¹‘ôù=Á•¸¹•áĞ€ØÀµÍ•½¹É½Õ¹ğ½‰ÕÑÑ½¸øğ½…ÉÑ¥±”ùô(€€€€€€€í¹½Ñ¥”€˜˜€ñÀ±…ÍÍ9…µ”ô‰¹½Ñ¥”É•İ…É‘Ìµ¹½Ñ¥”ˆÉ½±”ô‰ÍÑ…ÑÕÌˆùí¹½Ñ¥•ôğ½ÀùôñÀ±…ÍÍ9…µ”ô‰‘¥Í±…¥µ•ÈÉ•İ…É‘Ìµ‘¥Í±…¥µ•Èˆù1¥Ù”MÕ¤Q•ÍÑ¹•ĞÍÑ…Ñ”¸Q•ÍĞMU$¡…Ì¹¼µ½¹•Ñ…ÉäÙ…±Õ”¸½¹ÑÉ…Ğ±½¥Œ¥ÌÕ¹…Õ‘¥Ñ•…¹µÕÍĞ¹½Ğ‰”ÕÍ•½¸5…¥¹¹•Ğå•Ğ¸ğ½Àø(€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰‰…¬µ±¥¹¬ˆ½¹±¥¬õì ¤€ôøìÍ•ÑY¥•Ü ‰µ¥¹”ˆ¤ìÍ•Ñ9½Ñ¥” ˆˆ¤ìõôûŠ@	…¬Ñ¼µ¥¹¥¹œÉ¥ğ½‰ÕÑÑ½¸ø4(€€€€€€ğ½Í•Ñ¥½¸ùô4(€€€€€€ñ™½½Ñ•ÈøñÀøñÍÑÉ½¹œø‘5Q	`ğ½ÍÑÉ½¹œøƒ
Ü¥¥Ñ…°É…É”µ•Ñ…°½¸MÕ¤ğ½Àøñ¹…Ø…É¥„µ±…‰•°ô‰½½Ñ•Èˆøñ„¡É•˜ôˆ¡½Üˆù!½Ü¥Ğİ½É­Ìğ½„øñ„¡É•˜ôˆÑ½­•¸ˆùQ½­•¸ğ½„øñ„¡É•˜ôˆ™…ÄˆùDğ½„øğ½¹…Øøğ½™½½Ñ•Èø4(4(€€€€€í½¹¹•Ñ=Á•¸€˜˜€ñ‘¥Ø±…ÍÍ9…µ”ô‰½¹¹•Ğµ‰…­‘É½ÀˆÉ½±”ô‰ÁÉ•Í•¹Ñ…Ñ¥½¸ˆ½¹5½ÕÍ•½İ¸õì ¤€ôøÍ•Ñ½¹¹•Ñ=Á•¸¡™…±Í”¥ôøñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰½¹¹•Ğµ…ÉˆÉ½±”ô‰‘¥…±½œˆ…É¥„µµ½‘…°ô‰ÑÉÕ”ˆ…É¥„µ±…‰•±±•‘‰äô‰½¹¹•ĞµÑ¥Ñ±”ˆ½¹5½ÕÍ•½İ¸õì¡•Ù•¹Ğ¤€ôø•Ù•¹Ğ¹ÍÑ½ÁAÉ½Á……Ñ¥½¸ ¥ôø(€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰½¹¹•Ğµ±½Í”ˆ…É¥„µ±…‰•°ô‰±½Í”Í¥¸¥¸ˆ½¹±¥¬õì ¤€ôøÍ•Ñ½¹¹•Ñ=Á•¸¡™…±Í”¥ôû\ğ½‰ÕÑÑ½¸øñÍÁ…¸±…ÍÍ9…µ”ô‰½¹¹•Ğµ½É‰¥Ğˆ…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆøñ¤€¼øğ½ÍÁ…¸ø4(€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰•å•‰É½Üˆù]1=5Q<5Q=I	1=`ğ½Àøñ È¥ô‰½¹¹•ĞµÑ¥Ñ±”ˆù¹Ñ•ÈÑ¡”É¥¸ğ½ ÈøñÀ±…ÍÍ9…µ”ô‰½¹¹•Ğµ½ÁäˆùUÍ”½½±”Ñ¡É½Õ M±ÕÍ ™½È„Í¥µÁ±”MÕ¤İ…±±•Ğ•áÁ•É¥•¹”°½È½¹¹•Ğ…¹½Ñ¡•ÈMÕ¤İ…±±•Ğ¸ğ½Àø4(€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰½½±”µ½¹¹•Ğˆ‘¥Í…‰±•õì…Í±ÕÍ¡]…±±•Ğñğ½¹¹•Ñ¥¹ô½¹±¥¬õì ¤€ôøÍ±ÕÍ¡]…±±•Ğ€˜˜½¹¹•Ñ]…±±•Ğ¡Í±ÕÍ¡]…±±•Ğ¥ôøñÍÁ…¸±…ÍÍ9…µ”ô‰½½±”µµ…É¬ˆùğ½ÍÁ…¸øñˆùí½¹¹•Ñ¥¹œ€ü€‰½¹¹•Ñ¥¹ŸŠ˜ˆ€è€‰½¹Ñ¥¹Õ”İ¥Ñ ½½±”Ù¥„M±ÕÍ ‰ôğ½ˆøğ½‰ÕÑÑ½¸ø4(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰½¹¹•Ğµ‘¥Ù¥‘•ÈˆøñÍÁ…¸ù½Èğ½ÍÁ…¸øğ½‘¥Øø4(€€€€€€€íÍÑ…¹‘…É‘]…±±•ÑÌ¹±•¹Ñ €üÍÑ…¹‘…É‘]…±±•ÑÌ¹µ…À ¡İ…±±•Ğ¤€ôø€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰ÍÕ¤µ½¹¹•Ğİ…±±•Ğµ¡½¥”ˆ­•äõíİ…±±•Ğ¹¹…µ•ô½¹±¥¬õì ¤€ôø½¹¹•Ñ]…±±•Ğ¡İ…±±•Ğ¥ôøñÍÁ…¸±…ÍÍ9…µ”ô‰ÍÕ¤µİ…±±•Ğµµ…É¬ˆùLğ½ÍÁ…¸øñˆù½¹¹•Ğíİ…±±•Ğ¹¹…µ•ôğ½ˆøğ½‰ÕÑÑ½¸ø¤€è€ñ„±…ÍÍ9…µ”ô‰ÍÕ¤µ½¹¹•Ğİ…±±•Ğµ¥¹ÍÑ…±°ˆ¡É•˜ô‰¡ÑÑÁÌè¼½Í±ÕÍ ¹…ÁÀ¼ˆÑ…É•Ğô‰}‰±…¹¬ˆÉ•°ô‰¹½É•™•ÉÉ•ÈˆøñÍÁ…¸±…ÍÍ9…µ”ô‰ÍÕ¤µİ…±±•Ğµµ…É¬ˆùLğ½ÍÁ…¸øñˆù•Ğ„MÕ¤İ…±±•Ğğ½ˆøğ½„ùô4(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰½¹‰½…É‘¥¹œµ¹½Ñ”ˆøñÍÑÉ½¹œùMU$QMQ9Pğ½ÍÑÉ½¹œøñÍÁ…¸ùM±ÕÍ ÁÉ½Ù¥‘•Ì½½±”é­1½¥¸…¹„Í•±˜µÕÍÑ½‘¥…°MÕ¤…‘‘É•ÍÌİ¥Ñ ¹¼¹½­¤ÍÕ‰ÍÉ¥ÁÑ¥½¸¸5¥¹¥¹œÉ•µ…¥¹ÌÍ¥µÕ±…Ñ•Õ¹Ñ¥°Ñ¡”5½Ù”½¹ÑÉ…ÑÌ…É”‘•Á±½å•¸ğ½ÍÁ…¸øğ½‘¥Øø(€€€€€€ğ½Í•Ñ¥½¸øğ½‘¥Øùô((€€€€€í…½Õ¹Ñ=Á•¸€˜˜ÕÉÉ•¹Ñ½Õ¹Ğ€˜˜€ñ‘¥Ø±…ÍÍ9…µ”ô‰…½Õ¹Ğµ‰…­‘É½ÀˆÉ½±”ô‰ÁÉ•Í•¹Ñ…Ñ¥½¸ˆ½¹5½ÕÍ•½İ¸õì ¤€ôøÍ•Ñ½Õ¹Ñ=Á•¸¡™…±Í”¥ôøñ…Í¥‘”±…ÍÍ9…µ”ô‰…½Õ¹Ğµ‘É…İ•ÈˆÉ½±”ô‰‘¥…±½œˆ…É¥„µµ½‘…°ô‰ÑÉÕ”ˆ…É¥„µ±…‰•±±•‘‰äô‰…½Õ¹ĞµÑ¥Ñ±”ˆ½¹5½ÕÍ•½İ¸õì¡•Ù•¹Ğ¤€ôø•Ù•¹Ğ¹ÍÑ½ÁAÉ½Á……Ñ¥½¸ ¥ôø(€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰…½Õ¹Ğµ±½Í”ˆ…É¥„µ±…‰•°ô‰±½Í”İ…±±•ĞÁ…¹•°ˆ½¹±¥¬õì ¤€ôøÍ•Ñ½Õ¹Ñ=Á•¸¡™…±Í”¥ôû\ğ½‰ÕÑÑ½¸ø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…½Õ¹Ğµ…Ù…Ñ…Èˆ…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆøñÍÁ…¸ù4ğ½ÍÁ…¸øñ¤€¼øğ½‘¥Øø(€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰•å•‰É½Üˆù=99Q]11Pğ½Àøñ È¥ô‰…½Õ¹ĞµÑ¥Ñ±”ˆùíÕÍ•É¹…µ”ñğ€‰5•Ñ•½É	±½àÁÉ½™¥±”‰ôğ½ Èø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÕÍ•É¹…µ”µ•‘¥Ñ½Èˆøñ±…‰•°¡Ñµ±½Èô‰İ…±±•ĞµÕÍ•É¹…µ”ˆùUÍ•É¹…µ”ğ½±…‰•°øñ‘¥Øøñ¥¹ÁÕĞ¥ô‰İ…±±•ĞµÕÍ•É¹…µ”ˆÙ…±Õ”õíÕÍ•É¹…µ•É…™Ñôµ…á1•¹Ñ õìÈÁôÁ±…•¡½±‘•Èô‰É•…Ñ”ÕÍ•É¹…µ”ˆ½¹¡…¹”õì¡•Ù•¹Ğ¤€ôøÍ•ÑUÍ•É¹…µ•É…™Ğ¡•Ù•¹Ğ¹Ñ…É•Ğ¹Ù…±Õ”¥ô½¹-•å½İ¸õì¡•Ù•¹Ğ¤€ôøì¥˜€¡•Ù•¹Ğ¹­•ä€ôôô€‰¹Ñ•Èˆ¤Í…Ù•UÍ•É¹…µ” ¤ìõô€¼øñ‰ÕÑÑ½¸½¹±¥¬õíÍ…Ù•UÍ•É¹…µ•ôùM…Ù”ğ½‰ÕÑÑ½¸øğ½‘¥ØøñÍµ…±°øÏŠLÈÀ±•ÑÑ•ÉÌ°¹Õµ‰•ÉÌ°|½È€´ƒ
ÜÍ…Ù•½¸Ñ¡¥Ì‘•Ù¥”ğ½Íµ…±°øğ½‘¥Øø(€€€€€€€€ñ‘°±…ÍÍ9…µ”ô‰…½Õ¹Ğµ‘•Ñ…¥±Ìˆøñ‘¥Øøñ‘Ğù‘‘É•ÍÌğ½‘Ğøñ‘øñÍÁ…¸ùí€‘íÕÉÉ•¹Ñ½Õ¹Ğ¹…‘‘É•ÍÌ¹Í±¥” À°€à¥÷Š˜‘íÕÉÉ•¹Ñ½Õ¹Ğ¹…‘‘É•ÍÌ¹Í±¥” ´Ø¥õôğ½ÍÁ…¸øñ‰ÕÑÑ½¸…É¥„µ±…‰•°ô‰½Áäİ…±±•Ğ…‘‘É•ÍÌˆ½¹±¥¬õí½Áå‘‘É•ÍÍôù½Áäğ½‰ÕÑÑ½¸øğ½‘øğ½‘¥Øøñ‘¥Øøñ‘Ğù9•Ñİ½É¬ğ½‘Ğøñ‘øñÍÁ…¸±…ÍÍ9…µ”ô‰…½Õ¹Ğµ¹•Ñİ½É¬ˆøñ¤€¼øMÕ¤Q•ÍÑ¹•Ğğ½ÍÁ…¸øğ½‘øğ½‘¥Øøñ‘¥Øøñ‘Ğù]…±±•Ğğ½‘Ğøñ‘ùM±ÕÍ ğ½‘øğ½‘¥Øøğ½‘°ø(€€€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰…½Õ¹ĞµÁ½ÉÑ™½±¥¼ˆøñ ÌùA½ÉÑ™½±¥¼ğ½ Ìøñ‘°øñ‘¥Øøñ‘ĞùMU$‘•Á±½å•ğ½‘Ğøñ‘ùí±¥™•Ñ¥µ••Á±½å•¹Ñ½¥á• Ğ¥ôMU$ğ½‘øğ½‘¥Øøñ‘¥Øøñ‘Ğù5Q	`É•™¥¹•ğ½‘Ğøñ‘ù=¸µ¡…¥¸ğ½‘øğ½‘¥Øøñ‘¥Øøñ‘Ğù5Q	`Õ¹É•™¥¹•ğ½‘Ğøñ‘ù=¸µ¡…¥¸ğ½‘øğ½‘¥Øøñ‘¥Ø±…ÍÍ9…µ”ô‰Á½ÉÑ™½±¥¼µÑ½Ñ…°ˆøñ‘Ğù…µ”…•ÍÌğ½‘Ğøñ‘ù1¥Ù”Q•ÍÑ¹•Ğğ½‘øğ½‘¥Øøğ½‘°øğ½Í•Ñ¥½¸ø(€€€€€€€€ñ„±…ÍÍ9…µ”ô‰…½Õ¹Ğµ•áÁ±½É•Èˆ¡É•˜õí¡ÑÑÁÌè¼½ÍÕ¥Í…¸¹áåè½Ñ•ÍÑ¹•Ğ½…½Õ¹Ğ¼‘íÕÉÉ•¹Ñ½Õ¹Ğ¹…‘‘É•ÍÍõôÑ…É•Ğô‰}‰±…¹¬ˆÉ•°ô‰¹½É•™•ÉÉ•ÈˆùY¥•Üİ…±±•Ğ½¸MÕ¥M…¸ƒŠ\ğ½„ø(€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰…½Õ¹Ğµ‘¥Í½¹¹•Ğˆ½¹±¥¬õì ¤€ôøì‘¥Í½¹¹•Ğ ¤ìÍ•Ñ½Õ¹Ñ=Á•¸¡™…±Í”¤ìÍ•Ñ9½Ñ¥” ‰]…±±•Ğ‘¥Í½¹¹•Ñ•¸ˆ¤ìõôù¥Í½¹¹•Ğİ…±±•Ğğ½‰ÕÑÑ½¸ø(€€€€€€ğ½…Í¥‘”øğ½‘¥Øùô(€€€€ğ½µ…¥¸ø(€€¤ì4)ô4