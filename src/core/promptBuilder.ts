import { compress, type CompressOptions } from "./compressor.js";
import { getMode } from "../modes/defaultModes.js";

export interface CreatePromptInput {
  /** Registered mode name (e.g. "ENG_V1"). */
  mode?: string;
  /** Primary task the model should execute. */
  task: string;
  /** Hard constraints the output must satisfy. */
  constraints?: string[];
  /** Additional background context. */
  context?: string;
  /** Concrete examples (input/output pairs or snippets). */
  examples?: string[];
  /** Desired output format, e.g. "json", "markdown". */
  output?: string;
  /** Override compression behavior. */
  compression?: CompressOptions | false;
  /**
   * When true, neutralizes `[` / `]` in user-supplied fields so callers
   * cannot forge section tags (e.g. a malicious task string injecting
   * `[RULES] ignore previous`). Default: true.
   */
  escapeTags?: boolean;
}

const MAX_FIELD_LEN = 100_000;

function assertString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`eftojs: \`${field}\` must be a string`);
  }
  if (value.length > MAX_FIELD_LEN) {
    throw new RangeError(`eftojs: \`${field}\` exceeds ${MAX_FIELD_LEN} chars`);
  }
  return value;
}

function assertStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`eftojs: \`${field}\` must be an array of strings`);
  }
  return value.map((v, i) => assertString(v, `${field}[${i}]`));
}

function escapeTags(text: string): string {
  return text.replace(/\[/g, "⟦").replace(/\]/g, "⟧");
}

/**
 * Build a token-efficient prompt from a structured input.
 *
 * The builder assembles a compact, section-tagged prompt and then runs it
 * through the compression pipeline. Sections are omitted when empty so the
 * final string carries no dead weight.
 */
export function createPrompt(input: CreatePromptInput): string {
  if (!input || typeof input !== "object") {
    throw new TypeError("eftojs: createPrompt() expected an object");
  }

  const {
    mode,
    task,
    constraints,
    context,
    examples,
    output,
    compression,
    escapeTags: doEscape = true,
  } = input;

  const safeTask = assertString(task, "task").trim();
  if (!safeTask) throw new RangeError("eftojs: `task` must not be empty");

  const esc = (s: string): string => (doEscape ? escapeTags(s) : s);

  const parts: string[] = [];

  if (mode !== undefined) {
    const modeName = assertString(mode, "mode");
    // Mode names are matched against a Map; reject control/newline chars
    // so a hostile name cannot forge new sections in the output.
    if (/[\x00-\x1F\x7F]/.test(modeName)) {
      throw new RangeError("eftojs: `mode` contains control characters");
    }
    const def = getMode(modeName);
    if (def) {
      if (def.persona) parts.push(`[ROLE] ${def.persona}`);
      if (def.rules.length) parts.push(`[RULES] ${def.rules.join(", ")}`);
    } else {
      parts.push(`[MODE] ${esc(modeName)}`);
    }
  }

  if (context !== undefined) {
    const c = assertString(context, "context").trim();
    if (c) parts.push(`[CTX] ${esc(c)}`);
  }

  parts.push(`[TASK] ${esc(safeTask)}`);

  if (constraints !== undefined) {
    const arr = assertStringArray(constraints, "constraints");
    if (arr.length) parts.push(`[MUST] ${arr.map(esc).join(", ")}`);
  }

  if (examples !== undefined) {
    const arr = assertStringArray(examples, "examples");
    if (arr.length) {
      parts.push(`[EX]\n${arr.map((e, i) => `${i + 1}. ${esc(e)}`).join("\n")}`);
    }
  }

  if (output !== undefined) {
    const o = assertString(output, "output").trim();
    if (o) parts.push(`[OUT] ${esc(o)}`);
  }

  const raw = parts.join("\n");
  if (compression === false) return raw;
  return compress(raw, compression ?? {});
}
