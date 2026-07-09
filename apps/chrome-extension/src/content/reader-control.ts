const HOST_ID = "zotero-speechify-reader-control";
const SETTINGS_KEY = "zoteroSpeechifySettings";
const READER_PATH_PATTERN = /\/reader\/?$/u;
const NO_SELECTED_PASSAGE_MESSAGE =
  "Sorry, I don't see a selected passage to read.";
const NO_READER_MESSAGE =
  "Sorry, I don't see an article reader open right now.";

let toastTimer: ReturnType<typeof setTimeout> | undefined;

type ReaderAction = "say" | "annotate";

type ReaderActionStatus =
  | "ready"
  | "missing-config"
  | "missing-selection"
  | "no-reader"
  | "unavailable"
  | "error";

interface ReaderActionResult {
  ok: boolean;
  status: ReaderActionStatus;
  message: string;
}

interface RunReaderActionMessage {
  type: "RUN_READER_ACTION";
  action: ReaderAction;
  source: "popup" | "command" | "reader-control";
}

interface ExtensionSettings {
  speechifyApiKey: string;
  zoteroApiKey: string;
  speechifyAgentId: string;
  ttsVoiceId: string;
  readBackEnabled: boolean;
}

interface SetupState {
  sayReady: boolean;
  annotateReady: boolean;
  missingSay: string[];
  missingAnnotate: string[];
}

interface ZoteroReaderContext {
  readerOpen: boolean;
  selectedText: string;
  pageLabel?: string;
}

type AnnotationTarget =
  | { kind: "highlight"; selectedText: string }
  | { kind: "page-note"; pageLabel?: string }
  | { kind: "no-reader" };

const DEFAULT_SETTINGS: ExtensionSettings = {
  speechifyApiKey: "",
  zoteroApiKey: "",
  speechifyAgentId: "",
  ttsVoiceId: "geffen_32",
  readBackEnabled: false
};

const icons = {
  annotate:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/><path d="M8 22h8"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
  volume:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>'
} as const;

function isRunReaderActionMessage(
  message: unknown
): message is RunReaderActionMessage {
  return (
    isObject(message) &&
    message.type === "RUN_READER_ACTION" &&
    isReaderAction(message.action)
  );
}

function isReaderAction(value: unknown): value is ReaderAction {
  return value === "say" || value === "annotate";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const stored = result[SETTINGS_KEY];

  if (!isStoredSettings(stored)) {
    return DEFAULT_SETTINGS;
  }

  return {
    ...DEFAULT_SETTINGS,
    ...stored
  };
}

function getSetupState(settings: ExtensionSettings): SetupState {
  const missingSay = missingLabels([
    ["Speechify key", settings.speechifyApiKey]
  ]);
  const missingAnnotate = missingLabels([
    ["Speechify key", settings.speechifyApiKey],
    ["Zotero key", settings.zoteroApiKey],
    ["Agent ID", settings.speechifyAgentId]
  ]);

  return {
    sayReady: missingSay.length === 0,
    annotateReady: missingAnnotate.length === 0,
    missingSay,
    missingAnnotate
  };
}

function formatMissingConfig(labels: string[]): string {
  if (labels.length === 0) {
    return "Ready";
  }

  if (labels.length === 1) {
    return `${labels[0]} needed`;
  }

  return `${labels.slice(0, -1).join(", ")} and ${
    labels[labels.length - 1]
  } needed`;
}

function missingLabels(entries: [string, string][]): string[] {
  return entries
    .filter(([, value]) => value.trim().length === 0)
    .map(([label]) => label);
}

function isStoredSettings(value: unknown): value is Partial<ExtensionSettings> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    optionalString(candidate.speechifyApiKey) &&
    optionalString(candidate.zoteroApiKey) &&
    optionalString(candidate.speechifyAgentId) &&
    optionalString(candidate.ttsVoiceId) &&
    optionalBoolean(candidate.readBackEnabled)
  );
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

const READER_PROBE_SELECTOR =
  "[data-reader-root], #viewerContainer, .pdfViewer";

function getReaderContext(): ZoteroReaderContext {
  const documents = collectSameOriginDocuments(document);
  const readerOpen =
    READER_PATH_PATTERN.test(window.location.pathname) ||
    documents.some((doc) => doc.querySelector(READER_PROBE_SELECTOR) !== null);

  return {
    readerOpen,
    selectedText: getSelectedText(documents),
    pageLabel: getVisiblePageLabel(documents)
  };
}

