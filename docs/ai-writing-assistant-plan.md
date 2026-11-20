# Personal AI writing assistant implementation plan

## Product goal

Build a private, local-first writing assistant that remembers the user's profile and writing style, keeps separate conversations for separate opportunities, and helps prepare and schedule outreach emails. The user uploads their resume once and supplies their own writing instructions and examples.

## Existing foundation

- The app already stores profile and job preferences in SQLite (`apps/backend/src/modules/profile`).
- Resume import already extracts resume content to prefill the profile.
- OpenCode Go is already the configured provider, with `deepseek-v4.1-flash` as the default model. Settings already allow entering a model ID.
- The desktop app already saves AI settings in its user data directory and encrypts the API key with Electron `safeStorage` when the OS supports it. The settings API returns only whether a key exists, not the key itself.
- Gmail connection and draft support already exist in the desktop app.
- The backend currently has no `ai` SDK dependency or writing-assistant chat feature.

## User experience

1. **Personal setup**
   - Review/edit a reusable profile created from the resume: experience, skills, achievements, links, and career goals.
   - Add a durable writing guide (tone, length, words/claims to avoid, preferred structure).
   - Import 8–9 real cold emails as labeled examples. Keep source examples editable and removable.
   - Set the OpenCode Go API key once in Settings; select a model from available choices or enter a model ID.

2. **Opportunity workspace**
   - Create one conversation per founder, role, or company. Each uses the shared profile, writing guide, and examples by default.
   - Add opportunity-specific context (company, recipient, role, why now, relevant link). Keep the user in control of what gets included.
   - Generate and revise cold emails, cover letters, and other requested text. Show drafts in an editable preview; never invent personal facts.
   - Let users correct style inline and offer to save a correction as a preference, rather than silently changing the base instructions.

3. **Email workflow**
   - Connect Gmail and create a draft from the approved message.
   - Schedule only after the user confirms recipient, subject, body, and send time.
   - Persist the schedule and show queued/sent/failed/cancelled status. MVP scheduling runs while the desktop app is open and retries due jobs on launch; make this limitation visible. A future always-on scheduler can be considered if unattended delivery is required.

## Technical plan

### 1. Vercel AI SDK integration

- Add the current `ai` package and `@ai-sdk/openai-compatible` to `apps/backend`; use `@ai-sdk/react` in `apps/web` for streaming chat.
- Build one server-side model factory from existing runtime settings, using `createOpenAICompatible` with the configured OpenCode Go base URL, API key, and selected model. Keep all provider calls in the backend; never send the key to the renderer or persist it in browser storage.
- Implement chat with AI SDK `streamText` on the Hono backend and the current AI SDK UI transport/hook in the React client. Verify APIs against the installed SDK docs when implementing because the SDK changes frequently.
- Keep the provider/model selection in Settings. Validate saved values and provide a connection/model check. Treat model IDs as configurable strings; do not assume an unverified model catalog endpoint exists.

### 2. Persistent personal context

- Extend the profile area with a reusable writing profile: user-authored system instructions and preferences.
- Add a writing-example table containing label, example text, optional notes, and timestamps; support add/edit/delete and reordering.
- Persist original resume text or an editable extracted resume record so it can be revised later. Avoid requiring the PDF upload again for each opportunity.
- Construct each model request from: fixed safety/accuracy rules + saved user instructions + relevant profile facts + selected examples + current opportunity + conversation messages. Keep personal context out of unrelated users' data and avoid duplicating the entire resume where a smaller relevant excerpt is enough.

### 3. Chats and drafts

- Add SQLite tables for conversation metadata and ordered messages, keyed to the local user/profile. Store title, opportunity details, selected output type, model, timestamps, and message content.
- Add APIs to create/list/rename/archive conversations, fetch history, stream a reply, and delete a conversation.
- Persist user and completed assistant messages. Preserve the model used for each response, and handle interrupted streams without saving a partial answer as complete.
- Add a sidebar list of opportunity conversations and a chat + editable draft view. Include clear regenerate/copy/save draft actions.

### 4. Safe tools and email scheduling

- First tools: read the saved profile, retrieve writing examples, and create a Gmail draft. Use explicit, typed tool inputs and narrow server-side permissions.
- Require human confirmation before any external side effect. Scheduling and sending must show a final review step; the model cannot autonomously send email.
- Add a persistent scheduled-email queue with recipient, subject, body, timezone-aware send time, Gmail draft/message reference, status, and error details. Deduplicate retries.
- Extend Gmail integration only as needed for scheduling and sending; keep OAuth tokens in secure storage. Surface that the local desktop scheduler must be running for on-time delivery.

## Suggested delivery slices

1. **Remember me:** profile editor, writing guide, example library, secure settings review.
2. **Draft with me:** opportunity conversations, chat persistence, streaming AI drafts, model selector.
3. **Send with me:** Gmail draft creation, confirmation screen, schedule queue, status and retry handling.

## Key acceptance criteria

- Resume/profile, instructions, and examples are reused in new conversations without another upload.
- Each opportunity's context and history stays separate, while the shared writing profile is reusable.
- The selected model is used for the next generation and the API key never reaches frontend JavaScript or source control.
- The assistant grounds claims in the saved profile and asks for missing facts instead of fabricating them.
- The user can inspect and edit every generated email and must explicitly approve a scheduled send.
- A scheduled message survives app restart, and missed/failed jobs are visible rather than silently dropped.

## Main implementation areas

- `apps/backend/src/modules/profile/`: profile persistence and resume data.
- New `apps/backend/src/modules/writing/`: conversations, examples, prompt assembly, chat stream, draft/schedule APIs.
- `apps/backend/src/shared/ai/`: Vercel AI SDK model factory and shared prompt rules.
- `apps/backend/src/infrastructure/database/`: new tables and schema exports.
- `apps/web/src/features/settings/`: model and AI key settings.
- New `apps/web/src/features/writing/`: opportunity list, chat, writing preferences, and draft review.
- `apps/desktop/src/settings.ts`, `main.ts`, `preload.ts`, and `gmail.ts`: secure runtime settings and confirmed email actions.

## Implementation notes

- Do not put the user's real API key in code, `.env` committed to git, or a frontend bundle. Enter it once in the desktop Settings UI and use the existing OS-encrypted storage path.
- Check OpenCode Go's current supported model IDs and API compatibility before finalizing the model picker; keep a manual model-ID option as a fallback.
- The AI SDK's OpenAI-compatible provider package is the likely adapter for the OpenAI-compatible OpenCode Go endpoint. Confirm the endpoint behavior and SDK version during implementation.
