import { useMemo } from 'react';
import type { ProjectRecord } from '../types';

interface ProjectPanelProps {
  projects: ProjectRecord[];
  favorites: Set<string>;
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
  activeProjectId,
  onProjectClick,
  onToggleFavorite,
  onRename,
  onDelete
}: ProjectPanelProps) {
  const favoriteProjects = useMemo(() => {
    const favoriteList: ProjectRecord[] = [];
    projects.forEach(project => {
      if (favorites.has(project.id)) {
        favoriteList.push(project);
      }
    });
    return favoriteList;
  }, [favorites, projects]);

  const renderProjectRow = (project: ProjectRecord) => {
    const isActive = project.id === activeProjectId;
    const isFavorite = favorites.has(project.id);

    const handleRename = () => {
      if (!onRename) return;
      const current = renderProjectName(project);
      const next = window.prompt('タブ名を変更', current);
      if (next === null) return;
      const result = onRename(project.id, next);
      if (result === false) {
        window.alert('タブ名の変更に失敗しました。');
      }
    };

    const handleDelete = () => {
      if (!onDelete) return;
      const displayName = renderProjectName(project);
      if (window.confirm(`「${displayName}」を削除しますか？`)) {
        onDelete(project.id);
      }
    };

    return (
      <div
        key={project.id}
        className={`session-tab${isActive ? ' is-active' : ''}`}
      >
        <button
          type="button"
          className="session-tab-button"
          onClick={() => onProjectClick(project.id)}
          aria-pressed={isActive}
        >
          <span className="session-tab-text">
            <span className="session-tab-label">{renderProjectName(project)}</span>
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
            {favoriteProjects.length > 0 ? (
              favoriteProjects.map(renderProjectRow)
            ) : (
              <p className="session-tab-empty">お気に入りに登録されたプロジェクトはありません。</p>
            )}
          </div>
        </div>
        <div className="all-projects-section">
          <p className="projects-header">全プロジェクト</p>
          <div className="session-tab-bar">
            {projects.length > 0 ? (
              projects.map(renderProjectRow)
            ) : (
              <p className="session-tab-empty">保存されたプロジェクトがありません。</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
