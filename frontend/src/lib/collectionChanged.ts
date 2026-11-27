/**
 * A write that changes a collection, for the collection page that is open in
 * this tab. A `collectionId` of undefined means "a collection of this drive".
 */
export interface CollectionChangedDetail {
  drive: string;
  collectionId?: string;
}

const EVENT = "litloft:collection-changed";

export function emitCollectionChanged(detail: CollectionChangedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CollectionChangedDetail>(EVENT, { detail }));
}

export function subscribeCollectionChanged(
  handler: (detail: CollectionChangedDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    handler((event as CustomEvent<CollectionChangedDetail>).detail);
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
