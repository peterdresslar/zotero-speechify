import {
  NOT_READER_RESULT,
  isOpenOptionsMessage,
  isRunActiveReaderActionMessage,
  type ReaderAction,
  type ReaderActionResult,
  type RunReaderActionMessage
} from "../shared/messages";

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

  return false;
});

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
