import { createContext, useContext, type ReactNode } from 'react';
import type { UseBOMDataResult } from '../hooks/useBOMData';
import type { UseProjectsResult } from '../hooks/useProjects';
import type { UseDictionaryResult } from '../hooks/useDictionary';
import type { UseActivityLogResult } from '../hooks/useActivityLog';
import type { UseSettingsResult } from '../hooks/useSettings';

export interface AppContextValue {
  bomA: UseBOMDataResult;
  bomB: UseBOMDataResult;
  projects: UseProjectsResult;
  dictionary: UseDictionaryResult;
  activityLog: UseActivityLogResult;
  settings: UseSettingsResult;
}

const AppContext = createContext<AppContextValue | null>(null);

interface AppProviderProps {
  children: ReactNode;
  value: AppContextValue;
}

export function AppProvider({ children, value }: AppProviderProps) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
}
