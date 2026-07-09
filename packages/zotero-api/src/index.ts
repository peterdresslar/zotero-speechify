export const ZOTERO_API_BASE_URL = "https://api.zotero.org";
export const ZOTERO_API_VERSION = "3";
export const VOICE_ANNOTATION_TAG = "voice-annotation";

export interface ZoteroLibrary {
  type: "user" | "group";
  id: string;
}

export interface ZoteroKeyInfo {
  userID: number;
}

// GET /keys/current resolves the numeric user id behind an API key; reader
// URLs carry usernames, but the write API requires the numeric id.
export async function getKeyInfo(apiKey: string): Promise<ZoteroKeyInfo> {
  const payload = await zoteroRequest(apiKey, "/keys/current", "GET");

  if (
    typeof payload === "object" &&
    payload !== null &&
    "userID" in payload &&
    typeof payload.userID === "number"
  ) {
    return { userID: payload.userID };
  }

  throw new Error("Zotero did not return a userID for this API key.");
}

export interface CreateVoiceNoteInput {
  apiKey: string;
  library: ZoteroLibrary;
  parentItemKey: string;
  annotationText: string;
  selectedText?: string;
  pageLabel?: string;
}

// Creates the annotation as a child note of the item. This is the
// AGENTS.md fallback tier that needs no position data; a true positioned
// highlight annotation is a future refinement.
export async function createVoiceNote({
  apiKey,
  library,
  parentItemKey,
  annotationText,
  selectedText,
  pageLabel
}: CreateVoiceNoteInput): Promise<{ noteKey: string }> {
  const prefix = library.type === "user" ? "/users" : "/groups";
  const payload = await zoteroRequest(
    apiKey,
    `${prefix}/${library.id}/items`,
    "POST",
    [
      {
        itemType: "note",
        parentItem: parentItemKey,
        note: buildNoteHtml({ annotationText, selectedText, pageLabel }),
        tags: [{ tag: VOICE_ANNOTATION_TAG }]
      }
    ]
  );

  const noteKey = extractCreatedKey(payload);

  if (noteKey === undefined) {
    throw new Error("Zotero did not confirm the note creation.");
  }

  return { noteKey };
}

export const HIGHLIGHT_COLOR = "#ffd400";

// PDF-space position: pageIndex is zero-based; rects are [x1, y1, x2, y2]
// in PDF points with the origin at the page's bottom-left corner.
export interface HighlightPosition {
  pageIndex: number;
  rects: number[][];
  sortIndex: string;
}

export interface CreateHighlightAnnotationInput {
  apiKey: string;
  library: ZoteroLibrary;
  attachmentItemKey: string;
  selectedText: string;
  comment: string;
  pageLabel?: string;
  position: HighlightPosition;
}

// Creates a real reader annotation (child of the PDF attachment), which is
// what the reader page and sidebar actually display.
export async function createHighlightAnnotation({
  apiKey,
  library,
  attachmentItemKey,
  selectedText,
  comment,
  pageLabel,
  position
}: CreateHighlightAnnotationInput): Promise<{ annotationKey: string }> {
  const prefix = library.type === "user" ? "/users" : "/groups";
  const payload = await zoteroRequest(
    apiKey,
    `${prefix}/${library.id}/items`,
    "POST",
    [
      {
        itemType: "annotation",
        parentItem: attachmentItemKey,
        annotationType: "highlight",
        annotationText: selectedText,
        annotationComment: comment,
        annotationColor: HIGHLIGHT_COLOR,
        annotationPageLabel: pageLabel ?? String(position.pageIndex + 1),
        annotationSortIndex: position.sortIndex,
        annotationPosition: JSON.stringify({
          pageIndex: position.pageIndex,
          rects: position.rects
        }),
        tags: [{ tag: VOICE_ANNOTATION_TAG }]
      }
    ]
  );

  const annotationKey = extractCreatedKey(payload);

  if (annotationKey === undefined) {
    throw new Error("Zotero did not confirm the annotation creation.");
  }

  return { annotationKey };
}

// Reader URLs look like /<user>/(collections/<key>/)?items/<itemKey>/
// (attachment/<key>/)?reader, or /groups/<id>/... for group libraries. When
// there is no attachment segment, the item itself is the attachment.
export function parseZoteroReaderPath(pathname: string): {
  groupId?: string;
  parentItemKey?: string;
  attachmentKey?: string;
} {
  const groupMatch = /^\/groups\/(?<groupId>\d+)\//u.exec(pathname);
  const itemMatch = /\/items\/(?<itemKey>[A-Z0-9]{8})(?:\/|$)/u.exec(pathname);
  const attachmentMatch =
    /\/attachment\/(?<attachmentKey>[A-Z0-9]{8})(?:\/|$)/u.exec(pathname);

  return {
    groupId: groupMatch?.groups?.groupId,
    parentItemKey: itemMatch?.groups?.itemKey,
    attachmentKey:
      attachmentMatch?.groups?.attachmentKey ?? itemMatch?.groups?.itemKey
  };
}

async function zoteroRequest(
  apiKey: string,
  path: string,
  method: "GET" | "POST",
  body?: unknown
): Promise<unknown> {
  const response = await fetch(`${ZOTERO_API_BASE_URL}${path}`, {
    method,
    headers: {
      "Zotero-API-Key": apiKey,
      "Zotero-API-Version": ZOTERO_API_VERSION,
      "Content-Type": "application/json"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(
      `Zotero request ${method} ${path} failed (${String(response.status)}).`
    );
  }

  return response.json();
}

function buildNoteHtml({
  annotationText,
  selectedText,
  pageLabel
}: {
  annotationText: string;
  selectedText?: string;
  pageLabel?: string;
}): string {
  // The annotation leads: Zotero derives the note's display title from the
  // first line, and that title should read as the user's words, not as the
  // quoted paper text.
  const parts: string[] = [`<p>${escapeHtml(annotationText)}</p>`];

  if (selectedText !== undefined && selectedText.trim().length > 0) {
    parts.push(
      `<blockquote><p>${escapeHtml(selectedText.trim())}</p></blockquote>`
    );
  }

  const provenance =
    pageLabel === undefined
      ? "Voice annotation"
      : `Voice annotation — page ${escapeHtml(pageLabel)}`;
  parts.push(`<p><em>${provenance}</em></p>`);

  return parts.join("\n");
}

function extractCreatedKey(payload: unknown): string | undefined {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "success" in payload &&
    typeof payload.success === "object" &&
    payload.success !== null
  ) {
    const first = (payload.success as Record<string, unknown>)["0"];
    return typeof first === "string" ? first : undefined;
  }

  return undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export interface ReaderAnnotationContext {
  readerOpen: boolean;
  selectedText: string;
  pageLabel?: string;
}

export type AnnotationTarget =
  | { kind: "highlight"; selectedText: string }
  | { kind: "page-note"; pageLabel?: string }
  | { kind: "no-reader" };

export function chooseAnnotationTarget(
  context: ReaderAnnotationContext
): AnnotationTarget {
  if (!context.readerOpen) {
    return { kind: "no-reader" };
  }

  if (context.selectedText.trim().length > 0) {
    return { kind: "highlight", selectedText: context.selectedText.trim() };
  }

  return { kind: "page-note", pageLabel: context.pageLabel };
}
