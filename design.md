# Surface interface

Surface is a personal job-review workspace. Its design prioritizes scanning roles, reading the original evidence, and making a decision.

## Implemented design

1. Establish one visual system with light and dark themes: graphite backgrounds, a muted periwinkle interaction accent, consistent lightweight Lucide icons, and local Manrope typography. Remove promotional copy and decorative panels from navigation.
2. Rebuild the review layout: use the full width for the inbox, align role information into columns, and open a split reader only after selection. Separate Overview, Assessment, and Sources & history. Keep review actions available at the reader's foot.
3. Apply the system across Companies, Activity, Profile, forms, dialogs, popovers, and empty states. Verify real content in the browser, responsive behavior, keyboard focus, and production compilation.

## Themes and readability

Settings and onboarding provide a Light mode / Dark mode switch. The choice is
stored on this device and applied before paint; the system preference is used
until a choice is made. Light mode uses a soft gray canvas, white panels, dark
slate text and a deeper violet accent. Both themes use the same semantic tokens,
including statuses, overlays, job descriptions, diagrams and notifications.

Profile answers use whitespace instead of a separator after every row. Roles and
skills wrap into readable groups, with direct Edit actions for each section. The
save bar only appears while editing or when there are unsaved changes. Review
changes opens a wide, full-height panel on the right with a scrolling body and a
compact top action bar; on mobile it fills the screen. Save and Back to editing
stay in the top bar, with no separate footer.

Long profile answers support CommonMark (headings, lists, emphasis, links, quotes
and code), with an inline preview and placeholder examples. Raw Markdown remains
the stored source and AI context. HTML is ignored and images render as alt text.

## Dark palette

| Role                | Color     |
| ------------------- | --------- |
| Background          | `#111214` |
| Navigation          | `#141517` |
| Panel               | `#17181B` |
| Elevated control    | `#202125` |
| Primary text        | `#F3F4F6` |
| Supporting text     | `#B4B7C0` |
| Primary action      | `#B3AFF5` |
| Primary action text | `#17181B` |
| Accent / focus      | `#B8B4F6` |
| Selected navigation | `#272534` |
| Positive state      | `#A4C7AF` |
| Needs attention     | `#DBBF89` |
| Error / conflict    | `#E79A9E` |
| Divider             | `#2B2D32` |
| Form input border   | `#62656C` |

Color denotes interaction or state, with accompanying text. Company initials are neutral identifiers, not invented logos. Use the top-bar breadcrumb as the visible page title, with screen-reader-only page headings. Use 16px reading, form and row text, 14px supporting information, and 18px section headings. Shared `text-sm` and `text-xs` tokens follow this scale. Body line height is 1.6; long evidence and profile answers use more generous leading. Supporting text must not be dimmed with additional opacity. Manrope is bundled locally; Geist Mono is reserved for raw evidence. Lucide icons use a consistent 1.65 stroke. Panels have an 8px radius; controls use 6px.

## Components

Use the local shadcn/Radix component layer for Button, Input, Textarea, Select, Checkbox, Card, Collapsible, Tabs, Dialog, Sheet, Popover, Sidebar, Tooltip, and Sonner. Feature screens use these components for form controls and expandable sections. Select uses the official shadcn Radix composition with Trigger, Value, Content, and Item. Radix owns focus, keyboard navigation, and form participation.

## Layout and behavior

