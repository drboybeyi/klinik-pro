import { saveTani } from '../db.js';
import { showToast } from './toast.js';

let _overlay = null;

export function openTaniForm(hastaId, tani = null, onSaved = null) {
  _overlay?.remove();
  _overlay = document.createElement('div');
  _overlay.className = 'modal-overlay';

  const seviyeler = ['kritik', 'izlem', 'stabil'];

  _overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">${tani ? 'Tanı Düzenle' : 'Tanı Ekle'}</span>
        <button class="modal-close" id="tfClose">✕</button>
      </div>

      <div class="form-group">
        <label class="form-label">Tanım <span style="color:var(--danger)">*</span></label>
        <input type="text" id="tfTanim" class="form-control"
               placeholder="HFrEF EF %25-30" value="${tani?.tanim || ''}">
      </div>

      <div class="form-group">
        <label class="form-label">Şiddet <span style="color:var(--danger)">*</span></label>
        <div class="btn-group" id="tfSevGrp">
          ${seviyeler.map(s => `
            <button class="btn-option ${s} ${(tani?.seviye || 'izlem') === s ? 'active' : ''}"
                    data-v="${s}">${_seviyeLabel(s)}</button>
          `).join('')}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" style="font-weight:500;color:var(--text-secondary)">ICD-10 Kodu</label>
        <input type="text" id="tfIcd" class="form-control"
               placeholder="I50.21" value="${tani?.icd || ''}" maxlength="10">
      </div>

      <div id="tfErr" class="login-error" style="display:none"></div>

      <div class="modal-footer">
        <button class="btn btn-secondary" id="tfIptal">İptal</button>
        <button class="btn btn-primary" id="tfKaydet">Kaydet</button>
      </div>
    </div>
  `;
  document.body.appendChild(_overlay);
  requestAnimationFrame(() => _overlay.classList.add('open'));

  _overlay.addEventListener('click', e => { if (e.target === _overlay) _close(); });
  document.getElementById('tfClose').addEventListener('click', _close);
  document.getElementById('tfIptal').addEventListener('click', _close);

  document.querySelectorAll('#tfSevGrp .btn-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#tfSevGrp .btn-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.getElementById('tfKaydet').addEventListener('click', async () => {
    const tanim   = document.getElementById('tfTanim').value.trim();
    const seviye  = document.querySelector('#tfSevGrp .btn-option.active')?.dataset.v;
    const icd     = document.getElementById('tfIcd').value.trim();
    const btn     = document.getElementById('tfKaydet');

    if (!tanim) { _showErr('Tanım zorunludur.'); document.getElementById('tfTanim').classList.add('error'); return; }

    btn.disabled = true;
    btn.textContent = 'Kaydediliyor…';
    try {
      await saveTani({ ...(tani || {}), hastaId, tanim, seviye: seviye || 'izlem', icd });
      showToast(tani ? 'Tanı güncellendi' : 'Tanı eklendi', 'success');
      onSaved?.();
      _close();
    } catch {
      btn.disabled = false;
      btn.textContent = 'Kaydet';
      _showErr('Kayıt başarısız.');
    }
  });

  setTimeout(() => document.getElementById('tfTanim')?.focus(), 320);
}

function _close() {
  _overlay?.classList.remove('open');
  setTimeout(() => { _overlay?.remove(); _overlay = null; }, 300);
}

function _showErr(msg) {
  const el = document.getElementById('tfErr');
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

function _seviyeLabel(s) {
  return { kritik: '⚠ Kritik', izlem: '👁 İzlem', stabil: '✓ Stabil' }[s] || s;
}
