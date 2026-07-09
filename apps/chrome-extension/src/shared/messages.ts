export type ReaderAction = "say" | "annotate";

export type ReaderActionStatus =
  | "ready"
  | "missing-config"
  | "missing-selection"
  | "no-reader"
  | "unavailable"
  | "error";

export interface ReaderActionResult {
  ok: boolean;
  status: ReaderActionStatus;
  message: string;
}

export interface RunActiveReaderActionMessage {
  type: "RUN_ACTIVE_READER_ACTION";
  action: ReaderAction;
  source: "popup" | "command";
}

export interface RunReaderActionMessage {
  type: "RUN_READER_ACTION";
  action: ReaderAction;
  source: "popup" | "command" | "reader-control";
}

export interface OpenOptionsMessage {
  type: "OPEN_OPTIONS";
}

export interface SynthesizeSpeechMessage {
  type: "SYNTHESIZE_SPEECH";
  input: string;
  rate: number;
}

export interface SynthesizeSpeechResult {
  ok: boolean;
  message: string;
}

export type AudioControlCommand =
  "pause" | "resume" | "stop" | "restart" | "status" | "set-rate";

export type AudioPlaybackState = "playing" | "paused" | "stopped" | "expired";

// Extension-internal only (service worker → offscreen document); content
// scripts cannot receive runtime.sendMessage broadcasts, so the key stays
// within extension pages.
export interface StreamSpeechMessage {
  type: "STREAM_SPEECH";
  input: string;
  rate: number;
  apiKey: string;
  voiceId: string;
  textNormalization: boolean;
}

export interface AudioControlMessage {
  type: "AUDIO_CONTROL";
  command: AudioControlCommand;
  rate?: number;
}

export interface AudioControlResult {
  ok: boolean;
  state: AudioPlaybackState;
  rate: number;
}

export interface OperationResult {
  ok: boolean;
  message: string;
}

// Captured by the content script when the user starts an annotation; the
// service worker holds it as the single pending annotation target so a
// stray or replayed save cannot write into the library.
export interface AnnotationTargetInfo {
  parentItemKey: string;
  groupId?: string;
  selectedText?: string;
  pageLabel?: string;
  attachmentKey?: string;
  // PDF-space selection rectangles; present when the reader selection could
  // be resolved to page coordinates, enabling a real highlight annotation.
  highlight?: {
    pageIndex: number;
    rects: number[][];
    sortIndex: string;
  };
}

export interface StartAnnotationMessage {
  type: "START_ANNOTATION";
  target: AnnotationTargetInfo;
}

// Service worker → offscreen document: join the realtime agent session.
export interface AgentSessionMessage {
  type: "AGENT_SESSION";
  url: string;
  token: string;
}

export interface StopAnnotationMessage {
  type: "STOP_ANNOTATION";
}

// Offscreen document → service worker when the agent calls the
// save_annotation client tool.
export interface SaveAnnotationMessage {
  type: "SAVE_ANNOTATION";
  verbatimText: string;
}

export interface AnnotationEndedMessage {
  type: "ANNOTATION_ENDED";
  reason: string;
}

// Service worker → tab after a successful save. Carries the saved highlight
// position so the content script can draw an immediate echo overlay: the web
// reader deliberately skips item refetches while in reader view, so the real
// annotation only renders after a page reload.
export interface AnnotationSavedMessage {
  type: "ANNOTATION_SAVED";
  highlight?: {
    pageIndex: number;
    rects: number[][];
  };
}

export type ExtensionMessage =
  | RunActiveReaderActionMessage
  | RunReaderActionMessage
  | OpenOptionsMessage
  | SynthesizeSpeechMessage
  | StreamSpeechMessage
  | AudioControlMessage
  | StartAnnotationMessage
  | AgentSessionMessage
  | StopAnnotationMessage
  | SaveAnnotationMessage
  | AnnotationEndedMessage;

export const NOT_READER_RESULT: ReaderActionResult = {
  ok: false,
  status: "no-reader",
  message: "Sorry, I don't see an article reader open right now."
};

export function isRunActiveReaderActionMessage(
  message: unknown
): message is RunActiveReaderActionMessage {
  return (
    isObject(message) &&
    message.type === "RUN_ACTIVE_READER_ACTION" &&
    isReaderAction(message.action)
  );
}

