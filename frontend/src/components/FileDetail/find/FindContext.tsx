"use client";

import { createContext, useContext, type ReactElement, type ReactNode } from "react";

import type { FindContextValue, FindMarksValue } from "./types";

const EMPTY_FIND: FindContextValue = {
  enabled: false,
  shortcutEnabled: false,
  open: false,
  query: "",
  status: { kind: "idle" },
  filter: "all",
  rows: [],
  visibleRows: [],
  currentRow: null,
  currentIndex: null,
  truncated: false,
  focusNonce: 0,
  selectRequest: null,
  openFind: () => {},
  closeFind: () => {},
  openFindByShortcut: () => false,
  changeQuery: () => {},
  commitQuery: () => {},
  compositionStart: () => {},
  compositionEnd: () => {},
  keyDown: () => {},
  step: () => {},
  selectRow: () => {},
  selectFilter: () => {},
  retry: () => {},
  reportTab: () => {},
  registerUrlStrip: () => {},
};

const EMPTY_MARKS: FindMarksValue = {
  term: null,
  currentRow: null,
  rows: [],
};

const FindContext = createContext<FindContextValue>(EMPTY_FIND);
const FindMarksContext = createContext<FindMarksValue>(EMPTY_MARKS);

export function FindProvider({
  value,
  children,
}: {
  value: FindContextValue;
  children: ReactNode;
}): ReactElement {
  const marks: FindMarksValue = {
    term:
      value.open && value.status.kind === "hits"
        ? value.status.answer.query || value.query.trim()
        : null,
    currentRow: value.currentRow,
    rows: value.rows,
  };
  return (
    <FindContext.Provider value={value}>
      <FindMarksContext.Provider value={marks}>{children}</FindMarksContext.Provider>
    </FindContext.Provider>
  );
}

export function useFind(): FindContextValue {
  return useContext(FindContext);
}

/** Read by the text viewers; the bar's own state is not their concern. */
export function useFindMarks(): FindMarksValue {
  return useContext(FindMarksContext);
}
