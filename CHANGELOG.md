# Changelog

## 0.1.0 — 2026-07-09

First working release. Chrome extension for the Zotero Web reader.

### Say

- Streamed Speechify text-to-speech for the selected passage
  (time-to-first-sound roughly constant regardless of length).
- Transport deck: pause/resume, restart, stop, and pitch-preserving speed
  control (0.8×–2×), with an LED loading gauge.
- Optional text normalization (off by default — improves number and
  abbreviation reading, can slow responses).

### Annotate

- Realtime Speechify voice-agent session (LiveKit/WebRTC in the extension's
  offscreen document): dictate, hear a verbatim read-back, confirm, save.
- Voice commands: cancel, restart, pause/continue; question-shaped
  annotations are captured as text, not answered.
- Saves as a real highlight annotation (position computed from the reader
  selection; dictation as comment) with a child-note fallback whenever a
  position cannot be resolved — an annotation is never lost.
- Instant on-page echo of the saved highlight (the reader itself only shows
  new annotations after a reload).
- The voice agent is provisioned automatically onto the user's own Speechify
  account from the definition versioned in `packages/agent-config`, and
  re-provisioned whenever that definition's revision changes.

### Foundation

- pnpm workspace monorepo: extension app plus `agent-config`,
  `speechify-client`, and `zotero-api` packages.
- Manifest V3 throughout; API keys never leave extension contexts; audio and
  transcripts are never logged.
- Unit test suite (vitest) for path parsing, annotation targeting, session
  request building, and the agent definition.
