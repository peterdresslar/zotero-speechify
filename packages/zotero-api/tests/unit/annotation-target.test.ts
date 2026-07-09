import { describe, expect, test } from "vitest";

import { chooseAnnotationTarget } from "../../src/index";

describe("chooseAnnotationTarget", () => {
  test("selects a highlight when text is selected", () => {
    expect(
      chooseAnnotationTarget({
        readerOpen: true,
        selectedText: "  scaled dot-product attention  ",
        pageLabel: "4"
      })
    ).toEqual({
      kind: "highlight",
      selectedText: "scaled dot-product attention"
    });
  });

  test("selects a page note when the reader is open without a selection", () => {
    expect(
      chooseAnnotationTarget({
        readerOpen: true,
        selectedText: "",
        pageLabel: "2"
      })
    ).toEqual({ kind: "page-note", pageLabel: "2" });
  });

  test("reports no reader when the reader is closed", () => {
    expect(
      chooseAnnotationTarget({ readerOpen: false, selectedText: "anything" })
    ).toEqual({ kind: "no-reader" });
  });
});
