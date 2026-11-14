/** Stands in for an addon's `file-preview-actions` entry: one visible button. */
export function PreviewActionSlot() {
  return (
    <button
      type="button"
      data-testid="fixture-preview-action"
      className="workbench-toggle"
    >
      Quote
    </button>
  );
}
