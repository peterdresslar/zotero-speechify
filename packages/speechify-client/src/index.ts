import { SPEECHIFY_AGENTS_API_VERSION } from "@zotero-speechify/agent-config";

export const SPEECHIFY_API_BASE_URL = "https://api.speechify.ai";

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
