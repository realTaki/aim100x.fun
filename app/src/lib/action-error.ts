type Listener = () => void;

let message: string | null = null;
const listeners = new Set<Listener>();

function notify() {
  for (const fn of listeners) fn();
}

export function getActionError(): string | null {
  return message;
}

export function pushActionError(next: string) {
  const text = next.trim();
  if (!text) return;
  message = text;
  notify();
}

export function clearActionError() {
  if (message == null) return;
  message = null;
  notify();
}

export function subscribeActionError(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
