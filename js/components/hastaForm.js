import { createHasta, updateHasta } from '../db.js';
import { showToast } from './toast.js';

let _overlay = null;
let _hastaId = null;
let _onSaved  = null;

export function openHastaForm(hasta = null, onSaved = null) {
  _hastaId = hasta?.id || null;
  _onSaved  = onSaved;
  _render(hasta);
}

function _render(hasta) {
  _overlay?.remove();
  _overlay = document.createElement('div');
  _overlay.className = 'modal-overlay';
  _overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">${hasta ? 'Hasta Düzenle' : 'Yeni Hasta'}</span>
        <button class="modal-close" id="hfClose">✕</button>
      </div>

      <div class="form-group">
        <label class="form-label">Ad Soyad <span style="color:var(--danger)">*</span></label>
        <input type="text" id="hfAd" class="form-control"
               placeholder="S.İ. veya tam ad" value="${_esc(hasta?.ad)}" maxlength="80">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group">
          <label class="form-label">Yaş <span style="color:var(--danger)">*</span></label>
          <input type="number" id="hfYas" class="form-control"
                 placeholder="65" min="0" max="130" value="${hasta?.yas ?? ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Cinsiyet <span style="color:var(--danger)">*</span></label>
          <div class="btn-group" style="margin-top:2px" id="hfCinsiyetGrp">
            <button class="btn-option ${(!hasta || hasta.cinsiyet === 'E') ? 'active' : ''}" data-v="E">Erkek</button>
            <button class="btn-option ${hasta?.cinsiyet === 'K' ? 'active' : ''}" data-v="K">Kadın</button>
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group">
          <label class="form-label" style="font-weight:500;color:var(--text-secondary)">MRN</label>
          <input type="text" id="hfMrn" class="form-control"
                 placeholder="SI-89E" value="${_esc(hasta?.mrn)}">
        </div>
        <div class="form-group">
          <label class="form-label" style="font-weight:500;color:var(--text-secondary)">Telefon</label>
          <input type="tel" id="hfTelefon" class="form-control"
                 placeholder="05xx xxx xx xx" value="${_esc(hasta?.telefon)}">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" style="font-weight:500;color:var(--text-secondary)">Klinik Özet</label>
        <textarea id="hfOzet" class="form-control" rows="4"
                  placeholder="Kısa klinik not…" style="resize:vertical">${_esc(hasta?.klinikOzet)}</textarea>
      </div>

      <div id="hfErr" class="login-error" style="display:none"></div>

      <div class="modal-footer">
        <button class="btn btn-secondary" id="hfIptal">İptal</button>
        <button class="btn btn-primary" id="hfKaydet">Kaydet</button>
      </div>
    </div>
  `;
  document.body.appendChild(_overlay);
  requestAnimationFrame(() => _overlay.classList.add('open'));

  _overlay.addEventListener('click', e => { if (e.target === _overlay) _close(); });
  document.getElementById('hfClose').addEventListener('click', _close);
  document.getElementById('hfIptal').addEventListener('click', _close);
  document.getElementById('hfKaydet').addEventListener('click', _save);

  document.querySelectorAll('#hfCinsiyetGrp .btn-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#hfCinsiyetGrp .btn-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  setTimeout(() => document.getElementById('hfAd')?.focus(), 320);
}

function _close() {
  _overlay?.classList.remove('open');
  setTimeout(() => { _overlay?.remove(); _overlay = null; }, 300);
}

async function _save() {
  const ad       = document.getElementById('hfAd').value.trim();
  const yasRaw   = document.getElementById('hfYas').value;
  const yas      = parseInt(yasRaw);
  const cinsiyet = document.querySelector('#hfCinsiyetGrp .btn-option.active')?.dataset.v;
  const mrn      = document.getElementById('hfMrn').value.trim();
  const telefon  = document.getElementById('hfTelefon').value.trim();
  const klinikOzet = document.getElementById('hfOzet').value.trim();
  const btn      = document.getElementById('hfKaydet');

  document.getElementById('hfAd').classList.remove('error');
  _showErr('');

  if (!ad)                          { _showErr('Ad Soyad zorunludur.'); document.getElementById('hfAd').classList.add('error'); return; }
  if (!yasRaw || yas < 0 || yas > 130) { _showErr('Geçerli bir yaş girin (0-130).'); return; }
  if (!cinsiyet)                    { _showErr('Cinsiyet seçiniz.'); return; }

  btn.disabled = true;
  btn.textContent = 'Kaydediliyor…';

  try {
    const data = { ad, yas, cinsiyet, mrn, telefon, klinikOzet };
    if (_hastaId) {
      await updateHasta(_hastaId, data);
      showToast('Hasta güncellendi', 'success');
    } else {
      await createHasta(data);
      showToast('Hasta eklendi', 'success');
    }
    _onSaved?.();
    _close();
  } catch {
    btn.disabled = false;
    btn.textContent = 'Kaydet';
    _showErr('Kayıt başarısız. Tekrar dene.');
  }
}

function _showErr(msg) {
  const el = document.getElementById('hfErr');
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

function _esc(val) { return val || ''; }
