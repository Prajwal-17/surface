# Fieldwork design guide

Fieldwork is a personal job-search tool for discovering, reviewing, saving, and
dismissing opportunities. Its interface should feel calm, precise, and easy to
use every day. This document records the approved design and the rules for
extending it.

## Product direction

- Dark mode only, regardless of the operating-system preference. There is no
  theme switch or theme announcement in the interface.
- Use warm charcoal surfaces, ivory text, and restrained champagne accents.
- Prioritize useful information and actions. Avoid promotional copy, decorative
  statistics, workspace badges, and explanations of obvious controls.
- Keep the header to the Fieldwork mark and wordmark. Do not reintroduce
  “Your personal job desk,” “Personal workspace,” “Dark, always,” or the removed
  discovery tagline.
- Preserve the compact “Your next chapter.” heading and functional labels such
  as “Find opportunities,” “Save,” “Dismiss,” and “Open original.”
- Create polish through typography, spacing, alignment, and contrast. Avoid
  colorful panels, glossy effects, oversized heroes, and unnecessary animation.

## Theme and color

The source of truth is `apps/web/src/app/globals.css`. Define semantic tokens
there and consume them through Tailwind classes. The root layout always carries
`className="dark"`; `color-scheme: dark` also covers native browser controls.
There is one palette, not separate light and dark token sets.

| Token                  | Value     | Use                                           |
| ---------------------- | --------- | --------------------------------------------- |
| `background`           | `#101113` | Page, drawer, and recessed surfaces           |
| `foreground`           | `#eeece7` | Main text and titles                          |
| `card`                 | `#18191c` | Job cards and source panel                    |
| `primary`, `brand`     | `#dac29d` | Main action, active accents, company initials |
| `primary-foreground`   | `#211c15` | Dark text on champagne buttons                |
| `primary-hover`        | `#e8d3b3` | Main action hover                             |
| `primary-active`       | `#c8ae87` | Main action pressed                           |
| `secondary`            | `#212226` | Secondary controls and small inset surfaces   |
| `secondary-foreground` | `#dedbd5` | Secondary action text                         |
| `muted`                | `#2b2c30` | Hover fills and skeletons                     |
| `muted-foreground`     | `#a09e99` | Labels, metadata, and supporting text         |
| `accent`               | `#29251f` | Selected status and logo surface              |
| `accent-foreground`    | `#e3cdaa` | Selected status text                          |
| `border`               | `#2c2d30` | Quiet dividers and card outlines              |
| `border-strong`        | `#515052` | Emphasized boundaries and hover outlines      |
| `accent-border`        | `#514638` | Selected status and logo outline              |
| `input`                | `#434348` | Input and select outlines                     |
| `ring`                 | `#dac29d` | Keyboard focus indicator                      |
| `destructive`          | `#741b1d` | Destructive button fill                       |

Success feedback uses muted sage (`#a4bea9` on `#1b2921`, border `#34483c`).
Failure badges use soft coral (`#ffb9b5` on `#3a1718`, border `#7d3638`).
Use these colors for meaning, not decoration; pair them with text or an icon.
Dismiss is reversible and remains a quiet ghost action, not a red button.

The `card-surface`, `search-panel`, `selected-control`, and `primary-button`
classes provide the existing subtle surface treatments. Reuse them rather than
adding new gradients to individual components. Global element resets stay in
`@layer base` so they cannot override Tailwind utility colors or font sizes.

## Typography

Use locally hosted **Manrope** for interface text and headings. The variable
font supports weights 200–800; use 400 for regular text, 500 for emphasis, and
600 for display headings. Use the existing locally hosted **Geist Mono** only
for compact counts, source labels, and pagination metadata.

Both fonts are loaded in `apps/web/src/app/layout.tsx` with `next/font/local`.
Do not add runtime font requests or fall back to a serif display face. Manrope's
license lives beside its font file.

| Element                          | Size and treatment                                          |
| -------------------------------- | ----------------------------------------------------------- |
| Main heading                     | 36px on mobile, 48px from `sm`; 1.1 line height; weight 600 |
| Section heading                  | 18px; weight 500; slightly tightened tracking               |
| Job title                        | About 18px on mobile, 19px from `sm`; weight 500            |
| Body and descriptions            | 14–15px; comfortable 24–28px line height for paragraphs     |
| Inputs and buttons               | 14px; regular input text, medium button text                |
| Labels and metadata              | 12–13px; muted foreground                                   |
| Compact badges and source labels | 9–11px; never use for essential instructions                |

Use sentence case for actions. Reserve uppercase and letter spacing for the
small source labels. The gold word in the main heading is not italic.

## Layout and spacing

- The header and main content share a centered 1248px maximum width.
- Horizontal page padding is 20px on mobile, 32px from `sm`, and 40px from `lg`.
- The header is 80px tall. Main content starts with 36px vertical padding on
  mobile and 48px from `sm`.
- The search panel follows the heading with 32px spacing. Use a 16px corner
  radius and 16px mobile / 24px desktop padding.
- At `lg` (1024px), the search fields and action form one row. Below that they
  stack, and the action fills its grid cell.
- The results area begins 40px after search. At `lg`, use a flexible job list
  and a 264px source sidebar with a 40px gap. The sidebar is sticky, 24px from
  the top. On smaller screens it follows the results in normal document flow.
