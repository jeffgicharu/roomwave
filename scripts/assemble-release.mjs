// Puts a built release together in release/:
//
//   release/public/   the marketing site and the app's static files, served by nginx
//   release/server/   the bundled server and worker with their production packages
//   release/REVISION  the commit this release was built from
//
// Run after `pnpm build`. The release is then uploaded as one folder.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const out = join(root, "release");
const site = join(root, "apps/site/dist");
const app = join(root, "apps/app/build");

for (const [name, dir] of [
  ["marketing site", site],
  ["app", app],
  ["server", join(root, "apps/server/dist")],
]) {
  if (!existsSync(dir)) throw new Error(`The ${name} has not been built (${relative(root, dir)} is missing). Run pnpm build first.`);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "public"), { recursive: true });

function files(dir, base = dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path, base) : [relative(base, path)];
  });
}

// The two static builds share one folder. They must never write the same file.
const siteFiles = new Set(files(site));
const clashes = files(app).filter((file) => siteFiles.has(file));
if (clashes.length) throw new Error(`The site and the app both produce: ${clashes.join(", ")}`);
cpSync(site, join(out, "public"), { recursive: true });
cpSync(app, join(out, "public"), { recursive: true });

execFileSync("pnpm", ["--filter", "@roomwave/server", "deploy", "--prod", "--no-optional", "--legacy", join(out, "server")], {
  cwd: root,
  stdio: "inherit",
});

const revision = process.env.RELEASE ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
writeFileSync(join(out, "REVISION"), `${revision}\n`);

const required = [
  "public/index.html",
  "public/404.html",
  "public/app-shell.html",
  "public/unavailable.html",
  "public/robots.txt",
  "public/sitemap-index.xml",
  "public/site.webmanifest",
  "server/dist/web.mjs",
  "server/dist/worker.mjs",
  "server/dist/migrate.mjs",
  "server/dist/seed.mjs",
  "server/dist/check-release.mjs",
  "server/assets/fonts/instrument-sans-latin-400-normal.woff",
];
const missing = required.filter((file) => !existsSync(join(out, file)));
if (missing.length) throw new Error(`The release is missing: ${missing.join(", ")}`);

console.log(`Release ${revision.slice(0, 7)} assembled in ${relative(root, out)}/ (${files(join(out, "public")).length} public files).`);
