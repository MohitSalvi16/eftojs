export { createPrompt, type CreatePromptInput } from "./core/promptBuilder.js";
export { compress, type CompressOptions } from "./core/compressor.js";
export {
  createContext,
  Context,
  type ContextTurn,
  type ContextSnapshot,
  type ContextOptions,
} from "./core/context.js";
export {
  registerMode,
  getMode,
  listModes,
  clearModes,
  type ModeDefinition,
} from "./modes/defaultModes.js";
export {
  estimateTokens,
  compareTokens,
  type TokenComparison,
} from "./utils/tokenEstimator.js";

export const VERSION = "1.0.0";
