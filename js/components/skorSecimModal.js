// Skor seçim modalı — dashboard'da kullanılır
// Kullanıcı 5 skorun listesinden birini seçer, ardından skorModal açılır

import { SKORLAR, KATEGORI_LABEL } from '../skor/index.js';
import { openSkorModal } from './skorModal.js';

let _overlay = null;

/**
 * @param {Object|null} hasta — varsa skorlar bu hastaya kaydedilebilir
 */
export function openSkorSecimModal(hasta = null) {
  _overlay?.remove();
  _overlay = document.createElement('div');
  _overlay.className = 'modal-overlay';

  // Skorları kategoriye göre grupla
  const gruplar = {};
  for (const s of SKORLAR) {
    if (!gruplar[s.kategori]) gruplar[s.kategori] = [];
    gruplar[s.kategori].push(s);
  }

  _overlay.innerHTML = `
    <div class="modal-box modal-box-secim">
      <div class="modal-header">
        <span class="modal-title">Klinik Skor Seç</span>
        <button class="modal-close" id="ssClose">✕</button>
      </div>

      ${hasta ? `
        <div class="skor-secim-hasta">
          <span>👤 ${hasta.ad}</span>
          <span class="skor-secim-not">Yaş ${hasta.yas} ${hasta.cinsiyet === 'E' ? '♂' : '♀'} otomatik doldurulacak</span>
        </div>
      ` : `
        <div class="skor-secim-hasta">
          <span>🧮 Bağımsız hesaplayıcı</span>
          <span class="skor-secim-not">Sonuçlar kaydedilmez</span>
        </div>
      `}

      <div class="skor-secim-liste">
        ${Object.entries(gruplar).map(([kat, skorlar]) => `
          <div class="skor-secim-grup">
            <div class="skor-secim-grup-baslik">${KATEGORI_LABEL[kat] || kat}</div>
            ${skorlar.map(s => `
              <button class="skor-secim-kart skor-kat-${s.kategori}" data-skor-id="${s.id}">
                <div class="skor-secim-ad">${s.ad}</div>
                <div class="skor-secim-aciklama">${s.aciklama}</div>
                <div class="skor-secim-kilavuz">${s.kilavuz}</div>
              </button>
            `).join('')}
          </div>
        `).join('')}
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" id="ssIptal">Kapat</button>
      </div>
    </div>
  `;

  document.body.appendChild(_overlay);
  requestAnimationFrame(() => _overlay.classList.add('open'));

  _overlay.addEventListener('click', e => { if (e.target === _overlay) _close(); });
  document.getElementById('ssClose').addEventListener('click', _close);
  document.getElementById('ssIptal').addEventListener('click', _close);

  _overlay.querySelectorAll('.skor-secim-kart').forEach(kart => {
    kart.addEventListener('click', () => {
      const id = kart.dataset.skorId;
      const skor = SKORLAR.find(s => s.id === id);
      if (!skor) return;
      _close();
      // Seçim modalı kapansın, sonra hesaplama modalı açılsın
      setTimeout(() => openSkorModal(skor, hasta), 200);
    });
  });
}

function _close() {
  _overlay?.classList.remove('open');
  setTimeout(() => { _overlay?.remove(); _overlay = null; }, 300);
}
