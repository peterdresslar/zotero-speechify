import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import {
  ZOTERO_API_BASE_URL,
  createHighlightAnnotation,
  createVoiceNote,
  getKeyInfo
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

describe("getKeyInfo", () => {
  test("sends the key header and returns the numeric userID", async () => {
    let seenKeyHeader: string | null = null;

    server.use(
      http.get(`${ZOTERO_API_BASE_URL}/keys/current`, ({ request }) => {
        seenKeyHeader = request.headers.get("Zotero-API-Key");
        return HttpResponse.json({ userID: 4242, username: "reader" });
      })
    );

    await expect(getKeyInfo("zk_test")).resolves.toEqual({ userID: 4242 });
    expect(seenKeyHeader).toBe("zk_test");
  });
});

describe("createVoiceNote", () => {
  test("posts an annotation-first, HTML-escaped child note", async () => {
    let body: unknown;

    server.use(
      http.post(
        `${ZOTERO_API_BASE_URL}/users/4242/items`,
        async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({
            success: { "0": "NOTEKEY9" },
            failed: {}
          });
        }
      )
    );

    const result = await createVoiceNote({
      apiKey: "zk_test",
      library: { type: "user", id: "4242" },
      parentItemKey: "P5SXP2YU",
      annotationText: 'My take on <script> & "attention"',
      selectedText: "Scaled Dot-Product Attention",
      pageLabel: "4"
    });

    expect(result).toEqual({ noteKey: "NOTEKEY9" });

    const [item] = body as Record<string, unknown>[];
    expect(item.itemType).toBe("note");
    expect(item.parentItem).toBe("P5SXP2YU");
    expect(item.tags).toEqual([{ tag: "voice-annotation" }]);

    const note = String(item.note);
    // Dictation leads (it becomes the note's display title) and is escaped.
    expect(
      note.startsWith(
        "<p>My take on &lt;script&gt; &amp; &quot;attention&quot;</p>"
      )
    ).toBe(true);
    expect(note).toContain(
      "<blockquote><p>Scaled Dot-Product Attention</p></blockquote>"
    );
    expect(note).toContain("Voice annotation — page 4");
  });

  test("targets group libraries under /groups", async () => {
    let requested = false;

    server.use(
      http.post(`${ZOTERO_API_BASE_URL}/groups/512345/items`, () => {
        requested = true;
        return HttpResponse.json({ success: { "0": "NOTEKEY9" }, failed: {} });
      })
    );

    await createVoiceNote({
      apiKey: "zk_test",
      library: { type: "group", id: "512345" },
      parentItemKey: "AAAA1111",
      annotationText: "group note"
    });

    expect(requested).toBe(true);
  });

  test("throws when Zotero reports a per-item failure", async () => {
    server.use(
      http.post(`${ZOTERO_API_BASE_URL}/users/4242/items`, () =>
        HttpResponse.json({
          success: {},
          failed: { "0": { code: 400, message: "Parent item not found" } }
        })
      )
    );

    await expect(
      createVoiceNote({
        apiKey: "zk_test",
        library: { type: "user", id: "4242" },
        parentItemKey: "MISSING1",
        annotationText: "orphan"
      })
    ).rejects.toThrow("did not confirm");
  });
});

describe("createHighlightAnnotation", () => {
  test("posts a highlight child of the attachment with stringified position", async () => {
    let body: unknown;

    server.use(
      http.post(
        `${ZOTERO_API_BASE_URL}/users/4242/items`,
        async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({
            success: { "0": "ANNOKEY9" },
            failed: {}
          });
        }
      )
    );

    const result = await createHighlightAnnotation({
      apiKey: "zk_test",
      library: { type: "user", id: "4242" },
      attachmentItemKey: "K86WKCSC",
      selectedText: "Scaled Dot-Product Attention",
      comment: "This is the formal invention of quadratic attention.",
      pageLabel: "4",
      position: {
        pageIndex: 3,
        rects: [[108.5, 620.1, 402.9, 634.7]],
        sortIndex: "00003|000000|00157"
      }
    });

    expect(result).toEqual({ annotationKey: "ANNOKEY9" });

    const [item] = body as Record<string, unknown>[];
    expect(item.itemType).toBe("annotation");
    expect(item.annotationType).toBe("highlight");
    expect(item.parentItem).toBe("K86WKCSC");
    expect(item.annotationComment).toBe(
      "This is the formal invention of quadratic attention."
    );
    expect(item.annotationSortIndex).toBe("00003|000000|00157");

    // Zotero requires the position as a JSON *string*, not an object.
    expect(typeof item.annotationPosition).toBe("string");
    expect(JSON.parse(item.annotationPosition as string)).toEqual({
      pageIndex: 3,
      rects: [[108.5, 620.1, 402.9, 634.7]]
    });
  });
});
