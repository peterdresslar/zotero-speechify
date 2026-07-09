# Zotero Speechify

Zotero Speechify is an unofficial Chrome extension for adding
Speechify-based voice controls to the Zotero Web reader. It currently
supports two workflows: reading selected text aloud and dictating annotations
that are saved to the user's Zotero library.

This project is independent. It is not affiliated with, endorsed by, or
supported by Speechify or Zotero.

## Current Scope

### Text-to-speech

Select text in the Zotero Web reader and press **Say**. The extension sends
the selected text to Speechify's text-to-speech API, streams the returned
audio, and displays basic playback controls: pause/resume, restart, stop, and
playback speed from 0.8x to 2x. An optional text-normalization setting can be
enabled for numbers and abbreviations.

### Voice annotation

Select a passage and press **Annotate**. A Speechify voice agent records the
spoken annotation, reads it back verbatim when read-back is enabled, and saves
the annotation after confirmation. With a usable PDF text selection, the
result is a Zotero highlight annotation with the dictated text stored as its
comment and tagged `voice-annotation`.

During the annotation flow, the user can say "cancel", "restart", or
"pause", or can correct the read-back. Questions and tentative notes are
preserved as annotation text; the agent is not intended to answer questions
about the paper. Without a usable text selection, the dictation is saved as a
child note on the Zotero item.

The extension uses the user's own Speechify and Zotero API keys. It does not
operate a server. On first use of Annotate, it provisions a Speechify agent
named `zotero-speechify-annotate` in the user's Speechify account from the
definition versioned in this repository.

## Installation

You need Chrome, plus two keys:

- a [Speechify API key](https://speechify.ai/api) (both features), and
- a [Zotero API key](https://www.zotero.org/settings/keys) with **read/write
  access** to your library (Annotate only).

The Zotero desktop app is not required. The extension works against the
Zotero **Web** reader at `zotero.org`; desktop receives voice annotations via
normal Zotero sync.

There is no Chrome Web Store listing yet.

1. For a tagged release, download the release zip. From a checkout, build the
   same installable artifact with
   `pnpm --filter @zotero-speechify/chrome-extension run package`.
2. Unzip it; open `chrome://extensions`, enable Developer mode, choose
   **Load unpacked**, and select the unzipped folder.
3. Open the extension's **Settings** (puzzle icon > Zotero Speechify, or the
   gear on the floating control): paste both API keys, click **Enable
   microphone** (needed for Annotate), and optionally set a TTS voice id.
4. Open any item in the Zotero Web reader. The floating control appears at the
   bottom right. Select a sentence and press Say.

## Privacy and data flow

Everything runs between your browser and the two services you hold keys for.
There is no third-party server and no telemetry.

- **Say** sends the selected text to Speechify's text-to-speech API and plays
  the returned audio locally.
- **Annotate** streams your microphone audio to a Speechify voice agent
  session (WebRTC) for the duration of the annotation. Speechify receives the
  audio and transcript; retention and deletion are governed by the user's
  Speechify account and API terms.
- Confirmed annotations are sent only to `api.zotero.org` and stored in your
  Zotero library.
- Your API keys are stored in the extension's local storage and sent only to
  their own services. Microphone audio and transcripts are never logged by
  the extension.

Both features use the user's own service accounts. Speechify billing depends
on the current terms of the user's Speechify API plan.

## Known limitations

- A newly saved highlight is echoed on the page immediately, but the reader's
  annotation _sidebar_ only lists it after the page is reloaded. The web
  reader does not refetch items while in reader view.
- Highlight placement requires a text selection in a PDF; EPUB/snapshot
  readers and selection-less annotations fall back to a child note on the
  item.
- The extension recognizes reader pages by their URL; other Zotero surfaces
  (library view, desktop app) are unaffected.

## Troubleshooting

- Failures should surface as toasts on the reader page; most identify the
  missing component, such as a key, microphone access, or a session failure.
- Diagnostic detail is available from `chrome://extensions` by opening
  Zotero Speechify's inspection views: the **service worker** for
  provisioning, session, and save errors, and the **offscreen page** for
  audio and agent-session events.
- After updating the extension, reload it and refresh open reader tabs.
  Content scripts do not reattach to already-open tabs by themselves.
- To force the agent to be re-created, clear the agent id field in Settings.

## Development

pnpm workspace monorepo (Node >= 22, pnpm 10):

```
apps/chrome-extension/     the extension (Vite, MV3)
packages/agent-config/     versioned voice-agent prompt + tool definitions
packages/speechify-client/ Speechify API access (TTS, agents, provisioning)
packages/zotero-api/       Zotero Web API writes and reader-path parsing
```

```sh
pnpm install
pnpm run build        # typecheck + build everything
pnpm run test         # vitest (unit + wire projects)
pnpm run lint:check
pnpm --filter @zotero-speechify/chrome-extension run dev      # watch build
pnpm --filter @zotero-speechify/chrome-extension run package  # release zip
pnpm --filter @zotero-speechify/speechify-client run provision # dev: agent upsert
```

Inside the extension app, `src/entries/` holds the five MV3 entrypoints:
background service worker, content script, offscreen audio page, popup, and
options. Each entry's output has platform constraints, most notably that the
content script must bundle self-contained with no import statements.

### Distribution

`apps/chrome-extension/dist/` and `build/` are generated output and stay
untracked. The repository does not contain build artifacts. The installable
zip is produced only by the `package` script, which also verifies manifest
consistency and the content script's no-imports constraint. Source maps stay
in `dist/` for local debugging but are excluded from the packaged zip. Tagged
releases should attach the generated zip to a GitHub Release. Before tagging,
run the [manual test checklist](docs/manual-test-checklist.md) against the
packaged build.

Contributor ground rules live in [AGENTS.md](AGENTS.md). Issues and PRs are
welcome; please keep library details out of pasted logs.

## Roadmap (not built yet)

- Zotero desktop plugin (.xpi) port, using the same packages on a new surface.
- Read linked articles at publisher sites, not just reader attachments.
- Live sidebar refresh for new annotations (pending an upstream hook).
