import { compress } from "./compressor.js";
import { estimateTokens } from "../utils/tokenEstimator.js";

export interface ContextTurn {
  content: string;
  tokens: number;
}

export interface ContextSnapshot {
  base: string;
  history: ContextTurn[];
  totalTokens: number;
}

/**
 * Incremental context manager.
 *
 * Holds a compressed base prompt once and accumulates only deltas.
 * Callers use `next(...)` for each new step and receive just the
 * new turn — which is what gets sent to the model — while `full()`
 * returns the assembled conversation if a full replay is needed.
 */
export interface ContextOptions {
  /** Maximum retained history turns. Oldest are dropped. Default: 256. */
  maxHistory?: number;
}

const DEFAULT_MAX_HISTORY = 256;

export class Context {
  private base = "";
  private history: ContextTurn[] = [];
  private readonly maxHistory: number;

  constructor(options: ContextOptions = {}) {
    const m = options.maxHistory ?? DEFAULT_MAX_HISTORY;
    if (!Number.isInteger(m) || m < 1) {
      throw new RangeError("eftojs: `maxHistory` must be a positive integer");
    }
    this.maxHistory = m;
  }

  setBase(text: string): this {
    if (typeof text !== "string") {
      throw new TypeError("eftojs: setBase() expected a string");
    }
    this.base = compress(text);
    return this;
  }

  getBase(): string {
    return this.base;
  }

  /**
   * Append an incremental instruction and return just that delta,
   * compressed. This is what you send to the model on the next call.
   */
  next(text: string): string {
    if (typeof text !== "string") {
      throw new TypeError("eftojs: next() expected a string");
    }
    const delta = compress(text);
    this.history.push({ content: delta, tokens: estimateTokens(delta) });
    if (this.history.length > this.maxHistory) {
      this.history.splice(0, this.history.length - this.maxHistory);
    }
    return delta;
  }

  /** Full assembled prompt (base + all deltas). */
  full(): string {
    const parts = [this.base, ...this.history.map((h) => h.content)].filter(Boolean);
    return parts.join("\n");
  }

  /** Drop history while keeping the base. */
  reset(): this {
    this.history = [];
    return this;
  }

  snapshot(): ContextSnapshot {
    const full = this.full();
    return {
      base: this.base,
      history: this.history.map((h) => ({ ...h })),
      totalTokens: estimateTokens(full),
    };
  }
}

export function createContext(options?: ContextOptions): Context {
  return new Context(options);
}
