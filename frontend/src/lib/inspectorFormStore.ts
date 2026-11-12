"use client";

/**
 * The form the row measured, for the components above the shell: they decide
 * where the description, the summaries and the companions go, and they render
 * before the row that measures it.
 *
 * Held per file rather than globally: a reader that names a different file
 * gets `absent`, so a skeleton or the previous file's shell never hands a
 * stale form to the next file's first frame.
 */
export type InspectorForm =
  | "absent"
  | "phone"
  | "overlay"
  | "beside"
  | "stacked";

export interface InspectorFormState {
  form: InspectorForm;
  open: boolean;
  stacked: boolean;
}

const ABSENT: InspectorFormState = { form: "absent", open: false, stacked: false };

type Listener = () => void;

const listeners = new Set<Listener>();
let current: { fileId: string; form: InspectorForm; open: boolean } | null =
  null;
let cachedFor: { fileId: string; form: InspectorForm; open: boolean } | null =
  null;
let cached: InspectorFormState = ABSENT;

function emit(): void {
  for (const listener of listeners) listener();
}

export const inspectorFormStore = {
  get(fileId: string | undefined): InspectorFormState {
    if (!fileId || current === null || current.fileId !== fileId) return ABSENT;
    if (cachedFor !== current) {
      cached = {
        form: current.form,
        open: current.open,
        stacked: current.form === "stacked" && current.open,
      };
      cachedFor = current;
    }
    return cached;
  },
  publish(fileId: string, form: InspectorForm, open: boolean): void {
    if (
      current !== null &&
      current.fileId === fileId &&
      current.form === form &&
      current.open === open
    ) {
      return;
    }
    current = { fileId, form, open };
    emit();
  },
  /**
   * Only the shell that owns the current entry clears it: the next file's
   * shell measures in its own commit, which can land before this cleanup.
   */
  reset(fileId: string): void {
    if (current === null || current.fileId !== fileId) return;
    current = null;
    emit();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
