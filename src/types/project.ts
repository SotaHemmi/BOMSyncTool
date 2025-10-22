/**
 * プロジェクト管理関連の型定義
 */

import type { ParseResult, ColumnRole, BomRow } from './bom';

export type DatasetKey = 'a' | 'b';

export interface DatasetState {
  parseResult: ParseResult | null;
  normalizedBom: BomRow[] | null;
  fileName: string | null;
  filePath: string | null;
  lastUpdated: string | null;
  columnRoles: Record<string, ColumnRole>;
}

export interface ProjectPayload {
  version: number;
  savedAt: string;
  bomA: ParseResult | null;
  bomB: ParseResult | null;
  columnRolesA?: Record<string, ColumnRole>;
  columnRolesB?: Record<string, ColumnRole>;
  normalizedBomA?: BomRow[] | null;
  normalizedBomB?: BomRow[] | null;
}

export interface ProjectRecord {
  id: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
  data: ProjectPayload;
}

export interface ProjectSettings {
  autoIntervalMinutes: number;
  autoMaxEntries: number;
  defaultPreprocess?: {
    expandReference: boolean;
    splitReferenceRows: boolean;
    fillBlankCells: boolean;
    cleanseTextData: boolean;
    applyFormatRules: boolean;
  };
}
