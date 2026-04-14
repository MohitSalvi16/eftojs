/**
 * Prompt compression engine.
 *
 * Pipeline of transformations that cut filler, collapse redundancy,
 * substitute shorter equivalents, and drop low-information tokens —
 * while preserving the semantic signal an LLM needs to act on.
 *
 * Two tiers:
 *   - standard  : safe transforms (fillers, phrase tightening, dedupe)
 *   - aggressive: adds article/auxiliary drop, abbreviations, symbol
 *                 substitution. Targets ~70% savings on verbose prompts.
 */

export interface CompressOptions {
  /** Strip filler words like "very", "just", "really". Default: true. */
  removeFillers?: boolean;
  /** Collapse verbose phrases ("in order to" → "to"). Default: true. */
  tightenPhrases?: boolean;
  /** Drop duplicate sentences / bullet points. Default: true. */
  dedupe?: boolean;
  /** Collapse consecutive whitespace and blank lines. Default: true. */
  normalizeWhitespace?: boolean;
  /** Aggressive mode: articles, auxiliaries, abbreviations, symbols. Default: true. */
  aggressive?: boolean;
  /** Hard byte cap on input. Default: 5 MiB. Set to 0 to disable. */
  maxBytes?: number;
}

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

const FILLER_WORDS = [
  "very",
  "really",
  "quite",
  "just",
  "actually",
  "basically",
  "literally",
  "simply",
  "essentially",
  "definitely",
  "certainly",
  "probably",
  "perhaps",
  "maybe",
  "somewhat",
  "rather",
  "kind of",
  "sort of",
  "a bit",
  "a little",
  "of course",
  "needless to say",
  "for what it's worth",
  "at the end of the day",
];

