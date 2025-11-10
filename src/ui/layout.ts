/**
 * 動的レイアウト調整システム
 *
 * ビューポートサイズに応じてUI要素の高さを自動調整
 */

let layoutResizeTimeout: number | null = null;

function adjustDynamicLayouts() {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // 1. 編集モーダルの高さを viewport に合わせる
  const editModal = document.getElementById('edit-modal');
  if (editModal) {
    const maxHeight = viewportHeight * 0.9;
    editModal.style.maxHeight = `${maxHeight}px`;
  }

  // 2. 編集テーブルラッパーの高さを調整
  const editTableWrapper = document.querySelector('.editable-table-wrapper') as HTMLElement;
  if (editTableWrapper) {
    const availableHeight = viewportHeight * 0.5;
    editTableWrapper.style.maxHeight = `${Math.max(300, availableHeight)}px`;
  }

  // 3. 結果テーブルの高さを調整
  const resultsTable = document.querySelector('.results-table-wrapper') as HTMLElement;
  if (resultsTable) {
    const availableHeight = viewportHeight * 0.4;
    resultsTable.style.maxHeight = `${Math.max(360, availableHeight)}px`;
  }

  // 4. プロジェクトパネルとログパネルの高さを調整
  const projectScroll = document.querySelector('.project-tab-scroll') as HTMLElement;
  const activityLog = document.querySelector('.activity-log') as HTMLElement;

  if (projectScroll || activityLog) {
    // supplementary-panelまでの使用済み高さを計算
    const header = document.querySelector('.shell-header');
    const controlPanel = document.querySelector('.control-panel-vertical');
    const resultsPanel = document.querySelector('.results-panel');

    let usedHeight = 100; // padding等
    if (header) usedHeight += header.getBoundingClientRect().height;
    if (controlPanel) usedHeight += controlPanel.getBoundingClientRect().height;
    if (resultsPanel && !resultsPanel.hasAttribute('hidden')) {
      usedHeight += resultsPanel.getBoundingClientRect().height;
    }

    const availableHeight = Math.max(250, viewportHeight - usedHeight - 100);

    if (projectScroll) {
      projectScroll.style.maxHeight = `${availableHeight}px`;
    }
    if (activityLog) {
      activityLog.style.maxHeight = `${availableHeight}px`;
    }
  }

  // 5. モバイルでのテーブル幅調整
  if (viewportWidth < 768) {
    const tables = document.querySelectorAll('table');
    tables.forEach(table => {
      const tableEl = table as HTMLElement;
      tableEl.style.minWidth = 'auto';
    });
  }
}

function scheduleAdjustment(delay = 150) {
  if (layoutResizeTimeout) {
    clearTimeout(layoutResizeTimeout);
  }
  layoutResizeTimeout = window.setTimeout(() => {
    adjustDynamicLayouts();
  }, delay);
}

export function requestLayoutAdjustment(delay = 120) {
  scheduleAdjustment(delay);
}

// デバウンス付きリサイズハンドラー
function handleResize() {
  scheduleAdjustment();
}

export function initDynamicLayoutSystem() {
  // 初回実行
  adjustDynamicLayouts();

  // リサイズイベント
  window.addEventListener('resize', handleResize);

  // DOM変更を監視して必要に応じて再調整
  const observer = new MutationObserver((mutations) => {
    let needsAdjustment = false;

    for (const mutation of mutations) {
      // hidden属性の変更を検出
      if (mutation.type === 'attributes' && mutation.attributeName === 'hidden') {
        needsAdjustment = true;
        break;
      }
      // 大きな要素の追加/削除を検出
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.classList.contains('results-panel') ||
                el.classList.contains('modal') ||
                el.tagName === 'TABLE') {
              needsAdjustment = true;
              break;
            }
          }
        }
      }
    }

    if (needsAdjustment) {
      scheduleAdjustment(100);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'class']
  });
}
