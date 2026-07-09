import { SpeechifyClient } from "@speechify/api";
import {
  ANNOTATE_AGENT_SLUG,
  END_CALL_TOOL,
  SAVE_ANNOTATION_TOOL_DEFINITION,
  SAVE_ANNOTATION_TOOL_NAME,
  SPEECHIFY_AGENTS_API_VERSION,
  buildAnnotateAgentDefinition
} from "@zotero-speechify/agent-config";

export const SPEECHIFY_API_BASE_URL = "https://api.speechify.ai";

export interface ProvisionedAnnotateAgent {
  agentId: string;
  toolId: string;
}

// Materializes the versioned agent definition from @zotero-speechify/
// agent-config onto the caller's own Speechify account. Idempotent: finds
// existing resources by name/slug and updates them, so it is safe to run on
// every install and after every definition change. Browser-compatible so the
// extension can self-provision with the user's key.
export async function provisionAnnotateAgent({
  apiKey,
  voiceId
}: {
  apiKey: string;
  voiceId: string;
}): Promise<ProvisionedAnnotateAgent> {
  const toolId = await upsertToolDefinition(apiKey);
  const agentId = await upsertAgent(apiKey, voiceId);
  await agentsRequest(apiKey, `/v1/agents/${agentId}/tools/${toolId}`, "PUT");
  await ensureEndCallTool(apiKey, agentId);

  return { agentId, toolId };
}

// The end_call builtin is a per-agent instance (no shared definition), so
// it is created inline and only if the agent does not already have one.
async function ensureEndCallTool(
  apiKey: string,
  agentId: string
): Promise<void> {
  const listed = await agentsRequest(
    apiKey,
    `/v1/agents/${agentId}/tools`,
    "GET"
  );
  const hasEndCall = listResources(listed).some(
    (tool) =>
      isRecord(tool.config) &&
      tool.config.builtin === END_CALL_TOOL.config.builtin
  );

  if (!hasEndCall) {
    await agentsRequest(
      apiKey,
      `/v1/agents/${agentId}/tools`,
      "POST",
      END_CALL_TOOL
    );
  }
}

async function upsertToolDefinition(apiKey: string): Promise<string> {
  const listed = await agentsRequest(
    apiKey,
    "/v1/agents/tool-definitions",
    "GET"
  );
  const existing = findByKey(listed, "name", SAVE_ANNOTATION_TOOL_NAME);

  if (existing !== undefined) {
    await agentsRequest(
      apiKey,
      `/v1/agents/tool-definitions/${existing.id}`,
      "PATCH",
      {
        description: SAVE_ANNOTATION_TOOL_DEFINITION.description,
        config: SAVE_ANNOTATION_TOOL_DEFINITION.config
      }
    );
    return existing.id;
  }

  const created = await agentsRequest(
    apiKey,
    "/v1/agents/tool-definitions",
    "POST",
    SAVE_ANNOTATION_TOOL_DEFINITION
  );
  return requireId(created, "tool definition");
}

async function upsertAgent(apiKey: string, voiceId: string): Promise<string> {
  const definition = buildAnnotateAgentDefinition(voiceId);
  const listed = await agentsRequest(apiKey, "/v1/agents", "GET");
  const existing = findByKey(listed, "slug", ANNOTATE_AGENT_SLUG);

  if (existing !== undefined) {
    await agentsRequest(
      apiKey,
      `/v1/agents/${existing.id}`,
      "PATCH",
      definition
    );
    return existing.id;
  }

  const created = await agentsRequest(apiKey, "/v1/agents", "POST", definition);
  return requireId(created, "agent");
}

async function agentsRequest(
  apiKey: string,
  path: string,
  method: "GET" | "POST" | "PATCH" | "PUT",
  body?: unknown
): Promise<unknown> {
  const response = await fetch(`${SPEECHIFY_API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Speechify-Version": SPEECHIFY_AGENTS_API_VERSION
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(
      `Speechify agents request ${method} ${path} failed (${String(response.status)}): ${detail}`
    );
  }

  if (response.status === 204) {
    return undefined;
  }

  return response.json();
}

interface ProvisionedResource {
  id: string;
  name?: string;
  slug?: string;
  config?: unknown;
}

function findByKey(
  payload: unknown,
  key: "name" | "slug",
  value: string
): ProvisionedResource | undefined {
  return listResources(payload).find((resource) => resource[key] === value);
}

// List endpoints wrap results in a resource-named envelope ({tools: [...]},
// {agents: [...]}, ...), so take the first array-valued property.
function listResources(payload: unknown): ProvisionedResource[] {
  if (Array.isArray(payload)) {
    return payload.filter(isProvisionedResource);
  }

  if (!isRecord(payload)) {
    return [];
  }

  const arrayValue = Object.values(payload).find((value) =>
    Array.isArray(value)
  );

  return Array.isArray(arrayValue)
    ? arrayValue.filter(isProvisionedResource)
    : [];
}

function requireId(payload: unknown, label: string): string {
  if (isProvisionedResource(payload)) {
    return payload.id;
  }

  throw new Error(`Speechify did not return an id for the created ${label}.`);
}

function isProvisionedResource(value: unknown): value is ProvisionedResource {
  return isRecord(value) && typeof value.id === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export interface SynthesizeSpeechInput {
  apiKey: string;
  voiceId: string;
  input: string;
  // Off by default: normalization improves number/abbreviation reading but
  // can slow synthesis responses.
  textNormalization?: boolean;
}

// Say synthesis via the official SDK's streaming endpoint (the SDK performs
// its own fetch, so it must be called from a context with Speechify host
// permissions, such as the extension offscreen document). Bytes start
// arriving well before synthesis of the full input finishes.
export async function streamSpeech(
  { apiKey, voiceId, input, textNormalization }: SynthesizeSpeechInput,
  abortSignal?: AbortSignal
): Promise<ReadableStream<Uint8Array>> {
  const client = new SpeechifyClient({ apiKey });
  const response = await client.audio.stream(
    {
      Accept: "audio/mpeg",
      input,
      voice_id: voiceId,
      options:
        textNormalization === undefined
          ? undefined
          : { text_normalization: textNormalization }
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