export function isRunReaderActionMessage(
  message: unknown
): message is RunReaderActionMessage {
  return (
    isObject(message) &&
    message.type === "RUN_READER_ACTION" &&
    isReaderAction(message.action)
  );
}

export function isSynthesizeSpeechMessage(
  message: unknown
): message is SynthesizeSpeechMessage {
  return (
    isObject(message) &&
    message.type === "SYNTHESIZE_SPEECH" &&
    typeof message.input === "string" &&
    message.input.length > 0 &&
    typeof message.rate === "number"
  );
}

export function isStreamSpeechMessage(
  message: unknown
): message is StreamSpeechMessage {
  return (
    isObject(message) &&
    message.type === "STREAM_SPEECH" &&
    typeof message.input === "string" &&
    message.input.length > 0 &&
    typeof message.rate === "number" &&
    typeof message.apiKey === "string" &&
    typeof message.voiceId === "string" &&
    typeof message.textNormalization === "boolean"
  );
}

export function isAudioControlMessage(
  message: unknown
): message is AudioControlMessage {
  return (
    isObject(message) &&
    message.type === "AUDIO_CONTROL" &&
    isAudioControlCommand(message.command) &&
    (message.rate === undefined || typeof message.rate === "number")
  );
}

function isAudioControlCommand(value: unknown): value is AudioControlCommand {
  return (
    value === "pause" ||
    value === "resume" ||
    value === "stop" ||
    value === "restart" ||
    value === "status" ||
    value === "set-rate"
  );
}

export function isStartAnnotationMessage(
  message: unknown
): message is StartAnnotationMessage {
  return (
    isObject(message) &&
    message.type === "START_ANNOTATION" &&
    isAnnotationTargetInfo(message.target)
  );
}

export function isAgentSessionMessage(
  message: unknown
): message is AgentSessionMessage {
  return (
    isObject(message) &&
    message.type === "AGENT_SESSION" &&
    typeof message.url === "string" &&
    typeof message.token === "string"
  );
}

export function isStopAnnotationMessage(
  message: unknown
): message is StopAnnotationMessage {
  return isObject(message) && message.type === "STOP_ANNOTATION";
}

export function isSaveAnnotationMessage(
  message: unknown
): message is SaveAnnotationMessage {
  return (
    isObject(message) &&
    message.type === "SAVE_ANNOTATION" &&
    typeof message.verbatimText === "string" &&
    message.verbatimText.trim().length > 0
  );
}

export function isAnnotationEndedMessage(
  message: unknown
): message is AnnotationEndedMessage {
  return (
    isObject(message) &&
    message.type === "ANNOTATION_ENDED" &&
    typeof message.reason === "string"
  );
}

function isAnnotationTargetInfo(value: unknown): value is AnnotationTargetInfo {
  return (
    isObject(value) &&
    typeof value.parentItemKey === "string" &&
    value.parentItemKey.length > 0 &&
    (value.groupId === undefined || typeof value.groupId === "string") &&
    (value.selectedText === undefined ||
      typeof value.selectedText === "string") &&
    (value.pageLabel === undefined || typeof value.pageLabel === "string") &&
    (value.attachmentKey === undefined ||
      typeof value.attachmentKey === "string") &&
    (value.highlight === undefined || isHighlightInfo(value.highlight))
  );
}

function isHighlightInfo(value: unknown): value is {
  pageIndex: number;
  rects: number[][];
  sortIndex: string;
} {
  return (
    isObject(value) &&
    typeof value.pageIndex === "number" &&
    typeof value.sortIndex === "string" &&
    Array.isArray(value.rects) &&
    value.rects.length > 0 &&
    value.rects.every(
      (rect) =>
        Array.isArray(rect) &&
        rect.length === 4 &&
        rect.every((coord) => typeof coord === "number")
    )
  );
}

export function isOpenOptionsMessage(
  message: unknown
): message is OpenOptionsMessage {
  return isObject(message) && message.type === "OPEN_OPTIONS";
}

function isReaderAction(value: unknown): value is ReaderAction {
  return value === "say" || value === "annotate";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
