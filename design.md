# Surface interface

Surface is a compact personal research and job-review workspace. Navigation and controls support scanning; descriptions, reports, and personal evidence retain comfortable reading space. The October 2026 revamp adapts T3 Code's default neutral chrome to Surface's existing workflows.

## Reference and identity

The reference study is recorded in [docs/ui-reference-mapping.md](docs/ui-reference-mapping.md). It covers T3's default theme, shared controls, sidebar, compact branding, focus, positioning, and motion. Surface retains React, Vite, Tailwind, Radix, and React Query.

The original Surface SVG uses two offset horizontal planes to form an abstract S. It is monochrome, readable at 16px, and displayed at 20px beside the compact wordmark. The 48px rail uses the mark alone. Navigation, onboarding, authentication, and the SVG favicon share this identity.

Geist Sans and Geist Mono are bundled locally. No runtime font service is used. Interface text is 14px; supporting metadata is 13px; section headings are 18px; reader titles are 20px. Small captions and compact company initials use 12px. Descriptions, research prose, and long profile answers are 16px with 1.65 line height and a maximum measure of 76ch. Mobile form text is 16px. Scores, timestamps, identifiers, measurements, and diagnostics use Geist Mono and tabular numerals. Shared weight tokens use 550 for medium emphasis and 650 for semibold emphasis. Sidebar labels use 650, with the selected destination at 700; active tabs, job titles, company/source names, section headings, and form labels carry stronger emphasis. Reading text remains at 400. Shared Tailwind type tokens own the scale across controls, feature text, notifications, and prose; job titles use 20px leading and metadata uses 18px leading so larger text stays clear within compact rows.

## Theme

Semantic variables in `apps/web/src/styles/globals.css` own both themes. Feature code uses these variables rather than independent palettes, including Schema, notifications, loaders, and diagrams.

Dark mode uses:

- Neutral-950 `#0A0A0A` canvas; canvas mixed with 3% white for navigation, cards, and popovers.
- Neutral-100 `#F5F5F5` primary text and neutral-400 `#A3A3A3` supporting text.
- White at 4% for hover and 7% for selection; white at 6% for structural borders and 16% for control outlines.
- T3 primary blue `oklch(0.571 0.21 264)` with white action text.
- Blue-400 for links, focus, and active icons; emerald-400, amber-400, and red-400 for semantic states.
- Separate foreground and background variables for information, success, attention, and errors. Dark semantic badges use a 12% tint and a text label.

Light mode uses zinc-50 canvas, white panels, zinc-800 text, zinc-600 supporting text, zinc-200 dividers, T3's deeper `oklch(0.488 0.217 264)` primary blue, and darker semantic foregrounds. Badges use subtle 8% tints. Selection, links, controls, borders, and overlays have separate variables.

The existing `surface-theme` preference remains independent of layout preferences. It is applied before paint. With no stored choice, Surface follows system appearance and responds to OS changes. Theme controls remain usable when browser storage is unavailable. Text selection, caret, scrollbars, and focus belong to the same system.

## Geometry and controls

Desktop chrome has a 44px header, 208px sidebar, and 48px collapsed rail. Navigation rows and standard controls are 32px; small and toolbar icon buttons are 28px. Main gutters are 16px and dense panels use 12px padding. Controls have a 6px radius and floating panels an 8px radius.

Button, Input, Textarea, Select, Checkbox, Tabs, Dialog, Sheet, Popover, Tooltip, Sidebar, Badge, and Sonner remain shared components. Touch controls retain a minimum 44px target. Tooltips use neutral popovers. Focus is visible, statuses have labels, and Radix retains focus trapping, selection, and dismissal behavior. Form field hints are descriptions rather than part of their accessible names.

Jobs, Research, Companies, and Activity are primary navigation. Schema, Settings, and Profile occupy the secondary area. Active rows have neutral selection with a blue icon. Collapsed links retain accessible names and tooltips. The workspace header holds breadcrumbs and page actions. The existing authentication and DEV/PROD indicator remain; overlays move the environment label clear of Close.

