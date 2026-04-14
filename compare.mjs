import { spawnSync } from "node:child_process";
import { compress, estimateTokens, compareTokens } from "./dist/index.js";

const prompt = process.argv.slice(2).join(" ").trim();
if (!prompt) {
  console.error('usage: node compare.mjs "your prompt here"');
  process.exit(1);
}

const compressed = compress(prompt);
const diff = compareTokens(prompt, compressed);

console.log("=".repeat(60));
console.log("ORIGINAL PROMPT");
console.log("=".repeat(60));
console.log(prompt);
console.log(`\ntokens: ${diff.before}`);

console.log("\n" + "=".repeat(60));
console.log("EFTOJS-COMPRESSED PROMPT");
console.log("=".repeat(60));
console.log(compressed);
console.log(`\ntokens: ${diff.after}`);

console.log("\n" + "=".repeat(60));
console.log("SAVINGS");
console.log("=".repeat(60));
console.log(`before:  ${diff.before} tokens`);
console.log(`after:   ${diff.after} tokens`);
console.log(`saved:   ${diff.saved} tokens (${diff.savedPercent}%)`);

function callClaude(label, text) {
  console.log("\n" + "=".repeat(60));
  console.log(`CLAUDE REPLY — ${label}`);
  console.log("=".repeat(60));
  const r = spawnSync("claude", ["-p"], {
    input: text,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "inherit"],
  });
  if (r.error) {
    console.error(`(skipped: ${r.error.message})`);
    return null;
  }
  const reply = r.stdout || "";
  console.log(reply.trim());
  return estimateTokens(reply);
}

const replyTokensRaw = callClaude("WITHOUT eftojs", prompt);
const replyTokensEftojs = callClaude("WITH eftojs", compressed);

if (replyTokensRaw !== null && replyTokensEftojs !== null) {
  console.log("\n" + "=".repeat(60));
  console.log("TOTAL ROUND-TRIP TOKEN COMPARISON");
  console.log("=".repeat(60));
  const rawTotal = diff.before + replyTokensRaw;
  const eftojsTotal = diff.after + replyTokensEftojs;
  const totalSaved = rawTotal - eftojsTotal;
  const pct = rawTotal ? Math.round((totalSaved / rawTotal) * 1000) / 10 : 0;
  console.log(`without eftojs: ${diff.before} in + ${replyTokensRaw} out = ${rawTotal} tokens`);
  console.log(`with eftojs:    ${diff.after} in + ${replyTokensEftojs} out = ${eftojsTotal} tokens`);
  console.log(`net saved:     ${totalSaved} tokens (${pct}%)`);
}
