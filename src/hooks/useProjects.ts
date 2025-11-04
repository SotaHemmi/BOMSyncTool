import { useCallback, useEffect, useState } from 'react';
import type { ColumnRole, ProjectPayload, ProjectRecord } from '../types';
import {
  getStoredProjects,
  saveStoredProjects,
  loadActiveProjectId,
  saveActiveProjectId,
  getFavoriteProjects,
  saveFavoriteProjects,
  loadFavoriteProjectArchive,
  saveFavoriteProjectArchive,
  getFavoriteProjectSnapshot,
  FAVORITE_PROJECTS_ARCHIVE_KEY,
  logActivity
} from '../utils';
import {
  createEmptyProjectSnapshot,
  createProjectSnapshot,
  generateDefaultProjectName
} from '../core/project-manager';
import {
  datasetState,
  resetAllState
} from '../state/app-state';

const PROJECT_STORAGE_KEY = 'bomsync_projects';
const ACTIVE_PROJECT_KEY = 'bomsync_active_project';
const FAVORITE_PROJECTS_KEY = 'bomsync_favorite_projects';

type ColumnRolesMap = Record<string, ColumnRole>;

function normalizeColumnRoles(storedRoles?: ColumnRolesMap): ColumnRolesMap {
  if (!storedRoles) return {};
  const allowed = new Set([
    'ref',
    'part_no',
    'manufacturer',
    'value',
    'package',
    'quantity',
    'remarks',
    'ignore'
  ]);
  return Object.entries(storedRoles).reduce<ColumnRolesMap>((acc, [columnId, role]) => {
    if (allowed.has(role)) {
      acc[columnId] = role;
    }
    return acc;
  }, {});
}

function cloneParseResult(payload: ProjectPayload['bomA']): ProjectPayload['bomA'] {
  if (!payload) return null;
  const columnRoles = payload.column_roles ?? {};
  const columnOrder = payload.column_order ?? [];
  const errors = payload.errors ?? [];
  const headers = payload.headers ?? [];
  const columns = payload.columns ?? [];
  const rowNumbers = payload.row_numbers ?? [];
  return {
    ...payload,
    rows: payload.rows.map(row => [...row]),
    column_roles: Object.fromEntries(
      Object.entries(columnRoles).map(([role, mappedColumns]) => [role, [...mappedColumns]])
    ),
    column_order: [...columnOrder],
    errors: [...errors],
    headers: [...headers],
    columns: columns.map(column => ({ ...column })),
    row_numbers: [...rowNumbers],
    structured_errors: payload.structured_errors
      ? payload.structured_errors.map(error => ({ ...error }))
      : undefined
  };
}

function applyDatasetPayload(
  dataset: 'a' | 'b',
  parseResult: ProjectPayload['bomA'],
  columnRoles?: ColumnRolesMap,
  fileName?: string | null,
  savedAt?: string
) {
  const target = datasetState[dataset];
  if (!parseResult) {
    target.parseResult = null;
    target.fileName = null;
    target.filePath = null;
    target.lastUpdated = null;
    target.columnRoles = {};
    return;
  }

  target.parseResult = cloneParseResult(parseResult);
  target.fileName = fileName ?? null;
  target.filePath = null;
  target.lastUpdated = savedAt ?? new Date().toISOString();
  target.columnRoles = normalizeColumnRoles(columnRoles);
}

function applyProjectPayload(record: ProjectRecord): void {
  resetAllState();
  const { data } = record;
  applyDatasetPayload('a', data.bomA, data.columnRolesA, record.name, data.savedAt);
  applyDatasetPayload('b', data.bomB, data.columnRolesB, record.name, data.savedAt);
}

export interface UseProjectsResult {
  projects: ProjectRecord[];
  activeProjectId: string | null;
  favoriteProjects: Set<string>;
  favoriteArchive: Record<string, ProjectRecord>;
  createProject: (name?: string) => ProjectRecord;
  loadProject: (projectId: string) => ProjectRecord | null;
  saveProject: (name?: string) => ProjectRecord | null;
  deleteProject: (projectId: string) => void;
  renameProject: (projectId: string, name: string) => boolean;
  reorderProject: (projectId: string, targetIndex: number) => void;
  toggleFavorite: (projectId: string) => void;
}