// The Zotero web reader renders inside same-origin iframes (the reader app,
// with the pdf.js viewer nested one level deeper), so every DOM read has to
// walk the frame tree rather than the top document.
function collectSameOriginDocuments(root: Document): Document[] {
  const documents: Document[] = [root];

  for (const frame of Array.from(root.querySelectorAll("iframe"))) {
    const doc = sameOriginContentDocument(frame);

    if (doc !== null) {
      documents.push(...collectSameOriginDocuments(doc));
    }
  }

  return documents;
}

function sameOriginContentDocument(frame: HTMLIFrameElement): Document | null {
  try {
    return frame.contentDocument;
  } catch {
    return null;
  }
}

function getSelectedText(documents: Document[]): string {
  for (const doc of documents) {
    const selection = normalizeSelection(
      doc.defaultView?.getSelection()?.toString()
    );

    if (selection.length > 0) {
      return selection;
    }
  }

  return "";
}

function normalizeSelection(selection: string | undefined): string {
  return selection?.replace(/\s+/gu, " ").trim() ?? "";
}

function getVisiblePageLabel(documents: Document[]): string | undefined {
  for (const doc of documents) {
    const pages = Array.from(
      doc.querySelectorAll<HTMLElement>(".page[data-page-number]")
    );

    if (pages.length === 0) {
      continue;
    }

    const viewportMiddle = (doc.defaultView?.innerHeight ?? 0) / 2;
    const visiblePage = pages.find((page) => {
      const rect = page.getBoundingClientRect();
      return rect.top <= viewportMiddle && rect.bottom >= viewportMiddle;
    });

    return (visiblePage ?? pages[0]).dataset.pageNumber;
  }

  return undefined;
}

// Deployment flag: shows the captured selection in the toast while Say runs.
// On by default; build with VITE_SELECTION_PREVIEW=false to hide in releases.
const SELECTION_PREVIEW_ENABLED =
  import.meta.env.VITE_SELECTION_PREVIEW !== "false";

interface SynthesizeSpeechResult {
  ok: boolean;
  audioDataBase64?: string;
  message: string;
}

let audioContext: AudioContext | undefined;
let currentAudioSource: AudioBufferSourceNode | undefined;

async function startSaying(selectedText: string): Promise<ReaderActionResult> {
  showToast(
    SELECTION_PREVIEW_ENABLED
      ? formatSelectionPreview(selectedText)
      : "Fetching audio…",
    "ready"
  );

  const result: SynthesizeSpeechResult = await chrome.runtime.sendMessage({
    type: "SYNTHESIZE_SPEECH",
    input: selectedText
  });

  if (!result.ok || result.audioDataBase64 === undefined) {
    showToast(result.message, "warning");
    speakStatus(result.message);
    return { ok: false, status: "error", message: result.message };
  }

  try {
    await playAudioData(result.audioDataBase64);
  } catch {
    const message = "Sorry, I fetched the audio but could not play it.";
    showToast(message, "warning");
    speakStatus(message);
    return { ok: false, status: "error", message };
  }

  return { ok: true, status: "ready", message: "Reading selected text." };
}

// Playback goes through Web Audio because the page CSP on zotero.org blocks
// data:/blob: media loads; decodeAudioData works on raw bytes and never
// performs a resource load, so the page CSP does not apply.
async function playAudioData(audioDataBase64: string): Promise<void> {
  audioContext ??= new AudioContext();

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  stopCurrentAudio();

  const audioBuffer = await audioContext.decodeAudioData(
    decodeBase64ToArrayBuffer(audioDataBase64)
  );
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);
  source.start();
  currentAudioSource = source;
}

function stopCurrentAudio(): void {
  try {
    currentAudioSource?.stop();
  } catch {
    // Already stopped or finished; nothing to do.
  }

  currentAudioSource = undefined;
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

function formatSelectionPreview(selectedText: string): string {
  const preview =
    selectedText.length > 100
      ? `${selectedText.slice(0, 100)}…`
      : selectedText;

  return `Selected (${String(selectedText.length)} chars): “${preview}”`;
}

function chooseAnnotationTarget(
  context: ZoteroReaderContext
): AnnotationTarget {
  if (!context.readerOpen) {
    return { kind: "no-reader" };
  }

  if (context.selectedText.trim().length > 0) {
    return { kind: "highlight", selectedText: context.selectedText.trim() };
  }

  return { kind: "page-note", pageLabel: context.pageLabel };
}

function speakStatus(message: string): void {
  if (
    !("speechSynthesis" in window) ||
    !("SpeechSynthesisUtterance" in window)
  ) {
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.rate = 0.95;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function installReaderControl(): void {
  if (document.getElementById(HOST_ID) !== null) {
    return;
  }

  const host = document.createElement("div");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = renderControl();
  document.documentElement.append(host);

  bindControl(shadow);
  void refreshSetupState(shadow);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.zoteroSpeechifySettings !== undefined) {
      void refreshSetupState(shadow);
    }
  });
}

