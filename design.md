# Surface interface

Surface is a personal career workspace. The interface should make a full inbox feel manageable: see the role, understand the evidence, decide what to do next.

## Direction

Deep blue surfaces, electric blue actions, crisp typography, and meaningful mint, amber, and rose states. This replaces the previous charcoal/sage direction. Keep the local Manrope and Geist Mono fonts; reserve monospace for raw evidence. Never apply global button sizing or a monospace font to notifications.

| Role                 | Color     |
| -------------------- | --------- |
| Workspace background | `#0C1322` |
| Navigation           | `#0E182A` |
| Panels               | `#131E31` |
| Elevated controls    | `#1C2B43` |
| Primary action       | `#4F6BED` |
| Primary action text  | `#FFFFFF` |
| Primary text         | `#EDF2FC` |
| Secondary text       | `#9EAFC8` |
| Accent text          | `#9AB4FF` |
| Positive state       | `#6CDEC0` |
| Needs attention      | `#F4C779` |
| Error/conflict       | `#F48699` |
| Divider              | `#293A53` |
| Input border         | `#6681A4` |
| Focus                | `#97B6FF` |

Use 24–30px page headings, 14px role titles and reading text, and 12px supporting labels. Status always includes text. Company initials identify companies without inventing logos. Panels use a 12–14px radius; controls use 8px. Avoid ornamental gradients, confidence meters, and simulated progress.

## Navigation and review

- Official shadcn Sidebar provides persistent desktop navigation and a mobile Sheet. Destinations: Opportunities, Companies, Activity, My profile. The previous Jobs URL is retained across navigation.
- Jobs uses a compact toolbar and independent list/reader scrolling at 1100px and above. Mobile details use a full-width Sheet. The selected row has a blue surface and a visible accent edge.
- Rows show the company, wrapping title, location, known compensation, assessment state, source links, and publication date. Save/dismiss controls remain accessible without occupying a second oversized panel.
- Reader: company/title, role facts, review/eligibility state, Surface insight, evidence, description, source/history details. Save, Dismiss, and Open original remain at the bottom of the reader.
- Job status, listing availability, review state, and assessment freshness remain separate. URL filters, selection, sorting and pagination are preserved. Background updates announce availability without silently replacing the list.

## Components and forms

General controls use shadcn/Radix: Sidebar, Tabs, Dialog, Sheet, Popover, Tooltip, Checkbox, buttons, fields, native selects, and Sonner. Official source is adapted to Tailwind 4, the installed React rules, and Surface tokens. Keep the MIT license in `components/ui`.

Beautiful UI Recommendation Card, Context Cards, and Task Rows are adapted in `components/ai`, with their MIT attribution retained. They render actual assessments, cited source/profile excerpts, and persisted work states. Surface insight has a visible blue frame even when an assessment is pending or unavailable; it never invents results.

Companies uses a watchlist grid and focused dialogs for company/source creation and editing. Activity separates run history, schedules, sources and storage into tabs. Profile uses Experience, Constraints, Preferences, and Projects tabs; automatic-analysis settings show actual daily usage and queued work.

Notifications sit below the top bar, away from reader actions, and use the shadcn Sonner wrapper: proportional body font, compact title/description, standard action sizing, blue actions, mint success icons and rose errors. No expanded stack or stretched close button.

## Verification

Run lint, type checks and production build. Check color contrast, responsive CSS and accessible names in source. Browser review remains manual: desktop/mobile, sidebar, selected row, wrapping titles, Sheet/Dialog focus restoration, tabs by keyboard, source popovers, empty/error states, saved-search edits, and dismissal Undo. Never claim visual verification from a build alone.
