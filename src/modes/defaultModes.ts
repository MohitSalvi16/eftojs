export interface ModeDefinition {
  /** Short rules the model should always follow in this mode. */
  rules: string[];
  /** Optional persona / role line prepended to the prompt. */
  persona?: string;
}

const registry = new Map<string, ModeDefinition>();

export function registerMode(name: string, def: ModeDefinition): void {
  registry.set(name, def);
}

export function getMode(name: string): ModeDefinition | undefined {
  return registry.get(name);
}

export function listModes(): string[] {
  return Array.from(registry.keys());
}

export function clearModes(): void {
  registry.clear();
  registerDefaults();
}

function registerDefaults(): void {
  registerMode("ENG_V1", {
    persona: "Senior software engineer.",
    rules: ["modular", "production-ready", "no pseudo code", "typed", "secure"],
  });

  registerMode("DOC_V1", {
    persona: "Technical writer.",
    rules: ["concise", "accurate", "examples", "no filler"],
  });

  registerMode("REVIEW_V1", {
    persona: "Staff code reviewer.",
    rules: ["spot bugs", "flag risks", "suggest fixes", "terse"],
  });

  registerMode("DATA_V1", {
    persona: "Data engineer.",
    rules: ["sql-first", "idempotent", "explain tradeoffs"],
  });
}

registerDefaults();
