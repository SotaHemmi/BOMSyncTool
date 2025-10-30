import { useEffect, useMemo, useRef } from 'react';
import type { ActivityLogEntry } from '../types';

interface ActivityLogProps {
  logs: ActivityLogEntry[];
  onClear?: () => void;
}

const buildLogLabel = (entry: ActivityLogEntry) => {
  const time = new Date(entry.timestamp);
  const timeLabel = Number.isNaN(time.getTime())
    ? ''
    : `[${time.toLocaleTimeString()}] `;
  return `${timeLabel}${entry.message}`;
};

export function ActivityLog({ logs, onClear }: ActivityLogProps) {
  const listRef = useRef<HTMLUListElement | null>(null);

  const renderedLogs = useMemo(() => logs, [logs]);

  useEffect(() => {
    const element = listRef.current;
    if (!element) return;
    element.scrollTop = 0;
  }, [renderedLogs]);

  return (
    <section className="log-panel" aria-labelledby="activity-log-heading">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 id="activity-log-heading">アクティビティログ</h2>
        {onClear ? (
          <button
            type="button"
            className="ghost-button"
            onClick={onClear}
            disabled={renderedLogs.length === 0}
          >
            ログをクリア
          </button>
        ) : null}
      </div>
      <p>最新の操作履歴が新しい順に表示されます。</p>
      {renderedLogs.length === 0 ? (
        <p style={{ marginTop: '8px', color: '#94a3b8', fontSize: '13px' }}>まだログはありません。</p>
      ) : null}
      <ul
        ref={listRef}
        id="activity-log"
        className="activity-log"
        aria-live="polite"
      >
        {renderedLogs.map(entry => (
          <li key={entry.id}>{buildLogLabel(entry)}</li>
        ))}
      </ul>
    </section>
  );
}

