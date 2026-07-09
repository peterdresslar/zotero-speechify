# Manual test checklist

Automated coverage ends where Chrome, the microphone, and the live Speechify
and Zotero APIs begin. Run this checklist against a real reader tab before
tagging a release. Setup: extension loaded unpacked from `dist/`, both API
keys saved, microphone granted, a PDF open in the Zotero Web reader.

After any extension reload, refresh the reader tab first (content scripts do
not reattach on their own).

## Say

- [ ] Select a sentence → Say: audio starts quickly, transport deck appears
      with steady green LEDs.
- [ ] Long passage (several paragraphs): audio starts in roughly the same
      time as a short one (streaming), keeps playing to the end.
- [ ] Pause → resume → restart → stop all behave; deck hides on stop.
- [ ] Speed cycling: voice speeds up without chipmunk pitch; chosen rate
      persists into the next Say.
- [ ] Say with no selection: "no selected passage" toast, no API call.
- [ ] Keyboard shortcut triggers Say with a selection.

## Annotate

- [ ] With a selection: agent greets, dictate a sentence, verbatim read-back,
      confirm → "Saved to your library", agent hangs up by itself, deck
      closes, echo highlight appears on the page at the selection.
- [ ] Reload the reader page: the real highlight renders (page + sidebar),
      dictation is the comment, tag `voice-annotation`.
- [ ] Without a selection: saves as a child note on the item (dictation
      first, provenance line), visible in the library item pane.
- [ ] Dictate a question ("Are we sure this holds?"): captured as text, not
      answered.
- [ ] "cancel" mid-flow: nothing saved, session ends.
- [ ] "restart": prior dictation discarded, new one captured.
- [ ] "pause" → silence → "continue": no chatter while paused.
- [ ] Second press of Annotate (or the deck's End key) mid-session ends it.
- [ ] Desktop Zotero after sync: highlight visible in the desktop reader.

## Failure paths

- [ ] Wrong Speechify key: Say and Annotate both surface a key error toast;
      nothing hangs.
- [ ] Zotero key missing: Annotate refuses before starting a session.
- [ ] Microphone revoked (chrome://settings/content/microphone): Annotate
      reports the microphone problem and points at Settings.
- [ ] Consoles (service worker + offscreen) contain no errors during the
      happy paths, and no transcript or key content anywhere in the logs.

## Housekeeping

- [ ] Options page: keys persist, mic status correct, text normalization and
      read-back checkboxes persist.
- [ ] `pnpm run build`, `pnpm run test`, `pnpm run lint:check` all green.
- [ ] `package` script produces the zip; loading the unzipped folder as an
      unpacked extension works from a cold profile.
