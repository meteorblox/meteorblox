import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const siteRoot = resolve(import.meta.dirname, "..");
const packageRoot = resolve(siteRoot, "../../slvrblox-test-payment");
const sui = resolve(siteRoot, "../../toolchain/bin/sui.exe");
const output = execFileSync(
  sui,
  ["move", "build", "--path", packageRoot, "--dump-bytecode-as-base64", "--no-tree-shaking", "--silence-warnings", "--force"],
  {
    cwd: packageRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_COUNT: "2",
      GIT_CONFIG_KEY_0: "safe.directory",
      GIT_CONFIG_VALUE_0: resolve(siteRoot, "../../move-home-cache/git/https___github_com_MystenLabs_sui_git_51d177ad7d65102fc368b582408f466d97b31548").replaceAll("\\", "/"),
      GIT_CONFIG_KEY_1: "http.sslBackend",
      GIT_CONFIG_VALUE_1: "openssl",
      MOVE_HOME: resolve(siteRoot, "../../move-home-cache"),
      SUI_CONFIG_DIR: resolve(siteRoot, "../../sui-test-config"),
    },
  },
);
const jsonLine = output.split(/\r?\n/).find((line) => line.startsWith('{"modules"'));
if (!jsonLine) throw new Error("Sui build did not return publish bytecode JSON");
const { modules, dependencies } = JSON.parse(jsonLine);

writeFileSync(
  resolve(siteRoot, "app/test-usdc-publish-data.ts"),
  `// Generated from the tested Testnet-only mock USDC package.\nexport const testUsdcPublishData = ${JSON.stringify({ modules, dependencies })} as const;\n`,
);
