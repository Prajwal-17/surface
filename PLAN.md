# Surface desktop plan

## 1. Release goal

Finish a daily-use Ubuntu Electron build that lets you find good roles, prepare applications and outreach, and track what you actually submitted. Use `Surface Dev` for implementation, migration rehearsals, and verification. Production profiles, databases, and deployments are outside this release.

**Daily workflow:** Refresh your portals → review the best matches → queue a role → prepare the application or an outreach draft → schedule the draft in Gmail if you want → mark the role applied when you submit it → track the reply or follow-up.

**Release scope:** Jobs, Companies, Applications, a small Activity view, résumé-to-profile import and matching, and an AI email composer with Gmail drafts. Keep Profile and Settings in secondary navigation. Reuse the existing Electron shell, React renderer, backend, and shared contracts. Leave general-purpose AI chat, a standalone send scheduler, and automated browsing outside this release.

## 2. Baseline and build order

The desktop app runs the existing web renderer with a local backend and SQLite. Jobs, Companies, Activity, Profile, and Settings already exist. So do portal adapters, résumé extraction and review, job eligibility checks, and AI provider settings. Applications and Gmail outreach are new work. SQLite and PostgreSQL have distinct migration histories.

| Phase                   | Deliverable                                                                                                                                | Exit check                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| 1. Baseline and data    | Inventory entry points, workers, old records, and retained features. Back up a populated dev profile and record its counts and references. | Restore works on an isolated copy. Each candidate for removal has an owner or a documented disposition.                     |
| 2. Daily workspace      | Add Applications, simplify Companies and navigation, and connect job triage to Applications.                                               | The queue and status changes work on old and new records. Filters and archive/restore work on both pages.                   |
| 3. Job refresh          | Reuse a short list of portal adapters and consolidate the routine background run. Reduce Activity to run summaries and recovery.           | A failed portal leaves other results usable. Repeating a refresh creates no duplicate jobs.                                 |
| 4. Profile and matching | Harden the existing résumé review and rank portal listings against confirmed profile evidence.                                             | The review preserves manual corrections. Real listings produce a useful shortlist with understandable reasons.              |
| 5. Outreach and Gmail   | Add the AI composer, local drafts, Gmail connection, and the Gmail scheduling handoff.                                                     | A draft survives a restart, edits, and a recoverable Gmail failure. A test message can be scheduled and cancelled in Gmail. |
| 6. Cleanup and release  | Remove confirmed dead paths, rehearse migrations, review the UI with Impeccable, and package the dev build.                                | The packaged app passes the release checklist in §9 against both a fresh and an existing profile.                           |

Collect the inputs once in phase 1: the résumé, target roles and deal-breakers, priority portal sources, two or three outreach examples, and access to an AI provider and a Gmail desktop OAuth client. Check the provider connection and Gmail consent setup early so credentials and permissions cannot first surface as blockers during packaging. Keep personal files and credentials out of Git. Work on the parts that use fixtures while real inputs are pending, then verify quality and account behavior with the real inputs before calling the release ready.

### Commit checkpoints

- Commit after each small, verified change. Split larger phases into checkpoints such as the application data model, the Applications page, and job-to-application actions. Keep each commit focused and runnable.
- Run the relevant checks before committing and record useful validation in the commit body. Use concise lowercase subjects with prefixes such as `feat:`, `fix:`, or `refactor:`.
- Keep behavior changes, migrations, and unrelated cleanup in separate commits where they can stand on their own. Commit a migration with the code that requires it when separating them would break an upgrade. Keep résumé data, database backups, and credentials out of commits.

## 3. Jobs, Companies, and Applications

### 3.1 Jobs

- Keep Jobs as the default destination. Open on **Best matches** once the profile is ready. Keep **Needs review** and **All jobs** available so you can find a borderline listing or a newly fetched one that is still being ranked.
- Show role, company, location or work mode, source, and a short fit explanation. Open the original listing and detailed requirements from the job reader.
- Put **Add to queue**, **Mark as applied**, and **Ignore** on the job. Once tracked, show its current application status and a link to its record. Preserve existing saved and dismissed decisions during migration.
- A job action creates or updates one application for that job. Repeating an action or opening the same job from a second portal must lead to the same linked record. If a listing expires, keep the application and enough of the original listing to identify it.

### 3.2 Applications

