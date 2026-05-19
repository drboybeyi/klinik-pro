import { saveTetkik, uploadTetkikDosya, deleteTetkikDosya } from '../db.js';
import { showToast } from './toast.js';
import { bugun } from '../utils.js';

const TUR_LISTE = [
  { v: 'kan',         label: '🩸 Kan' },
  { v: 'idrar',       label: '🧫 İdrar' },
  { v: 'usg',         label: '📡 USG' },
  { v: 'mr',          label: '🧲 MR' },
  { v: 'bt',          label: '🩻 BT' },
  { v: 'rontgen',     label: '☢️ Röntgen' },
  { v: 'ekg',         label: '💓 EKG' },
  { v: 'echo',        label: '💗 Eko' },
  { v: 'endoskopi',   label: '🔬 Endoskopi' },
  { v: 'kolonoskopi', label: '🔬 Kolonoskopi' },
  { v: 'patoloji',    label: '🧬 Patoloji' },
  { v: 'diger',       label: '📋 Diğer' }
];

const ALLOWED_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic',
  'application/pdf'
];
const MAX_SIZE  = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;

let _overlay = null;

export function openTetkikForm(hastaId, tetkik = null, onSaved = null) {
  _overlay?.remove();

  // Düzenleme modunda mevcut dosyaları kopyala (silme işareti için ayrı bir Set tutarız)
  const mevcutDosyalar = (tetkik?.dosyalar || []).slice();
  const silinecekIdx   = new Set();

  _overlay = document.createElement('div');
  _overlay.className = 'modal-overlay';
  _overlay.innerHTML = `
    <div class="modal-box" style="max-height:92vh;overflow-y:auto">
      <div class="modal-header">
        <span class="modal-title">${tetkik ? 'Tetkiki Düzenle' : 'Yeni Tetkik'}</span>
        <button class="modal-close" id="tfClose">✕</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group">
          <label class="form-label">Tarih <span style="color:var(--danger)">*</span></label>
          <input type="date" id="tfTarih" class="form-control" value="${tetkik?.tarih || bugun()}">
        </div>
        <div class="form-group">
          <label class="form-label">Tür</label>
          <select id="tfTur" class="form-control">
            ${TUR_LISTE.map(t =>
              `<option value="${t.v}" ${(tetkik?.tur || 'kan') === t.v ? 'selected' : ''}>${t.label}</option>`
            ).join('')}
          </select>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Başlık <span style="color:var(--danger)">*</span></label>
        <input type="text" id="tfBaslik" class="form-control"
               placeholder="Üst abdomen kontrastlı MR" value="${tetkik?.baslik || ''}">
      </div>

      <div class="form-group">
        <label class="form-label" style="font-weight:500;color:var(--text-secondary)">Klinik özet / değerler</label>
        <textarea id="tfOzet" class="form-control" rows="5"
                  placeholder="Lab değerleri, radyolojik bulgular, klinik yorum…"
                  style="resize:vertical">${tetkik?.ozet || ''}</textarea>
      </div>

      <div class="form-group">
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:14px">
          <input type="checkbox" id="tfKritik" ${tetkik?.kritik ? 'checked' : ''}
                 style="width:18px;height:18px;cursor:pointer">
          <span>🔴 Kritik (listede en üstte göster)</span>
        </label>
      </div>

      ${mevcutDosyalar.length ? `
        <div class="form-group">
          <label class="form-label" style="font-weight:500;color:var(--text-secondary)">Mevcut dosyalar</label>
          <div id="tfMevcutListe"></div>
        </div>
      ` : ''}

      <div class="form-group">
        <label class="form-label" style="font-weight:500;color:var(--text-secondary)">
          Dosya ekle <span style="font-weight:400;font-size:11px">(PDF/JPG/PNG/WEBP — max 10 MB, ${MAX_FILES} dosya)</span>
        </label>
        <input type="file" id="tfDosya" multiple
               accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,application/pdf"
               style="font-size:13px;width:100%">
      </div>

      <div id="tfProgress"
           style="display:none;font-size:13px;color:var(--text-secondary);margin-bottom:10px">
        <span id="tfProgressLabel">Yükleniyor</span>… <span id="tfProgressVal">0%</span>
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

  // Mevcut dosyaları render et + silme delegasyonu
  const renderMevcut = () => {
    const wrap = document.getElementById('tfMevcutListe');
    if (!wrap) return;
    wrap.innerHTML = mevcutDosyalar.map((d, i) => {
      const silinecek = silinecekIdx.has(i);
      return `
        <div class="dosya-item ${silinecek ? 'silinecek' : ''}" data-i="${i}">
          <span class="dosya-meta">
            <span class="dosya-icon">${_dosyaIcon(d.tip)}</span>
            <a class="dosya-ad" href="${d.url}" target="_blank" rel="noopener">${d.ad}</a>
            <span class="dosya-boyut">${_formatBoyut(d.boyut)}</span>
          </span>
          <button class="icon-btn ${silinecek ? '' : 'danger'}" data-toggle-dosya="${i}">
            ${silinecek ? '↩' : '🗑️'}
          </button>
        </div>
      `;
    }).join('');
  };
  renderMevcut();

  _overlay.addEventListener('click', e => {
    const btn = e.target.closest('[data-toggle-dosya]');
    if (!btn) return;
    const i = Number(btn.dataset.toggleDosya);
    if (silinecekIdx.has(i)) silinecekIdx.delete(i);
    else                     silinecekIdx.add(i);
    renderMevcut();
  });

  document.getElementById('tfKaydet').addEventListener('click', async () => {
    const tarih  = document.getElementById('tfTarih').value;
    const tur    = document.getElementById('tfTur').value;
    const baslik = document.getElementById('tfBaslik').value.trim();
    const ozet   = document.getElementById('tfOzet').value.trim();
    const kritik = document.getElementById('tfKritik').checked;
    const files  = Array.from(document.getElementById('tfDosya').files || []);
    const btn    = document.getElementById('tfKaydet');

    if (!tarih)  return _showErr('Tarih zorunludur.');
    if (!baslik) return _showErr('Başlık zorunludur.');

    // Dosya validasyonu
    const kalacakSayi  = mevcutDosyalar.filter((_, i) => !silinecekIdx.has(i)).length;
    const toplamSayi   = kalacakSayi + files.length;
    if (toplamSayi > MAX_FILES) return _showErr(`En fazla ${MAX_FILES} dosya olabilir (şu an ${toplamSayi}).`);

    for (const f of files) {
      if (!ALLOWED_TYPES.includes(f.type)) {
        return _showErr(`"${f.name}" desteklenmeyen bir dosya tipi (${f.type || 'bilinmiyor'}).`);
      }
      if (f.size > MAX_SIZE) {
        return _showErr(`"${f.name}" 10 MB sınırını aşıyor (${_formatBoyut(f.size)}).`);
      }
    }

    btn.disabled = true;
    btn.textContent = 'Kaydediliyor…';
    _showErr('');

    try {
      // 1) Yeni dosyaları sırayla yükle (Storage)
      const yeniYuklenenler = [];
      if (files.length) {
        const prog = document.getElementById('tfProgress');
        const progLabel = document.getElementById('tfProgressLabel');
        const progVal   = document.getElementById('tfProgressVal');
        prog.style.display = 'block';

        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          progLabel.textContent = `Yükleniyor (${i + 1}/${files.length}) ${f.name}`;
          progVal.textContent   = '0%';

          const meta = await uploadTetkikDosya(f, hastaId, pct => {
            progVal.textContent = `${Math.round(pct)}%`;
          });
          yeniYuklenenler.push(meta);
        }
        prog.style.display = 'none';
      }

      // 2) İşaretli mevcut dosyaları Storage'tan sil (best-effort)
      const silinecekDosyalar = mevcutDosyalar.filter((_, i) => silinecekIdx.has(i));
      for (const d of silinecekDosyalar) {
        if (d.path) {
          try { await deleteTetkikDosya(d.path); } catch {}
        }
      }

      // 3) Final dosyalar dizisi
      const finalDosyalar = [
        ...mevcutDosyalar.filter((_, i) => !silinecekIdx.has(i)),
        ...yeniYuklenenler
      ];

      // 4) RTDB kaydet
      await saveTetkik({
        ...(tetkik || {}),
        hastaId,
        tarih,
        tur,
        baslik,
        ozet,
        kritik,
        dosyalar: finalDosyalar
      });

      showToast(tetkik ? 'Tetkik güncellendi' : 'Tetkik eklendi', 'success');
      onSaved?.();
      _close();
    } catch (e) {
      console.error('Tetkik kaydı başarısız:', e);
      btn.disabled = false;
      btn.textContent = 'Kaydet';
      document.getElementById('tfProgress').style.display = 'none';
      _showErr('Kayıt başarısız. Tekrar deneyin.');
    }
  });
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

function _formatBoyut(b) {
  if (!b && b !== 0) return '';
  if (b < 1024)         return `${b} B`;
  if (b < 1024 * 1024)  return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function _dosyaIcon(tip) {
  if (tip?.startsWith('image/'))      return '🖼️';
  if (tip === 'application/pdf')      return '📄';
  return '📎';
}
