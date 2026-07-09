import { describe, expect, test } from "vitest";

import { SPEECHIFY_AGENTS_API_VERSION } from "@zotero-speechify/agent-config";

import { buildAgentSessionRequest } from "../../src/index";

describe("buildAgentSessionRequest", () => {
  test("targets the agent's sessions endpoint with bearer auth", () => {
    const spec = buildAgentSessionRequest({
      agentId: "agent_0123",
      apiKey: "sk_test"
    });

    expect(spec.url).toBe(
      "https://api.speechify.ai/v1/agents/agent_0123/sessions"
    );
    expect(spec.init.method).toBe("POST");
    expect(spec.init.headers).toMatchObject({
      Authorization: "Bearer sk_test",
      "Speechify-Version": SPEECHIFY_AGENTS_API_VERSION
    });
  });

  test("includes dynamic variables and a trimmed user identity", () => {
    const spec = buildAgentSessionRequest({
      agentId: "agent_0123",
      apiKey: "sk_test",
      dynamicVariables: { item_title: "Attention Is All You Need" },
      userIdentity: "  reader-1  "
    });

    expect(typeof spec.init.body).toBe("string");
    expect(JSON.parse(spec.init.body as string)).toEqual({
      dynamic_variables: { item_title: "Attention Is All You Need" },
      user_identity: "reader-1"
    });
  });

  test("url-encodes the agent id", () => {
    const spec = buildAgentSessionRequest({
      agentId: "agent/../oops",
      apiKey: "sk_test"
    });

    expect(spec.url).toContain("/agents/agent%2F..%2Foops/sessions");
  });
});
