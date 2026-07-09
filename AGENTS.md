# Agent Working Agreement

This repository is maintained by Peter Dresslar with help from coding agents and
human contributors. Treat this file as the shared contract for how work should be
planned, changed, reviewed, and shipped.

## Project Boundary

This project is a voice layer for Zotero, built on Speechify's supported public
APIs. It lets a user talk with their papers: hear selected text read aloud
("Say") and dictate annotations by voice ("Annotate"), as described in
`docs/specs.md`.

The current phase is a Chrome extension targeting the Zotero Web reader on
zotero.org, where no read-aloud or voice capability exists today. A Zotero
desktop plugin (.xpi) is the planned follow-on port — desktop is where the
Zotero community lives. Design decisions should not foreclose the desktop
port, but do not build .xpi scaffolding, local-server plumbing, or desktop
code paths in this phase.

This is an unofficial, independent connector. It is not affiliated with,
endorsed by, or supported by Speechify or Zotero. Public-facing docs must say
so plainly.

Keep changes inside this product boundary unless an issue or maintainer
decision explicitly expands the scope.

## Architecture Boundary

The two features exercise different Speechify modalities and should be treated
as independent verticals:

- Say uses the text-to-speech API (streaming synthesis of selected text).
- Annotate uses the Voice Agents API: a realtime LiveKit/WebRTC conversation
  in the extension, with annotation persistence implemented as a client-side
  tool call.

Do not force shared abstractions across the two before one clearly earns it.
Shared code for API-key handling, settings, and Zotero context capture is
expected; a unified "voice provider" layer is not, unless the maintainer
decides the features should communicate.

The repository is a pnpm workspace monorepo:

- `apps/chrome-extension/` — the current phase.
- `apps/zotero-plugin/` — the future desktop port; stays empty until that
  phase begins.
- `packages/speechify-client/` — Say synthesis (via `@speechify/api`) and
  agent session bootstrap.
- `packages/zotero-api/` — `api.zotero.org` access and annotation payload
  construction.
- `packages/agent-config/` — the versioned agent instructions and tool
  definitions.

Keep package boundaries honest: a package exists because both surfaces will
need it or because it isolates a provider, not to pre-build speculative
layers.

Reads and writes take different paths, on purpose:

- Reading context (current item, page, text selection) comes from the Zotero
  web reader DOM. The reader is open source (`zotero/reader` on GitHub); when
  selectors break, consult the source and fix the smallest reliable
  interaction path. Keep all selectors and DOM logic isolated in one module,
  and leave notes about what was manually verified.
- Writing goes through the Zotero Web API (`api.zotero.org`) with the user's
  own API key. Annotations created there sync back to desktop Zotero. Never
  write by injecting into the reader DOM.

Annotation placement fallback order: a text selection becomes a highlight
annotation with the transcript as its comment; no usable selection or position
becomes a child note on the item. Do not pin annotations to positions the user
did not choose.

The Annotate agent must capture the user's annotation verbatim and read back
exactly what it heard. Helpful paraphrasing by the agent is a defect. Agent
instructions and tool definitions are product surface: keep them versioned in
this repository (created or updated via the API), not configured ad hoc in the
Speechify dashboard, so any user can reproduce the connector with their own
key.

## Tech preferences

- Python: `uv`; TypeScript: `pnpm`
- `gh` for interacting with source
- TypeScript with `strict` enabled; plain JS only where a manifest or content
  script genuinely cannot be built
- ESLint (flat config) + Prettier, same settings as zotero-notebooklm
  (80 columns, 2-space indent, LF)
- pnpm workspace monorepo: apps under `apps/`, shared code under `packages/`
  (see Architecture Boundary for the layout)
- Chrome extension is Manifest V3. MV3 forbids remotely hosted code, so every
  runtime dependency is bundled — use Vite for the extension build
- Sanctioned runtime dependencies: `@speechify/api` (the official SDK,
  currently TTS-only) for Say, and `livekit-client` for the agent voice
  session. The Zotero Web API is called with plain `fetch` — no client
  library
- Vitest, following the test layout of the official Speechify SDK
  (`SpeechifyInc/speechify-api-sdk-typescript`): `unit/` for pure logic,
  `wire/` for request/response-shape tests against an msw-backed mock server.
  No live-API calls in tests
- Plain HTML/CSS/TS for popup and options pages — no UI framework unless a
  feature earns it
- Pin the toolchain in `package.json`: `engines.node` >= 22 and latest
  stable pnpm 10.x in `packageManager`

## Roles

Humans own product direction, release decisions, issue prioritization, and
security tradeoffs.

Agents may inspect, implement, test, document, and prepare PRs. Agents should
make reasonable local engineering decisions, but should pause before changing
the product shape, dependency strategy, release process, or security model.

