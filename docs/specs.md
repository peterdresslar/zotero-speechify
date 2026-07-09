# Specs for Zotero-speechify

## {v1} Chrome extension

A Chrome extension that adds voice to Zotero's online reader

## {v2} Zotero Plugin

A Zotero plugin (.xpi) that allows a user to talk with their papers.

## Top priority features

{v1} Start with the Chrome extension UI and work to the two features.

## Say

- Read the selected text aloud.
- {v1} If no text is selected, say "sorry, I don't see a selected passage to read." Do say
  something out loud in this case! Otherwise users will not know what's wrong.

### Annotate

From the Zotero menu click Voice Annotate here.

- We first need to know where to save the annotation. Check to see if the cursor has a location and span.
  - Selection exists → highlight annotation with the transcript as its comment (the happy path)
  - Reader open, no selection → note annotation pinned to the current page
  - {v1} No reader open: reply out loud "Sorry, I don't see an article reader open right now."
  - {v2} No reader open at all → child note on the item ("Voice note - {date}")
- Capture the annotation. First, speechify-announce "Please say your annotation. [INSTRUCTIONS]"
- User speaks the annotation with hooks for [COMMANDS]
- [QUESTION] System reads back the annotation and confirms with the user
- Annotation is saved into DB

[COMMANDS]

#### v1

- Push to talk
- Push or silence detection to stop

#### v2

- Pause. Wait until the user says continue
- Continue. Stop pausing.
- Cencel. Cancel the annotation.
- Restart. Restart the annotation from the beginning at the same (or whatever current) location.

[INSTRUCTIONS] This is at the end of the prompt to say the annotation. We may optionally (occassionally? First time?) mention
that the user can ask to pause, restart, or cancel. Or whatever optionality we can provide.

[QUESTION] Does it make sense to read back and confirm? This may be a v2 feature.

## Other features

### Search

### Send

Send sends the article (with annotations) to any requested person through email with a note transcribed from voice if desired.

### Shared libraries

Not yet sure about this capability. Possibly desirable but not {v1}

### More v1 notes

- v1 human interface in the browser should be sophisticated and attractive. Go
  the extra distance on in-reader controls.
- The in-reader control can have a double/split button for say/annotate. Note that
  given the context, skeumorphic control design seem reasonable
- Use toasts with (gentle, elegant) text errors but also speak them aloud. If we don't say errors
  aloud users might think the error is an audio issue
- Tools requiring an API key or some other config can appear as disabled, but we do not want
  them to disappear entirely from the page--instead clicking them should remind the user
  that we need more information to set up.
- All UI should be relatively elegant (considering this is Zotero online instead of desktop)
- Keyboard shortcuts for say and annotate should be configurable
