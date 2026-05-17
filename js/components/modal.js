let _overlay = null;
let _onConfirm = null;

function getOverlay() {
  if (!_overlay) {
    _overlay = document.createElement('div');
    _overlay.className = 'modal-overlay';
    _overlay.innerHTML = `
      <div class="modal-box">
        <div class="modal-header">
          <span class="modal-title" id="modalTitle"></span>
          <button class="modal-close" id="modalClose">✕</button>
        </div>
        <div id="modalContent"></div>
        <div class="modal-footer" id="modalFooter"></div>
      </div>
    `;
    document.body.appendChild(_overlay);

    _overlay.addEventListener('click', e => {
      if (e.target === _overlay) closeModal();
    });
    document.getElementById('modalClose').addEventListener('click', closeModal);
  }
  return _overlay;
}

export function openModal({ title, content, onConfirm, confirmText = 'Tamam', cancelText = 'İptal', hiddenFooter = false }) {
  const overlay = getOverlay();
  document.getElementById('modalTitle').textContent = title || '';
  document.getElementById('modalContent').innerHTML = content || '';

  const footer = document.getElementById('modalFooter');
  if (hiddenFooter) {
    footer.style.display = 'none';
  } else {
    footer.style.display = 'flex';
    footer.innerHTML = `
      <button class="btn btn-secondary" id="modalCancel">${cancelText}</button>
      <button class="btn btn-primary" id="modalConfirm">${confirmText}</button>
    `;
    _onConfirm = onConfirm || null;
    document.getElementById('modalCancel').addEventListener('click', closeModal);
    document.getElementById('modalConfirm').addEventListener('click', () => {
      if (_onConfirm) _onConfirm();
      closeModal();
    });
  }

  requestAnimationFrame(() => overlay.classList.add('open'));
}

export function closeModal() {
  if (!_overlay) return;
  _overlay.classList.remove('open');
  _onConfirm = null;
}

export function confirm(message) {
  return new Promise(resolve => {
    openModal({
      title: 'Onay',
      content: `<p style="font-size:15px;color:var(--text-primary);line-height:1.5">${message}</p>`,
      confirmText: 'Evet',
      cancelText: 'Hayır',
      onConfirm: () => resolve(true)
    });
    const orig = _onConfirm;
    _overlay.querySelector('#modalCancel').addEventListener('click', () => resolve(false), { once: true });
  });
}
