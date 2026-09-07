# Location data

Data by [Countries States Cities Database](https://github.com/dr5hn/countries-states-cities-database), ODbL 1.0. See LICENSE.

Pinned local snapshot downloaded 2026-09-07 from the upstream master source archive.
Uncompressed derived JSON SHA-256: `0c03d981370081595f80e3b42158f1cdbd8b16eb69ac9c02554ca0c5a4094b6c`.

Includes 250 countries and 152970 cities. City tuples contain upstream ID, name, region, and country code. Derived from `contributions/countries`, `contributions/states`, and `contributions/cities`; extra columns omitted. The derived database remains under ODbL.

To update: download an upstream source archive, join state names by state_id, retain city IDs and country codes, sort cities by country/name/region, serialize to compact JSON and gzip with mtime=0. Review removed/changed IDs before replacing this snapshot; saved profiles reference these IDs.
