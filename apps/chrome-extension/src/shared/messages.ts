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
  | "pause"
  | "resume"
  | "stop"
  | "restart"
  | "status"
  | "set-rate";

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

export type ExtensionMessage =
  | RunActiveReaderActionMessage
  | RunReaderActionMessage
  | OpenOptionsMessage
  | SynthesizeSpeechMessage
  | StreamSpeechMessage
  | AudioControlMessage;

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
    typeof message.voiceId === "string"
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
