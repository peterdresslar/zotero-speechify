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
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5.5 10 6.5-10 6.5Z"/></svg>',
  pause:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5v13"/><path d="M14.5 5.5v13"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>',
  restart:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5.5v13"/><path d="m18 5.5-8 6.5 8 6.5Z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="10.5" width="11" height="8.5" rx="2"/><path d="M9 10.5V8a3 3 0 0 1 6 0v2.5"/></svg>'
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
  // The agent id is auto-provisioned by the service worker on first use.
  const missingAnnotate = missingLabels([
    ["Speechify key", settings.speechifyApiKey],
    ["Zotero key", settings.zoteroApiKey]
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
// Off by default; build with VITE_SELECTION_PREVIEW=true to enable while
// debugging selection capture.
const SELECTION_PREVIEW_ENABLED =
  import.meta.env.VITE_SELECTION_PREVIEW === "true";

interface SynthesizeSpeechResult {
  ok: boolean;
  message: string;
}

type AudioControlCommand =
  "pause" | "resume" | "stop" | "restart" | "status" | "set-rate";

type AudioPlaybackState = "playing" | "paused" | "stopped" | "expired";

interface AudioControlResult {
  ok: boolean;
  state: AudioPlaybackState;
  rate: number;
}

const PLAYBACK_RATES = [0.8, 1, 1.2, 1.5, 2] as const;
const PLAYBACK_POLL_MS = 1200;
const READING_EXPIRED_MESSAGE =
  "That reading has ended — press Say to start another.";

let preferredRate = 1;
let playbackPollTimer: ReturnType<typeof setInterval> | undefined;
let voiceLoading = false;

// Playback happens in the extension's offscreen document, where an audio
// element gets pitch-preserving speed control and is exempt from the page
// CSP and autoplay policy. This script is only the remote control.
async function startSaying(selectedText: string): Promise<ReaderActionResult> {
  showToast(
    SELECTION_PREVIEW_ENABLED
      ? formatSelectionPreview(selectedText)
      : "Loading voice…",
    "ready"
  );
  setTransportLoading();

  let result: SynthesizeSpeechResult;

  try {
    result = await chrome.runtime.sendMessage({
      type: "SYNTHESIZE_SPEECH",
      input: selectedText,
      rate: preferredRate
    });
  } catch {
    voiceLoading = false;

    if (!isExtensionAlive()) {
      teardownReaderControl();
      return {
        ok: false,
        status: "unavailable",
        message: "The extension was updated — refresh this page."
      };
    }

    applyPlaybackResult(undefined);
    const message = "Sorry, I could not reach the extension to load the voice.";
    showToast(message, "warning");
    return { ok: false, status: "error", message };
  }

  voiceLoading = false;

  if (!result.ok) {
    applyPlaybackResult(undefined);
    showToast(result.message, "warning");
    speakStatus(result.message);
    return { ok: false, status: "error", message: result.message };
  }

  applyPlaybackResult({ ok: true, state: "playing", rate: preferredRate });
  return { ok: true, status: "ready", message: "Reading selected text." };
}

// Shows the transport immediately in a locked state: the LED gauge runs its
// charging sweep and every key wears a lock icon until the voice arrives.
function setTransportLoading(): void {
  voiceLoading = true;
  stopPlaybackPolling();

  const shadow = getControlShadow();

  if (shadow === undefined) {
    return;
  }

  const transport = requiredHtmlElement(shadow, "[data-transport]");
  transport.hidden = false;
  transport.dataset.playback = "loading";

  for (const selector of [
    "[data-restart]",
    "[data-play-pause]",
    "[data-stop]"
  ]) {
    const button = requiredButton(shadow, selector);
    button.innerHTML = icons.lock;
    button.title = "Loading voice…";
  }

  requiredButton(shadow, "[data-play-pause]").dataset.state = "loading";
  requiredHtmlElement(shadow, "[data-speed]").textContent =
    formatRate(preferredRate);
}

async function sendAudioControl(
  command: AudioControlCommand,
  rate?: number
): Promise<AudioControlResult | undefined> {
  try {
    const result: AudioControlResult | undefined =
      await chrome.runtime.sendMessage({
        type: "AUDIO_CONTROL",
        command,
        rate
      });

    return result;
  } catch {
    return undefined;
  }
}

async function togglePlayPause(): Promise<void> {
  const shadow = getControlShadow();
  const state =
    shadow === undefined
      ? undefined
      : requiredButton(shadow, "[data-play-pause]").dataset.state;
  const result = await sendAudioControl(
    state === "playing" ? "pause" : "resume"
  );

  notifyIfExpired(result);
  applyPlaybackResult(result);
}

async function restartPlayback(): Promise<void> {
  const result = await sendAudioControl("restart");
  notifyIfExpired(result);
  applyPlaybackResult(result);
}

async function cyclePlaybackRate(): Promise<void> {
  const index = PLAYBACK_RATES.findIndex((rate) => rate === preferredRate);
  preferredRate = PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length];
  applyPlaybackResult(await sendAudioControl("set-rate", preferredRate));
}

function notifyIfExpired(result: AudioControlResult | undefined): void {
  if (result === undefined || result.state === "expired") {
    showToast(READING_EXPIRED_MESSAGE, "warning");
  }
}

function applyPlaybackResult(result: AudioControlResult | undefined): void {
  const shadow = getControlShadow();

  if (shadow === undefined) {
    return;
  }

  const transport = requiredHtmlElement(shadow, "[data-transport]");

  if (
    result === undefined ||
    result.state === "stopped" ||
    result.state === "expired"
  ) {
    transport.hidden = true;
    delete transport.dataset.playback;
    stopPlaybackPolling();
    return;
  }

  transport.hidden = false;
  transport.dataset.playback = result.state;

  const restartButton = requiredButton(shadow, "[data-restart]");
  restartButton.innerHTML = icons.restart;
  restartButton.title = "Restart";

  const stopButton = requiredButton(shadow, "[data-stop]");
  stopButton.innerHTML = icons.stop;
  stopButton.title = "Stop";

  const playPauseButton = requiredButton(shadow, "[data-play-pause]");
  playPauseButton.dataset.state = result.state;
  playPauseButton.innerHTML =
    result.state === "playing" ? icons.pause : icons.play;
  playPauseButton.title = result.state === "playing" ? "Pause" : "Play";

  requiredHtmlElement(shadow, "[data-speed]").textContent = formatRate(
    result.rate
  );
  startPlaybackPolling();
}

function startPlaybackPolling(): void {
  playbackPollTimer ??= setInterval(() => {
    if (!guardExtensionAlive()) {
      return;
    }

    void sendAudioControl("status").then((result) => {
      if (!voiceLoading) {
        applyPlaybackResult(result);
      }
    });
  }, PLAYBACK_POLL_MS);
}

function stopPlaybackPolling(): void {
  if (playbackPollTimer !== undefined) {
    clearInterval(playbackPollTimer);
    playbackPollTimer = undefined;
  }
}

function getControlShadow(): ShadowRoot | undefined {
  return document.getElementById(HOST_ID)?.shadowRoot ?? undefined;
}

// When the extension is reloaded or updated, content scripts already injected
// into open tabs are orphaned: they keep running but every chrome.* call
// throws "Extension context invalidated". Detect that and remove the control
// so the page is left clean; the next tab refresh injects a live script.
function isExtensionAlive(): boolean {
  try {
    return chrome.runtime.id !== undefined;
  } catch {
    return false;
  }
}

function guardExtensionAlive(): boolean {
  if (isExtensionAlive()) {
    return true;
  }

  teardownReaderControl();
  return false;
}

function teardownReaderControl(): void {
  stopPlaybackPolling();

  if (toastTimer !== undefined) {
    clearTimeout(toastTimer);
    toastTimer = undefined;
  }

  document.getElementById(HOST_ID)?.remove();
}

function formatRate(rate: number): string {
  return `${String(rate)}×`;
}

function formatSelectionPreview(selectedText: string): string {
  const preview =
    selectedText.length > 100 ? `${selectedText.slice(0, 100)}…` : selectedText;

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
    if (!guardExtensionAlive()) {
      return;
    }

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
    if (!guardExtensionAlive()) {
      return;
    }

    void runReaderAction("say").then((result) => {
      setMode(shadow, result.status);
    });
  });

  annotateButton.addEventListener("click", () => {
    if (!guardExtensionAlive()) {
      return;
    }

    void runReaderAction("annotate").then((result) => {
      setMode(shadow, result.status);
    });
  });

  settingsButton.addEventListener("click", () => {
    if (!guardExtensionAlive()) {
      return;
    }

    void chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
  });

  requiredButton(shadow, "[data-play-pause]").addEventListener("click", () => {
    if (!guardExtensionAlive()) {
      return;
    }

    void togglePlayPause();
  });

  requiredButton(shadow, "[data-restart]").addEventListener("click", () => {
    if (!guardExtensionAlive()) {
      return;
    }

    void restartPlayback();
  });

  requiredButton(shadow, "[data-stop]").addEventListener("click", () => {
    if (!guardExtensionAlive()) {
      return;
    }

    void sendAudioControl("stop").then(applyPlaybackResult);
  });

  requiredButton(shadow, "[data-speed]").addEventListener("click", () => {
    if (!guardExtensionAlive()) {
      return;
    }

    void cyclePlaybackRate();
  });

  requiredButton(shadow, "[data-end-annotation]").addEventListener(
    "click",
    () => {
      if (!guardExtensionAlive()) {
        return;
      }

      void stopAnnotation();
    }
  );
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isAnnotationEndedMessage(message)) {
    annotationActive = false;
    setAnnotateActive(false);
    setAnnotationDeck("hidden");
    showToast(message.reason, "ready");
    sendResponse({ ok: true });
    return false;
  }

  if (isAnnotationSavedMessage(message)) {
    showToast("Annotation saved.", "ready");

    if (message.highlight !== undefined) {
      drawHighlightEcho(message.highlight.pageIndex, message.highlight.rects);
    }

    sendResponse({ ok: true });
    return false;
  }

  if (!isRunReaderActionMessage(message)) {
    return false;
  }

  void runReaderAction(message.action).then((result) => {
    sendResponse(result);
  });

  return true;
});

