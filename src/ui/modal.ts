/**
 * モーダルUI
 *
 * モーダルウィンドウの管理
 */

import { closeModal } from '../utils';

export function registerModalCloseButtons() {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-modal-close]')
  );
  buttons.forEach(button => {
    const modalId = button.dataset.modalClose;
    button.addEventListener('click', () => {
      const modal = document.getElementById(modalId ?? '') as HTMLDialogElement | null;
      closeModal(modal);
    });
  });
}
