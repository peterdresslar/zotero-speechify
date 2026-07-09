import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { SPEECHIFY_API_BASE_URL, streamSpeech } from "../../src/index";

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

describe("streamSpeech", () => {
  test("requests mpeg audio and returns the byte stream", async () => {
    let body: Record<string, unknown> | undefined;
    let accept: string | null = null;

    server.use(
      http.post(
        `${SPEECHIFY_API_BASE_URL}/v1/audio/stream`,
        async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>;
          accept = request.headers.get("Accept");
          return new HttpResponse(new Uint8Array([1, 2, 3]).buffer, {
            headers: { "Content-Type": "audio/mpeg" }
          });
        }
      )
    );

    const stream = await streamSpeech({
      apiKey: "sk_test",
      voiceId: "voice_1",
      input: "Attention is all you need."
    });

    const chunks: number[] = [];
    const reader = stream.getReader();

    for (;;) {
      const chunk = await reader.read();

      if (chunk.done) {
        break;
      }

      chunks.push(...chunk.value);
    }

    expect(chunks).toEqual([1, 2, 3]);
    expect(accept).toBe("audio/mpeg");
    expect(body?.voice_id).toBe("voice_1");
    expect(body?.input).toBe("Attention is all you need.");
    // No normalization requested: default API behavior stays untouched.
    expect(body?.options).toBeUndefined();
  });

  test("passes text normalization through when enabled", async () => {
    let body: Record<string, unknown> | undefined;

    server.use(
      http.post(
        `${SPEECHIFY_API_BASE_URL}/v1/audio/stream`,
        async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>;
          return new HttpResponse(new Uint8Array([0]).buffer, {
            headers: { "Content-Type": "audio/mpeg" }
          });
        }
      )
    );

    await streamSpeech({
      apiKey: "sk_test",
      voiceId: "voice_1",
      input: "See Fig. 3 and Eq. 12.",
      textNormalization: true
    });

    expect(body?.options).toEqual({ text_normalization: true });
  });
});
