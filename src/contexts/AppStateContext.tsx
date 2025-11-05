/**
 * アプリケーション状態管理Context
 *
 * currentDiffs、mergedBom、editModalStateをReact Contextで管理
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { DiffRow, ParseResult, EditModalState } from '../types';

/**
 * Context state型定義
 */
interface AppStateContextValue {
  // 差分比較結果
  currentDiffs: DiffRow[];
  setCurrentDiffs: (diffs: DiffRow[]) => void;

  // マージされたBOM
  mergedBom: ParseResult | null;
  setMergedBom: (bom: ParseResult | null) => void;

  // 編集モーダル状態
  editModalState: EditModalState | null;
  setEditModalState: (state: EditModalState | null) => void;
}

/**
 * Context作成
 */
const AppStateContext = createContext<AppStateContextValue | undefined>(undefined);

/**
 * Provider props
 */
interface AppStateProviderProps {
  children: ReactNode;
}

/**
 * AppStateProvider
 */
export function AppStateProvider({ children }: AppStateProviderProps) {
  const [currentDiffs, setCurrentDiffsState] = useState<DiffRow[]>([]);
  const [mergedBom, setMergedBomState] = useState<ParseResult | null>(null);
  const [editModalState, setEditModalStateState] = useState<EditModalState | null>(null);

  const setCurrentDiffs = useCallback((diffs: DiffRow[]) => {
    setCurrentDiffsState(diffs);
  }, []);

  const setMergedBom = useCallback((bom: ParseResult | null) => {
    setMergedBomState(bom);
  }, []);

  const setEditModalState = useCallback((state: EditModalState | null) => {
    setEditModalStateState(state);
  }, []);

  const value: AppStateContextValue = {
    currentDiffs,
    setCurrentDiffs,
    mergedBom,
    setMergedBom,
    editModalState,
    setEditModalState
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

/**
 * カスタムフック
 */
export function useAppState(): AppStateContextValue {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return context;
}