function isAnnotationEndedMessage(
  message: unknown
): message is { type: "ANNOTATION_ENDED"; reason: string } {
  return (
    isObject(message) &&
    message.type === "ANNOTATION_ENDED" &&
    typeof message.reason === "string"
  );
}

function isAnnotationSavedMessage(message: unknown): message is {
  type: "ANNOTATION_SAVED";
  highlight?: { pageIndex: number; rects: number[][] };
} {
  return isObject(message) && message.type === "ANNOTATION_SAVED";
}

// The web reader skips item refetches while in reader view, so the real
// annotation only renders after a reload. This paints an ephemeral overlay
// from the saved PDF-space rects so the highlight appears immediately; the
// reader's own rendering takes over on the next load. Best effort — any
// failure just means no echo.
function drawHighlightEcho(pageIndex: number, rects: number[][]): void {
  for (const doc of collectSameOriginDocuments(document)) {
    const page = doc.querySelector<HTMLElement>(
      `.page[data-page-number="${String(pageIndex + 1)}"]`
    );

    if (page === null) {
      continue;
    }

    const canvas = page.querySelector("canvas");

    if (canvas === null) {
      continue;
    }

    const scale = resolveScaleFactor(page);

    if (scale === undefined) {
      return;
    }

    const pageHeightPts = canvas.getBoundingClientRect().height / scale;

    for (const rect of rects) {
      const [x1, y1, x2, y2] = rect;

      if (
        x1 === undefined ||
        y1 === undefined ||
        x2 === undefined ||
        y2 === undefined
      ) {
        continue;
      }

      const echo = doc.createElement("div");
      echo.className = "zotero-speechify-highlight-echo";
      echo.style.position = "absolute";
      echo.style.left = `${String(canvas.offsetLeft + x1 * scale)}px`;
      echo.style.top = `${String(canvas.offsetTop + (pageHeightPts - y2) * scale)}px`;
      echo.style.width = `${String((x2 - x1) * scale)}px`;
      echo.style.height = `${String((y2 - y1) * scale)}px`;
      echo.style.background = "rgba(255, 212, 0, 0.45)";
      echo.style.mixBlendMode = "multiply";
      echo.style.pointerEvents = "none";
      echo.style.borderRadius = "1px";
      page.append(echo);
    }

    return;
  }
}

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

  if (annotationActive) {
    return stopAnnotation();
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

  return startAnnotating(target, context);
}

