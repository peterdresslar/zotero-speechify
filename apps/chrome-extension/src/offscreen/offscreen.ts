import {
  isAudioControlMessage,
  isPlayAudioMessage,
  type AudioControlCommand,
  type AudioControlResult,
  type AudioPlaybackState
} from "../shared/messages";

// Offscreen document dedicated to audio playback. An HTMLAudioElement gives
// pitch-preserving playbackRate and pause/seek semantics that Web Audio buffer
// sources cannot, and extension pages are exempt from the page CSP and
// autoplay restrictions that apply inside the Zotero tab.

let audio: HTMLAudioElement | undefined;
let objectUrl: string | undefined;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isPlayAudioMessage(message)) {
    void startPlayback(message.audioDataBase64, message.rate).then(
      sendResponse
    );
    return true;
  }

  if (isAudioControlMessage(message)) {
    void handleControl(message.command, message.rate).then(sendResponse);
    return true;
  }

  return false;
});

async function startPlayback(
  audioDataBase64: string,
  rate: number
): Promise<AudioControlResult> {
  releaseAudio();

  const blob = new Blob([decodeBase64ToArrayBuffer(audioDataBase64)], {
    type: "audio/mpeg"
  });
  objectUrl = URL.createObjectURL(blob);
  audio = new Audio(objectUrl);
  audio.preservesPitch = true;
  audio.playbackRate = clampRate(rate);
  await audio.play();

  return statusResult();
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
      audio.pause();
      audio.currentTime = 0;
      releaseAudio();
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

function releaseAudio(): void {
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

function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return buffer;
}
