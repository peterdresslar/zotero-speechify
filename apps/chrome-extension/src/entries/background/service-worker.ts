import { ANNOTATE_AGENT_CONFIG_REVISION } from "@zotero-speechify/agent-config";
import {
  buildAgentSessionRequest,
  provisionAnnotateAgent
} from "@zotero-speechify/speechify-client";
import {
  createHighlightAnnotation,
  createVoiceNote,
  getKeyInfo
} from "@zotero-speechify/zotero-api";

import {
  NOT_READER_RESULT,
  isAnnotationEndedMessage,
  isOpenOptionsMessage,
  isRunActiveReaderActionMessage,
  isSaveAnnotationMessage,
  isStartAnnotationMessage,
  isSynthesizeSpeechMessage,
  type AgentSessionMessage,
  type AnnotationTargetInfo,
  type OperationResult,
  type ReaderAction,
  type ReaderActionResult,
  type RunReaderActionMessage,
  type StreamSpeechMessage,
  type SynthesizeSpeechResult
} from "../../shared/messages";
import { getSettings, saveSettings } from "../../shared/settings";

// Survives service-worker restarts (annotation sessions run for minutes)
// while staying in memory only — never persisted to disk.
const PENDING_ANNOTATION_KEY = "pendingAnnotation";
// Stored separately from the pending target: saving clears the target (the
// single-save guard), but the tab still needs the session-ended notification.
const ANNOTATION_TAB_KEY = "annotationTabId";
const AGENT_REVISION_KEY = "zoteroSpeechifyAgentConfigRevision";

interface PendingAnnotation {
  target: AnnotationTargetInfo;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

  if (isStartAnnotationMessage(message)) {
    void startAnnotation(message.target, sender.tab?.id).then(sendResponse);
    return true;
  }

  if (isSaveAnnotationMessage(message)) {
    void saveAnnotation(message.verbatimText).then(sendResponse);
    return true;
  }

  if (isAnnotationEndedMessage(message)) {
    void handleAnnotationEnded(message.reason).then(sendResponse);
    return true;
  }

  return false;
});

async function startAnnotation(
  target: AnnotationTargetInfo,
  tabId: number | undefined
): Promise<OperationResult> {
  const settings = await getSettings();

  if (
    settings.speechifyApiKey.trim().length === 0 ||
    settings.zoteroApiKey.trim().length === 0
  ) {
    return {
      ok: false,
      message: "Speechify and Zotero keys are needed for voice annotation."
    };
  }

  let agentId = settings.speechifyAgentId.trim();
  const revisionStore = await chrome.storage.local.get(AGENT_REVISION_KEY);
  const provisionedRevision: unknown = revisionStore[AGENT_REVISION_KEY];

  // Re-provision when the versioned agent definition changed, so prompt and
  // tool updates in the repo reach already-provisioned agents.
  if (
    agentId.length === 0 ||
    provisionedRevision !== ANNOTATE_AGENT_CONFIG_REVISION
  ) {
    try {
      const provisioned = await provisionAnnotateAgent({
        apiKey: settings.speechifyApiKey,
        voiceId: settings.ttsVoiceId
      });
      agentId = provisioned.agentId;
      await saveSettings({ ...settings, speechifyAgentId: agentId });
      await chrome.storage.local.set({
        [AGENT_REVISION_KEY]: ANNOTATE_AGENT_CONFIG_REVISION
      });
      console.info(
        "zotero-speechify: agent provisioned at revision",
        ANNOTATE_AGENT_CONFIG_REVISION
      );
    } catch (error) {
      console.error("zotero-speechify: agent provisioning failed", error);
      return {
        ok: false,
        message:
          "Could not set up the annotation agent — check the Speechify key (details in the extension console)."
      };
    }
  }

  let session: { token: string; url: string };

  try {
    const spec = buildAgentSessionRequest({
      agentId,
      apiKey: settings.speechifyApiKey
    });
    const response = await fetch(spec.url, spec.init);

    if (!response.ok) {
      console.error(
        "zotero-speechify: session creation failed",
        response.status,
        await response.text()
      );
      return {
        ok: false,
        message: `Speechify could not start the session (status ${String(response.status)}).`
      };
    }

    const parsed = parseSessionResponse(await response.json());

    if (parsed === undefined) {
      return {
        ok: false,
        message: "Speechify returned an unexpected session response."
      };
    }

    session = parsed;
  } catch (error) {
    console.error("zotero-speechify: session request failed", error);
    return {
      ok: false,
      message: "Sorry, I could not reach Speechify to start the session."
    };
  }

  try {
    await ensureOffscreenDocument();
    const joinMessage: AgentSessionMessage = {
      type: "AGENT_SESSION",
      url: session.url,
      token: session.token
    };
    const joinResult: OperationResult | undefined =
      await chrome.runtime.sendMessage(joinMessage);

    if (joinResult === undefined) {
      return {
        ok: false,
        message: "The audio player did not respond to the session request."
      };
    }

    if (!joinResult.ok) {
      return joinResult;
    }
  } catch (error) {
    console.error("zotero-speechify: offscreen join failed", error);
    return {
      ok: false,
      message: "Sorry, I could not start the voice session."
    };
  }

  await chrome.storage.session.set({
    [PENDING_ANNOTATION_KEY]: { target } satisfies PendingAnnotation,
    [ANNOTATION_TAB_KEY]: tabId ?? null
  });

  return { ok: true, message: "Listening — speak your annotation." };
}