let annotationActive = false;

async function startAnnotating(
  target: AnnotationTarget,
  context: ZoteroReaderContext
): Promise<ReaderActionResult> {
  const parsed = parseReaderPath(window.location.pathname);

  if (parsed.parentItemKey === undefined) {
    return showSpokenError(
      "no-reader",
      "Sorry, I can't tell which item this reader belongs to."
    );
  }

  showToast("Starting voice annotation…", "ready");
  setAnnotationDeck("connecting");

  let result: OperationResult | undefined;

  try {
    result = await chrome.runtime.sendMessage({
      type: "START_ANNOTATION",
      target: {
        parentItemKey: parsed.parentItemKey,
        groupId: parsed.groupId,
        attachmentKey: parsed.attachmentKey,
        selectedText:
          target.kind === "highlight" ? target.selectedText : undefined,
        pageLabel: context.pageLabel,
        highlight:
          target.kind === "highlight" ? captureHighlightPosition() : undefined
      }
    });
  } catch {
    if (!isExtensionAlive()) {
      teardownReaderControl();
      return {
        ok: false,
        status: "unavailable",
        message: "The extension was updated — refresh this page."
      };
    }

    result = {
      ok: false,
      message: "Sorry, I could not start the annotation session."
    };
  }

  // An undefined response means no handler answered — surface it rather
  // than failing silently.
  result ??= {
    ok: false,
    message: "The extension did not respond — try reloading it."
  };

  if (!result.ok) {
    setAnnotationDeck("hidden");
    showToast(result.message, "warning");
    speakStatus(result.message);
    return { ok: false, status: "error", message: result.message };
  }

  annotationActive = true;
  setAnnotateActive(true);
  setAnnotationDeck("live");
  showToast(result.message, "ready");
  return { ok: true, status: "ready", message: result.message };
}

