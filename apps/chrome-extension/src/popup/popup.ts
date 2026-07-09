import { icons } from "../shared/icons";
import {
  type ReaderAction,
  type ReaderActionResult,
  type RunActiveReaderActionMessage
} from "../shared/messages";
import { getSettings } from "../shared/settings";

import "./popup.css";

const statusElement = requiredElement("[data-status]");
const statusLine = requiredElement(".status-line");

function hydrateIcons(): void {
  document.querySelectorAll<HTMLElement>("[data-icon]").forEach((target) => {
    const iconName = target.dataset.icon;

    if (iconName !== undefined && iconName in icons) {
      target.innerHTML = icons[iconName as keyof typeof icons];
    }
  });
}

function bindActions(): void {
  document
    .querySelectorAll<HTMLButtonElement>("[data-action]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.action;

        if (action === "say" || action === "annotate") {
          void runAction(action);
        }
      });
    });

  requiredButton("[data-open-options]").addEventListener("click", () => {
    void chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
  });
}

async function runAction(action: ReaderAction): Promise<void> {
  setStatus("Working...", "quiet");
  const message: RunActiveReaderActionMessage = {
    type: "RUN_ACTIVE_READER_ACTION",
    action,
    source: "popup"
  };

  const result: ReaderActionResult = await chrome.runtime.sendMessage(message);
  setStatus(result.message, result.ok ? "ready" : "warning");
}

async function renderSetup(): Promise<void> {
  const settings = await getSettings();
  setSetupState("speechify", settings.speechifyApiKey.length > 0);
  setSetupState("zotero", settings.zoteroApiKey.length > 0);
  setSetupState("agent", settings.speechifyAgentId.length > 0);
}

function setSetupState(key: string, ready: boolean): void {
  const row = requiredElement(`[data-setup="${key}"]`);
  const state = requiredElement(`[data-setup="${key}"] [data-state]`);

  row.dataset.ready = String(ready);
  state.textContent = ready ? "Ready" : "Needed";
}

function setStatus(message: string, tone: "quiet" | "ready" | "warning"): void {
  statusElement.textContent = message;
  statusLine.dataset.statusTone = tone;
  const icon = requiredElement("[data-status-icon]");
  icon.innerHTML =
    tone === "ready"
      ? icons.check
      : tone === "warning"
        ? icons.warning
        : icons.chevron;
}

function requiredElement(selector: string): HTMLElement {
  const element = document.querySelector(selector);

  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing popup element: ${selector}`);
  }

  return element;
}

function requiredButton(selector: string): HTMLButtonElement {
  const element = document.querySelector(selector);

  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`Missing popup button: ${selector}`);
  }

  return element;
}

hydrateIcons();
bindActions();
setStatus("Open a Zotero reader page.", "quiet");
void renderSetup();
