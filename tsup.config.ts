import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    sourcemap: true,
    minify: false,
    target: "es2022",
    outDir: "dist",
  },
  {
    entry: { cli: "src/cli/index.ts" },
    format: ["esm"],
    dts: false,
    sourcemap: false,
    minify: false,
    target: "es2022",
    outDir: "dist",
    banner: { js: "#!/usr/bin/env node" },
  },
]);
