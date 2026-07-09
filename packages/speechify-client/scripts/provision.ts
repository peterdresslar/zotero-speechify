// Dev convenience: provisions the annotation agent on the account behind
// SPEECHIFY_KEY. The extension runs the same provisionAnnotateAgent() at
// first use, so end users never need this script.
//
// Usage: pnpm --filter @zotero-speechify/speechify-client provision
// Requires SPEECHIFY_KEY in the environment or the repo-root .env file.
// Optional: SPEECHIFY_AGENT_VOICE_ID to pick the agent voice.

import { fileURLToPath } from "node:url";

import { provisionAnnotateAgent } from "../src/index.ts";

const DEFAULT_VOICE_ID = "geffen_32";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {
  // No .env file; rely on the ambient environment.
}

const apiKey = process.env.SPEECHIFY_KEY ?? process.env.SPEECHIFY_API_KEY;

if (apiKey === undefined || apiKey.trim().length === 0) {
  console.error(
    "Missing SPEECHIFY_KEY. Set it in the repo-root .env or the environment."
  );
  process.exit(1);
}

const voiceId = process.env.SPEECHIFY_AGENT_VOICE_ID ?? DEFAULT_VOICE_ID;
const { agentId, toolId } = await provisionAnnotateAgent({ apiKey, voiceId });

console.log(`Tool definition ready: ${toolId}`);
console.log(`Agent ready: ${agentId}`);
