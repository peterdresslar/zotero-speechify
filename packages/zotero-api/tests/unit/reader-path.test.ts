import { describe, expect, test } from "vitest";

import { parseZoteroReaderPath } from "../../src/index";

describe("parseZoteroReaderPath", () => {
  test("parses a user-library reader path with an attachment segment", () => {
    const parsed = parseZoteroReaderPath(
      "/peterdresslar/collections/TA2IGNKN/items/P5SXP2YU/attachment/K86WKCSC/reader"
    );

    expect(parsed).toEqual({
      groupId: undefined,
      parentItemKey: "P5SXP2YU",
      attachmentKey: "K86WKCSC"
    });
  });

  test("falls back to the item key when there is no attachment segment", () => {
    const parsed = parseZoteroReaderPath(
      "/peterdresslar/items/N4DJS5TW/reader"
    );

    expect(parsed.parentItemKey).toBe("N4DJS5TW");
    expect(parsed.attachmentKey).toBe("N4DJS5TW");
  });

  test("parses a group-library reader path", () => {
    const parsed = parseZoteroReaderPath(
      "/groups/512345/items/AAAA1111/attachment/BBBB2222/reader"
    );

    expect(parsed).toEqual({
      groupId: "512345",
      parentItemKey: "AAAA1111",
      attachmentKey: "BBBB2222"
    });
  });

  test("returns nothing for non-reader library paths", () => {
    const parsed = parseZoteroReaderPath("/peterdresslar/library");

    expect(parsed.parentItemKey).toBeUndefined();
    expect(parsed.groupId).toBeUndefined();
  });
});