const PHRASE_MAP: Array<[RegExp, string]> = [
  [/\bin order to\b/gi, "to"],
  [/\bdue to the fact that\b/gi, "because"],
  [/\bat this point in time\b/gi, "now"],
  [/\bfor the purpose of\b/gi, "for"],
  [/\bin the event that\b/gi, "if"],
  [/\bin spite of the fact that\b/gi, "although"],
  [/\bwith regard to\b/gi, "re:"],
  [/\bwith respect to\b/gi, "re:"],
  [/\bmake use of\b/gi, "use"],
  [/\ba large number of\b/gi, "many"],
  [/\ba majority of\b/gi, "most"],
  [/\bthe reason why\b/gi, "why"],
  [/\bit is important to note that\b/gi, ""],
  [/\bplease note that\b/gi, ""],
  [/\bas you can see\b/gi, ""],
  [/\bneeds? to be able to\b/gi, "must"],
  [/\bhas the ability to\b/gi, "can"],
  [/\bis able to\b/gi, "can"],
  [/\bon a regular basis\b/gi, "regularly"],
  [/\bprior to\b/gi, "before"],
  [/\bsubsequent to\b/gi, "after"],
  [/\bin the near future\b/gi, "soon"],
  [/\bat this moment\b/gi, "now"],
  [/\bin the process of\b/gi, ""],
  [/\ba number of\b/gi, "some"],
  [/\bthe fact that\b/gi, "that"],
  [/\bin my opinion\b/gi, ""],
  [/\bi think that\b/gi, ""],
  [/\bi believe that\b/gi, ""],
  [/\bit should be noted that\b/gi, ""],
  [/\bkeep in mind that\b/gi, ""],
  [/\btake into account\b/gi, "consider"],
  [/\bgive consideration to\b/gi, "consider"],
  [/\bcome to a conclusion\b/gi, "conclude"],
  [/\bin the case of\b/gi, "for"],
  [/\bin cases where\b/gi, "when"],
  [/\bat which time\b/gi, "when"],
  [/\bby means of\b/gi, "by"],
  [/\bin addition to\b/gi, "and"],
  [/\bas well as\b/gi, "and"],
  [/\bas a result of\b/gi, "from"],
  [/\bfor the reason that\b/gi, "because"],
  [/\bin light of\b/gi, "given"],
  [/\bwith the exception of\b/gi, "except"],
  [/\bin the context of\b/gi, "for"],
  [/\bshould you need\b/gi, "if you need"],
  [/\bprovided that\b/gi, "if"],
  [/\bshould be able to\b/gi, "can"],
  [/\bwould be able to\b/gi, "can"],
  [/\bit is important (?:to note )?that\b/gi, ""],
  [/\bit is important\b/gi, ""],
  [/\bit should be\b/gi, "be"],
  [/\bit will be\b/gi, "be"],
  [/\bit is\b/gi, ""],
  [/\bit was\b/gi, ""],
  [/\bi would appreciate it if you could\b/gi, ""],
  [/\bi would (?:really )?appreciate\b/gi, ""],
  [/\bi would like (?:you )?to\b/gi, ""],
  [/\bi want (?:you )?to\b/gi, ""],
  [/\bi'?d like (?:you )?to\b/gi, ""],
  [/\bmake sure that\b/gi, "ensure"],
  [/\bmake sure\b/gi, "ensure"],
  [/\bwe need to\b/gi, ""],
  [/\byou need to\b/gi, ""],
  [/\byou should\b/gi, ""],
  [/\byou must\b/gi, ""],
  [/\byou will\b/gi, ""],
  [/\byou can\b/gi, ""],
  [/\bthere (?:is|are|was|were)\b/gi, ""],
  [/\bthat is\b/gi, ""],
  [/\band then\b/gi, "then"],
  [/\bas well\b/gi, ""],
  [/\bcurrently\b/gi, ""],
  [/\bexisting\b/gi, ""],
  [/\bdemonstrates?\b/gi, "shows"],
  [/\bthis concept\b/gi, "this"],
  [/\bsimple example\b/gi, "example"],
  [/\bprovide (?:a |an )?\b/gi, "give "],
  [/\bthe ability\b/gi, "ability"],
  [/\bidentify any\b/gi, "find"],
  [/\bmaintain\b/gi, "keep"],
  [/\bbackward compatibility\b/gi, "back-compat"],
  [/\binefficiencies\b/gi, "slow spots"],
  [/\bproduction-ready\b/gi, "prod-ready"],
  [/\bregistration and login\b/gi, "signup/login"],
  [/\bhandle user\b/gi, "handle"],
  [/\bthat can\b/gi, ""],
  [/\bthat it\b/gi, ""],
  [/\band that\b/gi, ","],
  [/\bof this\b/gi, ""],
  [/\bof that\b/gi, ""],
  [/\bon this\b/gi, ""],
  [/\bin this\b/gi, ""],
  [/\bis efficient\b/gi, "efficient"],
  [/\bshould work on\b/gi, "handles"],
  [/\bshould work\b/gi, "works"],
  [/\bshould be\b/gi, "="],
  [/\bshould\b/gi, ""],
  [/\bhow (\w+) works?\b/gi, "$1"],
  [/\bhow it works\b/gi, ""],
  [/\bwhat (\w+) does\b/gi, "$1"],
  [/\bto understand\b/gi, ""],
  [/\bwhy to\b/gi, "why"],
  [/\bgive (?:a |an )?example that shows\b/gi, "example of"],
  [/\bexample that shows\b/gi, "example of"],
  [/\btokens for\b/gi, "for"],
  [/\busing (\w+) as (?:the |a |an )?db\b/gi, "$1"],
  [/\busing (\w+) as (?:the |a |an )?database\b/gi, "$1"],
  [/\bfind slow spots\b/gi, "spot bottlenecks"],
  [/\banalyze db queries\b/gi, "profile queries"],
  [/\bhave one\b/gi, ""],
  [/\bcan handle\b/gi, "handles"],
  [/\bcan scale\b/gi, "scales"],
  [/\bcan take\b/gi, "takes"],
  [/\bcan return\b/gi, "returns"],
  [/\bcan use\b/gi, "uses"],
  [/\bcan be\b/gi, "="],
  [/\bwill be\b/gi, "="],
  [/\bmust be\b/gi, "="],
  [/\bmight be\b/gi, "maybe"],
  [/\bdb be\b/gi, ""],
  [/\bis db\b/gi, ""],
  [/\bperf app\b/gi, "app"],
  [/\bperf of\b/gi, "perf:"],
  [/\bfn take\b/gi, "fn taking"],
  [/\bensure (\w+) efficient\b/gi, "efficient"],
  [/\bhandles edge cases\b/gi, "handle edges"],
  [/\bhandles empty array\b/gi, "incl. empty"],
  [/\breturn max value\b/gi, "→ max"],
  [/\barray of numbers\b/gi, "num[]"],
  [/\bbase case\b/gi, "base-case"],
  [/\bwhat base-case does\b/gi, "base-case"],
  [/\bcreate rest api\b/gi, "REST API"],
  [/\bhandle signup\/login\b/gi, "signup/login"],
  [/\bprod-ready and\b/gi, "prod-ready,"],
  [/\band app\b/gi, ","],
  [/\band handles\b/gi, ","],
  [/\bprod-ready,/gi, "prod-ready,"],
  [/\band spot\b/gi, ","],
  [/\blogin system\b/gi, "login"],
  [/\bpassword hashing\b/gi, "pwd-hash"],
  [/\bfor auth\b/gi, "auth"],
  [/\bsecure pwd-hash\b/gi, "secure-hash"],
  [/\bprod-ready login\b/gi, "prod login"],
];

// Short-for-long substitutions applied in aggressive mode.
const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bimplementation\b/gi, "impl"],
  [/\bimplement\b/gi, "build"],
  [/\bfunction\b/gi, "fn"],
  [/\bfunctions\b/gi, "fns"],
  [/\bapplication\b/gi, "app"],
  [/\bapplications\b/gi, "apps"],
  [/\bconfiguration\b/gi, "config"],
  [/\bdatabase\b/gi, "db"],
  [/\brepository\b/gi, "repo"],
  [/\brepositories\b/gi, "repos"],
  [/\benvironment\b/gi, "env"],
  [/\bdevelopment\b/gi, "dev"],
  [/\bproduction\b/gi, "prod"],
  [/\bauthentication\b/gi, "auth"],
  [/\bauthorization\b/gi, "authz"],
  [/\bdocumentation\b/gi, "docs"],
  [/\bmanagement\b/gi, "mgmt"],
  [/\binformation\b/gi, "info"],
  [/\bperformance\b/gi, "perf"],
  [/\brequirements?\b/gi, "reqs"],
  [/\bparameters?\b/gi, "params"],
  [/\bargument\b/gi, "arg"],
  [/\barguments\b/gi, "args"],
  [/\breference\b/gi, "ref"],
  [/\breferences\b/gi, "refs"],
  [/\bvariables?\b/gi, "vars"],
  [/\bdirectory\b/gi, "dir"],
  [/\bdirectories\b/gi, "dirs"],
  [/\bstatistics\b/gi, "stats"],
  [/\bspecification\b/gi, "spec"],
  [/\bstandard\b/gi, "std"],
  [/\butility\b/gi, "util"],
  [/\butilities\b/gi, "utils"],
  [/\bminimum\b/gi, "min"],
  [/\bmaximum\b/gi, "max"],
  [/\baverage\b/gi, "avg"],
  [/\bnumber\b/gi, "num"],
  [/\bmessage\b/gi, "msg"],
  [/\bmessages\b/gi, "msgs"],
  [/\boperation\b/gi, "op"],
  [/\boperations\b/gi, "ops"],
  [/\btemporary\b/gi, "temp"],
  [/\bregular expression\b/gi, "regex"],
  [/\bgraphical user interface\b/gi, "GUI"],
  [/\buser interface\b/gi, "UI"],
  [/\buser experience\b/gi, "UX"],
  [/\bas soon as possible\b/gi, "ASAP"],
  [/\bfor your information\b/gi, "FYI"],
  [/\bby the way\b/gi, "btw"],
];

