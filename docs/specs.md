# Specs for Zotero-speechify

## Zotero Plugin

A Zotero plugin (.xpi) that allows a user to talk with their papers.

## Top priority features

## Say

- Read the selected text aloud (or the whole article if nothing selected; but selected text makes more sense).

### Annotate

From the Zotero menu click Voice Annotate here.

- We first need to know where to save the annotation. Check to see if the cursor has a location and span.
  - Selection exists → highlight annotation with the transcript as its comment (the happy path)
  - Reader open, no selection → note annotation pinned to the current page
  - No reader open at all → child note on the item ("Voice note - {date}")
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

[QUESTION] Does it make sense to read back and confirm? For now, let's do that. We could make read-back an option in the Plugin 
easily enough.

## Other features

### Search

### Send

Send sends the article (with annotations) to any requested person through email with a note transcribed from voice if desired.