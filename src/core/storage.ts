import type { ProjectPayload, ProjectRecord } from '../types/project';
import { appDataDir, join } from '@tauri-apps/api/path';

export const PROJECT_STORAGE_KEY = 'bomsync_projects';

type ProjectManifestEntry = {
  id: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
  file: string;
};

const PROJECT_DIR_NAME = 'projects';
const MANIFEST_FILE_NAME = 'manifest.json';
const FAVORITE_ARCHIVE_FILE_NAME = 'favorite-archive.json';
const DEFAULT_PROJECT_ID_PREFIX = 'project-';

let projectCache: ProjectRecord[] = [];
let favoriteArchiveCache: Record<string, ProjectRecord> = {};
let initialized = false;
let projectDirPath: string | null = null;

function createEmptyProjectPayload(savedAt: string): ProjectPayload {
  return {
    version: 1,
    savedAt,
    bomA: null,
    bomB: null,
    columnRolesA: {},
    columnRolesB: {}
  };
}

function createInitialProjectRecord(): ProjectRecord {
  const savedAt = new Date().toISOString();
  // 初期化時はdatasetStateが未初期化の可能性があるため、直接タイムスタンプベースの名前を生成
  // これはgenerateDefaultProjectName()と同じロジック（datasetState.a.fileNameがnullの場合）
  const timestamp = new Date().toLocaleString('ja-JP');
  return {
    id: `${DEFAULT_PROJECT_ID_PREFIX}${Date.now()}`,
    name: `タブ ${timestamp}`,
    createdAt: savedAt,
    updatedAt: savedAt,
    data: createEmptyProjectPayload(savedAt)
  };
}

function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

function cloneProjectRecord(record: ProjectRecord): ProjectRecord {
  if (typeof structuredClone === 'function') {
    return structuredClone(record);
  }
  return JSON.parse(JSON.stringify(record)) as ProjectRecord;
}

function cloneFavoriteArchive(archive: Record<string, ProjectRecord>): Record<string, ProjectRecord> {
  return Object.fromEntries(
    Object.entries(archive).map(([id, record]) => [id, cloneProjectRecord(record)])
  );
}

function readProjectsFromLocalStorage(): ProjectRecord[] {
  try {
    const stored = window.localStorage.getItem(PROJECT_STORAGE_KEY);
    if (!stored) {
      return [];
    }
    const data = JSON.parse(stored);
    if (Array.isArray(data)) {
      return data as ProjectRecord[];
    }
    return [];
  } catch (error) {
    console.error('Failed to parse legacy localStorage projects', error);
    return [];
  }
}

async function ensureProjectDir(): Promise<string> {
  if (projectDirPath) {
    return projectDirPath;
  }
  if (!isTauriEnvironment()) {
    throw new Error('ensureProjectDir called in non-Tauri environment');
  }
  try {
    const baseDir = await appDataDir();
    console.log('App data directory:', baseDir);
    const dir = await join(baseDir, PROJECT_DIR_NAME);
    console.log('Project directory:', dir);
    const { exists, mkdir } = await import('@tauri-apps/plugin-fs');
    if (!(await exists(dir))) {
      console.log('Creating project directory:', dir);
      await mkdir(dir, { recursive: true });
    }
    projectDirPath = dir;
    return dir;
  } catch (error) {
    console.error('Failed to ensure project directory', error);
    throw error;
  }
}

async function readProjectsFromDisk(): Promise<ProjectRecord[]> {
  try {
    const dir = await ensureProjectDir();
    const manifestPath = await join(dir, MANIFEST_FILE_NAME);
    const { exists, readTextFile, writeTextFile, readDir } = await import('@tauri-apps/plugin-fs');

    if (!(await exists(manifestPath))) {
      // migrate legacy localStorage if available
      const legacy = readProjectsFromLocalStorage();
      if (legacy.length > 0) {
        await writeProjectsToDisk(legacy);
        return legacy;
      }
      await writeTextFile(manifestPath, '[]');
      return [];
    }

    const manifestContent = await readTextFile(manifestPath);
    const entries: ProjectManifestEntry[] = manifestContent ? JSON.parse(manifestContent) : [];
    const projects: ProjectRecord[] = [];
    const referencedFiles = new Set(entries.map(entry => entry.file));

    for (const entry of entries) {
      const dataPath = await join(dir, entry.file);
      try {
        const payloadText = await readTextFile(dataPath);
        const payload = JSON.parse(payloadText) as ProjectPayload;
        projects.push({
          id: entry.id,
          name: entry.name,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
          data: payload
        });
      } catch (error) {
        console.error(`Failed to read project data for ${entry.id}`, error);
      }
    }

    // 既存のJSONファイルでマニフェスト未登録のものを復元
    let manifestUpdated = false;
    const dirEntries = await readDir(dir);
    for (const entry of dirEntries) {
      const fileName = entry.name;
      if (!fileName || !fileName.endsWith('.json')) {
        continue;
      }
      if (fileName === MANIFEST_FILE_NAME || fileName === FAVORITE_ARCHIVE_FILE_NAME) {
        continue;
      }
      if (referencedFiles.has(fileName)) {
        continue;
      }

      const dataPath = await join(dir, fileName);
      try {
        const payloadText = await readTextFile(dataPath);
        const payload = JSON.parse(payloadText) as ProjectPayload;
        const id = fileName.replace(/\.json$/i, '');
        const savedAt = payload.savedAt ?? new Date().toISOString();
        const recoveredRecord: ProjectRecord = {
          id,
          name: null,
          createdAt: savedAt,
          updatedAt: savedAt,
          data: payload
        };
        projects.push(recoveredRecord);
        entries.push({
          id,
          name: recoveredRecord.name,
          createdAt: recoveredRecord.createdAt,
          updatedAt: recoveredRecord.updatedAt,
          file: fileName
        });
        referencedFiles.add(fileName);
        manifestUpdated = true;
      } catch (error) {
        console.error(`Failed to recover project data for ${fileName}`, error);
      }
    }

    if (manifestUpdated) {
      try {
        await writeTextFile(manifestPath, JSON.stringify(entries));
      } catch (error) {
        console.error('Failed to update manifest with recovered projects', error);
      }
    }

    return projects;
  } catch (error) {
    console.error('Failed to read projects from disk', error);
    return [];
  }
}