async function stopAnnotation(): Promise<ReaderActionResult> {
  annotationActive = false;
  setAnnotateActive(false);
  setAnnotationDeck("hidden");

  try {
    await chrome.runtime.sendMessage({ type: "STOP_ANNOTATION" });
  } catch {
    // Session already gone.
  }

  const message = "Annotation ended.";
  showToast(message, "ready");
  return { ok: true, status: "ready", message };
}

function setAnnotateActive(active: boolean): void {
  const shadow = getControlShadow();

  if (shadow === undefined) {
    return;
  }

  const annotateButton = requiredButton(shadow, "[data-annotate]");
  annotateButton.dataset.active = String(active);
  annotateButton.title = active ? "End annotation" : "Annotate";
}

function setAnnotationDeck(state: "connecting" | "live" | "hidden"): void {
  const shadow = getControlShadow();

  if (shadow === undefined) {
    return;
  }

  const deck = requiredHtmlElement(shadow, "[data-annotate-deck]");

  if (state === "hidden") {
    deck.hidden = true;
    delete deck.dataset.state;
    return;
  }

  deck.hidden = false;
  deck.dataset.state = state;
  requiredHtmlElement(shadow, "[data-annotate-label]").textContent =
    state === "live" ? "Annotating" : "Connecting…";
}

interface OperationResult {
  ok: boolean;
  message: string;
}

