import { Room, RoomEvent, Track } from "livekit-client";

import {
  describeSpeechifyFailure,
  streamSpeech
} from "@zotero-speechify/speechify-client";

import {
  isAgentSessionMessage,
  isAudioControlMessage,
  isStopAnnotationMessage,
  isStreamSpeechMessage,
  type AudioControlCommand,
  type AudioControlResult,
  type AudioPlaybackState,
  type OperationResult,
  type StreamSpeechMessage,
  type SynthesizeSpeechResult
} from "../../shared/messages";

// Offscreen document dedicated to audio playback. It streams synthesis
// straight into a MediaSource, so audio starts with the first bytes instead
// of after the full clip. An HTMLAudioElement gives pitch-preserving
// playbackRate and pause/seek semantics, and extension pages are exempt from
// the page CSP and autoplay restrictions that apply inside the Zotero tab.
//
// Offscreen documents can use only chrome.runtime messaging — no
// chrome.storage — so the service worker supplies the API key and voice in
// the STREAM_SPEECH message rather than this document reading settings.

const MEDIA_MIME_TYPE = "audio/mpeg";
const PLAYBACK_FAILED_RESULT: SynthesizeSpeechResult = {
  ok: false,
  message: "Sorry, I could not play the audio stream."
};

let audio: HTMLAudioElement | undefined;
let objectUrl: string | undefined;
let abortController: AbortController | undefined;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isStreamSpeechMessage(message)) {
    startStreaming(message)
      .then(sendResponse)
      .catch(() => {
        sendResponse(PLAYBACK_FAILED_RESULT);
      });
    return true;
  }

  if (isAudioControlMessage(message)) {
    handleControl(message.command, message.rate)
      .then(sendResponse)
      .catch(() => {
        sendResponse({ ok: false, state: "paused", rate: 1 });
      });
    return true;
  }

  if (isAgentSessionMessage(message)) {
    startAgentSession(message.url, message.token)
      .then(sendResponse)
      .catch(() => {
        sendResponse({
          ok: false,
          message: "Sorry, I could not join the annotation session."
        });
      });
    return true;
  }

  if (isStopAnnotationMessage(message)) {
    endAgentSession()
      .then(() => {
        sendResponse({ ok: true, message: "Annotation ended." });
      })
      .catch(() => {
        sendResponse({ ok: true, message: "Annotation ended." });
      });
    return true;
  }

  return false;
});

// --- Voice annotation session (LiveKit) ---
//
// The agent's client tool calls arrive as data messages of the shape
// {type:"tool_request", id, name, arguments}; we reply on the same data
// channel with {type:"tool_response", id, result|error}. This mirrors the
// protocol implemented by Speechify's own web widget.

let room: Room | undefined;
let agentAudioElements: HTMLMediaElement[] = [];

async function startAgentSession(
  url: string,
  token: string
): Promise<OperationResult> {
  await endAgentSession();
  releasePlayback();

  const nextRoom = new Room();
  room = nextRoom;

  nextRoom.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
    void handleAgentData(nextRoom, payload);
  });

  nextRoom.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === Track.Kind.Audio) {
      const element = track.attach();
      agentAudioElements.push(element);
      document.body.append(element);
    }
  });

  nextRoom.on(RoomEvent.Disconnected, () => {
    if (room === nextRoom) {
      room = undefined;
      detachAgentAudio();
      void notifyAnnotationEnded("The annotation session ended.");
    }
  });

  try {
    await nextRoom.connect(url, token);
  } catch {
    room = undefined;
    return {
      ok: false,
      message: "Sorry, I could not join the annotation session."
    };
  }

  try {
    await nextRoom.localParticipant.setMicrophoneEnabled(true);
  } catch {
    await endAgentSession();
    return {
      ok: false,
      message:
        "Microphone access is needed — enable it in the extension settings."
    };
  }

  return { ok: true, message: "Listening — speak your annotation." };
}

