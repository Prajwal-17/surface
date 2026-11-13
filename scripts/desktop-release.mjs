#!/usr/bin/env node
/**
 * Linux desktop release helper for Surface.
 *
 * This script is intentionally dependency-free so CI can run it immediately
 * after checkout. It owns version/tag validation, release artifact discovery,
 * SHA-256 checksums, the staged Playwright Chromium check, and the fresh-profile
 * AppImage smoke test. Packaging itself stays in apps/desktop/package.json,
 * which is owned by the desktop implementation.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  createReadStream,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktopDirectory = join(root, "apps/desktop");
const releaseDirectory = join(desktopDirectory, "release");
const desktopPackage = readDesktopPackage();
const version = desktopPackage.version;
const expectedTag = `desktop-v${version}`;
const require = createRequire(import.meta.url);

await main().catch((error) => {
  console.error(`desktop-release: ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  const args = process.argv.slice(2);
  const command = args.shift();

  if (!command || command === "help" || command === "--help") {
    usage();
    return;
  }

  const options = parseOptions(args);
  validateVersion();
  if (options.tag) assertTag(options.tag);

  switch (command) {
    case "version":
      console.log(version);
      return;
    case "package":
      await packageApp(options);
      return;
    case "manifest":
      await writeBuildInfo(options.tag);
      printBuildInfo();
      return;
    case "checksums":
      printChecksums(await writeChecksums());
      return;
    case "verify-build":
      await verifyBuild();
      return;
    case "smoke":
      await smokeTest();
      return;
    default:
      throw new Error(
        `Unknown command "${command}". Run "node scripts/desktop-release.mjs help".`,
      );
  }
}

function usage() {
  console.log(`Usage: node scripts/desktop-release.mjs <command> [--tag <tag>]

Commands:
  version       Print the apps/desktop/package.json version.
  package       Clean apps/desktop/release, run the desktop production build,
                write BUILD-INFO.json, then write SHA256SUMS.
  manifest      Write apps/desktop/release/BUILD-INFO.json for existing artifacts.
  checksums     Verify existing artifacts and write apps/desktop/release/SHA256SUMS.
  verify-build  Launch the staged Playwright Chromium with the system libraries.
  smoke         Extract and run the AppImage with Xvfb, a new temporary profile,
                and SURFACE_DESKTOP_SMOKE_TEST=1.

Options:
  --tag <tag>   Require the tag to equal desktop-v<version>.
`);
}

function parseOptions(args) {
  const options = { tag: null };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--tag") {
      const value = args[index + 1];
      if (!value) throw new Error("--tag requires a value.");
      options.tag = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--tag=")) {
      options.tag = argument.slice("--tag=".length);
      continue;
    }
    throw new Error(`Unknown option "${argument}".`);
  }
  return options;
}

function readDesktopPackage() {
  const path = join(desktopDirectory, "package.json");
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${path}: ${error.message}`);
  }
}

function validateVersion() {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error(
      `apps/desktop/package.json version "${version}" is not a stable major.minor.patch version.`,
    );
  }
}

function assertTag(tag) {
  if (tag !== expectedTag) {
    throw new Error(
      `Release tag "${tag}" does not match "${expectedTag}" from apps/desktop/package.json.`,
    );
  }
}

async function packageApp(options) {
  assertLinuxX64();
  const publish = desktopPackage.build?.publish;
  if (publish) {
    throw new Error(
      "apps/desktop/package.json build.publish is configured. Publishing must only happen in the release workflow.",
    );
  }

  console.log(`Building Surface ${version} for Linux x64...`);
  rmSync(releaseDirectory, { recursive: true, force: true });
  const result = spawnSync("bun", ["--cwd", "apps/desktop", "package"], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      // Never let a local or CI package step discover signing or publishing
      // credentials. Linux artifacts are unsigned.
      CSC_IDENTITY_AUTO_DISCOVERY: "false",
      GH_TOKEN: "",
      GITHUB_TOKEN: "",
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Desktop packaging exited with status ${result.status ?? "unknown"}.`,
    );
  }

  await writeBuildInfo(options.tag);
  printChecksums(await writeChecksums());
}

async function writeBuildInfo(tag) {
  const artifacts = findArtifacts();
  const buildInfoPath = join(releaseDirectory, "BUILD-INFO.json");
  const buildInfo = {
    schemaVersion: 1,
    product: "Surface",
    version,
    tag: tag || null,
    source: {
      repository: process.env.GITHUB_REPOSITORY || null,
      // The workflows pass the real checkout output because workflow_dispatch
      // GITHUB_SHA belongs to the branch the workflow ran from, not inputs.ref.
      commit:
        process.env.SURFACE_SOURCE_COMMIT ||
        gitOutput(["rev-parse", "HEAD"]) ||
        process.env.GITHUB_SHA ||
        null,
      ref:
        process.env.SURFACE_SOURCE_REF ||
        (process.env.GITHUB_EVENT_NAME === "push"
          ? process.env.GITHUB_REF || null
          : null),
      event: process.env.GITHUB_EVENT_NAME || null,
    },
    build: {
      workflow: process.env.GITHUB_WORKFLOW_REF || null,
      runId: process.env.GITHUB_RUN_ID || null,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
      runner: process.env.RUNNER_IMAGE || process.env.ImageOS || null,
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      bun: commandOutput("bun", ["--version"]),
    },
    generatedAt: new Date().toISOString(),
    artifacts: [],
  };
  for (const artifact of artifacts) {
    buildInfo.artifacts.push({
      name: artifact.name,
      bytes: statSync(artifact.path).size,
      sha256: await sha256File(artifact.path),
    });
  }
  writeFileSync(buildInfoPath, `${JSON.stringify(buildInfo, null, 2)}\n`, {
    mode: 0o644,
  });
  return buildInfo;
}

function printBuildInfo() {
  console.log(`Wrote ${join(releaseDirectory, "BUILD-INFO.json")}`);
}

async function writeChecksums() {
  const artifacts = findArtifacts();
  const buildInfoPath = join(releaseDirectory, "BUILD-INFO.json");
  const files = [
    ...artifacts,
    ...(existsSync(buildInfoPath)
      ? [{ name: "BUILD-INFO.json", path: buildInfoPath }]
      : []),
  ];
  const lines = [];
  for (const file of files) {
    lines.push(`${await sha256File(file.path)}  ${file.name}`);
  }
  const checksums = join(releaseDirectory, "SHA256SUMS");
  writeFileSync(checksums, `${lines.join("\n")}\n`, { mode: 0o644 });
  return { artifacts: files, checksums };
}

function printChecksums({ artifacts, checksums }) {
  console.log(
    `Verified ${artifacts.length} artifact(s) for Surface ${version}:`,
  );
  for (const artifact of artifacts) {
    console.log(
      `  ${artifact.name} (${formatBytes(statSync(artifact.path).size)})`,
    );
  }
  console.log(`Checksums: ${checksums}`);
}

function findArtifacts() {
  if (!existsSync(releaseDirectory)) {
    throw new Error(
      `Missing release directory ${releaseDirectory}. Run the desktop package command first.`,
    );
  }
  const artifactPattern = new RegExp(
    `^Surface-${escapeRegExp(version)}-(?:x86_64|amd64)\\.(?:AppImage|deb)$`,
  );
  const installerPattern = /\.(?:AppImage|deb|rpm|snap|dmg|pkg|exe|msi)$/i;
  const entries = readdirSync(releaseDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  const artifacts = entries.filter((name) => artifactPattern.test(name));
  const unexpected = entries.filter(
    (name) => installerPattern.test(name) && !artifactPattern.test(name),
  );

  if (unexpected.length) {
    throw new Error(
      `Unexpected installer artifact(s) in apps/desktop/release: ${unexpected.join(", ")}. Remove stale outputs before packaging.`,
    );
  }
  if (!artifacts.some((name) => name.endsWith(".AppImage"))) {
    throw new Error(
      `No Surface-${version}-*.AppImage was found in apps/desktop/release.`,
    );
  }

  return artifacts.map((name) => {
    const path = join(releaseDirectory, name);
    const size = statSync(path).size;
    if (!Number.isFinite(size) || size <= 0) {
      throw new Error(`Artifact ${name} is empty.`);
    }
    return { name, path };
  });
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function gitOutput(args) {
  return commandOutput("git", args);
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim() || null;
}

async function verifyBuild() {
  assertLinuxX64();
  const browsersPath = join(desktopDirectory, "build/playwright");
  if (!existsSync(browsersPath)) {
    throw new Error(
      `Missing staged Playwright browsers at ${browsersPath}. Run node apps/desktop/scripts/build.mjs first.`,
    );
  }
  const chromiumDirectories = readdirSync(browsersPath).filter((name) =>
    name.startsWith("chromium-"),
  );
  if (!chromiumDirectories.length) {
    throw new Error(`No Chromium directory was staged in ${browsersPath}.`);
  }

  const playwrightPath = join(
    desktopDirectory,
    "build/crawler/node_modules/playwright",
  );
  if (!existsSync(playwrightPath)) {
    throw new Error(
      `Missing crawler Playwright dependency at ${playwrightPath}. Run the desktop build first.`,
    );
  }

  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
  const { chromium } = require(playwrightPath);
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent("<title>Surface build verification</title>");
    const title = await page.title();
    if (title !== "Surface build verification") {
      throw new Error(`Unexpected test page title "${title}".`);
    }
    console.log(
      `Playwright Chromium ${browser.version()} launched from ${browsersPath}.`,
    );
  } finally {
    await browser.close();
  }
}

async function smokeTest() {
  assertLinuxX64();
  const appImage = findArtifacts().find((artifact) =>
    artifact.name.endsWith(".AppImage"),
  );
  const temporaryRoot = mkdtempSync(join(tmpdir(), "surface-desktop-smoke-"));
  const profile = join(temporaryRoot, "profile");
  console.log(`Smoke-testing ${appImage.name} with profile ${profile}`);

  const env = {
    ...process.env,
    APPIMAGE_EXTRACT_AND_RUN: "1",
    SURFACE_DESKTOP_SMOKE_TEST: "1",
    SURFACE_DESKTOP_USER_DATA: profile,
  };
  // A developer shell opened from another Electron app can inherit its
  // run-as-node and AppImage variables. The smoke test needs a real Electron
  // launch and the AppImage under test must own these variables.
  for (const name of [
    "APPIMAGE",
    "APPDIR",
    "ARGV0",
    "ELECTRON_NO_ATTACH_CONSOLE",
    "ELECTRON_PA_APP_NAME",
    "ELECTRON_RUN_AS_NODE",
    "OWD",
  ]) {
    delete env[name];
  }

  const result = spawnSync("xvfb-run", ["-a", appImage.path, "--no-sandbox"], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 20 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const extractionPrefix = join(tmpdir(), "appimage_extracted_");
  const relevantOutput = output
    .split(/\r?\n/)
    .filter((line) => !line.includes(extractionPrefix))
    .join("\n");
  if (result.error) {
    console.error(relevantOutput);
    throw new Error(
      `Could not run the AppImage smoke test: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    console.error(relevantOutput);
    throw new Error(
      `AppImage smoke test exited with status ${result.status} (profile kept at ${temporaryRoot}).`,
    );
  }
  if (!output.includes("SMOKE_READY")) {
    console.error(relevantOutput);
    throw new Error(
      `AppImage smoke test completed without SMOKE_READY (profile kept at ${temporaryRoot}).`,
    );
  }
  if (!existsSync(join(profile, "surface.sqlite3"))) {
    console.error(relevantOutput);
    throw new Error(
      `AppImage smoke test did not create a fresh SQLite database (profile kept at ${temporaryRoot}).`,
    );
  }

  const readyLine = output
    .split(/\r?\n/)
    .find((line) => line.includes("SMOKE_READY"));
  console.log(readyLine?.trim() ?? "SMOKE_READY");
  console.log(
    "Packaged backend created a fresh SQLite database and the smoke test passed.",
  );
  rmSync(temporaryRoot, { recursive: true, force: true });
}

function assertLinuxX64() {
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error(
      `Linux x64 is required; this host is ${process.platform}/${process.arch}.`,
    );
  }
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
