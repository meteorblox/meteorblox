import assert from "node:assert/strict";
import test from "node:test";

test("renders production SLVRBLOX metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, /<title>SLVRBLOX<\/title>/i);
  assert.match(html, /<meta name="description" content="Pick your zone\. Strike the grid\. Earn DSLVR on Sui\."\/>/i);
});

test("ships the SLVRBLOX Testnet preview", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  );
  assert.match(source, /SLVRBLOX/);
  assert.match(source, /DSLVR/);
  assert.match(source, /DSLVR simulated Testnet value/);
  assert.match(source, /\$10\.00/);
});

test("ships verified Explore activity and tester diagnostics", async () => {
  const [home, explore, api] = await Promise.all([
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/page.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/explore/page.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/api/explore/route.ts", import.meta.url), "utf8")),
  ]);
  assert.match(home, /Copy report/);
  assert.match(home, /Latest transaction/);
  assert.match(explore, /Verified activity/);
  assert.match(explore, /DSLVR TEST VALUE/);
  assert.match(explore, /\$10\.00 <small>simulated<\/small>/);
  assert.match(explore, /Copy diagnostic report/);
  assert.match(api, /EntryPlaced/);
  assert.match(api, /RoundSettled/);
  assert.match(api, /MotherlodeUpdated/);
});