async function saveAnnotation(verbatimText: string): Promise<OperationResult> {
  const pending = await getPendingAnnotation();
  console.info(
    "zotero-speechify: save requested",
    pending === undefined ? "(no pending annotation)" : "(pending target found)"
  );

  if (pending === undefined) {
    return { ok: false, message: "No annotation is in progress." };
  }

  const settings = await getSettings();

  if (settings.zoteroApiKey.trim().length === 0) {
    return { ok: false, message: "Zotero key needed to save the annotation." };
  }

  try {
    const library =
      pending.target.groupId === undefined
        ? {
            type: "user" as const,
            id: String((await getKeyInfo(settings.zoteroApiKey)).userID)
          }
        : { type: "group" as const, id: pending.target.groupId };

    // Preferred: a real reader highlight with the dictation as its comment,
    // which the reader page and sidebar display. Falls back to a child note
    // so a failed position write never loses the annotation.
    if (
      pending.target.highlight !== undefined &&
      pending.target.attachmentKey !== undefined &&
      pending.target.selectedText !== undefined
    ) {
      try {
        await createHighlightAnnotation({
          apiKey: settings.zoteroApiKey,
          library,
          attachmentItemKey: pending.target.attachmentKey,
          selectedText: pending.target.selectedText,
          comment: verbatimText,
          pageLabel: pending.target.pageLabel,
          position: pending.target.highlight
        });

        await chrome.storage.session.remove(PENDING_ANNOTATION_KEY);
        console.info("zotero-speechify: highlight annotation created");
        await notifyAnnotationSaved(pending.target.highlight);
        return { ok: true, message: "Annotation saved." };
      } catch (error) {
        console.error(
          "zotero-speechify: highlight save failed, falling back to note",
          error
        );
      }
    }

    await createVoiceNote({
      apiKey: settings.zoteroApiKey,
      library,
      parentItemKey: pending.target.parentItemKey,
      annotationText: verbatimText,
      selectedText: pending.target.selectedText,
      pageLabel: pending.target.pageLabel
    });

    await chrome.storage.session.remove(PENDING_ANNOTATION_KEY);
    console.info("zotero-speechify: annotation note created");
    await notifyAnnotationSaved(undefined);
    return { ok: true, message: "Annotation saved." };
  } catch (error) {
    console.error("zotero-speechify: zotero save failed", error);
    return { ok: false, message: "Sorry, I could not save to Zotero." };
  }
}

async function notifyAnnotationSaved(
  highlight: { pageIndex: number; rects: number[][] } | undefined
): Promise<void> {
  const stored = await chrome.storage.session.get(ANNOTATION_TAB_KEY);
  const tabId: unknown = stored[ANNOTATION_TAB_KEY];

  if (typeof tabId !== "number") {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "ANNOTATION_SAVED",
      highlight:
        highlight === undefined
          ? undefined
          : { pageIndex: highlight.pageIndex, rects: highlight.rects }
    });
  } catch {
    // Tab is gone; nothing to echo.
  }
}

async function handleAnnotationEnded(reason: string): Promise<OperationResult> {
  const stored = await chrome.storage.session.get(ANNOTATION_TAB_KEY);
  const tabId: unknown = stored[ANNOTATION_TAB_KEY];
  await chrome.storage.session.remove([
    PENDING_ANNOTATION_KEY,
    ANNOTATION_TAB_KEY
  ]);

  if (typeof tabId === "number") {
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: "ANNOTATION_ENDED",
        reason
      });
    } catch {
      // Tab is gone; nothing to notify.
    }
  }

  return { ok: true, message: reason };
}

async function getPendingAnnotation(): Promise<PendingAnnotation | undefined> {
  const stored = await chrome.storage.session.get(PENDING_ANNOTATION_KEY);
  const pending: unknown = stored[PENDING_ANNOTATION_KEY];

  if (typeof pending === "object" && pending !== null && "target" in pending) {
    return pending as PendingAnnotation;
  }

  return undefined;
}

function parseSessionResponse(
  payload: unknown
): { token: string; url: string } | undefined {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "token" in payload &&
    typeof payload.token === "string" &&
    "url" in payload &&
    typeof payload.url === "string"
  ) {
    return { token: payload.token, url: payload.url };
  }

  return undefined;
}

// The offscreen document streams and plays the audio itself; it cannot read
// chrome.storage, so this worker validates setup, makes sure the document
// exists, and relays the request with the key and voice included.
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
      voiceId: settings.ttsVoiceId,
      textNormalization: settings.ttsTextNormalization
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
    url: "src/entries/offscreen/index.html",
    reasons: [
      chrome.offscreen.Reason.AUDIO_PLAYBACK,
      chrome.offscreen.Reason.USER_MEDIA,
      chrome.offscreen.Reason.WEB_RTC
    ],
    justification:
      "Plays Speechify text-to-speech audio and hosts the realtime voice annotation session (microphone + WebRTC)."
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
