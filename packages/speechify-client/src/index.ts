import { SpeechifyClient } from "@speechify/api";
import { SPEECHIFY_AGENTS_API_VERSION } from "@zotero-speechify/agent-config";

export const SPEECHIFY_API_BASE_URL = "https://api.speechify.ai";

export interface SynthesizeSpeechInput {
  apiKey: string;
  voiceId: string;
  input: string;
}

// Say synthesis via the official SDK's streaming endpoint (the SDK performs
// its own fetch, so it must be called from a context with Speechify host
// permissions, such as the extension offscreen document). Bytes start
// arriving well before synthesis of the full input finishes.
export async function streamSpeech(
  { apiKey, voiceId, input }: SynthesizeSpeechInput,
  abortSignal?: AbortSignal
): Promise<ReadableStream<Uint8Array>> {
  const client = new SpeechifyClient({ apiKey });
  const response = await client.audio.stream(
    {
      Accept: "audio/mpeg",
      input,
      voice_id: voiceId
    },
    { abortSignal }
  );
  const stream = response.stream();

  if (stream === null) {
    throw new Error("Speechify returned an empty audio stream.");
  }

  return stream;
}

export function describeSpeechifyFailure(error: unknown): string {
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
