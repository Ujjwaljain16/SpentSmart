type Listener = () => void;

const listeners = new Set<Listener>();
let version = 0;

/** Called by repositories after every write. Listeners are coalesced to at most one call per tick. */
let scheduled = false;
export function emitDataChanged(): void {
  version++;
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    for (const l of [...listeners]) l();
  }, 0);
}

export function subscribeToDataChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDataVersion(): number {
  return version;
}
