import { spawn } from "node:child_process";

const web = spawn("npm", ["run", "start:web"], { stdio: "inherit", shell: true });
const keeperPaused = process.env.KEEPER_PAUSED?.trim().toLowerCase() === "true";
const keeper = process.env.SUI_KEEPER_PRIVATE_KEY && !keeperPaused
  ? spawn(process.execPath, ["scripts/keeper.mjs"], { stdio: "inherit" })
  : null;

if (!keeper) console.log(keeperPaused
  ? "[keeper] Paused by KEEPER_PAUSED."
  : "[keeper] Disabled until SUI_KEEPER_PRIVATE_KEY is configured.");

const shutdown = (signal) => {
  keeper?.kill(signal);
  web.kill(signal);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
web.on("exit", (code) => {
  keeper?.kill("SIGTERM");
  process.exit(code ?? 1);
});

