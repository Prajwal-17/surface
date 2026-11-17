# Desktop builds and releases

Surface ships a single Linux desktop application: an Electron shell with a
local Node backend on SQLite and a local Crawlee/Playwright crawler. This
document covers the Ubuntu-only CI and production release automation. It does
not describe the web/PostgreSQL deployment.

## Scope

- **Supported host and target:** Ubuntu 24.04 x86_64 only. There are no
  macOS, Windows, or Linux ARM jobs, artifacts, or release assets.
- **Packaging tools:** Node `24.20.0`, Bun `1.4.1`, and the resolved Electron,
  electron-builder, Playwright, and Vite versions from the frozen lockfile.
- **Version source:** `apps/desktop/package.json`. The release version must be a
  stable `major.minor.patch` value. A release tag is `desktop-v<version>`, for
  example `desktop-v0.1.0`.
- **Output directory:** `apps/desktop/release`.
- **Database:** only a new local `surface.sqlite3` profile. There is no
  export, import, backup restore, or PostgreSQL migration path in the desktop
  build or its smoke test.

The desktop implementation owns `apps/desktop/package.json`,
`apps/desktop/scripts/build.mjs`, and the electron-builder configuration in
`apps/desktop/electron-builder.yml` and `apps/desktop/electron-builder.dev.yml`.
This automation expects that packaging to remain reproducible on Linux x64. If
the output directory, artifact names, or production command changes, update
`scripts/desktop-release.mjs` and these workflows in the same change.

Two channels are built from the same source:

| Channel     | Application | Output directory           | Installer identity        |
| ----------- | ----------- | -------------------------- | ------------------------- |
| production  | Surface     | `apps/desktop/release`     | `dev.surface.desktop`     |
| development | Surface Dev | `apps/desktop/release/dev` | `dev.surface.desktop.dev` |

Development builds use a distinct application name, so Electron stores their
data in a separate `userData` directory. Both channels can be installed and run
side by side. A packaged binary cannot switch channels at runtime; the channel
is compiled into the main process by `apps/desktop/scripts/build.mjs`.

## Local production build

Install from the repository root on Ubuntu 24.04 x64:

```sh
bun install --frozen-lockfile
```

The normal verification set is:

```sh
bun run format:check
bun run lint
bun run check-types
bun --cwd apps/web test
bun --cwd apps/crawler test
bun run verify:sqlite
```

`verify:sqlite` uses a new temporary directory. The backend's PostgreSQL test
is intentionally not part of desktop CI because it creates a PostgreSQL test
database; desktop validation uses SQLite only. Do not point the desktop
commands at a real profile.

Build and package the production application:

```sh
node scripts/desktop-release.mjs package
```

That helper cleans `apps/desktop/release`, runs
`bun --cwd apps/desktop package`, rejects stale or unexpected installer files,
writes `apps/desktop/release/BUILD-INFO.json`, and then writes
`apps/desktop/release/SHA256SUMS`. It does not publish, upload, tag, or create
a GitHub release. The AppImage is required; a `.deb` is included
automatically when the current electron-builder configuration emits one.

Build and package the development application:

```sh
node scripts/desktop-release.mjs package --channel development
```

Development artifacts are written to `apps/desktop/release/dev` and carry the
`Surface-Dev-` prefix. The manual **Desktop Development Build** workflow builds
this channel and publishes the AppImage, Debian package, manifest, and checksums
as assets on a `desktop-dev-<run number>` prerelease. It also keeps
`BUILD-INFO.json` and `SHA256SUMS` in a small Actions artifact.

The installers are published as release assets instead of Actions artifacts
because the AppImage and `.deb` together exceed the private repository's
Actions storage quota. Release assets have a separate per-file limit and are
not subject to that quota.

You can inspect and verify the helper independently:

```sh
node scripts/desktop-release.mjs version
node scripts/desktop-release.mjs manifest
node scripts/desktop-release.mjs checksums
node scripts/desktop-release.mjs verify-build
node scripts/desktop-release.mjs smoke
node scripts/desktop-release.mjs smoke --channel development
```

- `verify-build` launches the Playwright Chromium staged in
  `apps/desktop/build/playwright`. On a fresh host, install Playwright's
  Chromium system dependencies first:
  `./apps/crawler/node_modules/.bin/playwright install-deps chromium`.
- `smoke` runs the AppImage under Xvfb with
  `APPIMAGE_EXTRACT_AND_RUN=1`, a new temporary `SURFACE_DESKTOP_USER_DATA`
  profile, and `SURFACE_DESKTOP_SMOKE_TEST=1`. It requires `xvfb` and checks
  that the packaged backend served the smoke request and created
  `surface.sqlite3`. The temporary profile is removed on success.
  `--no-sandbox` is used only for this headless test process; do not use it as
  a normal way to run Surface.
