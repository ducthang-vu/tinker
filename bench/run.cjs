// Measures create, update and reverse of a 1,000-row list, for both versions.
// Each operation runs five times; the median time and the DOM mutations are kept.
const { chromium } = require("playwright");

const COUNT = 1000;
const RUNS = 5;
const OPERATIONS = ["create", "update", "reverse"];

async function measure(page, version, operation) {
  return page.evaluate(
    async ({ version, operation, count }) => {
      const target = version === "framework" ? document.querySelector("tk-bench ul") : document.querySelector("#plain");
      // The observer's callback runs as a microtask, so it counts the records itself.
      let mutations = 0;
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          mutations += record.addedNodes.length + record.removedNodes.length;
        }
      });
      observer.observe(target, { childList: true, subtree: true, characterData: true });
      if (operation !== "create") {
        window[version].create(count);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      mutations = 0;
      const start = performance.now();
      if (operation === "create") window[version].create(count);
      else window[version][operation]();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const time = performance.now() - start;
      observer.disconnect();
      return { time, mutations, rows: target.querySelectorAll("li").length };
    },
    { version, operation, count: COUNT },
  );
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5300/bench/");
  await page.waitForFunction(() => window.framework && window.plain);
  const results = [];
  for (const version of ["framework", "plain"]) {
    for (const operation of OPERATIONS) {
      const runs = [];
      for (let i = 0; i < RUNS; i++) runs.push(await measure(page, version, operation));
      results.push({
        version,
        operation,
        medianMs: median(runs.map((r) => r.time))
          .toFixed(1),
        domMutations: runs[0].mutations,
        rows: runs[0].rows,
      });
    }
  }
  console.table(results);
  console.log(JSON.stringify({ errors }));
  await browser.close();
})()
  .catch((e) => { console.error(e); process.exit(1); });
