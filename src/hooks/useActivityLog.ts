import { useEffect, useState } from 'react';
import type { ActivityLogEntry } from '../types';
import {
  clearActivityLog,
  getActivityLogEntries,
  subscribeActivityLog
} from '../state/activity-log';

export interface UseActivityLogResult {
  logs: ActivityLogEntry[];
  clear: () => void;
}

export function useActivityLog(): UseActivityLogResult {
  const [logs, setLogs] = useState<ActivityLogEntry[]>(() => getActivityLogEntries());

  useEffect(() => {
    return subscribeActivityLog(setLogs);
  }, []);

  return {
    logs,
    clear: clearActivityLog
  };
}