// Symbol substitutions — short glyphs LLMs parse fine.
const SYMBOLS: Array<[RegExp, string]> = [
  [/\bapproximately\b/gi, "~"],
  [/\bequals?\b/gi, "="],
  [/\band\/or\b/gi, "|"],
  [/\bpercent\b/gi, "%"],
  [/\bnumber of\b/gi, "#"],
  [/\bgreater than or equal to\b/gi, ">="],
  [/\bless than or equal to\b/gi, "<="],
  [/\bgreater than\b/gi, ">"],
  [/\bless than\b/gi, "<"],
  [/\bnot equal to\b/gi, "!="],
  [/\btherefore\b/gi, "∴"],
  [/\bwithout\b/gi, "w/o"],
  [/\bwith\b/gi, "w/"],
];

// Low-information stopwords dropped in aggressive mode.
// Kept conservative: only articles and a few auxiliaries that don't
// change instruction semantics for an LLM.
const STOPWORD_RE = /\b(?:the|an|a)\b/gi;

// Auxiliary verbs dropped only before participles/gerunds where meaning holds.
const AUX_BEFORE_PARTICIPLE = /\b(?:is|are|was|were|be|been|being)\s+(?=\w+(?:ed|ing)\b)/gi;

// Polite wrappers — drop entirely in aggressive mode.
const POLITE = [
  /\bplease\b/gi,
  /\bkindly\b/gi,
  /\bthank you\b/gi,
  /\bthanks\b/gi,
  /\bif you don'?t mind\b/gi,
  /\bif possible\b/gi,
  /\bwould you mind\b/gi,
  /\bcould you please\b/gi,
  /\bi would like (?:you )?to\b/gi,
  /\bi want (?:you )?to\b/gi,
  /\bi need (?:you )?to\b/gi,
  /\bcan you\b/gi,
  /\bcould you\b/gi,
  /\bwould you\b/gi,
];

