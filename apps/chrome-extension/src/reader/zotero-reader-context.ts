export interface ZoteroReaderContext {
  readerOpen: boolean;
  selectedText: string;
  pageLabel?: string;
}

const READER_PATH_PATTERN = /\/reader\/?$/u;
const READER_PROBE_SELECTOR =
  "[data-reader-root], #viewerContainer, .pdfViewer";

export function getReaderContext(): ZoteroReaderContext {
  const documents = collectSameOriginDocuments(document);
  const readerOpen =
    READER_PATH_PATTERN.test(window.location.pathname) ||
    documents.some((doc) => doc.querySelector(READER_PROBE_SELECTOR) !== null);

  return {
    readerOpen,
    selectedText: getSelectedText(documents),
    pageLabel: getVisiblePageLabel(documents)
  };
}

// The Zotero web reader renders inside same-origin iframes (the reader app,
// with the pdf.js viewer nested one level deeper), so every DOM read has to
// walk the frame tree rather than the top document.
function collectSameOriginDocuments(root: Document): Document[] {
  const documents: Document[] = [root];

  for (const frame of Array.from(root.querySelectorAll("iframe"))) {
    const doc = sameOriginContentDocument(frame);

    if (doc !== null) {
      documents.push(...collectSameOriginDocuments(doc));
    }
  }

  return documents;
}

function sameOriginContentDocument(frame: HTMLIFrameElement): Document | null {
  try {
    return frame.contentDocument;
  } catch {
    return null;
  }
}

function getSelectedText(documents: Document[]): string {
  for (const doc of documents) {
    const selection = normalizeSelection(
      doc.defaultView?.getSelection()?.toString()
    );

    if (selection.length > 0) {
      return selection;
    }
  }

  return "";
}

function normalizeSelection(selection: string | undefined): string {
  return selection?.replace(/\s+/gu, " ").trim() ?? "";
}

function getVisiblePageLabel(documents: Document[]): string | undefined {
  for (const doc of documents) {
    const pages = Array.from(
      doc.querySelectorAll<HTMLElement>(".page[data-page-number]")
    );

    if (pages.length === 0) {
      continue;
    }

    const viewportMiddle = (doc.defaultView?.innerHeight ?? 0) / 2;
    const visiblePage = pages.find((page) => {
      const rect = page.getBoundingClientRect();
      return rect.top <= viewportMiddle && rect.bottom >= viewportMiddle;
    });

    return (visiblePage ?? pages[0]).dataset.pageNumber;
  }

  return undefined;
}