function bindControl(shadow: ShadowRoot): void {
  const sayButton = requiredButton(shadow, "[data-say]");
  const annotateButton = requiredButton(shadow, "[data-annotate]");
  const settingsButton = requiredButton(shadow, "[data-settings]");

  sayButton.addEventListener("click", () => {
    void runReaderAction("say").then((result) => {
      setMode(shadow, result.status);
    });
  });

  annotateButton.addEventListener("click", () => {
    void runReaderAction("annotate").then((result) => {
      setMode(shadow, result.status);
    });
  });

  settingsButton.addEventListener("click", () => {
    void chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isRunReaderActionMessage(message)) {
    return false;
  }

  void runReaderAction(message.action).then((result) => {
    sendResponse(result);
  });

  return true;
});

async function runReaderAction(
  action: ReaderAction
): Promise<ReaderActionResult> {
  const settings = await getSettings();
  const setup = getSetupState(settings);
  const context = getReaderContext();

  if (action === "say") {
    if (context.selectedText.length === 0) {
      return showSpokenError("missing-selection", NO_SELECTED_PASSAGE_MESSAGE);
    }

    if (!setup.sayReady) {
      const message = formatMissingConfig(setup.missingSay);
      return showSetupReminder(
        "say",
        message,
        "Speechify setup is needed before I can read selected text."
      );
    }

    return startSaying(context.selectedText);
  }

  const target = chooseAnnotationTarget(context);

  if (target.kind === "no-reader") {
    return showSpokenError("no-reader", NO_READER_MESSAGE);
  }

  if (!setup.annotateReady) {
    const message = formatMissingConfig(setup.missingAnnotate);
    return showSetupReminder(
      "annotate",
      message,
      "Setup is needed before I can start voice annotation."
    );
  }

  if (target.kind === "highlight") {
    return showReady("Voice annotation will attach to the selected text.");
  }

  const page =
    target.pageLabel === undefined ? "this page" : `page ${target.pageLabel}`;
  return showReady(`Voice annotation will attach to ${page}.`);
}

async function refreshSetupState(shadow: ShadowRoot): Promise<void> {
  const settings = await getSettings();
  const setup = getSetupState(settings);
  const sayButton = requiredButton(shadow, "[data-say]");
  const annotateButton = requiredButton(shadow, "[data-annotate]");
  const status = requiredHtmlElement(shadow, "[data-status]");

  setSoftDisabled(sayButton, !setup.sayReady);
  setSoftDisabled(annotateButton, !setup.annotateReady);

  if (setup.sayReady && setup.annotateReady) {
    status.textContent = "Ready";
    setMode(shadow, "ready");
    return;
  }

  status.textContent = compactSetupStatus(settings);
  setMode(shadow, "missing-config");
}

function compactSetupStatus(settings: ExtensionSettings): string {
  const setup = getSetupState(settings);

  if (!setup.sayReady) {
    return formatMissingConfig(setup.missingSay);
  }

  return formatMissingConfig(setup.missingAnnotate);
}

function showReady(message: string): ReaderActionResult {
  showToast(message, "ready");
  return { ok: true, status: "ready", message };
}

function showSetupReminder(
  action: ReaderAction,
  message: string,
  spokenMessage: string
): ReaderActionResult {
  const label = action === "say" ? "Say" : "Annotate";
  const fullMessage = `${label}: ${message}`;
  showToast(fullMessage, "warning");
  speakStatus(spokenMessage);
  return { ok: false, status: "missing-config", message: fullMessage };
}

function showSpokenError(
  status: "missing-selection" | "no-reader",
  message: string
): ReaderActionResult {
  showToast(message, "warning");
  speakStatus(message);
  return { ok: false, status, message };
}

function showToast(message: string, tone: "ready" | "warning"): void {
  const host = document.getElementById(HOST_ID);
  const toast = host?.shadowRoot?.querySelector<HTMLElement>("[data-toast]");

  if (toast === undefined || toast === null) {
    return;
  }

  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.hidden = false;

  if (toastTimer !== undefined) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 4200);
}

function setMode(shadow: ShadowRoot, mode: string): void {
  const shell = requiredHtmlElement(shadow, "[data-shell]");
  shell.dataset.mode = mode;
}

function setSoftDisabled(button: HTMLButtonElement, disabled: boolean): void {
  button.setAttribute("aria-disabled", String(disabled));
  button.dataset.ready = String(!disabled);
}

function requiredButton(root: ShadowRoot, selector: string): HTMLButtonElement {
  const element = root.querySelector(selector);

  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`Missing reader control button: ${selector}`);
  }

  return element;
}

