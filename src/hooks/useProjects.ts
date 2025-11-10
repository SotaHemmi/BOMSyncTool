import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProjectPayload, ProjectRecord } from '../types';
import {
  loadActiveProjectId,
  saveActiveProjectId,
  getFavoriteProjects,
  saveFavoriteProjects,
  loadFavoriteProjectArchive,
  saveFavoriteProjectArchive,
  getFavoriteProjectSnapshot,
  FAVORITE_PROJECTS_ARCHIVE_KEY,
  logActivity,
  debounce,
  deepEqual
} from '../utils';
import {
  createEmptyProjectSnapshot,
  generateDefaultProjectName
} from '../core/project-manager';
import type { UseBOMDataResult } from './useBOMData';
import { ProjectStorage, PROJECT_STORAGE_KEY } from '../core/storage';

const ACTIVE_PROJECT_KEY = 'bomsync_active_project';
const FAVORITE_PROJECTS_KEY = 'bomsync_favorite_projects';

// Tauri環境チェック用ヘルパー
function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' &&
    Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}


function applyProjectPayload(
  record: ProjectRecord,
  bomA: UseBOMDataResult,
  bomB: UseBOMDataResult
): void {
  const { data } = record;
  
  if (data.bomA) {
    bomA.updateFromParseResult(data.bomA, data.fileNameA ?? null);
  } else {
    bomA.reset();
  }
  
  if (data.bomB) {
    bomB.updateFromParseResult(data.bomB, data.fileNameB ?? null);
  } else {
    bomB.reset();
  }
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

export function useProjects(bomA?: UseBOMDataResult, bomB?: UseBOMDataResult): UseProjectsResult {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null);
  const [favoriteProjects, setFavoriteProjectsState] = useState<Set<string>>(new Set());
  const [favoriteArchive, setFavoriteArchiveState] = useState<Record<string, ProjectRecord>>({});

  const { debounced: debouncedSaveProjects, flush: flushSaveProjects } = useMemo(
    () =>
      debounce((next: ProjectRecord[]) => {
        ProjectStorage.saveAll(next);
      }, 400),
    []
  );

  const upsertFavoriteArchive = useCallback(
    (record: ProjectRecord) => {
      setFavoriteArchiveState(prev => {
        const next = { ...prev, [record.id]: record };
        void saveFavoriteProjectArchive(next);
        return next;
      });
    },
    []
  );

  const removeFavoriteArchiveEntry = useCallback(
    (projectId: string) => {
      setFavoriteArchiveState(prev => {
        if (!(projectId in prev)) {
          return prev;
        }
        const { [projectId]: _removed, ...rest } = prev;
        void saveFavoriteProjectArchive(rest);
        return rest;
      });
    },
    []
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
        debouncedSaveProjects(updated);
        return updated;
      });

      return restoredRecord;
    },
    [debouncedSaveProjects, favoriteArchive, upsertFavoriteArchive]
  );

  const setActiveProject = useCallback((projectId: string | null) => {
    setActiveProjectIdState(projectId);
    saveActiveProjectId(projectId);
  }, []);

  useEffect(() => {
    void (async () => {
      // 初期化が完了するまで待つ
      if (!ProjectStorage.isInitialized()) {
        await ProjectStorage.initialize();
      }

      const storedProjects = ProjectStorage.getAll();
      const favorites = getFavoriteProjects();
      const archive = loadFavoriteProjectArchive();
      const storedActiveId = loadActiveProjectId();

      setProjects(storedProjects);
      setFavoriteProjectsState(favorites);
      setFavoriteArchiveState(archive);

      if (storedActiveId && bomA && bomB) {
        const record = storedProjects.find(project => project.id === storedActiveId);
        if (record) {
          applyProjectPayload(record, bomA, bomB);
          setActiveProject(storedActiveId);
          return;
        }
      }

      if (storedProjects.length > 0 && bomA && bomB) {
        const first = storedProjects[0];
        applyProjectPayload(first, bomA, bomB);
        setActiveProject(first.id);
      } else {
        if (bomA) bomA.reset();
        if (bomB) bomB.reset();
        setActiveProject(null);
      }
    })();
  }, [setActiveProject]);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== window.localStorage) {
        return;
      }

      const isProjectEvent = event.key === PROJECT_STORAGE_KEY || event.key === null;
      const isArchiveEvent = event.key === FAVORITE_PROJECTS_ARCHIVE_KEY || event.key === null;

      if (isProjectEvent) {
        void (async () => {
          await ProjectStorage.syncFromDisk();
          const updatedProjects = ProjectStorage.getAll();
          const projectsChanged = !deepEqual(updatedProjects, projects);
          const nextProjects = projectsChanged ? updatedProjects : projects;

          if (projectsChanged) {
            setProjects(updatedProjects);
          }

          const projectMap = new Map(nextProjects.map(project => [project.id, project]));

          const trimmedFavorites = new Set<string>();
          favoriteProjects.forEach(id => {
            if (projectMap.has(id)) {
              trimmedFavorites.add(id);
            }
          });

          if (!deepEqual(trimmedFavorites, favoriteProjects)) {
            setFavoriteProjectsState(trimmedFavorites);
            saveFavoriteProjects(trimmedFavorites);
          }

          setFavoriteArchiveState(prev => {
            if (isTauriEnvironment()) {
              const archive = loadFavoriteProjectArchive();
              return deepEqual(prev, archive) ? prev : archive;
            }

            const nextArchive: Record<string, ProjectRecord> = {};
            trimmedFavorites.forEach(id => {
              const record = projectMap.get(id);
              if (record) {
                nextArchive[id] = record;
              }
            });

            if (deepEqual(prev, nextArchive)) {
              return prev;
            }

            void saveFavoriteProjectArchive(nextArchive);
            return nextArchive;
          });

          if (nextProjects.length === 0) {
            if (bomA) bomA.reset();
            if (bomB) bomB.reset();
            setActiveProject(null);
            return;
          }

          if (!activeProjectId && bomA && bomB) {
            const first = nextProjects[0];
            applyProjectPayload(first, bomA, bomB);
            setActiveProject(first.id);
            return;
          }

          if (activeProjectId) {
            const activeRecord = projectMap.get(activeProjectId);
            if (activeRecord && bomA && bomB) {
              applyProjectPayload(activeRecord, bomA, bomB);
              return;
            }
          }

          if (bomA && bomB && nextProjects.length > 0) {
            const fallback = nextProjects[0];
            applyProjectPayload(fallback, bomA, bomB);
            setActiveProject(fallback.id);
          }
        })();
        return;
      }

      if (event.key === ACTIVE_PROJECT_KEY) {
        const nextActive = loadActiveProjectId();
        if (nextActive === activeProjectId) {
          return;
        }

        if (nextActive && bomA && bomB) {
          void (async () => {
            await ProjectStorage.syncFromDisk();
            const storedProjects = ProjectStorage.getAll();
            if (!deepEqual(storedProjects, projects)) {
              setProjects(storedProjects);
            }
            const record = storedProjects.find(project => project.id === nextActive);
            if (record) {
              applyProjectPayload(record, bomA, bomB);
              setActiveProject(nextActive);
            }
          })();
        } else {
          if (bomA) bomA.reset();
          if (bomB) bomB.reset();
          setActiveProject(null);
        }
        return;
      }

      if (event.key === ACTIVE_PROJECT_KEY) {
        const nextActive = loadActiveProjectId();
        if (nextActive === activeProjectId) {
          return;
        }

        if (nextActive && bomA && bomB) {
          void (async () => {
            await ProjectStorage.syncFromDisk();
            const storedProjects = ProjectStorage.getAll();
            if (!deepEqual(storedProjects, projects)) {
              setProjects(storedProjects);
            }
            const record = storedProjects.find(project => project.id === nextActive);
            if (record) {
              applyProjectPayload(record, bomA, bomB);
              setActiveProject(nextActive);
            }
          })();
        } else {
          if (bomA) bomA.reset();
          if (bomB) bomB.reset();
          setActiveProject(null);
        }
        return;
      }

      if (event.key === FAVORITE_PROJECTS_KEY) {
        const favorites = getFavoriteProjects();
        if (!deepEqual(favorites, favoriteProjects)) {
          setFavoriteProjectsState(favorites);
        }
        return;
      }

      if (isArchiveEvent) {
        const archive = loadFavoriteProjectArchive();
        setFavoriteArchiveState(prev => (deepEqual(prev, archive) ? prev : archive));
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [activeProjectId, bomA, bomB, favoriteProjects, projects, setActiveProject]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      flushSaveProjects();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      flushSaveProjects();
    };
  }, [flushSaveProjects]);

  const createProject = useCallback(
    (name?: string) => {
      const now = new Date().toISOString();

      // デフォルト名を生成（日付形式）
      const defaultName = name || generateDefaultProjectName(false);

      const newProject: ProjectRecord = {
        id: `project-${Date.now()}`,
        name: defaultName,
        createdAt: now,
        updatedAt: now,
        data: createEmptyProjectSnapshot()
      };

      setProjects(prev => {
        const updated = [...prev, newProject];
        debouncedSaveProjects(updated);
        return updated;
      });

      if (bomA) bomA.reset();
      if (bomB) bomB.reset();
      setActiveProject(newProject.id);
      logActivity('新しいタブを作成しました。');
      return newProject;
    },
    [bomA, bomB, debouncedSaveProjects, projects, setActiveProject]
  );

  const loadProject = useCallback(
    (projectId: string) => {
      if (!bomA || !bomB) {
        return null;
      }
      
      let record = projects.find(project => project.id === projectId) ?? null;
      let restored = false;

      if (!record) {
        record = restoreFavoriteProject(projectId);
        if (!record) {
          return null;
        }
        restored = true;
      }

      applyProjectPayload(record, bomA, bomB);
      setActiveProject(projectId);
      const displayName = record.name?.trim() || '未命名タブ';
      if (restored) {
        logActivity(`お気に入りから「${displayName}」を復元しました。`);
      } else {
        logActivity(`プロジェクト「${displayName}」を読み込みました。`);
      }
      return record;
    },
    [bomA, bomB, projects, restoreFavoriteProject, setActiveProject]
  );

  const saveProject = useCallback(
    (name?: string) => {
      if (!bomA || !bomB) {
        return null;
      }

      const hasData = bomA.parseResult !== null || bomB.parseResult !== null;
      if (!hasData) {
        // エラーメッセージを表示せず、静かに失敗する（自動保存の場合）
        // alert('保存できる内容がありません。');
        return null;
      }

      const now = new Date().toISOString();
      const snapshot: ProjectPayload = {
        version: 1,
        savedAt: now,
        bomA: bomA.parseResult,
        bomB: bomB.parseResult,
        fileNameA: bomA.fileName,
        fileNameB: bomB.fileName,
        columnRolesA: { ...bomA.columnRoles },
        columnRolesB: { ...bomB.columnRoles }
      };

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
      debouncedSaveProjects(updated);
      const displayName = record.name?.trim() || '未命名タブ';
      logActivity(`タブを「${displayName}」として保存しました。`);

      if (favoriteProjects.has(record.id)) {
        upsertFavoriteArchive(record);
      }

      return record;
    },
    [activeProjectId, bomA, bomB, debouncedSaveProjects, favoriteProjects, projects, setActiveProject, upsertFavoriteArchive]
  );

  const deleteProject = useCallback(
    (projectId: string) => {
      const target = projects.find(project => project.id === projectId) ?? null;
      const wasFavorite = favoriteProjects.has(projectId);

      if (target && wasFavorite) {
        upsertFavoriteArchive(target);
      }

      let newProjectId: string | null = null;
      
      setProjects(prev => {
        const updated = prev.filter(project => project.id !== projectId);

        if (projectId === activeProjectId) {
          if (updated.length > 0 && bomA && bomB) {
            const nextProject = updated[0];
            applyProjectPayload(nextProject, bomA, bomB);
            newProjectId = nextProject.id;
            debouncedSaveProjects(updated);
          } else {
            // 最後のタブが削除された場合、新しいタブを自動作成
            if (bomA) bomA.reset();
            if (bomB) bomB.reset();

            const now = new Date().toISOString();
            const newProject: ProjectRecord = {
              id: `project-${Date.now()}`,
              name: generateDefaultProjectName(false),
              createdAt: now,
              updatedAt: now,
              data: createEmptyProjectSnapshot()
            };

            newProjectId = newProject.id;
            debouncedSaveProjects([newProject]);
            logActivity('新しいタブを作成しました。');
            return [newProject];
          }
        } else {
          debouncedSaveProjects(updated);
        }

        return updated;
      });

      // 状態更新を同期的に実行（setProjectsの外で実行）
      if (newProjectId) {
        setActiveProject(newProjectId);
      }

      if (target) {
        const displayName = target.name?.trim() || '未命名タブ';
        logActivity(`タブ「${displayName}」を削除しました。`);
        if (wasFavorite) {
          logActivity('お気に入りから復元できます。');
        }
      }
    },
    [activeProjectId, debouncedSaveProjects, favoriteProjects, projects, setActiveProject, upsertFavoriteArchive]
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
        debouncedSaveProjects(next);
        updated = true;
        changed = true;
        return next;
      });

      if (!updated) {
        return false;
      }

      // ファイル名はBOMファイルの元の名前を保持し、プロジェクト名とは独立

      if (changed) {
        const displayName = normalized ?? '未命名タブ';
        logActivity(`タブ名を「${displayName}」に変更しました。`);
        if (favoriteProjects.has(projectId) && updatedRecord) {
          upsertFavoriteArchive(updatedRecord);
        }
      }
      return true;
    },
    [activeProjectId, debouncedSaveProjects, favoriteProjects, upsertFavoriteArchive]
  );

  const reorderProject = useCallback(
    (projectId: string, targetIndex: number) => {
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
        debouncedSaveProjects(updated);
        return updated;
      });
    },
    [debouncedSaveProjects]
  );

  const toggleFavorite = useCallback(
    (projectId: string) => {
      const wasFavorite = favoriteProjects.has(projectId);
      const shouldCaptureActive = !wasFavorite && projectId === activeProjectId;
      const activeSnapshot = shouldCaptureActive ? saveProject() : null;
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
          const existing =
            activeSnapshot ??
            projects.find(project => project.id === projectId) ??
            favoriteArchive[projectId] ??
            getFavoriteProjectSnapshot(projectId);
          if (existing) {
            upsertFavoriteArchive(existing);
          }
        }
        saveFavoriteProjects(next);
        return next;
      });

      if (message) {
        logActivity(message);
      }
    },
    [activeProjectId, favoriteArchive, favoriteProjects, projects, removeFavoriteArchiveEntry, saveProject, upsertFavoriteArchive]
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
