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
}

export interface SynthesizeSpeechResult {
  ok: boolean;
  audioDataBase64?: string;
  message: string;
}

export type ExtensionMessage =
  | RunActiveReaderActionMessage
  | RunReaderActionMessage
  | OpenOptionsMessage
  | SynthesizeSpeechMessage;

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
    message.input.length > 0
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
