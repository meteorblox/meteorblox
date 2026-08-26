import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const siteRoot = resolve(import.meta.dirname, "..");
const bytecode = resolve(
  siteRoot,
  "../../slvrblox-test-payment/build/slvrblox_test_payment/bytecode_modules/usdc.mv",
);
const modules = [readFileSync(bytecode).toString("base64")];
const dependencies = [
  "0x0000000000000000000000000000000000000000000000000000000000000001",
  "0x0000000000000000000000000000000000000000000000000000000000000002",
];

writeFileSync(
  resolve(siteRoot, "app/test-usdc-publish-data.ts"),
  `// Generated from the tested Testnet-only mock USDC package.\nexport const testUsdcPublishData = ${JSON.stringify({ modules, dependencies })} as const;\n`,
);
