# Changelog

## desktop-v0.1.0 - 17 Nov 2026

First Linux desktop release. Surface now ships as an Electron application with
a local SQLite database, the existing web workspace, and the local crawler.

### Added

- Install Surface as an Ubuntu AppImage or Debian package. The desktop shell
  starts its own backend and crawler on loopback, keeps data in a local SQLite
  database, and stores credentials through the platform secret store with an
  explicit plaintext fallback.
- Development and production desktop builds use separate application names,
  data directories, and installer identities, so both channels can be installed
  side by side.
- Add the GitHub Actions desktop workflows: Linux CI packaging, manual
  development builds, tag-driven production releases, and a changelog-assisted
  release preparation flow.
- Add reviewed release notes from `CHANGELOG.md` to GitHub releases, plus
  `BUILD-INFO.json` and `SHA256SUMS` for every published artifact.

### Changed

- Replace the PostgreSQL requirement for the desktop path with a fresh local
  SQLite profile. Existing PostgreSQL data is not imported or modified.
- Draw a frameless window with native drag regions and Ubuntu-style caption
  controls on every route, including onboarding and session checks.

### Fixed

- Keep the packaged AppImage smoke test working on a fresh profile by checking
  the window controls and the onboarding or workspace title bar instead of
  assuming the workspace header is always present.