async function handleAgentData(
  sessionRoom: Room,
  payload: Uint8Array
): Promise<void> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return;
  }

  if (isRecord(parsed) && typeof parsed.type === "string") {
    // Message *types* only — transcript content is never logged.
    console.info("zotero-speechify: agent data message", parsed.type);
  }

  if (
    !isRecord(parsed) ||
    parsed.type !== "tool_request" ||
    typeof parsed.name !== "string" ||
    (typeof parsed.id !== "string" && typeof parsed.id !== "number")
  ) {
    return;
  }

  console.info("zotero-speechify: tool_request received", parsed.name);
  const requestId = parsed.id;
  const args = isRecord(parsed.arguments) ? parsed.arguments : {};

  if (parsed.name !== "save_annotation") {
    await publishToolResponse(sessionRoom, {
      type: "tool_response",
      id: requestId,
      error: `no handler registered for tool ${parsed.name}`
    });
    return;
  }

  const verbatimText =
    typeof args.verbatim_text === "string" ? args.verbatim_text.trim() : "";

  if (verbatimText.length === 0) {
    await publishToolResponse(sessionRoom, {
      type: "tool_response",
      id: requestId,
      error: "The annotation text was empty."
    });
    return;
  }

  let result: OperationResult;

  try {
    result = await chrome.runtime.sendMessage({
      type: "SAVE_ANNOTATION",
      verbatimText
    });
  } catch {
    result = { ok: false, message: "The extension could not save the note." };
  }

  console.info(
    "zotero-speechify: tool_response",
    result.ok ? "saved" : `error: ${result.message}`
  );
  await publishToolResponse(
    sessionRoom,
    result.ok
      ? { type: "tool_response", id: requestId, result: { status: "saved" } }
      : { type: "tool_response", id: requestId, error: result.message }
  );
}

async function publishToolResponse(
  sessionRoom: Room,
  message: Record<string, unknown>
): Promise<void> {
  try {
    await sessionRoom.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify(message)),
      { reliable: true }
    );
  } catch {
    // Session already gone; the agent will report the tool timeout.
  }
}

async function endAgentSession(): Promise<void> {
  const current = room;
  room = undefined;
  detachAgentAudio();

  if (current !== undefined) {
    await current.disconnect();
  }
}

function detachAgentAudio(): void {
  for (const element of agentAudioElements) {
    element.remove();
  }

  agentAudioElements = [];
}

async function notifyAnnotationEnded(reason: string): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: "ANNOTATION_ENDED", reason });
  } catch {
    // Service worker unavailable; nothing to notify.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function startStreaming({
  input,
  rate,
  apiKey,
  voiceId,
  textNormalization
}: StreamSpeechMessage): Promise<SynthesizeSpeechResult> {
  releasePlayback();

  abortController = new AbortController();
  let stream: ReadableStream<Uint8Array>;

  try {
    stream = await streamSpeech(
      { apiKey, voiceId, input, textNormalization },
      abortController.signal
    );
  } catch (error) {
    return { ok: false, message: describeSpeechifyFailure(error) };
  }

  try {
    if (MediaSource.isTypeSupported(MEDIA_MIME_TYPE)) {
      await playFromMediaSource(stream, rate);
    } else {
      await playFromBufferedBlob(stream, rate);
    }
  } catch {
    releasePlayback();
    return PLAYBACK_FAILED_RESULT;
  }

  return { ok: true, message: "Reading selected text." };
}

