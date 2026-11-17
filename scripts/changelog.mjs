#!/usr/bin/env node
/**
 * Add a desktop changelog entry and optionally bump the desktop version.
 *
 * Usage:
 *   node scripts/changelog.mjs --bump patch --notes-file notes.md
 *   node scripts/changelog.mjs --version 0.2.0 --notes-file notes.md
 *   node scripts/changelog.mjs --bump minor --notes "### Added\n\n- Thing"
 *
 * The workflow_dispatch "Desktop Changelog" workflow runs this script on a
 * temporary branch and opens a pull request. The script never pushes or opens
 * a pull request itself.
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const changelogPath = join(root, "CHANGELOG.md");
const desktopPackagePath = join(root, "apps/desktop/package.json");

const options = {
  bump: null,
  version: null,
  notesFile: null,
  notes: null,
  dryRun: false,
};

const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  switch (argument) {
    case "--bump":
      options.bump = args[++index];
      break;
    case "--version":
      options.version = args[++index];
      break;
    case "--notes-file":
      options.notesFile = args[++index];
      break;
    case "--notes":
      options.notes = args[++index];
      break;
    case "--dry-run":
      options.dryRun = true;
      break;
    default:
      fail(`Unknown argument "${argument}".`);
  }
}

if (Boolean(options.bump) === Boolean(options.version)) {
  fail("Choose either --bump <patch|minor|major> or --version <x.y.z>.");
}
if (options.bump && !["patch", "minor", "major"].includes(options.bump)) {
  fail("--bump must be patch, minor, or major.");
}
if (Boolean(options.notesFile) === Boolean(options.notes)) {
  fail("Supply either --notes-file <path> or --notes <markdown>.");
}

const desktopPackage = JSON.parse(readFileSync(desktopPackagePath, "utf8"));
const currentVersion = desktopPackage.version;
const nextVersion =
  options.version ?? bumpVersion(currentVersion, options.bump);

if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(nextVersion)) {
  fail(`"${nextVersion}" is not a stable major.minor.patch version.`);
}
if (compareVersions(nextVersion, currentVersion) < 0) {
  fail(
    `The requested version ${nextVersion} is older than the current desktop version ${currentVersion}.`,
  );
}

const notes = (
  options.notesFile
    ? readFileSync(resolve(process.cwd(), options.notesFile), "utf8")
    : options.notes
).trim();
if (!notes) fail("The changelog notes are empty.");

const changelog = readFileSync(changelogPath, "utf8");
const heading = `## desktop-v${nextVersion} - ${formatDate(new Date())}`;
if (
  new RegExp(`^## \\[?desktop-v${escapeRegExp(nextVersion)}\\]?`, "m").test(
    changelog,
  )
) {
  fail(`CHANGELOG.md already has an entry for desktop-v${nextVersion}.`);
}

const section = `${heading}\n\n${notes}\n`;
const updatedChangelog = insertSection(changelog, section);

if (options.dryRun) {
  console.log(`Would write ${changelogPath}:\n`);
  console.log(section);
  if (nextVersion !== currentVersion) {
    console.log(
      `Would set apps/desktop/package.json version ${currentVersion} -> ${nextVersion}.`,
    );
  }
  process.exit(0);
}

writeFileSync(changelogPath, updatedChangelog);
if (nextVersion !== currentVersion) {
  desktopPackage.version = nextVersion;
  writeFileSync(
    desktopPackagePath,
    `${JSON.stringify(desktopPackage, null, 2)}\n`,
  );
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${nextVersion}\n`);
}
console.log(`Added CHANGELOG.md entry for desktop-v${nextVersion}.`);
if (nextVersion !== currentVersion) {
  console.log(`Bumped apps/desktop/package.json to ${nextVersion}.`);
}

function insertSection(changelog, section) {
  const header = /^# Changelog\s*\n/.exec(changelog);
  if (!header) {
    return `# Changelog\n\n${section}\n${changelog}`;
  }
  const start = header.index + header[0].length;
  const rest = changelog.slice(start).replace(/^\s*\n/, "");
  return `${changelog.slice(0, start)}\n${section}\n${rest}`;
}

function bumpVersion(version, bump) {
  const [major, minor, patch] = version.split(".").map(Number);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function compareVersions(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(message) {
  console.error(`changelog: ${message}`);
  process.exit(1);
}