function requiredHtmlElement(root: ShadowRoot, selector: string): HTMLElement {
  const element = root.querySelector(selector);

  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing reader control element: ${selector}`);
  }

  return element;
}

function renderControl(): string {
  return `
    <style>
      :host {
        all: initial;
        color-scheme: light;
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
        position: fixed;
        right: 24px;
        bottom: 24px;
        z-index: 2147483647;
      }

      * {
        box-sizing: border-box;
      }

      button {
        font: inherit;
      }

      .shell {
        display: grid;
        gap: 10px;
        justify-items: end;
      }

      .control {
        align-items: stretch;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(236, 242, 244, 0.96)),
          #f6f9fa;
        border: 1px solid rgba(43, 61, 57, 0.28);
        border-radius: 18px;
        box-shadow:
          0 18px 46px rgba(23, 31, 38, 0.22),
          inset 0 1px 0 rgba(255, 255, 255, 0.95),
          inset 0 -1px 0 rgba(68, 82, 76, 0.18);
        display: grid;
        grid-template-columns: minmax(92px, auto) 1px minmax(112px, auto) 44px;
        min-height: 54px;
        overflow: hidden;
      }

      .action,
      .settings {
        align-items: center;
        appearance: none;
        background: transparent;
        border: 0;
        color: #17241f;
        cursor: pointer;
        display: inline-flex;
        gap: 9px;
        justify-content: center;
        min-height: 54px;
        min-width: 0;
        outline: none;
        padding: 0 16px;
        position: relative;
        transition:
          background-color 140ms ease,
          color 140ms ease,
          transform 140ms ease;
        white-space: nowrap;
      }

      .action:hover,
      .settings:hover,
      .action:focus-visible,
      .settings:focus-visible {
        background: rgba(25, 105, 95, 0.09);
      }

      .action:active,
      .settings:active {
        transform: translateY(1px);
      }

      .action[data-ready="false"] {
        color: #63727a;
      }

      .action[data-ready="false"]::after {
        background: #c47754;
        border-radius: 999px;
        content: "";
        height: 7px;
        position: absolute;
        right: 9px;
        top: 9px;
        width: 7px;
      }

      .split {
        background:
          linear-gradient(180deg, transparent, rgba(42, 56, 53, 0.22), transparent);
        min-height: 54px;
      }

      svg {
        display: block;
        fill: none;
        flex: 0 0 auto;
        height: 18px;
        stroke: currentColor;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 2;
        width: 18px;
      }

      .settings {
        color: #315f62;
        padding: 0;
        width: 44px;
      }

      .status {
        background: rgba(27, 43, 39, 0.86);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 999px;
        box-shadow: 0 10px 24px rgba(21, 28, 34, 0.18);
        color: #f6f8fa;
        font-size: 12px;
        line-height: 1;
        max-width: 240px;
        overflow: hidden;
        padding: 8px 11px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .toast {
        background: rgba(251, 252, 253, 0.98);
        border: 1px solid rgba(43, 61, 57, 0.2);
        border-left: 4px solid #2c8a7d;
        border-radius: 12px;
        box-shadow: 0 18px 44px rgba(23, 31, 38, 0.2);
        color: #17241f;
        font-size: 13px;
        line-height: 1.35;
        max-width: min(340px, calc(100vw - 48px));
        padding: 12px 14px;
      }

      .toast[data-tone="warning"] {
        border-left-color: #b65f42;
      }

      .toast[hidden] {
        display: none;
      }

      @media (max-width: 520px) {
        :host {
          bottom: 14px;
          left: 14px;
          right: 14px;
        }

        .shell {
          justify-items: stretch;
        }

        .control {
          grid-template-columns: minmax(82px, 1fr) 1px minmax(98px, 1fr) 42px;
        }

        .action {
          padding: 0 11px;
        }
      }
    </style>
    <div class="shell" data-shell data-mode="missing-config">
      <div class="status" data-status>Setup needed</div>
      <div class="control" role="group" aria-label="Zotero Speechify">
        <button class="action" data-say data-ready="false" title="Say">
          ${icons.volume}
          <span>Say</span>
        </button>
        <span class="split" aria-hidden="true"></span>
        <button class="action" data-annotate data-ready="false" title="Annotate">
          ${icons.annotate}
          <span>Annotate</span>
        </button>
        <button class="settings" data-settings title="Settings">
          ${icons.settings}
        </button>
      </div>
      <div class="toast" data-toast role="status" hidden></div>
    </div>
  `;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installReaderControl, {
    once: true
  });
} else {
  installReaderControl();
}