- Job cards use 12px corners, 16–20px content padding, and 12px vertical gaps.
  At `sm` (640px), actions occupy a separate right column; on mobile they sit
  below the job information.
- Filters stack on mobile. The source select must fill its label so its chevron
  stays inside the control. Status buttons may wrap to a separate row.
- Standard controls are 40px tall; discovery inputs and the main search action
  are 48px. Compact card actions are 32px. Control corners are normally 8px.

## Components and ownership

Frontend primitives live in `apps/web/src/components/ui/`. They are locally
installed **shadcn/ui New York** source, customized for this design, using Radix
Dialog and Slot, class-variance-authority, and Tailwind. There is no separate UI
workspace. `apps/web/components.json` maps `ui` to `@/components/ui` and `utils`
to `@/lib/utils`; `cn` combines `clsx` with `tailwind-merge`.

| Component | Local conventions                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Button    | Champagne primary; neutral secondary/outline; quiet ghost. `asChild` supports links with the same appearance and focus states.                               |
| Badge     | Compact inline span. Retain `success` and `danger` feedback variants.                                                                                        |
| Card      | Semantic `article`, quiet border, charcoal fill. Only Card and CardContent are needed.                                                                       |
| Input     | Visible border and focus ring; forwards refs for React Hook Form.                                                                                            |
| Sheet     | Radix dialog rendered through a portal, with overlay, title, description, and labeled close control. Opens from the right; full mobile width, maximum 576px. |
| Skeleton  | Muted loading placeholder; hidden from assistive technology.                                                                                                 |

The Sheet retains keyboard focus trapping and Escape dismissal. Its description
scrolls within the drawer while actions remain available below. Animation
utilities come from `tw-animate-css`; reduced-motion overrides remain global.

Product-specific components belong in `features/discovery` or `features/jobs`.
Keep network calls, mutation state, and job-specific behavior outside the UI
primitives. Reuse Lucide icons; do not add another icon library.

Fit recommendations remain compact and explanatory. Show the numeric score on
job cards, then put the summary, strengths, and concerns in the detail sheet.
Use the sage success treatment for strong fits, the champagne accent treatment
for possible fits, and a neutral outline for weak fits. A fit score never changes
a job's Inbox, Saved, or Dismissed status automatically.

### Adding or updating shadcn components

From `apps/web`, add only a component required by a current feature:

```bash
bunx shadcn@latest add <component>
```

Review the generated diff before keeping it. Preserve the approved palette,
spacing, semantic markup, custom badge variants, and accessible drawer behavior.
Do not run `init` over the existing theme or blindly overwrite local components.
Remove unused generated pieces instead of keeping a component catalog for later.

The current primitives were installed from the official
[New York registry](https://ui.shadcn.com/r/styles/new-york/button.json), then
customized. Keep `src/components/ui/LICENSE.md` with the derived source.
See the official [manual installation](https://ui.shadcn.com/docs/installation/manual)
and [CLI reference](https://ui.shadcn.com/docs/cli) for maintenance.

## Interaction, feedback, and accessibility

- Search shows a busy label/spinner and disables repeat submission while pending.
  Associate validation errors with the affected input; preserve backend validation.
- Fit analysis is manually started in batches of ten. Keep its pending state and
  partial-failure feedback distinct from job-source search feedback.
- Inbox, Saved, and Dismissed use buttons with `aria-pressed`. Changing status or
  filters resets pagination. Do not rely on color alone to communicate selection.
- Job title areas and Details open the drawer. Save, Dismiss, and Restore stay
  separate actions; do not nest interactive elements inside another button.
- Loading, empty, error, and partial-source-failure states must remain distinct.
  Counts come from the API; do not invent statistics or imply a successful fetch
  before a source has completed.
- Inputs need labels, icon-only controls need accessible names, and all actions
  need visible keyboard focus. Keep native select semantics for source filtering.
- Preserve readable primary-button text for both `<button>` and `<a>` rendering.
- Respect `prefers-reduced-motion`. The existing page entrance is 360ms with a
  small vertical offset; sheet motion is 200ms. Avoid continuous decorative motion.
- Use short, useful error and empty-state guidance. Do not add marketing copy.

## API boundary

`apps/backend/src/shared/contracts.ts` owns the Zod request/response schemas,
source labels, and inferred types. It is exposed through the backend package's
single `backend/contracts` export. The frontend imports this browser-safe entry
for form validation and API response parsing; backend modules import it locally.

Keep it free of server entry points, environment configuration, SQLite, and Bun
APIs. Do not duplicate these schemas in the frontend or recreate a contracts
workspace. Backend-only logic belongs in backend modules. The remaining packages
contain TypeScript and ESLint configuration only.

## Verification

Run `bun run lint`, `bun run check-types`, and `bun run build` after structural
changes.
Check that request validation and frontend response parsing still use
the same schema module. Do not alter the personal database to test styling.

Browser and screenshot verification is performed manually by the user. Agents
must not launch browsers or capture screenshots unless the user changes that
instruction. For manual review, check mobile and desktop widths, long job titles,
loading and empty states, focus visibility, drawer scrolling and Escape dismissal,
and dark appearance with a light operating-system preference.