## Jobs and reader

The inbox fills available space until selection. Its compact toolbar groups search, source type, role relevance, sorting, filters, and result count. Applied filters wrap into removable chips with company and configured-source names rather than identifiers. Existing search parameters, selection, pagination, saved searches, background revision notices, and mutations remain compatible.

The Filters button counts active advanced categories. A 640px desktop popover groups Review & fit, Workplace, Company & source, and expandable Dates. Review and work mode use shared native radio choices with visible checks and arrow-key navigation. Mobile uses a full-height Sheet with a scrolling body and fixed header/result/Done footer. The environment indicator stays hidden until this sheet finishes closing, keeping actions clear. Lookup fields expose loading, empty, retry, and unavailable-selection states; long options wrap within viewport-bounded menus.

Results update immediately. Reset only clears advanced criteria and resets pagination, preserving search, source type, role relevance, sorting, review tab, and the selected reader. Consecutive changes merge against the browser's current URL so pending navigation cannot overwrite prior choices. Date fields open automatically when the URL contains date criteria. Multi-source selections restored from saved searches remain selected. Role-matching help belongs to its selector.

Ordinary desktop rows have a 56px minimum and grow for wrapping content. Role/company, location, compensation, assessment, age, and actions align in columns. Container queries fold facts into readable rows at smaller list widths. Missing compensation and location say “Not listed”; missing dates say “Unknown.” Only a current assessment with an actual result has a numeric score. Eligibility and assessment freshness remain separate.

Save/dismiss actions appear on hover or keyboard focus and remain exposed on touch. The title is an independent selection button; company links and source menus retain their own controls.

The reader defaults to 44% of measured workspace width. It needs 420px, while the list needs 480px plus its 32px gutters and the 1px divider: split view begins at 933px of actual workspace width. Sidebar changes, browser resizing, and zoom therefore affect the threshold correctly. Below it, selection opens a full-width Radix Sheet. The list and reader scroll independently; the reader header stays fixed. Overview, AI Summary, Assessment, and Sources & history remain available with compact facts above prose.

The divider supports pointer capture and keyboard focus. Left/Right change reader width by 16px; Home restores the 44% default. Width is clamped to both pane minimums. Manual resizing has no animation. Closing restores the selected title's focus, including sheet and failed-reader states.

A versioned `surface-ui-preferences` record stores `{ version: 1, sidebarExpanded, readerWidth }`. Safe defaults are expanded navigation and a null width, meaning 44%. Invalid versions or fields recover safely; denied or full storage leaves in-memory controls usable. The former sidebar cookie remains compatible. Mobile drawer visibility is transient.

## Other workflows

Research lives in the Companies reader, alongside Overview. Report, Company Q&A, and Sources use shared shadcn tabs inside Research. Run research explicitly generates a cited report; Refresh details checks public information. Expand opens the same company across the workspace, with a readable report measure and Back to companies restoring the list, filters, scroll, and Q&A draft. Report versions, streaming, citations, evidence, and saved questions stay attached to existing company IDs. The sidebar has one Companies destination; old Research URLs redirect into it.

Companies combines Discover, Searches, Watchlist, and Sources with a shared company reader. Overview contains facts, funding, contacts, linked roles, decisions, and optional AI summaries. Has research filters actual saved reports before pagination, with small indicators for saved, running, or incomplete research. Summary-only and unresearched companies remain in the directory. Sources align collection state and available last-success data, with expanded URL/provider/schedule details.

Activity uses a compact strip of existing run counts, readable run history, expandable work steps, schedules, sources, retry controls, and the existing cleanup preview. Settings uses compact section navigation for Appearance and AI settings.

Profile retains section navigation, editing, Markdown answers and previews, searchable catalogs, validation, résumé import, review, discard, and explicit save. Replacements from a résumé remain unselected; accepting suggestions still requires a separate final profile save. The review sheet keeps a fixed action bar and scrolling body. Onboarding retains its five steps, résumé/manual choice, validation, and explicit final save. Residence and preferred locations never establish work authorization.

