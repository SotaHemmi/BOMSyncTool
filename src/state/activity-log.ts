import type { ActivityLogEntry } from '../types';

type ActivityLogListener = (entries: ActivityLogEntry[]) => void;

const MAX_LOG_ENTRIES = 20;
let entries: ActivityLogEntry[] = [];
const listeners = new Set<ActivityLogListener>();

function notify() {
  const snapshot = [...entries];
  listeners.forEach(listener => {
    listener(snapshot);
  });
}

export function appendActivityLog(message: string): ActivityLogEntry {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `log-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const entry: ActivityLogEntry = {
    id,
    message,
    timestamp: new Date().toISOString()
  };
  entries = [entry, ...entries].slice(0, MAX_LOG_ENTRIES);
  notify();
  return entry;
}

export function subscribeActivityLog(listener: ActivityLogListener): () => void {
  listeners.add(listener);
  listener([...entries]);
  return () => {
    listeners.delete(listener);
  };
}

export function getActivityLogEntries(): ActivityLogEntry[] {
  return [...entries];
}

export function clearActivityLog(): void {
  if (entries.length === 0) return;
  entries = [];
  notify();
}
