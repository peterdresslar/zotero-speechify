import { SpeechifyClient } from "@speechify/api";
import { SPEECHIFY_AGENTS_API_VERSION } from "@zotero-speechify/agent-config";

export const SPEECHIFY_API_BASE_URL = "https://api.speechify.ai";

export interface SynthesizeSpeechInput {
  apiKey: string;
  voiceId: string;
  input: string;
}

export interface SynthesizedSpeech {
  audioDataBase64: string;
  audioFormat: string;
}

// Say synthesis via the official SDK (which performs its own fetch, so it
// must be called from a context with Speechify host permissions, such as the
// extension service worker). Returns the complete clip as base64 so it can
// cross an extension message boundary.
export async function synthesizeSpeech({
  apiKey,
  voiceId,
  input
}: SynthesizeSpeechInput): Promise<SynthesizedSpeech> {
  const client = new SpeechifyClient({ apiKey });
  const response = await client.audio.speech({
    audio_format: "mp3",
    input,
    voice_id: voiceId
  });

  return {
    audioDataBase64: response.audio_data,
    audioFormat: response.audio_format
  };
}

export interface AgentSessionRequestInput {
  agentId: string;
  apiKey: string;
  dynamicVariables?: Record<string, unknown>;
  userIdentity?: string;
}

export interface SpeechifyRequestSpec {
  url: string;
  init: RequestInit;
}

export function buildAgentSessionRequest({
  agentId,
  apiKey,
  dynamicVariables,
  userIdentity
}: AgentSessionRequestInput): SpeechifyRequestSpec {
  const body: Record<string, unknown> = {};

  if (dynamicVariables !== undefined) {
    body.dynamic_variables = dynamicVariables;
  }

  if (userIdentity !== undefined && userIdentity.trim().length > 0) {
    body.user_identity = userIdentity.trim();
  }

  return {
    url: `${SPEECHIFY_API_BASE_URL}/v1/agents/${encodeURIComponent(
      agentId
    )}/sessions`,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Speechify-Version": SPEECHIFY_AGENTS_API_VERSION
      },
      body: JSON.stringify(body)
    }
  };
}
