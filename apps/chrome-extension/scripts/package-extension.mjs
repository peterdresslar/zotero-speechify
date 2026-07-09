// Packages the built extension into the installable release zip at
// <repo>/build/zotero-speechify-extension-<version>.zip, after verifying
// that the build output satisfies the platform constraints that Chrome
// enforces only at runtime. Run via `pnpm run package` (which builds first).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "../..");
const distDir = join(appRoot, "dist");

function fail(message) {
  console.error(`package-extension: ${message}`);
  process.exit(1);
}

if (!existsSync(distDir)) {
  fail("dist/ not found — run the build first (pnpm run package does).");
}

// --- Manifest sanity ---------------------------------------------------

const manifest = JSON.parse(
  readFileSync(join(distDir, "manifest.json"), "utf8")
);
const pkg = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8"));

if (manifest.version !== pkg.version) {
  fail(
    `manifest version ${manifest.version} != package version ${pkg.version}.`
  );
}

const referencedFiles = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  manifest.options_page,
  ...(manifest.content_scripts ?? []).flatMap((entry) => entry.js ?? [])
].filter((file) => typeof file === "string");

for (const file of referencedFiles) {
  if (!existsSync(join(distDir, file))) {
    fail(`manifest references missing file: ${file}`);
  }
}

// --- Content-script constraint -----------------------------------------
// Content scripts load as classic scripts: a single `import` statement in
// the emitted bundle breaks them silently. This regressed once when shared
// code was imported and Rollup emitted a chunk import; never again.

for (const entry of manifest.content_scripts ?? []) {
  for (const scriptFile of entry.js ?? []) {
    const source = readFileSync(join(distDir, scriptFile), "utf8");

    if (/(^|[;}\s])import\s*[{("']/u.test(source)) {
      fail(
        `content script ${scriptFile} contains an import statement — it must be bundled self-contained.`
      );
    }
  }
}

// --- Zip ----------------------------------------------------------------
// Source maps stay in the local dist/ for debugging but are excluded from
// the release artifact (they roughly quadruple it and ship no user value).
// Requires the Info-ZIP `zip` binary (preinstalled on macOS/Linux; on
// Windows, run under WSL or install Info-ZIP).

const buildDir = join(repoRoot, "build");
const zipPath = join(buildDir, `zotero-speechify-extension-${pkg.version}.zip`);

mkdirSync(buildDir, { recursive: true });
rmSync(zipPath, { force: true });

try {
  execFileSync("zip", ["-qr", zipPath, ".", "-x", "*.map"], { cwd: distDir });
} catch (error) {
  if (error.code === "ENOENT") {
    fail(
      "the `zip` binary is required (preinstalled on macOS/Linux; on Windows use WSL or install Info-ZIP)."
    );
  }

  throw error;
}

console.log(`package-extension: checks passed, wrote ${zipPath}`);
