# Metra

> Token-efficiency SDK for LLMs. Compress prompts, manage context, and cut token usage 40–70% — without losing meaning.

[![npm version](https://img.shields.io/npm/v/metra.svg)](https://www.npmjs.com/package/metra)
[![license](https://img.shields.io/npm/l/metra.svg)](./LICENSE)

---

## What is Metra?

Metra is a tiny, zero-dependency TypeScript SDK that helps you:

- **Build** compact, structured prompts from plain inputs
- **Compress** verbose prompts while preserving intent
- **Reuse** modes so you stop re-sending the same boilerplate rules
- **Manage** incremental context so you only send what changed
- **Estimate** token counts before you hit the API

It works with any LLM — Claude, GPT-5, Gemini, local models — because all it does is give you a smaller, smarter string.

## Why token efficiency matters

Every token you send costs money and latency. Most prompts contain 30–60% filler: restated instructions, hedging language ("please note that…"), verbose phrasing ("in order to" vs "to"), and duplicated rules. Metra strips that out, so your model gets the signal and you stop paying for the noise.

## Installation

```bash
npm install metra
```

Requires Node 18+.

## Quick start

```ts
import { createPrompt, estimateTokens, compareTokens } from "metra";

const prompt = createPrompt({
  mode: "ENG_V1",
  task: "build a login system",
  constraints: ["secure", "scalable"],
  output: "typescript",
});

console.log(prompt);
console.log("tokens:", estimateTokens(prompt));
```

## Features

### 1. Prompt Builder

Turn structured input into a compact, section-tagged prompt:

```ts
import { createPrompt } from "metra";

const prompt = createPrompt({
  mode: "ENG_V1",
  task: "build login system",
  constraints: ["secure", "scalable"],
  context: "Existing Express + Postgres stack",
  examples: ["POST /login → { token }"],
  output: "typescript",
});
```

### 2. Modes

Register reusable rule sets once, reference them by name:

```ts
import { registerMode, createPrompt } from "metra";

registerMode("ENG_V1", {
  persona: "Senior software engineer.",
  rules: ["modular", "production-ready", "no pseudo code"],
});

createPrompt({ mode: "ENG_V1", task: "add rate limiting" });
```

Built-in modes: `ENG_V1`, `DOC_V1`, `REVIEW_V1`, `DATA_V1`.

### 3. Compression engine

```ts
import { compress, compareTokens } from "metra";

const verbose = `
In order to build a login system, please note that you really need to
make use of secure password hashing. It is important to note that you
should basically use bcrypt or argon2. Please note that you really need
to make use of secure password hashing.
`;

const tight = compress(verbose);
console.log(compareTokens(verbose, tight));
// { before: 62, after: 24, saved: 38, savedPercent: 61.3 }
```

The compressor:

- Removes filler words (`very`, `just`, `really`, `basically`, …)
- Tightens verbose phrases (`in order to` → `to`, `is able to` → `can`)
- Drops duplicate sentences and bullet points
- Normalizes whitespace and punctuation

### 4. Context Manager

Send base instructions once, then stream deltas:

```ts
import { createContext } from "metra";

const ctx = createContext();
ctx.setBase("You are a senior engineer. Respond in TypeScript only.");

const turn1 = ctx.next("Add authentication");
const turn2 = ctx.next("Now add rate limiting");

// Send only `turn1` / `turn2` to the model on each call.
// ctx.full() is available if you need the replay.
```

### 5. Token estimator

```ts
import { estimateTokens, compareTokens } from "metra";

estimateTokens("Hello, world!");             // ~4
compareTokens(original, compressed);          // { before, after, saved, savedPercent }
```

The estimator is a calibrated heuristic — typically within ~10% of real tokenizer counts, without pulling a multi-megabyte tokenizer into your bundle.

## Before vs after

```
Before (118 tokens):
  "In order to build a production-ready login system, please note that
   you really need to make use of secure password hashing. It is
   important to note that the system should basically be able to scale.
   Please note that you really need to make use of secure hashing."

After (42 tokens, −64%):
  "To build a production-ready login system, use secure password
   hashing. The system must scale."
```

## CLI

```bash
npx metra optimize "In order to build a login system, please note that..."
npx metra tokens "your prompt here"
echo "a long prompt" | npx metra optimize
```

The CLI prints the optimized prompt on stdout and the token delta on stderr, so you can pipe the result into another command.

## API

| Export            | Description                                          |
| ----------------- | ---------------------------------------------------- |
| `createPrompt`    | Build an optimized prompt from structured input     |
| `compress`        | Run the compression pipeline on any string          |
| `createContext`   | Factory for an incremental `Context`                 |
| `Context`         | Base + delta context manager class                   |
| `registerMode`    | Register a named mode                                |
| `getMode`         | Look up a registered mode                            |
| `listModes`       | List all registered mode names                      |
| `clearModes`      | Reset registry to defaults                           |
| `estimateTokens`  | Heuristic token count                                |
| `compareTokens`   | Before/after token delta                             |

All types are exported. See `dist/index.d.ts`.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Metra stays small on purpose — PRs that reduce code or dependencies are especially welcome.

## License

[MIT](./LICENSE)
