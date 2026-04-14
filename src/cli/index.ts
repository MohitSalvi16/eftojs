import { spawn } from "node:child_process";
import { compress } from "../core/compressor.js";
import { compareTokens } from "../utils/tokenEstimator.js";

const HELP = `eftojs — token-efficiency SDK for LLMs

Usage:
  eftojs ask      "<prompt>"     Compress a prompt and send it to Claude
  eftojs optimize "<prompt>"     Compress a prompt and show token savings
  eftojs tokens   "<prompt>"     Show estimated token count
  eftojs --help                  Show this help
  eftojs --version               Show version

Environment:
  EFTOJS_LLM_CMD                 LLM CLI to forward to (default: "claude")
  EFTOJS_LLM_ARGS                Extra args, space-separated (default: "-p")

Examples:
  eftojs ask "build me a secure login system, scalable"
  cat long-prompt.txt | eftojs ask
  EFTOJS_LLM_ARGS="-p --model claude-opus-4-6" eftojs ask "refactor this"
`;

const MAX_INPUT_BYTES = 5 * 1024 * 1024; // 5 MiB hard cap on CLI input

// Strip ASCII C0/C1 control bytes (except \t \n \r) before writing
// untrusted content to a terminal. Prevents ANSI/OSC escape injection
// that could rewrite prior output, spoof prompts, or manipulate the
// terminal title / clipboard on vulnerable terminal emulators.
function sanitizeForTerminal(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x80-\x9F]/g, "");
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) return resolve("");
    const chunks: Buffer[] = [];
    let total = 0;
    process.stdin.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_INPUT_BYTES) {
        reject(new Error(`stdin exceeds ${MAX_INPUT_BYTES} bytes`));
        process.stdin.pause();
        return;
      }
      chunks.push(chunk);
    });
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);

  if (!cmd || cmd === "--help" || cmd === "-h") {
    process.stdout.write(HELP);
    return;
  }

  if (cmd === "--version" || cmd === "-v") {
    process.stdout.write("1.0.0\n");
    return;
  }

  const inline = rest.join(" ").trim();
  const piped = inline ? "" : await readStdin();
  const rawInput = inline || piped;

  if (!rawInput) {
    process.stderr.write("eftojs: no input provided\n\n" + HELP);
    process.exit(1);
  }

  if (Buffer.byteLength(rawInput, "utf8") > MAX_INPUT_BYTES) {
    process.stderr.write(`eftojs: input exceeds ${MAX_INPUT_BYTES} bytes\n`);
    process.exit(1);
  }

  const input = sanitizeForTerminal(rawInput);

  switch (cmd) {
    case "optimize": {
      const out = sanitizeForTerminal(compress(input));
      const diff = compareTokens(input, out);
      process.stdout.write(out + "\n");
      process.stderr.write(
        `\n— tokens: ${diff.before} → ${diff.after} (saved ${diff.saved}, ${diff.savedPercent}%)\n`
      );
      return;
    }
    case "tokens": {
      const diff = compareTokens(input, input);
      process.stdout.write(String(diff.before) + "\n");
      return;
    }
    case "ask": {
      const out = sanitizeForTerminal(compress(input));
      const diff = compareTokens(input, out);
      process.stderr.write(
        `eftojs: tokens ${diff.before} → ${diff.after} (saved ${diff.saved}, ${diff.savedPercent}%)\n`
      );

      const llmCmd = process.env.EFTOJS_LLM_CMD || "claude";
      const llmArgs = (process.env.EFTOJS_LLM_ARGS ?? "-p")
        .split(/\s+/)
        .filter(Boolean);

      // On Windows, `claude` resolves to claude.cmd which Node's spawn
      // cannot execute without a shell. We whitelist arg chars to avoid
      // the DEP0190 deprecation around shell:true + unescaped args.
      // The prompt itself is piped via stdin, never through argv.
      const isWin = process.platform === "win32";
      if (isWin) {
        for (const a of llmArgs) {
          if (!/^[\w\-./:=]+$/.test(a)) {
            process.stderr.write(
              `eftojs: unsafe character in EFTOJS_LLM_ARGS arg: ${a}\n`
            );
            process.exit(1);
          }
        }
      }
      const child = spawn(llmCmd, llmArgs, {
        stdio: ["pipe", "inherit", "inherit"],
        shell: isWin,
      });

      child.on("error", (err) => {
        process.stderr.write(
          `eftojs: failed to launch "${llmCmd}": ${sanitizeForTerminal(err.message)}\n` +
            `eftojs: install the Claude CLI or set EFTOJS_LLM_CMD to your LLM binary.\n`
        );
        process.exit(127);
      });

      child.on("exit", (code) => process.exit(code ?? 0));
      child.stdin.end(out + "\n");
      return;
    }
    default: {
      const safeCmd = sanitizeForTerminal(String(cmd)).slice(0, 64);
      process.stderr.write(`eftojs: unknown command "${safeCmd}"\n\n` + HELP);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`eftojs: ${sanitizeForTerminal(msg).slice(0, 512)}\n`);
  process.exit(1);
});