// Reader URLs: /<user>/(collections/<key>/)?items/<itemKey>/
// (attachment/<key>/)?reader, or /groups/<id>/... for group libraries. When
// there is no attachment segment, the item itself is the attachment.
function parseReaderPath(pathname: string): {
  groupId?: string;
  parentItemKey?: string;
  attachmentKey?: string;
} {
  const groupMatch = /^\/groups\/(?<groupId>\d+)\//u.exec(pathname);
  const itemMatch = /\/items\/(?<itemKey>[A-Z0-9]{8})(?:\/|$)/u.exec(pathname);
  const attachmentMatch =
    /\/attachment\/(?<attachmentKey>[A-Z0-9]{8})(?:\/|$)/u.exec(pathname);

  return {
    groupId: groupMatch?.groups?.groupId,
    parentItemKey: itemMatch?.groups?.itemKey,
    attachmentKey:
      attachmentMatch?.groups?.attachmentKey ?? itemMatch?.groups?.itemKey
  };
}

interface HighlightCapture {
  pageIndex: number;
  rects: number[][];
  sortIndex: string;
}

// Converts the reader selection into Zotero's PDF-space annotation position:
// points, origin at the page's bottom-left. The DOM gives CSS pixels; the
// bridge is pdf.js's --scale-factor custom property and the rendered page
// canvas geometry. Returns undefined whenever anything cannot be resolved —
// callers then fall back to a child note, so the annotation is never lost.
function captureHighlightPosition(): HighlightCapture | undefined {
  const selectionRange = findSelectionRange(
    collectSameOriginDocuments(document)
  );

  if (selectionRange === undefined) {
    return undefined;
  }

  const anchor = selectionRange.commonAncestorContainer;
  const anchorElement =
    anchor instanceof Element ? anchor : anchor.parentElement;
  const page = anchorElement?.closest<HTMLElement>(".page[data-page-number]");

  if (page === null || page === undefined) {
    return undefined;
  }

  const pageNumber = Number(page.dataset.pageNumber);
  const canvas = page.querySelector("canvas");

  if (!Number.isFinite(pageNumber) || pageNumber < 1 || canvas === null) {
    return undefined;
  }

  const canvasRect = canvas.getBoundingClientRect();
  const scale = resolveScaleFactor(page);

  if (scale === undefined || canvasRect.width === 0) {
    return undefined;
  }

  const pageWidthPts = canvasRect.width / scale;
  const pageHeightPts = canvasRect.height / scale;
  const rects: number[][] = [];

  for (const rect of Array.from(selectionRange.getClientRects())) {
    if (rect.width < 1 || rect.height < 1) {
      continue;
    }

    const x1 = clamp((rect.left - canvasRect.left) / scale, 0, pageWidthPts);
    const x2 = clamp((rect.right - canvasRect.left) / scale, 0, pageWidthPts);
    const yTop = clamp((rect.top - canvasRect.top) / scale, 0, pageHeightPts);
    const yBottom = clamp(
      (rect.bottom - canvasRect.top) / scale,
      0,
      pageHeightPts
    );

    rects.push([
      roundPts(x1),
      roundPts(pageHeightPts - yBottom),
      roundPts(x2),
      roundPts(pageHeightPts - yTop)
    ]);
  }

  const firstRect = rects[0];

  if (firstRect === undefined) {
    return undefined;
  }

  const pageIndex = pageNumber - 1;
  const topPts = Math.max(0, Math.round(pageHeightPts - firstRect[3]));
  const sortIndex = `${String(pageIndex).padStart(5, "0")}|000000|${String(topPts).padStart(5, "0")}`;

  return { pageIndex, rects, sortIndex };
}

function findSelectionRange(documents: Document[]): Range | undefined {
  for (const doc of documents) {
    const selection = doc.defaultView?.getSelection();

    if (
      selection !== null &&
      selection !== undefined &&
      selection.rangeCount > 0 &&
      !selection.isCollapsed
    ) {
      return selection.getRangeAt(0);
    }
  }

  return undefined;
}

