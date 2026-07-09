import {
  NOT_READER_RESULT,
  isOpenOptionsMessage,
  isRunActiveReaderActionMessage,
  isSynthesizeSpeechMessage,
  type ReaderAction,
  type ReaderActionResult,
  type RunReaderActionMessage,
  type StreamSpeechMessage,
  type SynthesizeSpeechResult
} from "../shared/messages";
import { getSettings } from "../shared/settings";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isOpenOptionsMessage(message)) {
    void chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  if (isRunActiveReaderActionMessage(message)) {
    void sendActionToActiveTab(message.action, message.source).then(
      sendResponse
    );
    return true;
  }

  if (isSynthesizeSpeechMessage(message)) {
    void synthesizeInput(message.input, message.rate).then(sendResponse);
    return true;
  }

  return false;
});

// The offscreen document streams and plays the audio itself (it reads the
// API key from storage directly); this worker only validates setup, makes
// sure the document exists, and relays the request.
async function synthesizeInput(
  input: string,
  rate: number
): Promise<SynthesizeSpeechResult> {
  const settings = await getSettings();

  if (settings.speechifyApiKey.trim().length === 0) {
    return {
      ok: false,
      message: "Speechify key needed before I can read selected text."
    };
  }

  try {
    await ensureOffscreenDocument();
    const streamMessage: StreamSpeechMessage = {
      type: "STREAM_SPEECH",
      input,
      rate,
      apiKey: settings.speechifyApiKey,
      voiceId: settings.ttsVoiceId
    };
    const result: SynthesizeSpeechResult =
      await chrome.runtime.sendMessage(streamMessage);

    return result;
  } catch {
    return { ok: false, message: "Sorry, I could not start playback." };
  }
}

async function ensureOffscreenDocument(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]
  });

  if (contexts.length > 0) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: "src/offscreen/index.html",
    reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
    justification:
      "Plays Speechify text-to-speech audio with pause and speed controls."
  });
}

chrome.commands.onCommand.addListener((command) => {
  const action = commandToAction(command);

  if (action === undefined) {
    return;
  }

  void sendActionToActiveTab(action, "command").then((result) => {
    if (!result.ok) {
      void flashBadge();
    }
  });
});

async function sendActionToActiveTab(
  action: ReaderAction,
  source: "popup" | "command"
): Promise<ReaderActionResult> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (tab?.id === undefined) {
    return NOT_READER_RESULT;
  }

  const message: RunReaderActionMessage = {
    type: "RUN_READER_ACTION",
    action,
    source
  };

  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    return NOT_READER_RESULT;
  }
}

function commandToAction(command: string): ReaderAction | undefined {
  if (command === "say-selected-text") {
    return "say";
  }

  if (command === "voice-annotate") {
    return "annotate";
  }

  return undefined;
}

async function flashBadge(): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ color: "#9b3f2f" });
  await chrome.action.setBadgeText({ text: "!" });
  globalThis.setTimeout(() => {
    void chrome.action.setBadgeText({ text: "" });
  }, 1800);
}