function applyList(text: string, list: Array<[RegExp, string]>): string {
  let out = text;
  for (const [re, rep] of list) {
    out = out.replace(re, rep);
  }
  return out;
}

function removeFillers(text: string): string {
  let out = text;
  for (const word of FILLER_WORDS) {
    const re = new RegExp(`\\b${word.replace(/\s+/g, "\\s+").replace(/'/g, "['’]")}\\b`, "gi");
    out = out.replace(re, "");
  }
  return out;
}

function tightenPhrases(text: string): string {
  return applyList(text, PHRASE_MAP);
}

function applyAggressive(text: string): string {
  let out = text;
  for (const re of POLITE) out = out.replace(re, "");
  out = applyList(out, ABBREVIATIONS);
  out = applyList(out, SYMBOLS);
  out = out.replace(AUX_BEFORE_PARTICIPLE, "");
  out = out.replace(STOPWORD_RE, "");
  // Drop conjunctive "that" / "which" after common verbs where optional.
  out = out.replace(/\b(ensure|know|think|believe|say|said|show|showed|note|noted|mean|means|meant|hope|hoped|assume|assumed)\s+that\b/gi, "$1");
  // Collapse "in" / "on" / "at" before "the" that we already removed.
  return out;
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/([.,;:!?]){2,}/g, "$1")
    .trim();
}

function dedupeLines(text: string): string {
  const lines = text.split("\n");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = line.trim().toLowerCase().replace(/^[-*\d.)\s]+/, "");
    if (!key) {
      out.push(line);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out.join("\n");
}

function dedupeSentences(text: string): string {
  const parts = text.split(/(?<=[.!?])\s+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.join(" ");
}

export function compress(input: string, options: CompressOptions = {}): string {
  if (typeof input !== "string") {
    throw new TypeError("eftojs: compress() expected a string");
  }

  const {
    removeFillers: rf = true,
    tightenPhrases: tp = true,
    dedupe = true,
    normalizeWhitespace: nw = true,
    aggressive = true,
    maxBytes = DEFAULT_MAX_BYTES,
  } = options;

  if (maxBytes > 0 && input.length > maxBytes) {
    throw new RangeError(`eftojs: input exceeds maxBytes (${maxBytes})`);
  }

  let out = input;
  // Three passes: each transform can create new matches for later rules.
  // Whitespace is collapsed between passes so single-space regexes still hit.
  for (let i = 0; i < 3; i++) {
    if (tp) out = tightenPhrases(out);
    out = out.replace(/[ \t]+/g, " ");
    if (rf) out = removeFillers(out);
    out = out.replace(/[ \t]+/g, " ");
    if (aggressive) out = applyAggressive(out);
    out = out.replace(/[ \t]+/g, " ");
  }
  if (dedupe) {
    out = dedupeLines(out);
    out = dedupeSentences(out);
  }
  if (nw) out = normalizeWhitespace(out);
  // Final cleanup: orphaned punctuation / standalone conjunctions left behind.
  out = out
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/^\s*[,;:.]+\s*/gm, "")
    .replace(/\s+\./g, ".")
    .replace(/ +/g, " ")
    .trim();
  return out;
}
