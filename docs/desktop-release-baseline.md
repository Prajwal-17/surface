# Surface Dev release baseline

## Profile backup and restore

The Ubuntu development profile is `~/.config/Surface Dev`. There were no
Surface processes or open database handles when the backup was taken. The
backup is outside the checkout at
`${XDG_STATE_HOME:-$HOME/.local/state}/surface-dev/baseline-wgbp84eg/backup`.
It contains `surface.sqlite3` from SQLite's online backup API, which includes
committed WAL data, plus `data/` and `settings.json`. Keep the parent directory
private because the copy includes local settings and authentication data.

The sibling `restore/` was created from this backup. The source, backup, and
restore agreed on all 32 table counts, the foreign-key check found zero
violations, and SQLite's integrity check returned `ok`. All 89 referenced
snapshot files and both referenced company logos were present. The backup and
restore had matching file hashes, including the database.

For another rehearsal, copy the backup into a new directory and point the
development build at the copy.

```sh
baseline="${XDG_STATE_HOME:-$HOME/.local/state}/surface-dev/baseline-wgbp84eg"
profile="$(mktemp -d)"
cp -a "$baseline/backup/." "$profile/"
SURFACE_DESKTOP_USER_DATA="$profile" apps/desktop/release/dev/linux-unpacked/surface-dev
```

## Existing records

| Records          | Count and disposition                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jobs             | 11,404 total. Keep 11,390 inbox jobs available for triage. Map four saved jobs to In queue and ten dismissed jobs to Ignored.                           |
| Job provenance   | Keep 11,405 source references, 11,973 versions, 12,754 observations, and 563 duplicate decisions with the original jobs.                                |
| Companies        | Five companies in the legacy `new` state, five link reviews, and no contacts. Retain company IDs, notes, logos, review states, and any linked reports.  |
| Profile          | Six revisions, one preferences record, and two assessments. Preserve confirmed profile history and evidence.                                            |
| Research         | Keep six reports, 18 runs, 307 sources, eight messages, and 180 events readable through the existing routes.                                            |
| Work and sources | Keep 53 runs, 47 work items, and six enabled sources. The configured providers are Arbeitnow, Ashby, Jobicy, Remote OK, Remotive, and We Work Remotely. |
| Evidence         | 91 snapshot rows, with 89 distinct active content files. Keep the originals alongside the database.                                                     |

The full aggregate inventory is in the backup's parent directory as
`inventory.json`.

## Entry points and retirement criteria

| Area                    | Current owner and disposition                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Desktop startup         | `apps/desktop/src/main.ts` starts the local backend and crawler. Preserve the channel, storage paths, and renderer session. Disconnect the routine crawler start once collection and compatibility paths are verified.                                 |
| Workspace navigation    | `apps/web/src/app/router.tsx` serves Jobs, Companies, Activity, Profile, Settings, Schema, and research. Keep Jobs as the default and preserve research deep links. Review the Schema route and research entry points during cleanup.                  |
| Collection and Activity | `modules/work/executor.ts` runs configured-source collection, analysis, company discovery, and enrichment. `modules/discovery` also supports portal fetches. Consolidate routine refresh and keep existing run history and ranking retries accessible. |
| Browser and research    | `apps/crawler` supports research and browser-backed workflows. Keep compatibility reads and preserve dormant browser code when removing its startup dependency.                                                                                        |
| Résumé and analysis     | `modules/profile` and `modules/analysis` own import, confirmed revisions, eligibility, and ranking. Keep these entry points and build on their data.                                                                                                   |
| AI and Gmail            | Desktop Settings has a stored AI key. Live provider verification and Gmail desktop consent are pending.                                                                                                                                                |

Personal résumé and preferences, priority portal validation, outreach examples,
and the designated Gmail client and test account are pending for release
verification. Use fixture inputs for implementation.