Schema uses the shared surfaces, semantic domain colors, edge/selection variables, and compact themed controls. Search, graph direction, minimap, and diagram navigation remain available in both themes.

## Keyboard and motion

- `/` focuses job search only outside editable controls and open overlays.
- Up/Down within a job row moves between title controls; Enter uses the focused title's normal activation.
- Escape dismisses the top overlay first; with no overlay, it closes the split reader. Radix owns sheet/modal Escape and focus trapping.
- Modified keys, IME composition, editable fields, and open menus retain their normal behavior. There are no global single-letter mutation shortcuts.

Feedback takes 120ms. Standalone action buttons press to 0.98 over 80ms; menu triggers, inline source controls, and title/row controls are excluded. Inner popovers/tooltips fade with at most 2px travel. Reader entry and sidebar collapse take 160ms ease-out. Disclosures take 140ms. There are no staggered rows, decorative pulses, or per-word entry effects. Labeled spinners indicate active work; skeletons are static. Reduced motion removes movement, scaling, and animations.

Never alter Radix positioning-wrapper transforms. All floating motion belongs to inner content.

## Validation

- `bun run lint`, `bun run check-types`, and `bun run build` pass using Vite.
- `bun run --cwd apps/web test`: 36 focused tests for preference recovery, persistence, resize boundaries, keyboard movement, editable targets, overlays, mutation-shortcut exclusion, and filter counting, reset scope, labels, and state semantics.
- Before/after captures use the same local dataset. Initial Jobs/reader captures preceded editing; remaining baseline captures were recovered from the preserved source and original tracked patch. At 1440×900, with the increased typography, both themes show **11 complete job rows versus 7 before**, approximately **57% more**.
- The browser matrix covers Jobs, reader, Research, report, Companies, Sources, Activity, Profile, Settings, Schema, and onboarding at 1440×900, 1280×800, and 390×844, in both themes. The updated app has no page or main-content horizontal overflow and no browser errors in these 66 combinations.
- Native browser checks cover `/`, title arrows/Enter, modal focus trapping, overlay-first Escape, reader-close focus restoration, pointer clamping, keyboard resizing, reload persistence, the 48px rail, the split threshold, and reduced motion.
- Browser regression checks exercise profile editing/review/discard, source editing, saved-search requests, job mutations, and résumé review. Mutating requests and AI results use isolated response fixtures so stored research and profile data are preserved. Empty, failed, stale, queued, running, current, and unassessed jobs are verified without treating missing results as zero.
- Sampled normal text on Jobs, Research, Profile, and Activity passes AA on actual composited backgrounds in both themes: 636 text samples, minimum 4.65:1. Visible focus and labeled semantic states are retained. Mobile Close is 44px and clear of the environment indicator.

Screenshots and machine-readable checks are under `/tmp/surface-ui-revamp/`, with `visual-matrix-before-after.json`, `visual-matrix-final.json`, `behavior-checks.json`, `contrast-checks.json`, and `extra-state-checks.json`. Baseline source and the initial tracked patch are retained there for review. No backend API, database schema, shared contract, or route-path changes are part of this revamp; pre-existing unrelated edits remain intact.

The typography increase is rechecked across the same 66 route/theme/viewport combinations, with no page or main-content horizontal overflow and no browser errors. Updated captures and `visual-checks.json`, including computed type sizes, are under `/tmp/surface-type-step/`.

The weight refinement passes 24 targeted Jobs, reader, Research, Companies, Profile, and Settings checks across desktop/mobile and both themes. Computed sidebar weights are 650 for ordinary destinations and 700 for the active destination, including the mobile drawer. The Jobs list retains 11 complete desktop rows. Captures and `weight-checks.json` are under `/tmp/surface-type-weight/`.

The Jobs filter redesign is checked at 1440×900, 1280×800, and 390×844 in both themes, plus immediate URL updates, rapid choices, reset scope, reload, saved-search sources, native radio keys, nested Escape, focus restoration, mobile dates, long values, and lookup recovery. Before/after captures and `checks.json` are under `/tmp/surface-job-filters/`.
