import { describe, expect, test } from "vitest";

import {
  ANNOTATE_AGENT_CONFIG_REVISION,
  ANNOTATE_AGENT_PROMPT,
  ANNOTATE_AGENT_SLUG,
  END_CALL_TOOL,
  SAVE_ANNOTATION_TOOL_DEFINITION,
  SAVE_ANNOTATION_TOOL_NAME,
  buildAnnotateAgentDefinition
} from "../../src/index";

describe("annotation agent definition", () => {
  test("the save tool is a client tool with a required verbatim_text param", () => {
    expect(SAVE_ANNOTATION_TOOL_DEFINITION.kind).toBe("client");

    const [param] = SAVE_ANNOTATION_TOOL_DEFINITION.config.params;
    expect(param.name).toBe("verbatim_text");
    expect(param.required).toBe(true);
  });

  test("builtin tool names satisfy the API identifier pattern", () => {
    const identifier = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/u;
    expect(END_CALL_TOOL.name).toMatch(identifier);
    expect(SAVE_ANNOTATION_TOOL_NAME).toMatch(identifier);
  });

  test("the prompt wires the tool and the verbatim discipline together", () => {
    expect(ANNOTATE_AGENT_PROMPT).toContain(SAVE_ANNOTATION_TOOL_NAME);
    expect(ANNOTATE_AGENT_PROMPT).toContain("verbatim");
    expect(ANNOTATE_AGENT_PROMPT).toContain("end_call");
  });

  test("the agent definition carries the versioned prompt and voice", () => {
    const definition = buildAnnotateAgentDefinition("voice_123");

    expect(definition.slug).toBe(ANNOTATE_AGENT_SLUG);
    expect(definition.prompt).toBe(ANNOTATE_AGENT_PROMPT);
    expect(definition.tts.voice_id).toBe("voice_123");
    expect(definition.first_message.length).toBeGreaterThan(0);
  });

  test("the config revision is a positive integer", () => {
    expect(Number.isInteger(ANNOTATE_AGENT_CONFIG_REVISION)).toBe(true);
    expect(ANNOTATE_AGENT_CONFIG_REVISION).toBeGreaterThan(0);
  });
});