- `package`, `manifest`, and `checksums` accept `--tag desktop-v<version>`. The
  command fails if the tag does not exactly match the version in
  `apps/desktop/package.json`.

`bun --cwd apps/desktop package` remains the canonical packaging command and
builds both Ubuntu targets in one run. `package:appimage`, `package:deb`, and
`package:ubuntu` are narrower aliases; `package:dir` is unpacked-only. The
`just desktop-package` recipe runs the full package command. CI and release
automation always use the full command so the AppImage and `.deb` are produced
together. The helper is the recommended release path because it also verifies
the version and generates checksums.

## Artifacts

| File                                    | Purpose                                                             |
| --------------------------------------- | ------------------------------------------------------------------- |
| `Surface-<version>-x86_64.AppImage`     | Portable Ubuntu x86_64 production application. Required.            |
| `Surface-<version>-amd64.deb`           | Production Debian package produced by the Linux packaging target.   |
| `Surface-Dev-<version>-x86_64.AppImage` | Portable development application, installable beside production.    |
| `Surface-Dev-<version>-amd64.deb`       | Development Debian package (`surface-dev`).                         |
| `BUILD-INFO.json`                       | Version, channel, source commit/ref, build environment, and hashes. |
| `SHA256SUMS`                            | Standard `sha256sum` file for every channel artifact.               |

No blockmaps, updater feeds, macOS images, Windows installers, or Linux ARM
packages are produced or published. Development installers are published as
prerelease assets, and production installers are published on the versioned
release; both carry `BUILD-INFO.json` and `SHA256SUMS`.

Verify a downloaded release:

```sh
cd downloaded-release
sha256sum --check SHA256SUMS
```

`BUILD-INFO.json` records the release version, tag, source commit/ref, workflow
run, runner, Node/Bun versions, and every artifact's SHA-256 digest. GitHub
artifact attestations are optional because this repository is private and
attestations require a plan that supports them. If the repository variable
`DESKTOP_ATTESTATIONS` is set to `true` after confirming support, the publish
job also attests the checksummed assets, and you can verify them with:

```sh
gh attestation verify Surface-<version>-x86_64.AppImage --repo Prajwal-17/surface
```

The AppImage normally needs FUSE 2. On a host without FUSE, run it with
`APPIMAGE_EXTRACT_AND_RUN=1`, as the smoke test does. A `.deb` can be installed
with `sudo apt install ./Surface-<version>-amd64.deb`.

## Pull request and branch CI

`.github/workflows/desktop-ci.yml` runs on:

- every pull request,
- pushes to `master`, and
- manual dispatches.

It uses `permissions: contents: read`, does not reference secrets, and cannot
create a GitHub release. Concurrent runs for the same pull request or ref are
cancelled.

The `checks` job runs the frozen install, formatting, lint, type checks, web
and crawler unit tests, and the fresh SQLite verification. The `package` job
installs Electron/Chromium system dependencies and Playwright's Chromium
dependencies, builds the production AppImage and Debian package, launches the
staged Chromium, runs the packaged AppImage smoke test, and writes
`BUILD-INFO.json` and `SHA256SUMS`. It uploads only the manifest and checksums
as the `surface-desktop-ci-linux-x64-metadata` Actions artifact for 14 days.
The installers stay in the workflow workspace because the AppImage and `.deb`
together exceed the private repository's Actions storage quota. That metadata
artifact is a CI record only; it is never published as a release. Use the
development build workflow when you need a downloadable installer.

The packaged smoke test verifies the Electron 45 runtime and the backend's
built-in `node:sqlite` implementation in the actual AppImage. No native SQLite
addon or Electron ABI rebuild is required. If a native addon is introduced
later, electron-builder's `npmRebuild` behavior and the ABI check must be
reviewed before relying on this workflow.

## Manual development builds

`.github/workflows/desktop-dev-build.yml` builds only the development channel
for Ubuntu x64. It runs the same source checks, Playwright dependency setup,
packaging, staged-Chromium verification, and fresh-profile AppImage smoke test
as CI. It can be started in two ways:

- manually with `workflow_dispatch` and a branch, commit, or tag;
- by adding the `desktop-dev-build` label to a pull request from this
  repository.

It publishes:

- `Surface-Dev-<version>-x86_64.AppImage`
- `Surface-Dev-<version>-amd64.deb`
- `BUILD-INFO.json`
- `SHA256SUMS`

to a `desktop-dev-<run number>` prerelease, and uploads the manifest and
checksums as the `surface-desktop-dev-linux-x64-metadata` Actions artifact.
Development builds never create a stable tag or publish a production release.
Use them when you want a downloadable installer before a versioned release
exists.

## Changelog and release notes

`CHANGELOG.md` at the repository root is the source of release notes. The
release workflow extracts the matching `## desktop-v<version>` section with
`scripts/release-notes.mjs` and attaches it to the draft release. A tag run
fails before building if that section is missing or empty.

