/* Headless benchmark: 60 concurrent reactions, 6x CPU throttle, per engine.
   Usage:  npm i playwright   (or use any Playwright install)   then   node bench/bench.js
   Outputs bench/results.json and bench/trace-<mode>.json (load in DevTools > Performance > Load profile). */
// Playwright drives a real Chrome so we can use the DevTools Protocol (CDP) for throttling + metrics.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
// Absolute file:// URL of index.html (the app works without a server).
const URL_ = require('url').pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href; // works on Windows, Mac and Linux
const RUNS = 3; // repeat each mode 3 times: single runs are noisy

/** Run ONE benchmark pass for one engine and return its numbers. saveTrace=true also records a DevTools trace. */
async function run(browser, mode, saveTrace) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(URL_);
  await page.evaluate(m => ReactionApp.setMode(m), mode);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 }); // same as DevTools "6x slowdown"
  await cdp.send('Performance.enable'); // lets us read cumulative Layout/Style/Script counters
  await page.waitForTimeout(500);

  // Snapshot counters BEFORE the load so we can subtract and get only this run's work.
  const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
  // Optional: record a full trace you can open in DevTools > Performance > Load profile.
  if (saveTrace) await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing'] });
  await page.evaluate(() => ReactionApp.startFrameLog()); // begin recording every frame's duration
  await page.evaluate(() => ReactionApp.burst(60, 15));   // the load: 60 reactions, 15ms apart
  const peak = await page.evaluate(() => ReactionApp.stats());
  await page.waitForTimeout(3300);                      // let the whole 3 s lifespan play out
  const frames = await page.evaluate(() => ReactionApp.stopFrameLog());
  let trace = null;
  if (saveTrace) trace = await browser.stopTracing();
  // Snapshot counters AFTER the load.
  const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ReactionApp.stats());

  const d = k => m1[k] - m0[k];
  // Sort frame times so we can read percentiles (p95 = 95% of frames were faster than this).
  const sorted = [...frames].sort((a, b) => a - b);
  const sum = frames.reduce((a, b) => a + b, 0);
  const res = {
    mode, peakActive: peak.active, nodesAfter: after.nodes,
    avgFps: +(frames.length * 1000 / sum).toFixed(1),
    p95FrameMs: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1),
    worstFrameMs: +sorted[sorted.length - 1].toFixed(1),
    framesOver33ms: frames.filter(f => f > 33.4).length,
    framesOver50ms: frames.filter(f => f > 50).length,
    layoutCount: d('LayoutCount'), recalcStyleCount: d('RecalcStyleCount'),
    layoutMs: +(d('LayoutDuration') * 1000).toFixed(1), recalcStyleMs: +(d('RecalcStyleDuration') * 1000).toFixed(1),
    scriptMs: +(d('ScriptDuration') * 1000).toFixed(1), mainThreadTaskMs: +(d('TaskDuration') * 1000).toFixed(1)
  };
  if (trace) {
    // Count/sum the main rendering events from the trace: Layout, Style recalc, Paint, etc.
    const ev = JSON.parse(trace.toString()).traceEvents || JSON.parse(trace.toString());
    const tally = {};
    for (const e of ev) if (e.ph === 'X' && e.dur && ['Layout', 'UpdateLayoutTree', 'Paint', 'PrePaint', 'Layerize', 'Commit', 'RunTask'].includes(e.name)) {
      const t = tally[e.name] || (tally[e.name] = { count: 0, ms: 0 }); t.count++; t.ms += e.dur / 1000;
    }
    for (const k in tally) tally[k].ms = +tally[k].ms.toFixed(1);
    res.traceTally = tally;
    fs.writeFileSync(path.join(__dirname, `trace-${mode}.json`), trace);
  }
  await ctx.close();
  return res;
}

// Entry point: run every mode RUNS times, print a summary, save results.json.
(async () => {
  const browser = await chromium.launch();
  const out = { chrome: browser.version(), cpuThrottle: '6x', load: '60 concurrent reactions (15ms stagger)', runs: {} };
  for (const mode of ['css', 'gsap']) {
    out.runs[mode] = [];
    for (let i = 0; i < RUNS; i++) out.runs[mode].push(await run(browser, mode, i === 0));
    console.log(mode, JSON.stringify(out.runs[mode].map(({ traceTally, ...r }) => r), null, 1));
  }
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(out, null, 2));
  await browser.close();
})();