One page for roles you intend to pursue, submitted applications, and company outreach. Allow a manual entry from Applications or a company for an off-platform role or outreach without a listing.

| Status          | Meaning                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------- |
| In queue        | You intend to pursue it and may still need to prepare a résumé, application, or email.        |
| Applied         | You submitted a job application. Record the date and allow correction for older applications. |
| Contacted       | You sent direct outreach. Record the contact date when you confirm it.                        |
| In conversation | You received a reply or started an interview process.                                         |
| Closed          | The opportunity ended. Optionally record an outcome.                                          |
| Ignored         | You reviewed the opportunity and chose to pass. It can be reopened.                           |

- Default to active records and make **In queue** easy to reach. Search by role or company. Filter by status, company, and archive state. Sort by recent update, date applied, or next follow-up. Put undated follow-ups last.
- Show role or outreach subject, company, status, and the most relevant date in the list. Keep notes, source link, contact, follow-up date, and outreach draft in the detail view.
- Allow status changes and archive/restore from the row. Archive is a reversible visibility action independent of status. Preserve the original date when reopening an application or retrying **Mark as applied**. Make a deliberate date edit available.
- Keep a clear link back to the company and original job where available. Save the details needed for off-platform opportunities and withdrawn listings.

### 3.3 Companies

One page for companies you follow or intend to contact. Show the company name, current status, and useful counts for open roles and linked applications. Put notes, contacts, related jobs and applications, and **Draft outreach** in the company detail view.

| Status    | Meaning                                           |
| --------- | ------------------------------------------------- |
| Watching  | Keep the company visible for relevant openings.   |
| In queue  | You want to prepare company research or outreach. |
| Contacted | You’ve reached out to the company.                |
| Ignored   | You’ve decided to pass for now.                   |

- Search by name. Filter by status or archive state. Sort by name, recent update, or newest opening. Allow inline status changes and reversible archive.
- Company and application statuses are independent. Applying for one role can leave the company on **Watching**. Changing or archiving a company preserves its applications. Portal settings control which sources refresh.
- Preserve existing company notes, reports, contacts, and evidence. Keep a read path for existing reports and old research links even if the prominent research workflow is retired.

## 4. Portal refresh and Activity

- Reuse existing structured adapters, starting with the portals and career boards in the dev profile that have working feeds or documented public endpoints. Verify the selected sources before enabling them. Give unsupported sources a clear status and keep saved links usable.
- Use one routine workflow: **fetch → normalize → deduplicate → rank new and changed listings**. Keep **Refresh now**, coalesce overlapping runs, and resume interrupted work safely. Honor source backoff, timeouts, and rate limits. Keep network destination validation in the existing HTTP path.
- Fetching and ranking can fail independently. Preserve last successful results on source failure, keep collecting from healthy sources, and let unfinished rankings retry. Only a complete, successful inventory can establish that a listing disappeared. Keep the original source references on duplicates and retain existing manual merge decisions.
- Disconnect Playwright and generic browsing from refresh and app startup. Keep the dormant browser code available for occasional use. Verify that normal packaged startup and portal refresh work without launching a crawler or Chromium.
- Put **Activity** at the bottom of the sidebar. Show when a run started or finished, new jobs found, and a concise reason for any source failure. Provide a retry where it helps. Surface last successful refresh and whether a run is in progress on the Jobs page. Describe refresh as active while Surface is running.

## 5. Résumé import and job matching

### 5.1 Résumé to profile

1. Reuse the existing supported import formats, text extraction, and editable review flow. Test a straightforward PDF, a multi-column résumé, and a low-text or scanned file. If extraction is too weak to trust, show what was recovered and ask for a text-readable file or manual input.
2. Extract structured roles, employers, dates, skills, projects, education, and achievements using a validated output schema. Keep important claims linked to their source text. Preserve the résumé’s actual metrics and dates. Flag ambiguous ranges, overlapping roles, and uncertain associations for review.
3. Present proposed additions and changes before saving. Keep existing manual fields and corrections unless the user explicitly accepts a replacement. Treat target roles, work authorization, and relocation preferences as user-confirmed settings. A résumé address alone cannot establish eligibility.
4. Keep the previous confirmed profile usable through provider errors or partial parses. Save a new profile revision only after review. Keep the raw résumé, extracted text, and model context out of ordinary logs.

### 5.2 Profile to ranked list

