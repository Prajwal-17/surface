#!/usr/bin/env node
/**
 * Extract Surface release notes from CHANGELOG.md.
 *
 * Usage:
 *   node scripts/release-notes.mjs 0.1.0
 *   node scripts/release-notes.mjs --check
 *   node scripts/release-notes.mjs --backfill [--apply]
 *
 * The release workflow uses the positional form to attach reviewed notes to a
 * GitHub release. `--check` validates the current apps/desktop version, and
 * `--backfill` previews or applies notes to existing desktop-vX.Y.Z releases.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const changelogPath = join(root, "CHANGELOG.md");
const desktopPackagePath = join(root, "apps/desktop/package.json");

const args = process.argv.slice(2);
const options = {
  version: null,
  check: false,
  backfill: false,
  apply: false,
  repo:
    process.env.GITHUB_REPOSITORY ||
    readHomepage().match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/)?.[1] ||
    "Prajwal-17/surface",
};

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === "--check") {
    options.check = true;
  } else if (argument === "--backfill") {
    options.backfill = true;
  } else if (argument === "--apply") {
    options.apply = true;
  } else if (argument === "--repo") {
    options.repo = args[++index];
    if (!options.repo) fail("--repo requires owner/name.");
  } else if (argument.startsWith("--repo=")) {
    options.repo = argument.slice("--repo=".length);
  } else if (argument.startsWith("-")) {
    fail(`Unknown option "${argument}".`);
  } else if (!options.version) {
    options.version = argument;
  } else {
    fail(`Unexpected argument "${argument}".`);
  }
}

if (options.apply && !options.backfill) {
  fail("--apply requires --backfill.");
}
if (options.backfill && (options.version || options.check)) {
  fail("--backfill cannot be combined with a version or --check.");
}

const changelog = readFileSync(changelogPath, "utf8");

if (options.check) {
  const version = readDesktopVersion();
  ensureReleaseNotes(version);
  console.log(`CHANGELOG.md has an entry for desktop-v${version}.`);
} else if (options.backfill) {
  backfill();
} else if (options.version) {
  process.stdout.write(formatReleaseNotes(options.version));
} else {
  fail("Supply a version, --check, or --backfill. See the script header.");
}

function formatReleaseNotes(version) {
  const section = ensureReleaseNotes(version);
  return [
    "## What's changed",
    "",
    section,
    "",
    `[View all releases](https://github.com/${options.repo}/releases)`,
    "",
  ].join("\n");
}

function ensureReleaseNotes(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    fail(`"${version}" is not a stable major.minor.patch version.`);
  }
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = changelog.match(
    new RegExp(
      `^## \\[?(?:desktop-v)?${escaped}\\]?(?:\\s+-[^\\n]*)?\\s*\\n(.*?)(?=^## |(?![\\s\\S]))`,
      "ms",
    ),
  );
  if (!match || !match[1].trim()) {
    fail(
      `Missing nonempty CHANGELOG.md entry for desktop-v${version}. Add "## desktop-v${version} - <date>" before releasing.`,
    );
  }
  return match[1].trim();
}

function backfill() {
  const releases = JSON.parse(
    execFileSync(
      "gh",
      [
        "release",
        "list",
        "--repo",
        options.repo,
        "--limit",
        "100",
        "--json",
        "tagName",
      ],
      { encoding: "utf8" },
    ),
  );

  // Validate every entry before making any remote change.
  const prepared = [];
  for (const release of releases) {
    const match = /^desktop-v(\d+\.\d+\.\d+)$/.exec(release.tagName);
    if (match) {
      prepared.push({
        tag: release.tagName,
        notes: formatReleaseNotes(match[1]),
      });
    }
  }

  if (!options.apply) {
    for (const release of prepared) {
      process.stdout.write(`--- ${release.tag} ---\n${release.notes}\n`);
    }
    console.log(
      `Previewed ${prepared.length} release(s). No GitHub changes made. Use --backfill --apply after verification.`,
    );
    return;
  }

  for (const release of prepared) {
    execFileSync(
      "gh",
      [
        "release",
        "edit",
        release.tag,
        "--repo",
        options.repo,
        "--notes-file",
        "-",
      ],
      { input: release.notes, stdio: ["pipe", "inherit", "inherit"] },
    );
    console.log(`Updated ${release.tag}`);
  }
}

function readDesktopVersion() {
  return JSON.parse(readFileSync(desktopPackagePath, "utf8")).version;
}

function readHomepage() {
  try {
    return JSON.parse(readFileSync(desktopPackagePath, "utf8")).homepage ?? "";
  } catch {
    return "";
  }
}

function fail(message) {
  console.error(`release-notes: ${message}`);
  process.exit(1);
}
