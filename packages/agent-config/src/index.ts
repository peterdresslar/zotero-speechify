export const SPEECHIFY_AGENTS_API_VERSION = "2026-07-08";

export const SAVE_ANNOTATION_TOOL_NAME = "save_annotation";

export const SAVE_ANNOTATION_TOOL_DEFINITION = {
  name: SAVE_ANNOTATION_TOOL_NAME,
  description:
    "Save the caller's dictated annotation verbatim to the active Zotero reader target.",
  kind: "client",
  config: {
    timeout_ms: 5000,
    params: [
      {
        name: "verbatim_text",
        type: "string",
        required: true,
        description:
          "The exact annotation text the caller dictated, without paraphrase."
      }
    ]
  }
} as const;

export const ANNOTATE_AGENT_PROMPT = [
  "You capture short scholarly annotations for the active Zotero reader.",
  "Ask the caller to say the annotation.",
  "Capture the annotation verbatim.",
  "Do not summarize, polish, rewrite, or infer missing words.",
  `When ready, call ${SAVE_ANNOTATION_TOOL_NAME} with the exact dictated text.`
].join("\n");
