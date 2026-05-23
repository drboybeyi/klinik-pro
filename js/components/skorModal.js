// Generic skor hesaplama modalı — herhangi bir skor modülünü yükler
// Hasta verilmişse yaş/cinsiyet otomatik dolar ve "Kaydet" aktiftir.

import { saveSkor } from '../db.js';
import { showToast } from './toast.js';

let _overlay = null;

/**
 * @param {Object} skor     skor modülü (SKORLAR registry'den)
 * @param {Object} hasta    opsiyonel — varsa autofill + kayıt
 * @param {Object} mevcut   opsiyonel — düzenleme için varolan skor kaydı
 */
export function openSkorModal(skor, hasta = null, mevcut = null) {
  _overlay?.remove();
  _overlay = document.createElement('div');
  _overlay.className = 'modal-overlay skor-modal';

  // Başlangıç değerleri: önce mevcut kaydın inputs'u, sonra autofill, sonra boş
  const baslangic = {};
  for (const inp of skor.inputs) {
    if (mevcut?.inputs && mevcut.inputs[inp.key] !== undefined) {
      baslangic[inp.key] = mevcut.inputs[inp.key];
    } else if (inp.autofill && hasta && hasta[inp.autofill] !== undefined) {
      baslangic[inp.key] = hasta[inp.autofill];
    } else {
      baslangic[inp.key] = inp.tip === 'bool' ? null : '';
    }
  }

  _overlay.innerHTML = `
    <div class="modal-box modal-box-skor">
      <div class="modal-header">
        <span class="modal-title">${skor.ad}</span>
        <button class="modal-close" id="smClose">✕</button>
      </div>

      <div class="skor-modal-meta">
        <span class="skor-kategori-pill skor-kat-${skor.kategori}">${skor.kilavuz}</span>
        <span class="skor-modal-aciklama">${skor.aciklama}</span>
      </div>

      <div class="skor-modal-form" id="smForm">
        ${skor.inputs.map(inp => _renderInput(inp, baslangic[inp.key])).join('')}
      </div>

      <div class="skor-sonuc" id="smSonuc">
        ${_renderSonuc(skor, baslangic)}
      </div>

      ${skor.link ? `<div class="skor-modal-kaynak">
        <a href="${skor.link}" target="_blank" rel="noopener">📖 Kılavuz/Kaynak →</a>
      </div>` : ''}

      <div class="modal-footer">
        <button class="btn btn-secondary" id="smIptal">${hasta ? 'İptal' : 'Kapat'}</button>
        ${hasta ? `<button class="btn btn-primary" id="smKaydet">${mevcut ? 'Güncelle' : 'Kaydet'}</button>` : ''}
      </div>
    </div>
  `;

  document.body.appendChild(_overlay);
  requestAnimationFrame(() => _overlay.classList.add('open'));

  _overlay.addEventListener('click', e => { if (e.target === _overlay) _close(); });
  document.getElementById('smClose').addEventListener('click', _close);
  document.getElementById('smIptal').addEventListener('click', _close);

  // Live recalc
  document.getElementById('smForm').addEventListener('input',  () => _refreshSonuc(skor));
  document.getElementById('smForm').addEventListener('change', () => _refreshSonuc(skor));
  document.getElementById('smForm').addEventListener('click', e => {
    const btn = e.target.closest('.skor-bool-btn');
    if (btn) {
      const grp = btn.closest('.skor-bool-grp');
      grp.querySelectorAll('.skor-bool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _refreshSonuc(skor);
    }
  });

  if (hasta) {
    document.getElementById('smKaydet').addEventListener('click', () =>
      _kaydet(skor, hasta, mevcut));
  }
}

function _renderInput(inp, value) {
  if (inp.tip === 'bool') {
    const aktif = value === true ? 'evet' : value === false ? 'hayir' : null;
    return `
      <div class="skor-input-row">
        <label class="skor-input-label">${inp.label}</label>
        <div class="skor-bool-grp" data-key="${inp.key}">
          <button type="button" class="skor-bool-btn ${aktif === 'hayir' ? 'active' : ''}" data-v="0">Hayır</button>
          <button type="button" class="skor-bool-btn ${aktif === 'evet'  ? 'active' : ''}" data-v="1">Evet</button>
        </div>
      </div>
    `;
  }

  if (inp.tip === 'enum') {
    return `
      <div class="skor-input-row">
        <label class="skor-input-label">${inp.label}</label>
        <select class="form-control skor-input-select" data-key="${inp.key}">
          ${inp.secenekler.map(o => `
            <option value="${o.v}" ${o.v === value ? 'selected' : ''}>${o.label}</option>
          `).join('')}
        </select>
      </div>
    `;
  }

  // sayi veya ondalik
  const step = inp.tip === 'ondalik' ? (inp.adim || 0.01) : 1;
  return `
    <div class="skor-input-row">
      <label class="skor-input-label">
        ${inp.label}
        ${inp.birim ? `<span class="skor-input-birim">${inp.birim}</span>` : ''}
      </label>
      <input type="number" class="form-control skor-input-num"
             data-key="${inp.key}"
             value="${value ?? ''}"
             ${inp.min !== undefined ? `min="${inp.min}"` : ''}
             ${inp.max !== undefined ? `max="${inp.max}"` : ''}
             step="${step}"
             inputmode="decimal">
    </div>
  `;
}

function _topla() {
  const data = {};
  document.querySelectorAll('#smForm .skor-input-num').forEach(el => {
    const k = el.dataset.key;
    data[k] = el.value === '' ? '' : Number(el.value);
  });
  document.querySelectorAll('#smForm .skor-input-select').forEach(el => {
    data[el.dataset.key] = el.value;
  });
  document.querySelectorAll('#smForm .skor-bool-grp').forEach(grp => {
    const aktif = grp.querySelector('.skor-bool-btn.active');
    data[grp.dataset.key] = aktif ? aktif.dataset.v === '1' : null;
  });
  return data;
}

function _eksikVar(skor, data) {
  for (const inp of skor.inputs) {
    const v = data[inp.key];
    if (v === '' || v === null || v === undefined) return inp.label;
    if (inp.tip === 'sayi' || inp.tip === 'ondalik') {
      if (Number.isNaN(v)) return inp.label;
    }
  }
  return null;
}

function _renderSonuc(skor, data) {
  const eksik = _eksikVar(skor, data);
  if (eksik) {
    return `
      <div class="skor-sonuc-bos">
        <span>👀 Hesaplamak için tüm alanları doldurun</span>
        <span class="skor-sonuc-eksik">Eksik: ${eksik}</span>
      </div>
    `;
  }
  const r = skor.calc(data);
  const i = skor.interpret(r);

  return `
    <div class="skor-sonuc-kutu seviye-bg-${i.seviye}">
      <div class="skor-puan-row">
        <div class="skor-puan-buyuk">
          ${r.puan}${r.birim ? `<span class="skor-puan-birim">${r.birim}</span>` : (r.max ? `<span class="skor-puan-max">/${r.max}</span>` : '')}
        </div>
        <span class="badge seviye-${i.seviye}">${i.etiket}</span>
      </div>
      <div class="skor-yorum">${i.mesaj}</div>
      ${i.detay ? `<div class="skor-detay">${i.detay}</div>` : ''}
      ${r.bilesenler?.length ? `
        <details class="skor-bilesenler-toggle">
          <summary>Bileşen dökümü</summary>
          <table class="skor-bilesenler-tablo">
            ${r.bilesenler.map(b => `
              <tr>
                <td>${b.ad}</td>
                <td class="skor-bilesen-puan">${typeof b.puan === 'number' && b.puan === 0 ? '0' : b.puan}</td>
              </tr>
            `).join('')}
          </table>
        </details>
      ` : ''}
    </div>
  `;
}

function _refreshSonuc(skor) {
  const data = _topla();
  document.getElementById('smSonuc').innerHTML = _renderSonuc(skor, data);
}

async function _kaydet(skor, hasta, mevcut) {
  const data = _topla();
  const eksik = _eksikVar(skor, data);
  if (eksik) {
    showToast(`Eksik alan: ${eksik}`, 'info');
    return;
  }
  const r = skor.calc(data);
  const i = skor.interpret(r);

  const btn = document.getElementById('smKaydet');
  btn.disabled = true;
  btn.textContent = 'Kaydediliyor…';

  try {
    await saveSkor({
      ...(mevcut?.id ? { id: mevcut.id } : {}),
      hastaId: hasta.id,
      skorId:  skor.id,
      skorAd:  skor.ad,
      kategori: skor.kategori,
      kilavuz: skor.kilavuz,
      tarih:   new Date().toISOString().slice(0, 10),
      inputs:  data,
      puan:    r.puan,
      birim:   r.birim || null,
      etiket:  i.etiket,
      seviye:  i.seviye,
      mesaj:   i.mesaj
    });
    showToast(mevcut ? 'Skor güncellendi' : 'Skor kaydedildi', 'success');
    _close();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = mevcut ? 'Güncelle' : 'Kaydet';
    showToast('Kayıt başarısız', 'error');
  }
}

function _close() {
  _overlay?.classList.remove('open');
  setTimeout(() => { _overlay?.remove(); _overlay = null; }, 300);
}