To prepare an entry without editing the version by hand, run the manual **Desktop
Changelog** workflow from the Actions tab:

- `bump`: `patch`, `minor`, or `major` when no explicit version is supplied.
- `version`: optional explicit version such as `0.2.0`.
- `notes`: Markdown, optionally grouped with `### Added`, `### Changed`, and
  `### Fixed`.

The workflow runs `scripts/changelog.mjs` on the default branch, pushes a
`chore/release-<version>` branch, and opens a pull request. Review it, merge it,
then push the matching `desktop-v<version>` tag to start the release. The
script does not push or create a pull request on its own.

You can preview the extraction and the changelog edit locally:

```sh
node scripts/release-notes.mjs --check
node scripts/release-notes.mjs 0.1.0
node scripts/changelog.mjs --bump patch --notes-file notes.md --dry-run
```

`node scripts/release-notes.mjs --backfill` previews notes for existing
`desktop-vX.Y.Z` GitHub releases; add `--apply` only after verifying the preview.

## Versioned production release

`.github/workflows/desktop-release.yml` supports two intentional modes.

### Tag release

Push a tag named `desktop-v<version>` after the matching version is committed
to `apps/desktop/package.json`. For tag pushes, use a commit that already
contains this release workflow:

```sh
git tag desktop-v0.1.0
git push origin desktop-v0.1.0
```

The workflow checks that the tag exists, points at the checked-out commit, and
matches `desktop-v<apps/desktop/package.json version>` exactly. It then runs
the same checks and packaging as CI, writes `BUILD-INFO.json`, creates a draft
GitHub release, optionally attests the checksummed assets, uploads the
AppImage, the `.deb`, `BUILD-INFO.json`, and `SHA256SUMS`, and publishes the
release only after every step succeeds. A tag release never uses a long-lived
Actions artifact as the published source.

### Manual build or publish

Run **Desktop Linux Release** from the Actions tab:

- `ref`: branch, commit, or tag to build. The default is `master`.
- `publish`: `false` builds and uploads a temporary
  `surface-desktop-release-linux-x64` Actions artifact without creating a
  release. `true` requires `ref` to be an existing, matching
  `desktop-v<version>` tag and publishes it after the build succeeds.

Manual publishing does not create or move tags. A published release is never
overwritten: if the tag already has a published release, the run fails. Reruns
may update an existing **draft** release and replace its assets. A draft
release has no public installers until the final publish step succeeds.

Only the final publish job has `contents: write`, `id-token: write`, and
`attestations: write`; the build jobs are read-only. The publish job runs in
the `desktop-release` GitHub environment; its protection rules are optional, so
repository owners can add required reviewers there without blocking ordinary
PR builds. Release jobs are serialized per ref and are not cancelled in
progress. If GitHub attestations are unavailable for this private repository,
leave `DESKTOP_ATTESTATIONS` unset; `BUILD-INFO.json` and `SHA256SUMS` are still
published on every release.

Release notes come from the reviewed `CHANGELOG.md` entry, not from generated
commit lists. The workflow verifies the entry before packaging, creates or
updates a draft release with those notes, uploads the checksummed assets, and
publishes the draft only after the upload succeeds. The workflow does not
create or delete git tags, does not modify the repository, and does not use
application secrets. Do not run production releases from pull request code.

## Remaining constraints

- CI and release jobs are Ubuntu 24.04 x86_64 only. Cross-builds and Linux
  ARM64 are unsupported.
- Linux artifacts are unsigned and there is no auto-updater or updater feed.
  Verify checksums and provenance before installing.
- GitHub build attestations are opt-in via the `DESKTOP_ATTESTATIONS`
  repository variable because this repository is private. The release manifest
  and checksums are always produced and published.
- The workflows are limited to the Linux desktop path. They do not start,
  migrate, back up, restore, or otherwise touch Docker Compose, PostgreSQL,
  production volumes, or production data.
- The desktop SQLite path is fresh-only. No export, import, backup restore, or
  PGlite/PostgreSQL migration runs in CI, packaging, or the smoke test.
- The AppImage is large because it bundles Chromium for the crawler. The
  AppImage and `.deb` together exceed this private repository's 500 MiB Actions
  artifact quota, so installers are published as prerelease or release assets
  and only build metadata uses Actions artifacts.
- The hosted **Desktop Linux CI** and **Desktop Development Build** workflows
  ran successfully for commit `c88a0f3` on 17 Nov 2026. The development build
  passed the source checks, Playwright verification, fresh-profile AppImage
  smoke test, and published `desktop-dev-1` with the AppImage, `.deb`,
  `BUILD-INFO.json`, and `SHA256SUMS`.

If a release fails before publishing, fix the cause and rerun the same tag or
manual publish. If it fails after creating a draft, the next run updates that
draft. Never force-push or delete a published release tag to work around a
failed build.