Do not overwrite or revert work you did not make unless the maintainer explicitly
asks for that operation.

## Branch And PR Discipline

Do not commit directly to `main`. Use a branch for every change and open a PR.

Keep PRs reviewable. A good default is one PR for one issue or one coherent
maintenance task. Avoid mixing bug fixes, dependency migrations, UI polish, and
documentation rewrites unless the PR description explains why they belong
together.

Prefer atomic commits:

- Reproduce or document the bug.
- Implement the narrow fix.
- Add or update tests.
- Update docs or release notes.

Link PRs to the relevant GitHub issue when one exists.

## GitHub Ruleset

This repository uses the `Solo-to-Small Workflow` ruleset on the default
branch, based on `peterdresslar/rulesets`.

The ruleset enforces the baseline workflow:

- Direct commits to `main` are blocked because all changes must go through a PR.
- Human review is encouraged but not required by tooling for solo-maintainer
  work; the required approval count is zero.
- The default branch cannot be deleted.
- Non-fast-forward updates to the default branch are blocked.

Treat the PR as the required self-review surface even when no second reviewer is
involved. When collaborating with another human or agent, ask for review when the
change has meaningful risk, scope uncertainty, or security implications.

If this repository later adopts the `Solo-to-Small-Testing` variant or another
required-check ruleset, do not merge while required checks are red. Fix the
failure or document an explicit maintainer bypass for emergencies.

## Commit Messages

Follow GitHub-friendly commit messages. Use a short imperative subject, include
the relevant issue number when one exists, and keep the body focused on why the
change was made.

When a commit closes or fixes an issue on merge, use GitHub keywords in the PR
description rather than forcing every commit subject to carry `Fixes #...`.

## Merge Policy

Squash merge PRs by default to keep `main` readable.

Use a regular merge only when the PR has a deliberately structured commit
history that is useful to preserve. Do not use rebase merges unless the
maintainer explicitly asks for one.

Before merging, make sure the final PR title and description are accurate,
because the squash commit will usually become the durable history entry.

## Package Management

_Please_ use `pnpm` for dependency installation and scripts.

Do not maintain npm and pnpm lockfiles in parallel.

Avoid adding new runtime dependencies unless they materially reduce complexity or
match an established project pattern.

## Local Tooling

Keep personal editor, IDE, browser-profile, and local-agent state out of the
repository. Do not add `.vscode`, `.idea`, `.cursor`, `.zed`, `.agents`,
`.codex`, or similar tool-specific folders.

Shared project standards should live in editor-neutral files such as
`AGENTS.md`, `package.json`, `tsconfig.json`, ESLint config, Prettier config, and
test configuration. If a tool-specific setup becomes necessary, document the
reason in the PR and prefer an editor-neutral script or command when possible.

## Verification

Before marking work ready for review, run the relevant checks for the files you
touched. For typical code changes, expect:

- `pnpm install --frozen-lockfile`
- `pnpm run build`
- `pnpm run lint:check`

Voice flows cannot be fully covered by automation. Document manual verification
in the PR: which flow was exercised, in Chrome against the Zotero Web reader,
with a real microphone where relevant, and what the resulting annotation looked
like (including confirming sync into desktop Zotero when the change touches
persistence).

## Keys, Audio, And Privacy

The extension holds two user secrets in extension storage: a Speechify API key
and a Zotero Web API key. Neither may be committed, logged, or sent anywhere
except its own service. Instruct users to create the Zotero key with the
minimum permissions the workflow needs.

Only short-lived conversation tokens may be exposed beyond extension storage
(for example, to the LiveKit session).

Microphone audio and transcripts are sensitive user data. Never log them, and
never write them anywhere except the annotation or note the user asked to
create. Documentation must state exactly which external service receives audio
and text, and when.

Do not log file contents, credentials, private library data, or item metadata
beyond what a specific error message requires.

## Extension Safety

Keep host permissions and content-script matches as narrow as the workflow
allows: the Zotero Web reader pages, `api.zotero.org`, and the Speechify API
endpoints. Do not broaden matches, add wide `tabs` access, or request new
permissions without a clear reason recorded in the PR.

Prefer explicit loading, error, retry, and timeout states over silent failure,
especially around the realtime voice session.

## Documentation

Public docs should help a new user install, build, obtain both API keys,
troubleshoot, and report issues without private context. Lead with the
unofficial-status disclaimer.

Keep README changes accurate to the current release state. If there is no
published release or Chrome Web Store listing, do not imply that one exists.

## Privacy

Do not commit secrets, personal tokens, generated logs with personal data, or
local browser/profile state.

When sharing command output in issues or PRs, remove paths, filenames, or Zotero
library details that are not necessary to understand the problem.
