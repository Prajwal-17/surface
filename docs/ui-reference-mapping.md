# Surface UI reference mapping

Reference studied: `/mnt/hdd/code/oss/t3code/apps/web/src`.

- `index.css`, default theme around lines 1060–1174: neutral-950 canvas; white at 3% for raised panels, 4% hover, 6% dividers; blue `oklch(0.571 0.21 264)` in dark and `oklch(0.488 0.217 264)` in light. Surface adds explicit status foreground/background, link, selection, and control tokens, plus brighter supporting text.
- `components/ui/button.tsx`: 32px default and 28px small desktop controls, 16px icons, visible keyboard focus, press feedback excluding popup triggers. Surface uses an 80ms 0.98 press and 6px control radius.
- `components/ui/sidebar.tsx` and `components/sidebar/SidebarChrome.tsx`: compact rows, utility area, restrained branding, independent collapsed rail. Surface uses 208/48px navigation and a 44px header, with a locally persisted preference.
- `components/ui/tooltip.tsx` and `popover.tsx`: positioning belongs to the library; animate inner content. Surface retains Radix and uses 120ms opacity/2px entry.
- Surface adaptation: local Geist Sans/Mono; a two-plane S mark; a job list with 56px baseline rows; a reader at 44% with 420px minimum and a 480px minimum usable list plus gutters. Resize uses pointer capture and arrow keys, with no animation during dragging.

Jobs and the reader were captured from the running Vite app on port 4317 before UI edits. The other baseline routes were recaptured from the preserved starting source against the same backend after detecting captures made before paint. Port 3000 served a different Next.js app. Screenshots are under `/tmp/surface-ui-revamp/before-*`: Jobs, reader, Companies, Activity, Profile, Settings, Schema, onboarding, plus light/mobile Jobs. At 1440×900 the original jobs viewport displayed 7 complete rows from the actual local dataset (714 matching / 7,094 collected).

Existing uncommitted work was preserved; its initial tracked patch is `/tmp/surface-ui-revamp/pre-existing.patch`. Authentication behavior remains part of the implementation.
