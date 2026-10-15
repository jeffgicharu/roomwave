import { readFileSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";

import { defineConfig } from "vitest/config";

// Tests run against a real PostgreSQL and Redis. Locally the settings come
// from .env.test; in CI from the workflow's environment.
const fromFile = existsSync(".env.test") ? parseEnv(readFileSync(".env.test", "utf8")) : {};

export default defineConfig({
  test: {
    env: { ...fromFile, NODE_ENV: "test" } as Record<string, string>,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
