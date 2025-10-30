/**
 * BOMSyncTool - Reactエントリポイント
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initTooltipSystem } from './ui/tooltip';
import { initDynamicLayoutSystem } from './ui/layout';
import { registerNativeDropBridge } from './ui/dropzone';

// システム初期化
initTooltipSystem();
initDynamicLayoutSystem();
registerNativeDropBridge();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
