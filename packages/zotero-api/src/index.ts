export interface ReaderAnnotationContext {
  readerOpen: boolean;
  selectedText: string;
  pageLabel?: string;
}

export type AnnotationTarget =
  | { kind: "highlight"; selectedText: string }
  | { kind: "page-note"; pageLabel?: string }
  | { kind: "no-reader" };

export function chooseAnnotationTarget(
  context: ReaderAnnotationContext
): AnnotationTarget {
  if (!context.readerOpen) {
    return { kind: "no-reader" };
  }

  if (context.selectedText.trim().length > 0) {
    return { kind: "highlight", selectedText: context.selectedText.trim() };
  }

  return { kind: "page-note", pageLabel: context.pageLabel };
}