- The desktop sidebar is 240px wide. Mobile uses the existing Radix Sheet. Navigation preserves the last jobs URL. Settings lives above the sidebar profile link and contains automatic analysis controls. The top bar contains navigation breadcrumbs.
- Use a 56px top bar, 16px content inset below it, 40px status tabs and toolbar controls, and 36px pagination buttons. Put status tabs and actions on the same row when space allows. The Inbox/Saved/Dismissed divider ends beneath the tabs, rather than continuing underneath the action buttons. Job rows retain their reading space.
- Companies and Activity place their actions alongside section tabs; Profile starts directly with its section navigation.
- The inbox fills the available width until a role is selected. At 1100px and above, the reader is a full-height right pane from the 56px top bar to the viewport bottom. Inbox controls stay in the left pane; both panes scroll independently. The reader uses a clear 18px title and company metadata with a location icon, with visible actions beneath the title in a fixed header. Narrower screens use a full-width reader Sheet.
- Container queries adapt the job rows to the actual list width, including when the sidebar collapses. On compact rows, publication dates remain available in the reader.
- The title is an explicit, keyboard-accessible selection button. Source links, save, and dismiss have independent hit targets. Closing the reader restores focus to its title button.
- Filters, sorting, page, and selection stay in the URL. Background changes announce new results without silently replacing the list.
- Location icons expose full location and work arrangement via shadcn tooltips on hover, keyboard focus, or tap. Laptop denotes remote, arrows hybrid, building on-site, globe worldwide, and pin other locations. Unknown arrangements remain explicit in the tooltip.
- Job status, availability, review state, eligibility, and assessment freshness remain separate. The reader defaults to Overview. Assessment and source evidence retain their existing functionality.
- Companies uses a restrained watchlist grid and source rows. Activity uses a single summary strip and divided run history. Profile uses section navigation beside the form on desktop and a two-column tab grid on mobile.

## Micro-interactions

Use CSS and the existing Radix components. Hover/color transitions take 140–150ms. The reader enters over 180ms with 6px of horizontal travel; tab content fades in over 140ms with 4px of vertical travel. Tooltips use the local shadcn component’s fade and scale transitions. Shadcn Collapsible animates disclosure height and opacity while its chevron rotates. There are no staggered job rows or decorative looping animations. All nonessential motion is disabled for `prefers-reduced-motion`.

Radix owns the positioning transform on `[data-radix-popper-content-wrapper]`. Never animate or override that wrapper’s transform: doing so makes tooltips briefly appear at the page origin. Apply motion to the inner tooltip or popover content instead.

## Verification

Loading states mirror the content they replace: job rows, profile sections,
company cards, settings, and the job reader. Keep existing results visible during
background refreshes, with a small status indicator. Announce loading to assistive
technology, hide decorative skeletons, and respect reduced motion. Longer résumé
imports explain the current work without inventing progress percentages.

Browser checks use the real local app: desktop pages, a 390px mobile viewport, navigation drawer, company-dialog dismissal/focus restoration, sources and schedules, search empty state, filter popover, mobile reader tabs, reader close/focus restoration, horizontal overflow, compact pagination, full-height desktop reader alignment, and location tooltip anchoring and tap behavior. Supporting text on dark panels has at least 8.8:1 contrast; primary-button text has 8.76:1; form-input borders against the background have 3.21:1.

Run `bun run lint`, `bun run check-types`, and `bun run build`. The current execution environment blocks Turbopack's local worker port; `bun run build --webpack` from `apps/web` provides an alternate production build without changing the project's default compiler.

## Personal profile and onboarding

Onboarding is a dedicated, quiet page with a five-step progress rail, one active
section, Back/Continue controls and an explicit final save. Mobile reduces the rail
to numbered steps. The opening page offers résumé import and manual entry; it does
not collect an email address or show a welcome modal over job results.

The profile page uses Overview, Career goals, Experience & projects, and Locations
& requirements navigation. Overview shows answered fields with section edit
controls and short prompts for empty sections. Import resume, Review changes and
Save are the relevant actions; analysis controls belong in Settings. Preserve the
existing graphite palette, local Manrope and periwinkle interaction accent.

Use searchable catalogs for standardized answers and guided text for evidence.
Country/city selections display region and country to disambiguate names. Résumé
review leaves replacements unselected and requires a final profile save after the
user edits the proposed fields. Do not imply that residence, preferred locations,
or a résumé-derived location establish work authorization.
