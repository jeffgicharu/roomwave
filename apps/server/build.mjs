// Bundles the server's own code (and the shared package) into a few files.
// Packages from npm stay outside the bundle and are installed beside it.
import { readFileSync } from "node:fs";

import { build } from "esbuild";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith("@roomwave/"));

await build({
  entryPoints: {
    web: "src/web.ts",
    worker: "src/worker.ts",
    migrate: "src/tools/migrate.ts",
    seed: "src/tools/seed.ts",
    "check-release": "src/tools/check-release.ts",
  },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  sourcemap: true,
  external: [...external, "pg-native"],
  // Some dependencies still use require(); give ESM bundles a working one.
  banner: { js: "import { createRequire as __rwRequire } from 'node:module'; const require = __rwRequire(import.meta.url);" },
  logLevel: "info",
});
