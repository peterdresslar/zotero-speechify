export interface ExtensionSettings {
  speechifyApiKey: string;
  zoteroApiKey: string;
  speechifyAgentId: string;
  ttsVoiceId: string;
  readBackEnabled: boolean;
}

export interface SetupState {
  sayReady: boolean;
  annotateReady: boolean;
  missingSay: string[];
  missingAnnotate: string[];
}

const SETTINGS_KEY = "zoteroSpeechifySettings";

export const DEFAULT_SETTINGS: ExtensionSettings = {
  speechifyApiKey: "",
  zoteroApiKey: "",
  speechifyAgentId: "",
  ttsVoiceId: "geffen_32",
  readBackEnabled: false
};

export async function getSettings(): Promise<ExtensionSettings> {
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

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export function getSetupState(settings: ExtensionSettings): SetupState {
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

export function formatMissingConfig(labels: string[]): string {
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