1. **Apply explicit constraints.** Evaluate location, remote eligibility, level, and any other deal-breakers the user selected. A conflict with a known hard requirement can move the job out of Best matches. Missing or conflicting posting details go into **Needs review**.
2. **Rank against evidence.** Compare responsibilities and required qualifications with confirmed profile projects and work history. Weight relevant outcomes and depth of experience. Recognize transferable experience and distinguish required skills from preferred ones.
3. **Explain the order.** Show one concrete reason the job fits and the biggest material gap or uncertainty. Link back to the relevant job requirement or profile fact in the reader. Keep pending, stale, and unavailable assessments distinct. Reserve numerical scores for cases where the scale has been validated.
4. **Keep refresh predictable.** Reuse results for the same job content and profile revision. Re-rank changed listings and refresh stale results after a profile update. Use bounded batches and the last good result where appropriate. With AI unavailable, continue collecting and allow basic filtering from known metadata.
5. **Evaluate before release.** Build a small set of roughly 20 representative listings labeled **would apply**, **maybe**, or **skip** using your résumé and preferences. Include false friends, transferable skills, missing location details, and a hard eligibility conflict. Review the top ten against those judgments. Inspect every labeled strong fit the default view missed and resolve blocking misses or flag the relevant uncertainty. Record the examples and ranking decisions without committing personal résumé content.

## 6. AI outreach and Gmail

### 6.1 Composer and draft quality

- Place **Draft outreach** on Jobs, Companies, and Application details. Open one shared composer. Use confirmed profile facts, the selected job or company, and a few user-supplied writing examples. Show the context used.
- Reuse the current provider settings and integration. Make connection status and a connection test available in Settings. Keep the composer usable for manual writing when the provider is offline or unconfigured.
- Generate a short, specific subject and body with a clear ask. Treat listing text and writing examples as reference material. Personalize from confirmed facts, avoid invented recipient names and achievements, and leave **To** blank unless a known contact is selected. Keep factual claims traceable in review.
- Keep all fields editable and save drafts locally. Offer a focused revision action such as **Make shorter** or **Change emphasis**. Present generated revisions for review and preserve the current edits on cancellation or failure. Generation and revision leave the final send decision to the user.
- Evaluate sample drafts for a role, company outreach without a role, and a missing contact. Check for invented facts, generic filler, tone drift, and whether the result is close enough to send after a quick review.

### 6.2 Gmail connection and handoff