async function readFavoriteArchiveFromDisk(): Promise<Record<string, ProjectRecord>> {
  try {
    const dir = await ensureProjectDir();
    const archivePath = await join(dir, FAVORITE_ARCHIVE_FILE_NAME);
    const { exists, readTextFile, writeTextFile } = await import('@tauri-apps/plugin-fs');

    if (!(await exists(archivePath))) {
      await writeTextFile(archivePath, '{}');
      return {};
    }

    const content = await readTextFile(archivePath);
    if (!content) {
      return {};
    }

    return JSON.parse(content) as Record<string, ProjectRecord>;
  } catch (error) {
    console.error('Failed to read favorite archive from disk', error);
    return {};
  }
}

async function writeFavoriteArchiveToDisk(archive: Record<string, ProjectRecord>): Promise<boolean> {
  try {
    const dir = await ensureProjectDir();
    const archivePath = await join(dir, FAVORITE_ARCHIVE_FILE_NAME);
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const payload = JSON.stringify(archive);
    await writeTextFile(archivePath, payload);
    return true;
  } catch (error) {
    console.error('Failed to write favorite archive to disk', error);
    alert('お気に入りの保存に失敗しました。');
    return false;
  }
}

async function writeProjectsToDisk(projects: ProjectRecord[]): Promise<boolean> {
  try {
    if (!isTauriEnvironment()) {
      console.error('writeProjectsToDisk called in non-Tauri environment');
      return false;
    }

    const dir = await ensureProjectDir();
    console.log('Project directory:', dir);
    const manifestPath = await join(dir, MANIFEST_FILE_NAME);
    const { readTextFile, writeTextFile, exists, remove } = await import('@tauri-apps/plugin-fs');

    let previousEntries: ProjectManifestEntry[] = [];
    if (await exists(manifestPath)) {
      const previousContent = await readTextFile(manifestPath);
      previousEntries = previousContent ? JSON.parse(previousContent) : [];
    }

    const obsoleteFiles = new Set(previousEntries.map(entry => entry.file));
    const entries: ProjectManifestEntry[] = [];

    for (const project of projects) {
      const fileName = `${project.id}.json`;
      const filePath = await join(dir, fileName);
      const projectDataJson = JSON.stringify(project.data);
      console.log(`Writing project ${project.id} to ${filePath}, size: ${projectDataJson.length} bytes`);
      await writeTextFile(filePath, projectDataJson);
      entries.push({
        id: project.id,
        name: project.name,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        file: fileName
      });
      obsoleteFiles.delete(fileName);
    }

    // remove data files that are no longer referenced
    for (const fileName of obsoleteFiles) {
      try {
        const filePath = await join(dir, fileName);
        await remove(filePath);
      } catch {
        // ignore
      }
    }

    const manifestJson = JSON.stringify(entries);
    console.log(`Writing manifest to ${manifestPath}, size: ${manifestJson.length} bytes`);
    await writeTextFile(manifestPath, manifestJson);
    console.log('Successfully saved projects to disk');
    return true;
  } catch (error) {
    console.error('Failed to persist projects to disk', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    });
    alert('プロジェクトの保存に失敗しました。');
    return false;
  }
}

function emitStorageChange(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      PROJECT_STORAGE_KEY,
      JSON.stringify({ updatedAt: new Date().toISOString(), count: projectCache.length })
    );
  } catch {
    // ignore quota errors for metadata writes
  }
}