export function useProjects(): UseProjectsResult {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null);
  const [favoriteProjects, setFavoriteProjectsState] = useState<Set<string>>(new Set());
  const [favoriteArchive, setFavoriteArchiveState] = useState<Record<string, ProjectRecord>>({});

  const upsertFavoriteArchive = useCallback(
    (record: ProjectRecord) => {
      setFavoriteArchiveState(prev => {
        const next = { ...prev, [record.id]: record };
        saveFavoriteProjectArchive(next);
        return next;
      });
    },
    [saveFavoriteProjectArchive]
  );

  const removeFavoriteArchiveEntry = useCallback(
    (projectId: string) => {
      setFavoriteArchiveState(prev => {
        if (!(projectId in prev)) {
          return prev;
        }
        const { [projectId]: _removed, ...rest } = prev;
        saveFavoriteProjectArchive(rest);
        return rest;
      });
    },
    [saveFavoriteProjectArchive]
  );

  const restoreFavoriteProject = useCallback(
    (projectId: string): ProjectRecord | null => {
      let record = favoriteArchive[projectId] ?? getFavoriteProjectSnapshot(projectId) ?? null;
      if (!record) {
        return null;
      }

      upsertFavoriteArchive(record);

      let restoredRecord = record;
      setProjects(prev => {
        const existing = prev.find(project => project.id === projectId);
        if (existing) {
          restoredRecord = existing;
          return prev;
        }
        const updated = [...prev, record];
        saveStoredProjects(updated);
        return updated;
      });

      return restoredRecord;
    },
    [favoriteArchive, upsertFavoriteArchive]
  );

  const setActiveProject = useCallback((projectId: string | null) => {
    setActiveProjectIdState(projectId);
    saveActiveProjectId(projectId);
  }, []);

  useEffect(() => {
    const storedProjects = getStoredProjects();
    const favorites = getFavoriteProjects();
    const archive = loadFavoriteProjectArchive();
    const storedActiveId = loadActiveProjectId();

    setProjects(storedProjects);
    setFavoriteProjectsState(favorites);
    setFavoriteArchiveState(archive);

    if (storedActiveId) {
      const record = storedProjects.find(project => project.id === storedActiveId);
      if (record) {
        applyProjectPayload(record);
        setActiveProject(storedActiveId);
        return;
      }
    }

    if (storedProjects.length > 0) {
      const first = storedProjects[0];
      applyProjectPayload(first);
      setActiveProject(first.id);
    } else {
      resetAllState();
      setActiveProject(null);
    }
  }, [setActiveProject]);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== window.localStorage) {
        return;
      }

      if (event.key === PROJECT_STORAGE_KEY || event.key === null) {
        const updatedProjects = getStoredProjects();
        setProjects(updatedProjects);

        if (favoriteProjects.size > 0) {
          setFavoriteArchiveState(prev => {
            let needsUpdate = false;
            const next = { ...prev };
            favoriteProjects.forEach(favoriteId => {
              const favoriteRecord = updatedProjects.find(project => project.id === favoriteId);
              if (favoriteRecord && next[favoriteId] !== favoriteRecord) {
                next[favoriteId] = favoriteRecord;
                needsUpdate = true;
              }
            });

            if (needsUpdate) {
              saveFavoriteProjectArchive(next);
              return next;
            }
            return prev;
          });
        }

        if (!activeProjectId) {
          if (updatedProjects.length > 0) {
            const next = updatedProjects[0];
            applyProjectPayload(next);
            setActiveProject(next.id);
          } else {
            resetAllState();
            setActiveProject(null);
          }
          return;
        }

        const activeRecord = updatedProjects.find(project => project.id === activeProjectId);
        if (activeRecord) {
          applyProjectPayload(activeRecord);
        } else if (updatedProjects.length > 0) {
          const next = updatedProjects[0];
          applyProjectPayload(next);
          setActiveProject(next.id);
        } else {
          resetAllState();
          setActiveProject(null);
        }
      }

      if (event.key === ACTIVE_PROJECT_KEY) {
        const nextActive = loadActiveProjectId();
        if (nextActive === activeProjectId) {
          return;
        }
        if (nextActive) {
          const storedProjects = getStoredProjects();
          setProjects(storedProjects);
          const record = storedProjects.find(project => project.id === nextActive);
          if (record) {
            applyProjectPayload(record);
            setActiveProject(nextActive);
          }
        } else {
          resetAllState();
          setActiveProject(null);
        }
      }

      if (event.key === FAVORITE_PROJECTS_KEY) {
        const favorites = getFavoriteProjects();
        setFavoriteProjectsState(favorites);
      }

      if (event.key === FAVORITE_PROJECTS_ARCHIVE_KEY || event.key === null) {
        const archive = loadFavoriteProjectArchive();
        setFavoriteArchiveState(archive);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [activeProjectId, favoriteProjects, setActiveProject, saveFavoriteProjectArchive]);

  const createProject = useCallback(
    (name?: string) => {
      const now = new Date().toISOString();

      // デフォルト名を生成（日付形式）
      const defaultName = name || generateDefaultProjectName();

      const newProject: ProjectRecord = {
        id: `project-${Date.now()}`,
        name: defaultName,
        createdAt: now,
        updatedAt: now,
        data: createEmptyProjectSnapshot()
      };

      setProjects(prev => {
        const updated = [...prev, newProject];
        saveStoredProjects(updated);
        return updated;
      });

      resetAllState();
      setActiveProject(newProject.id);
      logActivity('新しいタブを作成しました。');
      return newProject;
    },
    [projects, setActiveProject]
  );

  const loadProject = useCallback(
    (projectId: string) => {
      let record = projects.find(project => project.id === projectId) ?? null;
      let restored = false;

      if (!record) {
        record = restoreFavoriteProject(projectId);
        if (!record) {
          return null;
        }
        restored = true;
      }

      applyProjectPayload(record);
      setActiveProject(projectId);
      const displayName = record.name?.trim() || '未命名タブ';
      if (restored) {
        logActivity(`お気に入りから「${displayName}」を復元しました。`);
      } else {
        logActivity(`プロジェクト「${displayName}」を読み込みました。`);
      }
      return record;
    },
    [projects, restoreFavoriteProject, setActiveProject]
  );

  const saveProject = useCallback(
    (name?: string) => {
      const snapshot = createProjectSnapshot();
      const now = snapshot.savedAt;
      const updated = [...projects];
      const index = activeProjectId ? updated.findIndex(project => project.id === activeProjectId) : -1;
      let record: ProjectRecord;

      if (index >= 0) {
        const current = updated[index];
        const trimmed = name?.trim();
        const nextName = trimmed && trimmed.length > 0 ? trimmed : current.name;
        record = {
          ...current,
          name: nextName ?? current.name,
          updatedAt: now,
          data: snapshot
        };
        updated[index] = record;
      } else {
        const trimmed = name?.trim();
        const generatedName = trimmed && trimmed.length > 0 ? trimmed : generateDefaultProjectName();
        record = {
          id: `project-${Date.now()}`,
          name: generatedName,
          createdAt: now,
          updatedAt: now,
          data: snapshot
        };
        updated.push(record);
        setActiveProject(record.id);
      }

      setProjects(updated);
      saveStoredProjects(updated);
      const displayName = record.name?.trim() || '未命名タブ';
      logActivity(`タブを「${displayName}」として保存しました。`);

      if (favoriteProjects.has(record.id)) {
        upsertFavoriteArchive(record);
      }

      if (record.id === activeProjectId) {
        if (datasetState.a.parseResult) {
          datasetState.a.fileName = record.name ?? datasetState.a.fileName;
        }
        if (datasetState.b.parseResult) {
          datasetState.b.fileName = record.name ?? datasetState.b.fileName;
        }
      }

      return record;
    },
    [activeProjectId, favoriteProjects, projects, setActiveProject, upsertFavoriteArchive]
  );

  const deleteProject = useCallback(
    (projectId: string) => {
      const target = projects.find(project => project.id === projectId) ?? null;
      const wasFavorite = favoriteProjects.has(projectId);

      if (target && wasFavorite) {
        upsertFavoriteArchive(target);
      }

      setProjects(prev => {
        const updated = prev.filter(project => project.id !== projectId);

        if (projectId === activeProjectId) {
          if (updated.length > 0) {
            const nextProject = updated[0];
            applyProjectPayload(nextProject);
            setActiveProject(nextProject.id);
            saveStoredProjects(updated);
          } else {
            // 最後のタブが削除された場合、新しいタブを自動作成
            resetAllState();

            const now = new Date().toISOString();
            const newProject: ProjectRecord = {
              id: `project-${Date.now()}`,
              name: generateDefaultProjectName(),
              createdAt: now,
              updatedAt: now,
              data: createEmptyProjectSnapshot()
            };

            setActiveProject(newProject.id);
            saveStoredProjects([newProject]);
            logActivity('新しいタブを作成しました。');
            return [newProject];
          }
        } else {
          saveStoredProjects(updated);
        }

        return updated;
      });

      if (target) {
        const displayName = target.name?.trim() || '未命名タブ';
        logActivity(`タブ「${displayName}」を削除しました。`);
        if (wasFavorite) {
          logActivity('お気に入りから復元できます。');
        }
      }
    },
    [activeProjectId, favoriteProjects, projects, setActiveProject, upsertFavoriteArchive]
  );

  const renameProject = useCallback(
    (projectId: string, name: string) => {
      const trimmed = name.trim();
      const normalized = trimmed.length > 0 ? trimmed : null;
      const now = new Date().toISOString();
      let updated = false;
      let changed = false;
      let updatedRecord: ProjectRecord | null = null;

      setProjects(prev => {
        const index = prev.findIndex(project => project.id === projectId);
        if (index < 0) {
          return prev;
        }
        const current = prev[index];
        const currentName = current.name ?? null;
        if (currentName === normalized) {
          updated = true;
          return prev;
        }
        const next = [...prev];
        const record = { ...current, name: normalized, updatedAt: now };
        next[index] = record;
        updatedRecord = record;
        saveStoredProjects(next);
        updated = true;
        changed = true;
        return next;
      });

      if (!updated) {
        return false;
      }

      if (changed && projectId === activeProjectId) {
        if (datasetState.a.parseResult) {
          datasetState.a.fileName = normalized ?? datasetState.a.fileName;
        }
        if (datasetState.b.parseResult) {
          datasetState.b.fileName = normalized ?? datasetState.b.fileName;
        }
      }

      if (changed) {
        const displayName = normalized ?? '未命名タブ';
        logActivity(`タブ名を「${displayName}」に変更しました。`);
        if (favoriteProjects.has(projectId) && updatedRecord) {
          upsertFavoriteArchive(updatedRecord);
        }
      }
      return true;
    },
    [activeProjectId, favoriteProjects, upsertFavoriteArchive]
  );

  const reorderProject = useCallback((projectId: string, targetIndex: number) => {
    setProjects(prev => {
      const currentIndex = prev.findIndex(project => project.id === projectId);
      if (currentIndex === -1) {
        return prev;
      }
      const clampedIndex = Math.max(0, Math.min(targetIndex, prev.length - 1));
      const updated = [...prev];
      const [moved] = updated.splice(currentIndex, 1);
      const insertIndex = currentIndex < clampedIndex ? clampedIndex - 1 : clampedIndex;
      updated.splice(insertIndex, 0, moved);
      saveStoredProjects(updated);
      return updated;
    });
  }, []);

  const toggleFavorite = useCallback(
    (projectId: string) => {
      let message: string | null = null;
      setFavoriteProjectsState(prev => {
        const next = new Set(prev);
        if (next.has(projectId)) {
          next.delete(projectId);
          message = 'お気に入りから削除しました';
          removeFavoriteArchiveEntry(projectId);
        } else {
          next.add(projectId);
          message = 'お気に入りに追加しました';
          const existing = projects.find(project => project.id === projectId);
          if (existing) {
            upsertFavoriteArchive(existing);
          } else {
            const archived = favoriteArchive[projectId] ?? getFavoriteProjectSnapshot(projectId);
            if (archived) {
              upsertFavoriteArchive(archived);
            }
          }
        }
        saveFavoriteProjects(next);
        return next;
      });
      if (message) {
        logActivity(message);
      }
    },
    [favoriteArchive, projects, removeFavoriteArchiveEntry, upsertFavoriteArchive]
  );

  return {
    projects,
    activeProjectId,
    favoriteProjects,
    favoriteArchive,
    createProject,
    loadProject,
    saveProject,
    deleteProject,
    renameProject,
    reorderProject,
    toggleFavorite
  };
}
