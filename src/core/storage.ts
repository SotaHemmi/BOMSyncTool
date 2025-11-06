import type { ProjectRecord } from '../types/project';

export const PROJECT_STORAGE_KEY = 'bomsync_projects';

export class ProjectStorage {
  static getAll(): ProjectRecord[] {
    try {
      const stored = window.localStorage.getItem(PROJECT_STORAGE_KEY);
      if (!stored) {
        return [];
      }
      return JSON.parse(stored) as ProjectRecord[];
    } catch (error) {
      console.error('Failed to load projects from storage', error);
      return [];
    }
  }

  static saveAll(projects: ProjectRecord[]): void {
    try {
      window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(projects));
    } catch (error) {
      console.error('Failed to save projects to storage', error);
      alert('プロジェクトの保存に失敗しました。不要なデータを削除して空き容量を確保してください。');
    }
  }

  static clear(): void {
    window.localStorage.removeItem(PROJECT_STORAGE_KEY);
  }
}
