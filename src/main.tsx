/**
 * BOMSyncTool - Reactエントリポイント
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppStateProvider } from './contexts/AppStateContext';
import { initTooltipSystem } from './ui/tooltip';
import { initDynamicLayoutSystem } from './ui/layout';
import { initializeProjectStorage } from './utils/storage';

async function bootstrap() {
  await initializeProjectStorage();
  initTooltipSystem();
  initDynamicLayoutSystem();

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AppStateProvider>
        <App />
      </AppStateProvider>
    </React.StrictMode>
  );
}

void bootstrap();
