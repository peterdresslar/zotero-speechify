import {
  DEFAULT_SETTINGS,
  getSettings,
  saveSettings
} from "../../shared/settings";

import "./options.css";

const form = requiredForm("[data-form]");
const saveStatus = requiredElement("[data-save-status]");
const shortcutsTarget = requiredElement("[data-shortcuts]");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void persistSettings();
});

requiredButton("[data-open-shortcuts]").addEventListener("click", () => {
  void chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

const micStatus = requiredElement("[data-mic-status]");
const enableMicButton = requiredButton("[data-enable-mic]");

enableMicButton.addEventListener("click", () => {
  void requestMicrophone();
});

// Granting getUserMedia here grants it to the extension origin, which the
// offscreen document then relies on for the voice annotation session (it
// cannot show a permission prompt itself).
async function requestMicrophone(): Promise<void> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    for (const track of stream.getTracks()) {
      track.stop();
    }
  } catch {
    // Denied or no device; the status refresh below reports it.
  }

  await refreshMicStatus();
}

async function refreshMicStatus(): Promise<void> {
  const state = await queryMicPermission();

  if (state === "granted") {
    micStatus.textContent = "Microphone access granted";
    micStatus.dataset.state = "granted";
    enableMicButton.hidden = true;
    return;
  }

  micStatus.textContent =
    state === "denied"
      ? "Microphone access denied — allow it in Chrome site settings for this extension"
      : "Microphone access not granted yet";
  micStatus.dataset.state = state ?? "unknown";
  enableMicButton.hidden = false;
}

async function queryMicPermission(): Promise<PermissionState | undefined> {
  try {
    const result = await navigator.permissions.query({
      name: "microphone"
    });
    return result.state;
  } catch {
    return undefined;
  }
}

async function hydrateForm(): Promise<void> {
  const settings = await getSettings();
  setInputValue("speechifyApiKey", settings.speechifyApiKey);
  setInputValue("zoteroApiKey", settings.zoteroApiKey);
  setInputValue("speechifyAgentId", settings.speechifyAgentId);
  setInputValue("ttsVoiceId", fallbackVoiceId(settings.ttsVoiceId));
  setCheckboxValue("ttsTextNormalization", settings.ttsTextNormalization);
  setCheckboxValue("readBackEnabled", settings.readBackEnabled);
  await renderShortcuts();
}

async function persistSettings(): Promise<void> {
  await saveSettings({
    speechifyApiKey: getInputValue("speechifyApiKey"),
    zoteroApiKey: getInputValue("zoteroApiKey"),
    speechifyAgentId: getInputValue("speechifyAgentId"),
    ttsVoiceId: fallbackVoiceId(getInputValue("ttsVoiceId")),
    ttsTextNormalization: getCheckboxValue("ttsTextNormalization"),
    readBackEnabled: getCheckboxValue("readBackEnabled")
  });

  saveStatus.textContent = "Saved";
  window.setTimeout(() => {
    saveStatus.textContent = "";
  }, 2200);
}

async function renderShortcuts(): Promise<void> {
  const commands = await chrome.commands.getAll();
  shortcutsTarget.replaceChildren(
    ...commands
      .filter((command) => command.name !== "_execute_action")
      .map((command) => {
        const row = document.createElement("div");
        row.className = "shortcut-row";

        const label = document.createElement("span");
        label.textContent = command.description ?? command.name ?? "Command";

        const key = document.createElement("strong");
        const shortcut = command.shortcut ?? "";
        key.textContent = shortcut.length > 0 ? shortcut : "Unset";

        row.append(label, key);
        return row;
      })
  );
}

function getInputValue(name: string): string {
  return getInput(name).value.trim();
}

function setInputValue(name: string, value: string): void {
  getInput(name).value = value;
}

function getCheckboxValue(name: string): boolean {
  return getInput(name).checked;
}

function setCheckboxValue(name: string, value: boolean): void {
  getInput(name).checked = value;
}

function getInput(name: string): HTMLInputElement {
  const input = form.elements.namedItem(name);

  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Missing settings input: ${name}`);
  }

  return input;
}

function fallbackVoiceId(value: string): string {
  return value.trim().length > 0 ? value.trim() : DEFAULT_SETTINGS.ttsVoiceId;
}

function requiredElement(selector: string): HTMLElement {
  const element = document.querySelector(selector);

  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing options element: ${selector}`);
  }

  return element;
}

function requiredForm(selector: string): HTMLFormElement {
  const element = document.querySelector(selector);

  if (!(element instanceof HTMLFormElement)) {
    throw new Error(`Missing options form: ${selector}`);
  }

  return element;
}

function requiredButton(selector: string): HTMLButtonElement {
  const element = document.querySelector(selector);

  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`Missing options button: ${selector}`);
  }

  return element;
}

void hydrateForm();
void refreshMicStatus();
