import { saveNot } from '../db.js';
import { showToast } from './toast.js';
import { bugun } from '../utils.js';

let _overlay = null;

export function openNotForm(hastaId, not = null, onSaved = null) {
  _overlay?.remove();
  _overlay = document.createElement('div');
  _overlay.className = 'modal-overlay';

  const tipler = ['vizit', 'telefon', 'lab'];

  _overlay.innerHTML = `
    <div class="modal-box" style="max-height:92vh;overflow-y:auto">
      <div class="modal-header">
        <span class="modal-title">${not ? 'Notu Düzenle' : 'Yeni SOAP Notu'}</span>
        <button class="modal-close" id="nfClose">✕</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group">
          <label class="form-label">Tarih <span style="color:var(--danger)">*</span></label>
          <input type="date" id="nfTarih" class="form-control"
                 value="${not?.tarih || bugun()}">
        </div>
        <div class="form-group">
          <label class="form-label">Tip</label>
          <div class="btn-group" id="nfTipGrp">
            ${tipler.map(t => `
              <button class="btn-option ${(not?.tip || 'vizit') === t ? 'active' : ''}"
                      data-v="${t}">${_tipLabel(t)}</button>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">S — <span style="font-weight:400">Subjektif</span></label>
        <textarea id="nfS" class="form-control" rows="3"
                  placeholder="Hasta yakınması, anamnez…" style="resize:vertical">${not?.S || ''}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">O — <span style="font-weight:400">Objektif</span></label>
        <textarea id="nfO" class="form-control" rows="3"
                  placeholder="Muayene, vital bulgular, lab…" style="resize:vertical">${not?.O || ''}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">A — <span style="font-weight:400">Değerlendirme</span></label>
        <textarea id="nfA" class="form-control" rows="3"
                  placeholder="Tanı, klinik yorum…" style="resize:vertical">${not?.A || ''}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">P — <span style="font-weight:400">Plan</span></label>
        <textarea id="nfP" class="form-control" rows="3"
                  placeholder="Tedavi planı, takip, tetkik…" style="resize:vertical">${not?.P || ''}</textarea>
      </div>

      <div id="nfErr" class="login-error" style="display:none"></div>

      <div class="modal-footer">
        <button class="btn btn-secondary" id="nfIptal">İptal</button>
        <button class="btn btn-primary" id="nfKaydet">Kaydet</button>
      </div>
    </div>
  `;
  document.body.appendChild(_overlay);
  requestAnimationFrame(() => _overlay.classList.add('open'));

  _overlay.addEventListener('click', e => { if (e.target === _overlay) _close(); });
  document.getElementById('nfClose').addEventListener('click', _close);
  document.getElementById('nfIptal').addEventListener('click', _close);

  document.querySelectorAll('#nfTipGrp .btn-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#nfTipGrp .btn-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.getElementById('nfKaydet').addEventListener('click', async () => {
    const tarih = document.getElementById('nfTarih').value;
    const tip   = document.querySelector('#nfTipGrp .btn-option.active')?.dataset.v || 'vizit';
    const S     = document.getElementById('nfS').value.trim();
    const O     = document.getElementById('nfO').value.trim();
    const A     = document.getElementById('nfA').value.trim();
    const P     = document.getElementById('nfP').value.trim();
    const btn   = document.getElementById('nfKaydet');

    if (!tarih) { _showErr('Tarih zorunludur.'); return; }
    if (!S && !O && !A && !P) { _showErr('En az bir alan doldurulmalıdır.'); return; }

    btn.disabled = true;
    btn.textContent = 'Kaydediliyor…';
    try {
      await saveNot({ ...(not || {}), hastaId, tarih, tip, S, O, A, P });
      showToast(not ? 'Not güncellendi' : 'Not eklendi', 'success');
      onSaved?.();
      _close();
    } catch {
      btn.disabled = false;
      btn.textContent = 'Kaydet';
      _showErr('Kayıt başarısız.');
    }
  });
}

function _close() {
  _overlay?.classList.remove('open');
  setTimeout(() => { _overlay?.remove(); _overlay = null; }, 300);
}

function _showErr(msg) {
  const el = document.getElementById('nfErr');
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

function _tipLabel(t) {
  return { vizit: '🏥 Vizit', telefon: '📞 Tel', lab: '🔬 Lab' }[t] || t;
}
