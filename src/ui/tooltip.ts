/**
 * ツールチップUI
 *
 * data-tooltip属性を持つ要素にツールチップを表示
 */

let tooltipElement: HTMLElement | null = null;
let tooltipTimeout: number | null = null;

function showTooltip(event: Event) {
  if (!tooltipElement) return;

  const target = event.target as HTMLElement;
  if (!target.hasAttribute('data-tooltip')) return;

  const text = target.getAttribute('data-tooltip');
  if (!text) return;

  // 既存のタイムアウトをクリア
  if (tooltipTimeout) {
    clearTimeout(tooltipTimeout);
  }

  const content = tooltipElement.querySelector('.tooltip-content') as HTMLElement;
  if (!content) return;

  content.textContent = text;

  // 少し遅延させて表示
  tooltipTimeout = window.setTimeout(() => {
    positionTooltip(target);
    tooltipElement!.classList.add('visible');
  }, 200);
}

function hideTooltip() {
  if (!tooltipElement) return;

  if (tooltipTimeout) {
    clearTimeout(tooltipTimeout);
    tooltipTimeout = null;
  }

  tooltipElement.classList.remove('visible');
}

function positionTooltip(target: HTMLElement) {
  if (!tooltipElement) return;

  const content = tooltipElement.querySelector('.tooltip-content') as HTMLElement;
  if (!content) return;

  const targetRect = target.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const spacing = 4; // ボタンに近づける
  const margin = 8;

  // 利用可能なスペースを計算
  const spaceBelow = viewportHeight - targetRect.bottom - spacing - margin;
  const spaceAbove = targetRect.top - spacing - margin;
  const spaceRight = viewportWidth - targetRect.right - spacing - margin;
  const spaceLeft = targetRect.left - spacing - margin;

  // 優先順位: 下 → 上 → 右 → 左
  let position: 'bottom' | 'top' | 'right' | 'left' = 'bottom';
  let maxWidth = 320; // デフォルト最大幅

  // 最適な配置を決定
  if (spaceBelow >= 60) {
    position = 'bottom';
    maxWidth = Math.min(320, viewportWidth - 2 * margin);
  } else if (spaceAbove >= 60) {
    position = 'top';
    maxWidth = Math.min(320, viewportWidth - 2 * margin);
  } else if (spaceRight >= 100) {
    position = 'right';
    maxWidth = Math.min(280, spaceRight);
  } else if (spaceLeft >= 100) {
    position = 'left';
    maxWidth = Math.min(280, spaceLeft);
  } else {
    // スペースが足りない場合は最大のスペースを使う
    const maxSpace = Math.max(spaceBelow, spaceAbove, spaceRight, spaceLeft);
    if (maxSpace === spaceBelow) position = 'bottom';
    else if (maxSpace === spaceAbove) position = 'top';
    else if (maxSpace === spaceRight) position = 'right';
    else position = 'left';
    maxWidth = Math.min(320, maxSpace - margin);
  }

  // ツールチップの幅を設定
  content.style.maxWidth = `${maxWidth}px`;

  // 一度描画してサイズを取得
  content.style.visibility = 'hidden';
  tooltipElement.classList.add('visible');
  const tooltipRect = content.getBoundingClientRect();
  tooltipElement.classList.remove('visible');
  content.style.visibility = 'visible';

  let left = 0;
  let top = 0;

  // 位置を計算
  switch (position) {
    case 'bottom':
      top = targetRect.bottom + spacing;
      left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
      break;
    case 'top':
      top = targetRect.top - spacing - tooltipRect.height;
      left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
      break;
    case 'right':
      top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
      left = targetRect.right + spacing;
      break;
    case 'left':
      top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
      left = targetRect.left - spacing - tooltipRect.width;
      break;
  }

  // 左右の微調整
  if (left < margin) {
    left = margin;
  } else if (left + tooltipRect.width > viewportWidth - margin) {
    left = viewportWidth - tooltipRect.width - margin;
  }

  // 上下の微調整
  if (top < margin) {
    top = margin;
  } else if (top + tooltipRect.height > viewportHeight - margin) {
    top = viewportHeight - tooltipRect.height - margin;
  }

  tooltipElement.style.left = `${left}px`;
  tooltipElement.style.top = `${top}px`;

  // 位置クラスを更新
  tooltipElement.className = `tooltip-container position-${position}`;

  // 次のフレームでvisibleクラスを追加
  requestAnimationFrame(() => {
    tooltipElement!.classList.add('visible');
  });
}

export function initTooltipSystem() {
  // ツールチップコンテナを作成（矢印を削除）
  tooltipElement = document.createElement('div');
  tooltipElement.className = 'tooltip-container';
  tooltipElement.innerHTML = '<div class="tooltip-content"></div>';
  document.body.appendChild(tooltipElement);

  // mouseenter/mouseleaveを使用（バブリングしないのでイベント委譲できないため、動的に追加）
  const handleMouseEnter = (event: Event) => {
    const target = event.target as HTMLElement;
    if (target.hasAttribute('data-tooltip')) {
      showTooltip(event);
    }
  };

  const handleMouseLeave = (event: Event) => {
    const target = event.target as HTMLElement;
    if (target.hasAttribute('data-tooltip')) {
      hideTooltip();
    }
  };

  // MutationObserverで動的に追加される要素を監視
  const observer = new MutationObserver(() => {
    document.querySelectorAll('[data-tooltip]').forEach((element) => {
      element.removeEventListener('mouseenter', handleMouseEnter);
      element.removeEventListener('mouseleave', handleMouseLeave);
      element.addEventListener('mouseenter', handleMouseEnter);
      element.addEventListener('mouseleave', handleMouseLeave);
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-tooltip']
  });

  // 初期化時に既存の要素にもイベントを設定
  document.querySelectorAll('[data-tooltip]').forEach((element) => {
    element.addEventListener('mouseenter', handleMouseEnter);
    element.addEventListener('mouseleave', handleMouseLeave);
  });

  // フォーカス時のツールチップも対応
  document.body.addEventListener('focus', (event) => {
    const target = event.target as HTMLElement;
    if (target.hasAttribute('data-tooltip')) {
      showTooltip(event);
    }
  }, true);

  document.body.addEventListener('blur', (event) => {
    const target = event.target as HTMLElement;
    if (target.hasAttribute('data-tooltip')) {
      hideTooltip();
    }
  }, true);
}
