import "@testing-library/jest-dom/vitest";

const storage = new Map<string, string>();

Object.defineProperty(window, "localStorage", {
  writable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  },
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

window.getComputedStyle = (_element: Element) => {
  const values: Record<string, string> = {
    "border-bottom-width": "0px",
    "border-top-width": "0px",
    "box-sizing": "border-box",
    "font-family": "Inter",
    "font-size": "14px",
    "font-variant": "normal",
    "font-weight": "400",
    "letter-spacing": "0px",
    "line-height": "20px",
    "overflow": "auto",
    "overflow-x": "auto",
    "overflow-y": "auto",
    "padding-bottom": "0px",
    "padding-left": "0px",
    "padding-right": "0px",
    "padding-top": "0px",
    "text-indent": "0px",
    "text-rendering": "auto",
    "text-transform": "none",
    "white-space": "normal",
    "width": "1024px",
    "word-break": "normal",
  };
  return {
    getPropertyValue: (property: string) => values[property] ?? "",
    borderBottomWidth: "0px",
    borderTopWidth: "0px",
    boxSizing: "border-box",
    fontFamily: "Inter",
    fontSize: "14px",
    fontVariant: "normal",
    fontWeight: "400",
    letterSpacing: "0px",
    lineHeight: "20px",
    overflow: "auto",
    overflowX: "auto",
    overflowY: "auto",
    paddingBottom: "0px",
    paddingLeft: "0px",
    paddingRight: "0px",
    paddingTop: "0px",
    textIndent: "0px",
    textRendering: "auto",
    textTransform: "none",
    whiteSpace: "normal",
    width: "1024px",
    wordBreak: "normal",
  } as CSSStyleDeclaration;
};
