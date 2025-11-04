import { useMemo } from 'react';
import type { ProjectRecord } from '../types';

interface ProjectPanelProps {
  projects: ProjectRecord[];
  favorites: Set<string>;
  favoriteArchive: Record<string, ProjectRecord>;
  activeProjectId: string | null;
  onProjectClick: (projectId: string) => void;
  onToggleFavorite: (projectId: string) => void;
  onRename?: (projectId: string, name: string) => boolean | void;
  onDelete?: (projectId: string) => void;
}

function renderProjectName(project: ProjectRecord): string {
  return project.name?.trim() || '未命名タブ';
}

export function ProjectPanel({
  projects,
  favorites,
  favoriteArchive,
  activeProjectId,
  onProjectClick,
  onToggleFavorite,
  onRename,
  onDelete
}: ProjectPanelProps) {
  interface FavoriteEntry {
    project: ProjectRecord;
    isArchived: boolean;
  }

  const favoriteEntries = useMemo(() => {
    const entries: FavoriteEntry[] = [];
    favorites.forEach(projectId => {
      const match = projects.find(project => project.id === projectId);
      if (match) {
        entries.push({ project: match, isArchived: false });
        return;
      }
      const archived = favoriteArchive[projectId];
      if (archived) {
        entries.push({ project: archived, isArchived: true });
      }
    });
    return entries;
  }, [favoriteArchive, favorites, projects]);

  const renderProjectRow = (project: ProjectRecord, options?: { isArchived?: boolean }) => {
    const isArchived = options?.isArchived ?? false;
    const isActive = project.id === activeProjectId;
    const isFavorite = favorites.has(project.id);
    const displayName = renderProjectName(project);
    const handleRename = () => {
      if (isArchived) {
        window.alert('お気に入りを復元してから名前を変更してください。');
        return;
      }
      if (!onRename) return;
      const next = window.prompt('タブ名を変更', displayName);
      if (next === null) return;
      const result = onRename(project.id, next);
      if (result === false) {
        window.alert('タブ名の変更に失敗しました。');
      }
    };

    const handleDelete = () => {
      if (isArchived) {
        window.alert('お気に入りから削除してから完全に削除してください。');
        return;
      }
      if (!onDelete) return;
      if (window.confirm(`「${displayName}」を削除しますか？`)) {
        onDelete(project.id);
      }
    };

    return (
      <div
        key={project.id}
        className={`session-tab${isActive ? ' is-active' : ''}${isArchived ? ' is-archived' : ''}`}
      >
        <button
          type="button"
          className="session-tab-button"
          onClick={() => onProjectClick(project.id)}
          aria-pressed={isActive}
        >
          <span className="session-tab-text">
            <span className="session-tab-label">
              {displayName}
              {isArchived && <span className="session-tab-status">（削除済み）</span>}
            </span>
          </span>
        </button>
        <button
          type="button"
          className="session-tab-favorite"
          aria-label={isFavorite ? 'お気に入りから削除' : 'お気に入りに追加'}
          onClick={() => onToggleFavorite(project.id)}
        >
          {isFavorite ? '★' : '☆'}
        </button>
        <button
          type="button"
          className="session-tab-close"
          title="名前を変更"
          aria-label="タブ名を変更"
          disabled={isArchived}
          onClick={event => {
            event.stopPropagation();
            handleRename();
          }}
        >
          ✎
        </button>
        <button
          type="button"
          className="session-tab-close"
          title="タブを削除"
          aria-label="タブを削除"
          disabled={isArchived}
          onClick={event => {
            event.stopPropagation();
            handleDelete();
          }}
        >
          ×
        </button>
      </div>
    );
  };

  return (
    <section className="project-panel" aria-labelledby="project-panel-heading">
      <h2 id="project-panel-heading">プロジェクト</h2>
      <div className="project-tab-scroll">
        <div className="favorites-section">
          <p className="favorites-header">お気に入り</p>
          <div className="favorites-tab-bar">
            {favoriteEntries.length > 0 ? (
              favoriteEntries.map(entry => renderProjectRow(entry.project, { isArchived: entry.isArchived }))
            ) : (
              <p className="session-tab-empty">お気に入りに登録されたプロジェクトはありません。</p>
            )}
          </div>
        </div>
        <div className="all-projects-section">
          <p className="projects-header">全プロジェクト</p>
          <div className="session-tab-bar">
            {projects.length > 0 ? (
              projects.map(project => renderProjectRow(project))
            ) : (
              <p className="session-tab-empty">保存されたプロジェクトがありません。</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