// Resolves once playback has started; the rest of the stream keeps pumping
// into the SourceBuffer in the background while the user already listens.
async function playFromMediaSource(
  stream: ReadableStream<Uint8Array>,
  rate: number
): Promise<void> {
  const mediaSource = new MediaSource();
  const element = createAudioElement(URL.createObjectURL(mediaSource), rate);

  await new Promise<void>((resolve) => {
    mediaSource.addEventListener("sourceopen", () => resolve(), {
      once: true
    });
  });

  const sourceBuffer = mediaSource.addSourceBuffer(MEDIA_MIME_TYPE);
  const reader = stream.getReader();
  const first = await reader.read();

  if (first.done) {
    throw new Error("The audio stream ended before any audio arrived.");
  }

  await appendChunk(sourceBuffer, first.value);
  await element.play();

  void pumpRemainingChunks(reader, sourceBuffer, mediaSource, element);
}

async function pumpRemainingChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  sourceBuffer: SourceBuffer,
  mediaSource: MediaSource,
  element: HTMLAudioElement
): Promise<void> {
  try {
    for (;;) {
      const chunk = await reader.read();

      if (audio !== element) {
        // A newer playback replaced this one; stop feeding it.
        await reader.cancel();
        return;
      }

      if (chunk.done) {
        if (mediaSource.readyState === "open") {
          mediaSource.endOfStream();
        }
        return;
      }

      await appendChunk(sourceBuffer, chunk.value);
    }
  } catch {
    // Aborted stop, network drop mid-stream, or a full buffer: let whatever
    // is already buffered finish playing rather than cutting audio off.
    if (audio === element && mediaSource.readyState === "open") {
      mediaSource.endOfStream();
    }
  }
}

function appendChunk(
  sourceBuffer: SourceBuffer,
  chunk: Uint8Array
): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleError = (): void => {
      reject(new Error("SourceBuffer append failed."));
    };

    sourceBuffer.addEventListener("updateend", () => resolve(), {
      once: true
    });
    sourceBuffer.addEventListener("error", handleError, { once: true });

    try {
      sourceBuffer.appendBuffer(chunk as BufferSource);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

// Fallback for environments without MSE support for audio/mpeg: buffer the
// whole stream, then play it as a blob. Slower to first sound, still correct.
async function playFromBufferedBlob(
  stream: ReadableStream<Uint8Array>,
  rate: number
): Promise<void> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();

  for (;;) {
    const chunk = await reader.read();

    if (chunk.done) {
      break;
    }

    chunks.push(chunk.value);
  }

  const blob = new Blob(chunks as BlobPart[], { type: MEDIA_MIME_TYPE });
  const element = createAudioElement(URL.createObjectURL(blob), rate);
  await element.play();
}

function createAudioElement(sourceUrl: string, rate: number): HTMLAudioElement {
  objectUrl = sourceUrl;
  audio = new Audio(sourceUrl);
  audio.preservesPitch = true;
  audio.playbackRate = clampRate(rate);
  return audio;
}

async function handleControl(
  command: AudioControlCommand,
  rate: number | undefined
): Promise<AudioControlResult> {
  if (audio === undefined) {
    return { ok: false, state: "expired", rate: 1 };
  }

  switch (command) {
    case "pause":
      audio.pause();
      break;
    case "resume":
      if (audio.ended) {
        audio.currentTime = 0;
      }
      await audio.play();
      break;
    case "restart":
      audio.currentTime = 0;
      await audio.play();
      break;
    case "stop":
      releasePlayback();
      return { ok: true, state: "stopped", rate: 1 };
    case "set-rate":
      if (rate !== undefined) {
        audio.playbackRate = clampRate(rate);
      }
      break;
    case "status":
      break;
  }

  return statusResult();
}

function statusResult(): AudioControlResult {
  if (audio === undefined) {
    return { ok: true, state: "stopped", rate: 1 };
  }

  const state: AudioPlaybackState =
    audio.paused || audio.ended ? "paused" : "playing";

  return { ok: true, state, rate: audio.playbackRate };
}

function releasePlayback(): void {
  abortController?.abort();
  abortController = undefined;

  audio?.pause();
  audio = undefined;

  if (objectUrl !== undefined) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = undefined;
  }
}

function clampRate(rate: number): number {
  return Math.min(3, Math.max(0.5, rate));
}
