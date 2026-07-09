import { synthesizeSpeech } from "@zotero-speechify/speechify-client";

import {
  NOT_READER_RESULT,
  isOpenOptionsMessage,
  isRunActiveReaderActionMessage,
  isSynthesizeSpeechMessage,
  type ReaderAction,
  type ReaderActionResult,
  type RunReaderActionMessage,
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
    void synthesizeInput(message.input).then(sendResponse);
    return true;
  }

  return false;
});

async function synthesizeInput(input: string): Promise<SynthesizeSpeechResult> {
  const settings = await getSettings();

  if (settings.speechifyApiKey.trim().length === 0) {
    return {
      ok: false,
      message: "Speechify key needed before I can read selected text."
    };
  }

  try {
    const speech = await synthesizeSpeech({
      apiKey: settings.speechifyApiKey,
      voiceId: settings.ttsVoiceId,
      input
    });

    return {
      ok: true,
      audioDataBase64: speech.audioDataBase64,
      message: "Reading selected text."
    };
  } catch (error) {
    return { ok: false, message: describeSynthesisFailure(error) };
  }
}

function describeSynthesisFailure(error: unknown): string {
  const statusCode =
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
      ? error.statusCode
      : undefined;

  if (statusCode === 401 || statusCode === 403) {
    return "Speechify rejected the API key. Please check it in Settings.";
  }

  if (statusCode !== undefined) {
    return `Speechify could not synthesize the selection (status ${String(statusCode)}).`;
  }

  return "Sorry, I could not reach Speechify to synthesize the selection.";
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
