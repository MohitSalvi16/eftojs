/**
 * Lightweight token estimator.
 *
 * Uses a heuristic calibrated against tiktoken (cl100k / o200k) averages:
 * roughly 1 token ≈ 4 characters of English, with adjustments for
 * whitespace, punctuation, and non-ASCII density.
 *
 * This avoids a heavy tokenizer dependency while staying within ~10%
 * of real tokenizer counts for typical prompts.
 */
export function estimateTokens(input: string): number {
  if (typeof input !== "string") {
    throw new TypeError("eftojs: estimateTokens() expected a string");
  }
  if (!input) return 0;

  const chars = input.length;
  const words = input.trim().split(/\s+/).filter(Boolean).length;
  const punctuation = (input.match(/[.,;:!?()[\]{}"'`~@#$%^&*_\-+=<>/\\|]/g) || []).length;
  const nonAscii = (input.match(/[^\x00-\x7F]/g) || []).length;

  // Base: average of char-based and word-based heuristics.
  const charTokens = chars / 4;
  const wordTokens = words * 1.3;
  let estimate = (charTokens + wordTokens) / 2;

  // Punctuation typically splits into its own token.
  estimate += punctuation * 0.25;

  // Non-ASCII characters tend to be 1–2 tokens each.
  estimate += nonAscii * 0.75;

  return Math.max(1, Math.round(estimate));
}

export interface TokenComparison {
  before: number;
  after: number;
  saved: number;
  savedPercent: number;
}

export function compareTokens(before: string, after: string): TokenComparison {
  if (typeof before !== "string" || typeof after !== "string") {
    throw new TypeError("eftojs: compareTokens() expected two strings");
  }
  const b = estimateTokens(before);
  const a = estimateTokens(after);
  const saved = Math.max(0, b - a);
  const savedPercent = b === 0 ? 0 : Math.round((saved / b) * 1000) / 10;
  return { before: b, after: a, saved, savedPercent };
}