export class ProjectStorage {
  static async initialize(): Promise<void> {
    if (initialized) {
      return;
    }
    await this.syncFromDisk();
    // 初期プロジェクトの作成はproject-manager.tsのinitializeProjects()に任せる
    // await ensureInitialProjectRecord();
    initialized = true;
  }

  static isInitialized(): boolean {
    return initialized;
  }

  static getAll(): ProjectRecord[] {
    return projectCache.map(record => cloneProjectRecord(record));
  }

  static async syncFromDisk(): Promise<void> {
    if (isTauriEnvironment()) {
      projectCache = await readProjectsFromDisk();
      favoriteArchiveCache = await readFavoriteArchiveFromDisk();
    } else {
      projectCache = readProjectsFromLocalStorage();
      favoriteArchiveCache = {};
    }
  }

  static async saveAll(projects: ProjectRecord[]): Promise<boolean> {
    const nextCache = projects.map(record => cloneProjectRecord(record));

    if (isTauriEnvironment()) {
      const success = await writeProjectsToDisk(nextCache);
      if (!success) {
        return false;
      }
    } else {
      try {
        window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(nextCache));
      } catch (error) {
        console.error('Failed to save projects to localStorage', error);
        alert('プロジェクトの保存に失敗しました。');
        return false;
      }
    }

    projectCache = nextCache;
    emitStorageChange();
    return true;
  }

  static async clear(): Promise<void> {
    projectCache = [];
    favoriteArchiveCache = {};
    if (isTauriEnvironment()) {
      try {
        const dir = await ensureProjectDir();
        const manifestPath = await join(dir, MANIFEST_FILE_NAME);
        const archivePath = await join(dir, FAVORITE_ARCHIVE_FILE_NAME);
        const { exists, writeTextFile, readDir, remove } = await import('@tauri-apps/plugin-fs');
        if (await exists(manifestPath)) {
          await writeTextFile(manifestPath, '[]');
        }
        if (await exists(archivePath)) {
          await writeTextFile(archivePath, '{}');
        }
        const entries = await readDir(dir);
        await Promise.all(
          entries
            .filter(entry => entry.name && entry.name.endsWith('.json'))
            .map(async entry => {
              try {
                const targetPath = await join(dir, entry.name);
                if (entry.name === FAVORITE_ARCHIVE_FILE_NAME) {
                  await writeTextFile(targetPath, '{}');
                  return;
                }
                await remove(targetPath);
              } catch {
                  // ignore
                }
              })
        );
      } catch (error) {
        console.error('Failed to clear project storage directory', error);
      }
    } else {
      window.localStorage.removeItem(PROJECT_STORAGE_KEY);
    }
    await ensureInitialProjectRecord();
    emitStorageChange();
  }

  static getFavoriteArchive(): Record<string, ProjectRecord> {
    if (!isTauriEnvironment()) {
      return {};
    }
    return cloneFavoriteArchive(favoriteArchiveCache);
  }

  static getFavoriteArchiveSnapshot(projectId: string): ProjectRecord | null {
    if (!isTauriEnvironment()) {
      return null;
    }
    const record = favoriteArchiveCache[projectId];
    return record ? cloneProjectRecord(record) : null;
  }

  static async saveFavoriteArchive(archive: Record<string, ProjectRecord>): Promise<boolean> {
    if (!isTauriEnvironment()) {
      favoriteArchiveCache = {};
      return true;
    }

    favoriteArchiveCache = cloneFavoriteArchive(archive);
    const success = await writeFavoriteArchiveToDisk(favoriteArchiveCache);
    if (success) {
      emitStorageChange();
    }
    return success;
  }
}

async function ensureInitialProjectRecord(): Promise<void> {
  if (projectCache.length > 0) {
    return;
  }
  const record = createInitialProjectRecord();

  // まずキャッシュに追加（保存に失敗しても表示されるように）
  projectCache = [record];
  emitStorageChange();

  // その後、保存を試みる
  if (isTauriEnvironment()) {
    console.log('Saving initial project in Tauri environment');
    const success = await writeProjectsToDisk([record]);
    if (!success) {
      console.error('Failed to save initial project to disk, but keeping it in cache');
      // 保存に失敗してもキャッシュには追加済み（既に追加されている）
    } else {
      console.log('Successfully saved initial project to disk');
    }
  } else {
    console.log('Saving initial project to localStorage');
    try {
      const json = JSON.stringify([record]);
      console.log('localStorage data size:', json.length, 'bytes');
      window.localStorage.setItem(PROJECT_STORAGE_KEY, json);
      console.log('Successfully saved initial project to localStorage');
    } catch (error) {
      console.error('Failed to save initial project to localStorage, but keeping it in cache', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : undefined
      });
      // 保存に失敗してもキャッシュには追加済み（既に追加されている）
    }
  }
}
