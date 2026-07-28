#!/usr/bin/env node
/**
 * Keep hitting a Larvatar chunked build URL until done: true.
 *
 * Usage:
 *   node scripts/run-build.mjs catchphrase
 *   node scripts/run-build.mjs catchphrase --force
 *   node scripts/run-build.mjs moral
 *   node scripts/run-build.mjs hottest
 *   node scripts/run-build.mjs survey
 *   node scripts/run-build.mjs profiles
 *
 * Env (or flags):
 *   LARVATAR_URL=https://larvatar.vercel.app
 *   LARVAE_BUILD_SECRET=...
 *   --url https://larvatar.vercel.app
 *   --secret YOUR_SECRET
 */

const PATHS = {
  catchphrase: "/api/larvae/catchphrase/build",
  moral: "/api/larvae/moral/build",
  hottest: "/api/larvae/hottest/build",
  survey: "/api/larvae-survey/build",
  profiles: "/api/larvae/build",
  alignment: "/api/larvae/alignment/build",
};

function arg(name, fallback = "") {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  return process.argv[i + 1] || fallback;
}

function has(flag) {
  return process.argv.includes(flag);
}

async function main() {
  const kind = (process.argv[2] || "").replace(/^--/, "");
  if (!kind || !PATHS[kind]) {
    console.error(
      `Usage: node scripts/run-build.mjs <${Object.keys(PATHS).join("|")}> [--force] [--secret X] [--url https://larvatar.vercel.app]`
    );
    process.exit(1);
  }

  const base = (arg("--url") || process.env.LARVATAR_URL || "https://larvatar.vercel.app").replace(
    /\/$/,
    ""
  );
  const secret = arg("--secret") || process.env.LARVAE_BUILD_SECRET || "";
  if (!secret) {
    console.error("Set LARVAE_BUILD_SECRET or pass --secret YOUR_SECRET");
    process.exit(1);
  }

  const qs = new URLSearchParams({ secret });
  if (has("--force") || has("--reset")) qs.set("force", "true");
  if (has("--reset")) qs.set("reset", "true");

  const url = `${base}${PATHS[kind]}?${qs}`;
  console.log(`Looping ${kind} → ${base}${PATHS[kind]}`);
  let n = 0;

  for (;;) {
    n += 1;
    process.stdout.write(`#${n}… `);
    let res;
    try {
      res = await fetch(url, { cache: "no-store" });
    } catch (e) {
      console.error(`\nnetwork error: ${e instanceof Error ? e.message : e}`);
      await sleep(3000);
      continue;
    }

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error(`\nHTTP ${res.status} non-JSON: ${text.slice(0, 200)}`);
      if (res.status >= 500) await sleep(5000);
      else process.exit(1);
      continue;
    }

    if (!res.ok) {
      console.error(`\nHTTP ${res.status}:`, data);
      process.exit(1);
    }

    const bits = [
      data.done ? "done" : "continue",
      data.justSeeded ? "seeded" : null,
      data.queued != null ? `queued=${data.queued}` : null,
      data.remaining != null ? `remaining=${data.remaining}` : null,
      data.written != null ? `written=${data.written}` : null,
      data.tested != null ? `tested=${data.tested}` : null,
      data.failed != null ? `failed=${data.failed}` : null,
      data.message || null,
    ].filter(Boolean);
    console.log(bits.join(" · "));
    if (Array.isArray(data.errorSamples) && data.errorSamples.length) {
      console.log("  samples:", data.errorSamples.join(" | "));
    }

    if (data.done) {
      console.log("Finished.");
      // Avoid Windows Node UV_HANDLE_CLOSING assert on hard exit.
      setTimeout(() => process.exit(0), 50);
      return;
    }
    await sleep(800);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

main();
