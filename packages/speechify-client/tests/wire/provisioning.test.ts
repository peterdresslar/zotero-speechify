import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import {
  SPEECHIFY_API_BASE_URL,
  provisionAnnotateAgent
} from "../../src/index";

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

describe("provisionAnnotateAgent", () => {
  test("creates and wires everything on a fresh account", async () => {
    const created: string[] = [];
    let builtinBody: unknown;
    let attached = false;

    server.use(
      http.get(`${SPEECHIFY_API_BASE_URL}/v1/agents/tool-definitions`, () =>
        HttpResponse.json({ tools: [], next_cursor: null, has_more: false })
      ),
      http.post(`${SPEECHIFY_API_BASE_URL}/v1/agents/tool-definitions`, () => {
        created.push("tool-definition");
        return HttpResponse.json({ id: "tool_new1" });
      }),
      http.get(`${SPEECHIFY_API_BASE_URL}/v1/agents`, () =>
        HttpResponse.json({ agents: [], next_cursor: null, has_more: false })
      ),
      http.post(`${SPEECHIFY_API_BASE_URL}/v1/agents`, () => {
        created.push("agent");
        return HttpResponse.json({ id: "agent_new1" });
      }),
      http.put(
        `${SPEECHIFY_API_BASE_URL}/v1/agents/agent_new1/tools/tool_new1`,
        () => {
          attached = true;
          return HttpResponse.json({ ok: true });
        }
      ),
      http.get(`${SPEECHIFY_API_BASE_URL}/v1/agents/agent_new1/tools`, () =>
        HttpResponse.json({ tools: [] })
      ),
      http.post(
        `${SPEECHIFY_API_BASE_URL}/v1/agents/agent_new1/tools`,
        async ({ request }) => {
          builtinBody = await request.json();
          return HttpResponse.json({ id: "tool_endcall" });
        }
      )
    );

    const result = await provisionAnnotateAgent({
      apiKey: "sk_test",
      voiceId: "voice_1"
    });

    expect(result).toEqual({ agentId: "agent_new1", toolId: "tool_new1" });
    expect(created).toEqual(["tool-definition", "agent"]);
    expect(attached).toBe(true);

    // Regression: the API rejects display names; builtin names must be
    // identifier-shaped ("End Call" 400s against the live validator).
    const builtin = builtinBody as Record<string, unknown>;
    expect(builtin.kind).toBe("builtin");
    expect(builtin.name).toBe("end_call");
  });

  test("finds existing resources inside resource-named list envelopes and patches instead of creating", async () => {
    // Regression: list endpoints wrap results as {tools: [...]} / {agents:
    // [...]}; missing that caused create-instead-of-update ("a tool with
    // this name already exists").
    const patched: string[] = [];

    server.use(
      http.get(`${SPEECHIFY_API_BASE_URL}/v1/agents/tool-definitions`, () =>
        HttpResponse.json({
          tools: [{ id: "tool_old1", name: "save_annotation" }],
          next_cursor: null,
          has_more: false
        })
      ),
      http.patch(
        `${SPEECHIFY_API_BASE_URL}/v1/agents/tool-definitions/tool_old1`,
        () => {
          patched.push("tool-definition");
          return HttpResponse.json({ id: "tool_old1" });
        }
      ),
      http.get(`${SPEECHIFY_API_BASE_URL}/v1/agents`, () =>
        HttpResponse.json({
          agents: [{ id: "agent_old1", slug: "zotero-speechify-annotate" }],
          next_cursor: null,
          has_more: false
        })
      ),
      http.patch(`${SPEECHIFY_API_BASE_URL}/v1/agents/agent_old1`, () => {
        patched.push("agent");
        return HttpResponse.json({ id: "agent_old1" });
      }),
      http.put(
        `${SPEECHIFY_API_BASE_URL}/v1/agents/agent_old1/tools/tool_old1`,
        () => HttpResponse.json({ ok: true })
      ),
      http.get(`${SPEECHIFY_API_BASE_URL}/v1/agents/agent_old1/tools`, () =>
        HttpResponse.json({
          tools: [{ id: "tool_endcall", config: { builtin: "end_call" } }]
        })
      )
    );

    const result = await provisionAnnotateAgent({
      apiKey: "sk_test",
      voiceId: "voice_1"
    });

    expect(result).toEqual({ agentId: "agent_old1", toolId: "tool_old1" });
    expect(patched).toEqual(["tool-definition", "agent"]);
    // No POSTs registered above: onUnhandledRequest: "error" guarantees the
    // create paths were never taken.
  });
});
