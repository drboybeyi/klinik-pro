import { saveIlac } from '../db.js';
import { showToast } from './toast.js';

let _overlay = null;

export function openIlacForm(hastaId, ilac = null, onSaved = null) {
  _overlay?.remove();
  _overlay = document.createElement('div');
  _overlay.className = 'modal-overlay';

  const durumlar = ['aktif', 'kesilecek', 'planli'];

  _overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">${ilac ? 'İlaç Düzenle' : 'İlaç Ekle'}</span>
        <button class="modal-close" id="ifClose">✕</button>
      </div>

      <div class="form-group">
        <label class="form-label">İlaç Adı <span style="color:var(--danger)">*</span></label>
        <input type="text" id="ifAd" class="form-control"
               placeholder="Entresto" value="${ilac?.ad || ''}">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group">
          <label class="form-label" style="font-weight:500;color:var(--text-secondary)">Doz</label>
          <input type="text" id="ifDoz" class="form-control"
                 placeholder="24/26 mg" value="${ilac?.doz || ''}">
        </div>
        <div class="form-group">
          <label class="form-label" style="font-weight:500;color:var(--text-secondary)">Sıklık</label>
          <input type="text" id="ifSiklik" class="form-control"
                 placeholder="2x1" value="${ilac?.siklik || ''}">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" style="font-weight:500;color:var(--text-secondary)">Endikasyon</label>
        <input type="text" id="ifEndikasyon" class="form-control"
               placeholder="HFrEF" value="${ilac?.endikasyon || ''}">
      </div>

      <div class="form-group">
        <label class="form-label">Durum <span style="color:var(--danger)">*</span></label>
        <div class="btn-group" id="ifDurumGrp">
          ${durumlar.map(d => `
            <button class="btn-option ${(ilac?.durum || 'aktif') === d ? 'active' : ''}"
                    data-v="${d}">${_durumLabel(d)}</button>
          `).join('')}
        </div>
      </div>

      <div id="ifErr" class="login-error" style="display:none"></div>

      <div class="modal-footer">
        <button class="btn btn-secondary" id="ifIptal">İptal</button>
        <button class="btn btn-primary" id="ifKaydet">Kaydet</button>
      </div>
    </div>
  `;
  document.body.appendChild(_overlay);
  requestAnimationFrame(() => _overlay.classList.add('open'));

  _overlay.addEventListener('click', e => { if (e.target === _overlay) _close(); });
  document.getElementById('ifClose').addEventListener('click', _close);
  document.getElementById('ifIptal').addEventListener('click', _close);

  document.querySelectorAll('#ifDurumGrp .btn-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ifDurumGrp .btn-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.getElementById('ifKaydet').addEventListener('click', async () => {
    const ad         = document.getElementById('ifAd').value.trim();
    const doz        = document.getElementById('ifDoz').value.trim();
    const siklik     = document.getElementById('ifSiklik').value.trim();
    const endikasyon = document.getElementById('ifEndikasyon').value.trim();
    const durum      = document.querySelector('#ifDurumGrp .btn-option.active')?.dataset.v || 'aktif';
    const btn        = document.getElementById('ifKaydet');

    if (!ad) { _showErr('İlaç adı zorunludur.'); document.getElementById('ifAd').classList.add('error'); return; }

    btn.disabled = true;
    btn.textContent = 'Kaydediliyor…';
    try {
      await saveIlac({ ...(ilac || {}), hastaId, ad, doz, siklik, endikasyon, durum });
      showToast(ilac ? 'İlaç güncellendi' : 'İlaç eklendi', 'success');
      onSaved?.();
      _close();
    } catch {
      btn.disabled = false;
      btn.textContent = 'Kaydet';
      _showErr('Kayıt başarısız.');
    }
  });

  setTimeout(() => document.getElementById('ifAd')?.focus(), 320);
}

function _close() {
  _overlay?.classList.remove('open');
  setTimeout(() => { _overlay?.remove(); _overlay = null; }, 300);
}

function _showErr(msg) {
  const el = document.getElementById('ifErr');
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

function _durumLabel(d) {
  return { aktif: '✓ Aktif', kesilecek: '✕ Kesilecek', planli: '+ Planlı' }[d] || d;
}
