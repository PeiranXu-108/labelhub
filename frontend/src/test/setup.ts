import "@testing-library/jest-dom/vitest";
import React from "react";
import { vi } from "vitest";

vi.mock("@ant-design/x/lib", () => {
  function XProvider({ children }: { children: React.ReactNode }) {
    return React.createElement(React.Fragment, null, children);
  }

  function Welcome({ title, description, icon, extra, className }: Record<string, React.ReactNode>) {
    return React.createElement(
      "div",
      { className },
      icon,
      title ? React.createElement("div", null, title) : null,
      description ? React.createElement("p", null, description) : null,
      extra,
    );
  }

  function Prompts({
    title,
    items = [],
    onItemClick,
    className,
  }: {
    title?: React.ReactNode;
    items?: Array<{ key: string; label?: React.ReactNode; description?: React.ReactNode }>;
    onItemClick?: (info: { data: { key: string; label?: React.ReactNode; description?: React.ReactNode } }) => void;
    className?: string;
  }) {
    return React.createElement(
      "div",
      { className },
      title ? React.createElement("h5", null, title) : null,
      items.map((item) =>
        React.createElement(
          "div",
          { key: item.key, onClick: () => onItemClick?.({ data: item }) },
          item.label,
          item.description ? React.createElement("small", null, item.description) : null,
        ),
      ),
    );
  }

  function Sender({
    value,
    placeholder,
    onChange,
    onSubmit,
    className,
  }: {
    value?: string;
    placeholder?: string;
    onChange?: (value: string) => void;
    onSubmit?: (value: string) => void;
    className?: string;
  }) {
    return React.createElement(
      "form",
      {
        className,
        onSubmit: (event: React.FormEvent) => {
          event.preventDefault();
          onSubmit?.(value ?? "");
        },
      },
      React.createElement("textarea", {
        placeholder,
        value,
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onChange?.(event.target.value),
      }),
      React.createElement("button", { type: "submit" }, "发送"),
    );
  }

  function Bubble({ content }: { content?: React.ReactNode }) {
    return React.createElement("div", null, content);
  }

  Bubble.List = function BubbleList({
    items = [],
    className,
  }: {
    items?: Array<{ key?: string | number; content?: React.ReactNode }>;
    className?: string;
  }) {
    return React.createElement(
      "div",
      { className },
      items.map((item, index) => React.createElement("div", { key: item.key ?? index }, item.content)),
    );
  };

  function ThoughtChain({
    items = [],
    className,
  }: {
    items?: Array<{ key?: string; title?: React.ReactNode; description?: React.ReactNode; extra?: React.ReactNode }>;
    className?: string;
  }) {
    return React.createElement(
      "div",
      { className },
      items.map((item, index) =>
        React.createElement(
          "div",
          { key: item.key ?? index },
          item.title,
          item.description,
          item.extra,
        ),
      ),
    );
  }

  return {
    XProvider,
    Welcome,
    Prompts,
    Sender,
    Bubble,
    ThoughtChain,
  };
});

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