// pdf.js sets --scale-factor on the viewer container; computed style
// inherits it down to the page element.
function resolveScaleFactor(element: HTMLElement): number | undefined {
  const raw = element.ownerDocument.defaultView
    ?.getComputedStyle(element)
    .getPropertyValue("--scale-factor");
  const parsed = Number.parseFloat(raw ?? "");

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundPts(value: number): number {
  return Math.round(value * 1000) / 1000;
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
        box-shadow: inset 0 2px 4px rgba(43, 61, 57, 0.18);
        transform: translateY(1px);
      }

      .action span {
        text-shadow: 0 1px 0 rgba(255, 255, 255, 0.65);
      }

      .transport {
        align-items: center;
        background:
          linear-gradient(180deg, rgba(250, 252, 252, 0.97), rgba(224, 233, 234, 0.97));
        border: 1px solid rgba(43, 61, 57, 0.3);
        border-radius: 16px;
        box-shadow:
          0 14px 34px rgba(23, 31, 38, 0.2),
          inset 0 1px 0 rgba(255, 255, 255, 0.95),
          inset 0 -2px 3px rgba(68, 82, 76, 0.16);
        display: inline-flex;
        gap: 7px;
        padding: 8px 10px;
      }

      .transport[hidden] {
        display: none;
      }

      .transport-key,
      .transport-speed {
        align-items: center;
        appearance: none;
        background: linear-gradient(180deg, #fdfefe, #e2eaeb);
        border: 1px solid rgba(43, 61, 57, 0.32);
        border-radius: 11px;
        box-shadow:
          0 2px 3px rgba(23, 31, 38, 0.16),
          inset 0 1px 0 rgba(255, 255, 255, 0.95),
          inset 0 -1px 0 rgba(68, 82, 76, 0.12);
        color: #17241f;
        cursor: pointer;
        display: inline-flex;
        height: 34px;
        justify-content: center;
        outline: none;
        padding: 0;
        transition:
          background-color 120ms ease,
          box-shadow 120ms ease,
          transform 120ms ease;
        width: 36px;
      }

      .transport-key:hover,
      .transport-speed:hover,
      .transport-key:focus-visible,
      .transport-speed:focus-visible {
        background: linear-gradient(180deg, #f4faf9, #dbe6e5);
      }

      .transport-key:active,
      .transport-speed:active {
        background: linear-gradient(180deg, #e3ecec, #d6e1e2);
        box-shadow:
          0 1px 1px rgba(23, 31, 38, 0.12),
          inset 0 2px 4px rgba(43, 61, 57, 0.28);
        transform: translateY(1px);
      }

      .transport-key svg {
        height: 15px;
        width: 15px;
      }

      .transport[data-playback="loading"] .transport-key,
      .transport[data-playback="loading"] .transport-speed {
        color: #7b878d;
        pointer-events: none;
      }

      .gauge {
        align-items: center;
        background: linear-gradient(180deg, #202d26, #2d4034);
        border: 1px solid rgba(16, 24, 20, 0.6);
        border-radius: 9px;
        box-shadow:
          inset 0 2px 4px rgba(8, 14, 11, 0.65),
          0 1px 0 rgba(255, 255, 255, 0.6);
        display: inline-flex;
        flex-direction: column-reverse;
        gap: 2px;
        height: 34px;
        justify-content: center;
        padding: 0 6px;
      }

      .led {
        background: #34483d;
        box-shadow: inset 0 1px 1px rgba(8, 14, 11, 0.55);
        height: 3px;
        transition:
          background-color 160ms ease,
          box-shadow 160ms ease;
        width: 13px;
      }

      @keyframes zotero-speechify-led {
        0%,
        100% {
          background: #34483d;
          box-shadow: inset 0 1px 1px rgba(8, 14, 11, 0.55);
        }
        30%,
        70% {
          background: #57df82;
          box-shadow:
            0 0 6px rgba(87, 223, 130, 0.85),
            inset 0 0 2px rgba(255, 255, 255, 0.5);
        }
      }

      .transport[data-playback="loading"] .led {
        animation: zotero-speechify-led 1100ms linear infinite;
      }

      .transport[data-playback="loading"] .led:nth-child(2) {
        animation-delay: 130ms;
      }

      .transport[data-playback="loading"] .led:nth-child(3) {
        animation-delay: 260ms;
      }

      .transport[data-playback="loading"] .led:nth-child(4) {
        animation-delay: 390ms;
      }

      .transport[data-playback="loading"] .led:nth-child(5) {
        animation-delay: 520ms;
      }

      .transport[data-playback="playing"] .led {
        background: #57df82;
        box-shadow:
          0 0 6px rgba(87, 223, 130, 0.85),
          inset 0 0 2px rgba(255, 255, 255, 0.5);
      }

      .annotate-deck {
        align-items: center;
        background:
          linear-gradient(180deg, rgba(250, 252, 252, 0.97), rgba(224, 233, 234, 0.97));
        border: 1px solid rgba(43, 61, 57, 0.3);
        border-radius: 16px;
        box-shadow:
          0 14px 34px rgba(23, 31, 38, 0.2),
          inset 0 1px 0 rgba(255, 255, 255, 0.95),
          inset 0 -2px 3px rgba(68, 82, 76, 0.16);
        display: inline-flex;
        gap: 10px;
        padding: 8px 10px 8px 14px;
      }

      .annotate-deck[hidden] {
        display: none;
      }

      .rec-lamp {
        background: #b0bcb6;
        border-radius: 999px;
        box-shadow: inset 0 1px 1px rgba(8, 14, 11, 0.35);
        flex: 0 0 auto;
        height: 10px;
        width: 10px;
      }

      @keyframes zotero-speechify-pulse {
        50% {
          opacity: 0.45;
        }
      }

      .annotate-deck[data-state="connecting"] .rec-lamp {
        animation: zotero-speechify-pulse 1100ms ease-in-out infinite;
        background: #d7a55f;
        box-shadow: 0 0 7px rgba(215, 165, 95, 0.75);
      }

      .annotate-deck[data-state="live"] .rec-lamp {
        animation: zotero-speechify-pulse 1600ms ease-in-out infinite;
        background: #d64533;
        box-shadow: 0 0 8px rgba(214, 69, 51, 0.8);
      }

      .annotate-label {
        color: #17241f;
        font-size: 12.5px;
        letter-spacing: 0.01em;
        text-shadow: 0 1px 0 rgba(255, 255, 255, 0.7);
      }

      .transport-speed {
        color: #1d4a42;
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        letter-spacing: 0.02em;
        text-shadow: 0 1px 0 rgba(255, 255, 255, 0.8);
        width: 48px;
      }

      .action[data-ready="false"] {
        color: #63727a;
      }

      .action[data-active="true"] {
        color: #9b3f2f;
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
      <div class="annotate-deck" data-annotate-deck hidden>
        <span class="rec-lamp" aria-hidden="true"></span>
        <span class="annotate-label" data-annotate-label>Annotating</span>
        <button
          class="transport-key"
          data-end-annotation
          title="End annotation"
        >
          ${icons.stop}
        </button>
      </div>
      <div
        class="transport"
        data-transport
        role="group"
        aria-label="Playback controls"
        hidden
      >
        <div class="gauge" aria-hidden="true">
          <span class="led"></span>
          <span class="led"></span>
          <span class="led"></span>
          <span class="led"></span>
          <span class="led"></span>
        </div>
        <button class="transport-key" data-restart title="Restart">
          ${icons.restart}
        </button>
        <button
          class="transport-key"
          data-play-pause
          data-state="paused"
          title="Play"
        >
          ${icons.play}
        </button>
        <button class="transport-key" data-stop title="Stop">
          ${icons.stop}
        </button>
        <button class="transport-speed" data-speed title="Playback speed">
          1×
        </button>
      </div>
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
