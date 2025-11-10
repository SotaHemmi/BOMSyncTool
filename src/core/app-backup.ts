import { save, open } from '@tauri-apps/plugin-dialog';
import { ProjectStorage } from './storage';
import type {
  ProjectRecord,
  ProjectSettings,
  RegistrationEntry,
  ExceptionEntry,
  PreprocessBlock
} from '../types';
import {
  getFavoriteProjects,
  saveFavoriteProjects,
  loadFavoriteProjectArchive,
  saveFavoriteProjectArchive,
  loadProjectSettings,
  saveProjectSettings,
  loadActiveProjectId,
  saveActiveProjectId,
  loadRegistrationData,
  saveRegistrationData,
  loadExceptionData,
  saveExceptionData,
  loadPreprocessBlocks,
  savePreprocessBlocks
} from '../utils/storage';

interface AppBackupPayload {
  version: number;
  exportedAt: string;
  projects: ProjectRecord[];
  favoriteProjects: string[];
  favoriteArchive: Record<string, ProjectRecord>;
  activeProjectId: string | null;
  projectSettings: ProjectSettings | null;
  dictionary: {
    registrations: RegistrationEntry[];
    exceptions: ExceptionEntry[];
  };
  preprocessBlocks: PreprocessBlock[];
}

function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

async function ensureFsModule() {
  if (!isTauriEnvironment()) {
    throw new Error('backup_requires_tauri');
  }
  return await import('@tauri-apps/plugin-fs');
}

function handleBackupError(error: unknown): void {
  if ((error as Error)?.message === 'backup_requires_tauri') {
    alert('バックアップ機能はデスクトップ版でのみ利用できます。');
    return;
  }
  console.error('Failed to process backup', error);
  alert(`バックアップ処理に失敗しました: ${error}`);
}

export async function exportAppBackup(): Promise<void> {
  try {
    const fs = await ensureFsModule();

    const targetPath = await save({
      filters: [{ name: 'BOMSync Backup', extensions: ['json', 'bkp'] }],
      defaultPath: `bomsync-backup-${Date.now()}.json`
    });
    if (!targetPath) {
      return;
    }

    const projects = ProjectStorage.getAll();
    const favorites = Array.from(getFavoriteProjects());
    const favoriteArchive = loadFavoriteProjectArchive();
    const payload: AppBackupPayload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      projects,
      favoriteProjects: favorites,
      favoriteArchive,
      activeProjectId: loadActiveProjectId(),
      projectSettings: loadProjectSettings(),
      dictionary: {
        registrations: loadRegistrationData(),
        exceptions: loadExceptionData()
      },
      preprocessBlocks: loadPreprocessBlocks()
    };

    await fs.writeTextFile(targetPath, JSON.stringify(payload, null, 2));
    alert('バックアップを作成しました。');
  } catch (error) {
    handleBackupError(error);
  }
}

export async function importAppBackup(): Promise<void> {
  try {
    const fs = await ensureFsModule();
    const filePath = await open({
      multiple: false,
      filters: [{ name: 'BOMSync Backup', extensions: ['json', 'bkp'] }]
    });
    if (!filePath || Array.isArray(filePath)) {
      return;
    }

    const content = await fs.readTextFile(filePath);
    const payload = JSON.parse(content) as Partial<AppBackupPayload>;

    if (!payload || !Array.isArray(payload.projects)) {
      alert('バックアップファイルの形式が不正です。');
      return;
    }

    const success = await ProjectStorage.saveAll(payload.projects);
    if (!success) {
      alert('プロジェクトデータの復元に失敗しました。');
      return;
    }

    await Promise.all([
      (async () => {
        saveFavoriteProjects(new Set(payload.favoriteProjects ?? []));
      })(),
      saveFavoriteProjectArchive(payload.favoriteArchive ?? {}),
      (async () => {
        saveActiveProjectId(payload.activeProjectId ?? null);
      })()
    ]);

    if (payload.projectSettings) {
      saveProjectSettings(payload.projectSettings);
    }

    if (payload.dictionary?.registrations) {
      saveRegistrationData(payload.dictionary.registrations);
    }
    if (payload.dictionary?.exceptions) {
      saveExceptionData(payload.dictionary.exceptions);
    }

    if (payload.preprocessBlocks) {
      savePreprocessBlocks(payload.preprocessBlocks);
    }

    alert('バックアップを復元しました。アプリを再読み込みします。');
    window.location.reload();
  } catch (error) {
    handleBackupError(error);
  }
}