- Use Google’s desktop OAuth flow through the system browser. Use a loopback callback and PKCE, verify the returned state, and request Gmail’s `gmail.compose` scope for draft creation and updates. Google classifies the scope as restricted. Confirm which consent and verification requirements apply to the intended personal-use setup before relying on it. External OAuth clients in Testing receive Gmail refresh tokens that expire after seven days. Keep tokens out of the renderer, logs, and repository. Use protected OS-backed credential storage and show a clear recovery path if it is unavailable or authorization expires. [Google desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app) · [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes) · [Google token expiration](https://developers.google.com/identity/protocols/oauth2#expiration)
- Show the connected account before saving. Scope remote draft IDs to that account. Preserve local drafts when switching or disconnecting accounts. Make a changed account explicit before saving its first draft.
- **Save to Gmail Drafts** creates the remote draft on first save and updates it thereafter. Serialize saves for a draft. Preserve local edits on errors, and reconcile an uncertain first save before retrying so a timeout cannot silently create duplicates. Give a clear recovery action if Gmail has already removed the draft.
- **Open Gmail to schedule** saves the draft and opens Gmail. Verify whether opening the exact draft is dependable. Use Gmail Drafts as the fallback and show the subject so it’s easy to locate. You pick and approve the time using Gmail’s **Schedule Send**, which works after Surface closes. Keep Surface’s state at **Drafted** until a user-confirmed outreach status. A Gmail handoff alone cannot confirm that an email was scheduled or sent.
- Use a designated test Gmail account and recipient for the release check. Exercise connection, reconnect, draft create, draft update, a failed save, and the scheduling handoff. Confirm the scheduled item in Gmail, then cancel it as part of verification.

References: [Gmail drafts API](https://developers.google.com/workspace/gmail/api/guides/drafts) · [Gmail Schedule Send](https://support.google.com/mail/answer/9214606?hl=en-GB)

## 7. UI and UX with Impeccable

Use **Impeccable in Operate mode** when shaping the screens and during the release review. Start from the actual Surface renderer and its design guidance. Reuse Geist typography, theme tokens, and shared accessible components. Evaluate the interface by how easily you can scan jobs, update a status, and complete an action.

- Keep Jobs, Companies, and Applications in primary navigation and Activity at the bottom. Make the next likely action visible. Use the same labels, filter placement, status affordances, and feedback patterns across the list views.
- Preserve filters, sort, selection, and scroll when returning from a detail view. Keep row changes visible and reversible. Use a reader or split view where the available width supports it, and reflow to one pane in a narrow window.
- Give résumé review and email editing room for long content. Keep relevant source text or drafting context within reach. Make the connected account and the difference between saved locally and saved in Gmail apparent.
- Design empty, loading, partial, stale, and failed states as part of each screen. Keep existing results visible during refresh and preserve typed content when a request fails. State what happened and provide a useful recovery action.
- Follow Surface’s accessibility target for AA contrast, visible focus, keyboard operation, readable status labels, and reduced motion. Check focus restoration, long company and role names, narrow desktop widths, and both themes. Use existing UI primitives and restrained feedback.
- Review the full workflow in the packaged dev app. Batch the findings, fix them together, and inspect the corrected screens once more. Run the Impeccable detector on changed UI during the final pass where available.

## 8. Data preservation and code cleanup

1. **Identify the exact dev profile before any mutation.** Stop writers and use a SQLite-aware backup that includes committed WAL data. Keep the matching files referenced by the database, including snapshots and profile assets where applicable. Rehearse restore using a separate dev profile. Keep production and historical data directories outside the operation.
2. **Map before changing schemas.** Inspect existing company review states, saved and dismissed jobs, profile revisions, notes, contacts, reports, source links, and runs. Preserve IDs, timestamps, and relationships. Keep original status values where they cannot be mapped confidently. A saved listing alone is insufficient evidence that you applied.
3. **Make changes forward-compatible.** Start with additive migrations and transactional backfills. Verify reruns, interrupted upgrades, and old records with missing or unexpected values. Keep SQLite and PostgreSQL definitions and migrations consistent wherever they share runtime code. Exercise shared database changes only against isolated dev or test databases.
4. **Remove confirmed dead paths.** Trace imports, routes, startup processes, UI entry points, API consumers, and stored references. Retire duplicate background workflows, surplus Activity chrome, and screens that no longer serve the daily flow. Preserve compatibility links or a narrow read path wherever users have saved data. Keep useful shared primitives.
5. **Reclaim storage only when proven safe.** Remove genuinely unused schema fields or tables after checking that they are empty, safely migrated, or explicitly disposable. Preserve uncertain legacy records in a recoverable form. Keep cleanup separate from any age-based retention policy.
6. **Verify the before/after.** Compare record counts and representative records, check foreign-key integrity and data links, and test a second startup. Document the dev backup location, restore steps, and which obsolete storage or entry points were retained for compatibility.

## 9. Release checklist

- [ ] Lint, type checks, and focused regression tests pass for status changes, deduplication, migrations, résumé review, ranking, and Gmail draft retries.
- [ ] The dev package builds and launches. Run the repository’s dev smoke check on the packaged build. Test startup with a fresh profile and an upgraded copy of the existing dev profile.
- [ ] Old companies, jobs, notes, profile history, and saved research remain reachable. Archive and restore preserve links and dates. The backup can be restored.
- [ ] A portal refresh with one failing source leaves the previous jobs visible and collects from healthy sources. Activity shows the useful details, and no browser process is launched.
- [ ] The résumé review preserves manual edits. Best matches are useful on the labeled job set. The Jobs view remains usable when ranking is delayed or the AI connection is unavailable.
- [ ] You can go from **Companies → Jobs → In queue → Applications → Applied**, change status inline, find the record using filters, and restore an archived record after reopening Surface.
- [ ] You can create an outreach draft, edit it, save it to Gmail twice without duplication, and schedule it in Gmail with an explicit confirmation. The same draft remains recoverable after a connection failure.
- [ ] The main flow works by keyboard in light and dark themes and at normal and narrow desktop sizes. Review the packaged dev build and record any blocker that would prevent daily use.

**Done means you can open the packaged dev app, find a role worth applying to, prepare outreach if useful, and track the application with your existing data intact.** Deliver the dev build location and launch command, the backup and restore location, and concise evidence that those checks passed.
