#!/usr/bin/env node
/**
 * Write SHA256SUMS and BUILD-INFO.json for a staged desktop build.
 *
 * Usage:
 *   node scripts/build-metadata.mjs --channel development
 *   node scripts/build-metadata.mjs --channel production --tag desktop-v0.2.0
 *
 * The script scans the staged release directory for Surface AppImage and
 * Debian package artifacts, writes SHA256SUMS next to them, and records the
 * build metadata in BUILD-INFO.json. It never uploads or publishes anything.
 */
import { createHash } from "node:crypto";
import {
  createReadStream,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { pipeline } from "node:stream/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseRoot = join(root, "apps/desktop/release");

const options = {
  channel: null,
  tag: null,
};

const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  switch (argument) {
    case "--channel":
      options.channel = args[++index];
      break;
    case "--tag":
      options.tag = args[++index];
      break;
    default:
      fail(`Unknown argument "${argument}".`);
  }
}

if (options.channel !== "development" && options.channel !== "production") {
  fail('--channel must be "development" or "production".');
}

const releaseDir =
  options.channel === "development" ? join(releaseRoot, "dev") : releaseRoot;

const environment = {
  repository: process.env.GITHUB_REPOSITORY ?? null,
  commit: process.env.SURFACE_SOURCE_COMMIT ?? null,
  ref: process.env.SURFACE_SOURCE_REF ?? null,
  workflow: process.env.GITHUB_WORKFLOW ?? null,
  runId: process.env.GITHUB_RUN_ID ? Number(process.env.GITHUB_RUN_ID) : null,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT
    ? Number(process.env.GITHUB_RUN_ATTEMPT)
    : null,
  runner: process.env.RUNNER_NAME ?? null,
};

const packageJson = JSON.parse(
  readFileSync(join(root, "apps/desktop/package.json"), "utf8"),
);

const artifacts = await Promise.all(
  readdirSync(releaseDir)
    .filter((name) => /^(Surface-(Dev-)?)\d.*\.(AppImage|deb)$/.test(name))
    .sort()
    .map(async (name) => {
      const path = join(releaseDir, name);
      const { size } = statSync(path);
      const sha256 = await sha256File(path);
      return { name, path, bytes: size, sha256 };
    }),
);

if (artifacts.length === 0) {
  fail(`No Surface installers found in ${releaseDir}.`);
}

const buildInfo = {
  schemaVersion: 1,
  product: options.channel === "development" ? "Surface Dev" : "Surface",
  channel: options.channel,
  version: packageJson.version,
  tag: options.tag,
  source: {
    repository: environment.repository,
    commit: environment.commit,
    ref: environment.ref,
    event: process.env.GITHUB_EVENT_NAME ?? null,
  },
  build: {
    workflow: environment.workflow,
    runId: environment.runId,
    runAttempt: environment.runAttempt,
    runner: environment.runner,
    platform: "linux",
    arch: "x64",
    node: process.version,
    bun: process.env.BUN_VERSION ?? null,
  },
  generatedAt: new Date().toISOString(),
  artifacts: artifacts.map(({ name, bytes, sha256 }) => ({
    name,
    bytes,
    sha256,
  })),
};

const buildInfoPath = join(releaseDir, "BUILD-INFO.json");
writeFileSync(buildInfoPath, `${JSON.stringify(buildInfo, null, 2)}\n`);

const checksumLines = [
  ...artifacts.map(({ name, sha256 }) => `${sha256}  ${name}`),
  `${await sha256File(buildInfoPath)}  BUILD-INFO.json`,
];
writeFileSync(join(releaseDir, "SHA256SUMS"), `${checksumLines.join("\n")}\n`);

console.info(`Wrote BUILD-INFO.json and SHA256SUMS in ${releaseDir}.`);
for (const { name, sha256 } of [...artifacts]) {
  console.info(`${sha256}  ${name}`);
}

async function sha256File(path) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

function fail(message) {
  console.error(`build-metadata: ${message}`);
  process.exit(1);
}
