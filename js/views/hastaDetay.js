import { getState, subscribe } from '../state.js';
import {
  deleteHastaWithRelated, saveAlerji, deleteAlerji,
  deleteTani, deleteIlac, deleteNot, deleteTetkik, updateHasta
} from '../db.js';
import { openHastaForm }   from '../components/hastaForm.js';
import { openTaniForm }    from '../components/taniForm.js';
import { openIlacForm }    from '../components/ilacForm.js';
import { openNotForm }     from '../components/notForm.js';
import { openTetkikForm }  from '../components/tetkikForm.js';
import { confirm }         from '../components/modal.js';
import { showToast }       from '../components/toast.js';
import { formatTarih }     from '../utils.js';
import { renderAiPanel, attachAiListeners, resetAi, refreshAiGecmis } from '../components/aiSorgu.js';

const SEMPTOM_FIELDS = [
  { key: 'sikayetler', label: 'Başvuru Şikayetleri', icon: '📋' },
  { key: 'hikaye',     label: 'Hikaye (HPI)',        icon: '📖' },
  { key: 'ozgecmis',   label: 'Özgeçmiş',            icon: '📜' },
  { key: 'soygecmis',  label: 'Soygeçmiş',           icon: '👪' },
  { key: 'fmBulgular', label: 'Fizik Muayene',       icon: '🩺' }
];

const METIN_ALAN_MAP = new Map(SEMPTOM_FIELDS.map(f => [f.key, f]));

// Tetkik türü → kategori + etiket (badge rengi tur-{kat} sınıfı ile)
const TETKIK_TUR = {
  kan:         { label: '🩸 Kan',         kat: 'lab'    },
  idrar:       { label: '🧫 İdrar',       kat: 'lab'    },
  usg:         { label: '📡 USG',         kat: 'rad'    },
  mr:          { label: '🧲 MR',          kat: 'rad'    },
  bt:          { label: '🩻 BT',          kat: 'rad'    },
  rontgen:     { label: '☢️ Röntgen',     kat: 'rad'    },
  ekg:         { label: '💓 EKG',         kat: 'cardio' },
  echo:        { label: '💗 Eko',         kat: 'cardio' },
  endoskopi:   { label: '🔬 Endoskopi',   kat: 'gastro' },
  kolonoskopi: { label: '🔬 Kolonoskopi', kat: 'gastro' },
  patoloji:    { label: '🧬 Patoloji',    kat: 'pato'   },
  diger:       { label: '📋 Diğer',       kat: 'diger'  }
};

let _overlay  = null;
let _hastaId  = null;
let _aktifTab = 'ozet';
let _unsubs   = [];

export function openHastaDetay(hastaId) {
  _hastaId  = hastaId;
  _aktifTab = 'ozet';
  _mount();
}

// --- Mount / Unmount ---

function _mount() {
  _unmount();

  _overlay = document.createElement('div');
  _overlay.className = 'hasta-detay-overlay';
  document.body.appendChild(_overlay);

  _buildAll();
  requestAnimationFrame(() => _overlay.classList.add('open'));

  _unsubs = [
    subscribe('hastalar',  () => {
      _refreshHeader();
      _refreshOzetTab();
      _refreshMetinTab('hdPanelSemptomlar', SEMPTOM_FIELDS);
    }),
    subscribe('tanilar',   () => _refreshSection('hdTanilarList',  _renderTanilarList)),
    subscribe('ilaclar',   () => _refreshSection('hdIlaclarList',  _renderIlaclarList)),
    subscribe('alerjiler', () => _refreshSection('hdAlerjiList',   _renderAlerjiList)),
    subscribe('notlar',    () => _refreshSection('hdNotlarList',   _renderNotlarList)),
    subscribe('tetkikler', () => _refreshSection('hdTetkiklerList', _renderTetkiklerList)),
    subscribe('aiSorgulari', () => _refreshAiTab())
  ];
}

function _unmount() {
  _unsubs.forEach(fn => fn());
  _unsubs = [];
  _overlay?.remove();
  _overlay = null;
  resetAi();
}

function _close() {
  _overlay?.classList.remove('open');
  setTimeout(_unmount, 290);
}

// --- Helpers ---

function _hasta()         { return (getState('hastalar') || {})[_hastaId] || null; }
function _items(col)      { return Object.values(getState(col) || {}).filter(i => i.hastaId === _hastaId); }
function _tanilar()       { return _items('tanilar').sort((a,b) => _sevOrd(a.seviye) - _sevOrd(b.seviye)); }
function _ilaclar()       { return _items('ilaclar'); }
function _alerjiler()     { return _items('alerjiler'); }
function _notlar()        { return _items('notlar').sort((a,b) => (b.tarih||'').localeCompare(a.tarih||'')); }
function _tetkikler()     {
  // Kritikler en üstte; sonra tarih yeni → eski
  return _items('tetkikler').sort((a, b) => {
    if (!!b.kritik - !!a.kritik) return !!b.kritik - !!a.kritik;
    return (b.tarih || '').localeCompare(a.tarih || '');
  });
}
function _sevOrd(s)       { return {kritik:0,izlem:1,stabil:2}[s] ?? 1; }

// --- Full build ---

function _buildAll() {
  const hasta = _hasta();
  if (!hasta) { _close(); return; }

  _overlay.innerHTML = `
    <div class="hasta-detay-header" id="hdHeader">
      <button class="hasta-detay-geri" id="hdGeri">←</button>
      <span class="hasta-detay-baslik" id="hdBaslik">${hasta.ad}</span>
      <div class="dropdown" id="hdDropdown">
        <button class="hasta-detay-menu-btn" id="hdMenuBtn">···</button>
        <div class="dropdown-menu">
          <div class="dropdown-item" id="hdDuzenle">✏️ Düzenle</div>
          <div class="dropdown-item danger" id="hdSil">🗑️ Sil</div>
        </div>
      </div>
    </div>

    <div class="top-tabs" id="hdTabs">
      <div class="top-tab ${_aktifTab==='ozet'       ? 'active':''}" data-tab="ozet">Özet</div>
      <div class="top-tab ${_aktifTab==='semptomlar' ? 'active':''}" data-tab="semptomlar">Semptomlar</div>
      <div class="top-tab ${_aktifTab==='tetkikler'  ? 'active':''}" data-tab="tetkikler">Tetkikler</div>
      <div class="top-tab ${_aktifTab==='notlar'     ? 'active':''}" data-tab="notlar">Notlar</div>
      <div class="top-tab ${_aktifTab==='ai'         ? 'active':''}" data-tab="ai">AI</div>
    </div>

    <div class="hasta-detay-body">
      <div id="hdPanelOzet"       style="display:${_aktifTab==='ozet'       ?'block':'none'}">${_renderOzetPanel(hasta)}</div>
      <div id="hdPanelSemptomlar" style="display:${_aktifTab==='semptomlar' ?'block':'none'}">${_renderMetinPanel(hasta, SEMPTOM_FIELDS)}</div>
      <div id="hdPanelTetkikler"  style="display:${_aktifTab==='tetkikler'  ?'block':'none'}">${_renderTetkiklerPanel()}</div>
      <div id="hdPanelNotlar"     style="display:${_aktifTab==='notlar'     ?'block':'none'}">${_renderNotlarPanel()}</div>
      <div id="hdPanelAi"         style="display:${_aktifTab==='ai'         ?'block':'none'}">${renderAiPanel(_hastaId)}</div>
    </div>
  `;

  _attachListeners();
  if (_aktifTab === 'ai') attachAiListeners(_hastaId);
}

// --- Tab panels ---

function _renderOzetPanel(hasta) {
  return `
    <div class="view-container">
      <div class="demografi-grid">
        <div class="demografi-item">
          <div class="demografi-label">Yaş / Cinsiyet</div>
          <div class="demografi-value">${hasta.yas} ${hasta.cinsiyet==='E'?'♂':'♀'}</div>
        </div>
        ${hasta.mrn ? `<div class="demografi-item">
          <div class="demografi-label">MRN</div>
          <div class="demografi-value">${hasta.mrn}</div>
        </div>` : ''}
        ${hasta.telefon ? `<div class="demografi-item">
          <div class="demografi-label">Telefon</div>
          <div class="demografi-value" style="font-size:13px">${hasta.telefon}</div>
        </div>` : ''}
      </div>

      ${hasta.klinikOzet ? `<div class="klinik-ozet-block">${hasta.klinikOzet}</div>` : ''}

      <div class="card" style="margin-bottom:12px">
        <div class="section-header">
          <span class="section-title">Aktif Tanılar</span>
          <button class="btn btn-secondary" id="hdTaniEkle"
                  style="min-height:30px;padding:5px 12px;font-size:12px">+ Tanı</button>
        </div>
        <div id="hdTanilarList">${_renderTanilarList()}</div>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="section-header">
          <span class="section-title">İlaçlar</span>
          <button class="btn btn-secondary" id="hdIlacEkle"
                  style="min-height:30px;padding:5px 12px;font-size:12px">+ İlaç</button>
        </div>
        <div id="hdIlaclarList">${_renderIlaclarList()}</div>
      </div>

      <div class="card">
        <div class="section-header">
          <span class="section-title">Alerjiler</span>
          <button class="btn btn-secondary" id="hdAlerjiEkle"
                  style="min-height:30px;padding:5px 12px;font-size:12px">+ Alerji</button>
        </div>
        <div id="hdAlerjiList">${_renderAlerjiList()}</div>
      </div>
    </div>
  `;
}

function _renderMetinPanel(hasta, fields) {
  return `
    <div class="view-container">
      ${fields.map(f => _renderMetinKart(f, hasta?.[f.key] || '')).join('')}
    </div>
  `;
}

function _renderMetinKart(field, value) {
  const v = (value || '').trim();
  const dolu = v.length > 0;
  const kisaltilmis = dolu && v.length > 200 ? v.slice(0, 200).trim() + '…' : v;
  const linkLabel = dolu ? 'Tamamını Gör / Düzenle' : 'Düzenle';
  return `
    <div class="card" style="margin-bottom:12px">
      <div class="section-header">
        <span class="section-title">${field.icon} ${field.label}</span>
        <button class="btn btn-secondary" data-edit-metin="${field.key}"
                style="min-height:30px;padding:5px 12px;font-size:12px">${linkLabel}</button>
      </div>
      ${dolu
        ? `<div style="padding:8px 0;font-size:14px;color:var(--text-primary);line-height:1.5;white-space:pre-wrap">${kisaltilmis}</div>`
        : `<div style="padding:12px 0;color:var(--text-secondary);font-size:13px;text-align:center">Henüz girilmedi</div>`
      }
    </div>
  `;
}

function _renderNotlarPanel() {
  return `
    <div class="view-container">
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
        <button class="btn btn-primary" id="hdNotEkle"
                style="min-height:36px;padding:8px 16px;font-size:13px">+ Yeni Not</button>
      </div>
      <div id="hdNotlarList">${_renderNotlarList()}</div>
    </div>
  `;
}

function _renderTetkiklerPanel() {
  return `
    <div class="view-container">
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
        <button class="btn btn-primary" id="hdTetkikEkle"
                style="min-height:36px;padding:8px 16px;font-size:13px">+ Yeni Tetkik</button>
      </div>
      <div id="hdTetkiklerList">${_renderTetkiklerList()}</div>
    </div>
  `;
}

// --- List renderers ---

function _renderTanilarList() {
  const list = _tanilar();
  if (!list.length) return _emptyRow('Tanı eklenmemiş');
  return list.map(t => `
    <div class="klinik-item">
      <div class="klinik-item-body">
        <div class="klinik-item-ad">${t.tanim}</div>
        <div class="klinik-item-sub">
          <span class="badge seviye-${t.seviye}">${t.seviye}</span>
          ${t.icd ? `<span style="font-size:11px;color:var(--text-secondary)">${t.icd}</span>` : ''}
        </div>
      </div>
      <div class="klinik-item-actions">
        <button class="icon-btn"        data-edit-tani="${t.id}">✏️</button>
        <button class="icon-btn danger" data-del-tani="${t.id}">🗑️</button>
      </div>
    </div>
  `).join('');
}

function _renderIlaclarList() {
  const list = _ilaclar();
  if (!list.length) return _emptyRow('İlaç eklenmemiş');
  return list.map(i => `
    <div class="klinik-item">
      <div class="klinik-item-body">
        <div class="klinik-item-ad">
          ${i.ad}
          ${i.doz    ? `<span style="font-weight:400;color:var(--text-secondary)"> ${i.doz}</span>` : ''}
          ${i.siklik ? `<span style="font-weight:400;color:var(--text-secondary)"> · ${i.siklik}</span>` : ''}
        </div>
        <div class="klinik-item-sub">
          <span class="badge durum-${i.durum}">${_durumLabel(i.durum)}</span>
          ${i.endikasyon ? `<span style="font-size:11px;color:var(--text-secondary)">${i.endikasyon}</span>` : ''}
        </div>
      </div>
      <div class="klinik-item-actions">
        <button class="icon-btn"        data-edit-ilac="${i.id}">✏️</button>
        <button class="icon-btn danger" data-del-ilac="${i.id}">🗑️</button>
      </div>
    </div>
  `).join('');
}

function _renderAlerjiList() {
  const list = _alerjiler();
  if (!list.length) return _emptyRow('Kayıtlı alerji yok');
  return list.map(a => `
    <div class="klinik-item">
      <div class="klinik-item-body">
        <div class="klinik-item-ad">${a.ajan}</div>
        ${a.reaksiyon ? `<div class="klinik-item-sub">${a.reaksiyon}</div>` : ''}
      </div>
      <div class="klinik-item-actions">
        <button class="icon-btn danger" data-del-alerji="${a.id}">🗑️</button>
      </div>
    </div>
  `).join('');
}

function _renderTetkiklerList() {
  const list = _tetkikler();
  if (!list.length) return `
    <div class="empty-state" style="padding:40px 0">
      <div class="empty-icon">🧪</div>
      <div class="empty-title">Henüz tetkik yok</div>
      <div class="empty-sub">Lab, görüntüleme, EKG vb. kayıtlar burada görünecek</div>
    </div>
  `;
  return list.map(t => {
    const meta = TETKIK_TUR[t.tur] || TETKIK_TUR.diger;
    const dosyalar = t.dosyalar || [];
    return `
      <div class="tetkik-kart ${t.kritik ? 'kritik' : ''}" data-tetkik-id="${t.id}">
        <div class="tetkik-kart-header">
          <div class="tetkik-kart-meta">
            <span class="tetkik-kart-tarih">${formatTarih(t.tarih)}</span>
            <span class="badge tur-${meta.kat}">${meta.label}</span>
            ${t.kritik ? '<span class="kritik-flag" title="Kritik">🔴</span>' : ''}
            ${dosyalar.length ? `<span class="tetkik-dosya-sayi" title="${dosyalar.length} dosya">📎 ${dosyalar.length}</span>` : ''}
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <button class="icon-btn"        data-edit-tetkik="${t.id}" title="Düzenle">✏️</button>
            <button class="icon-btn danger" data-del-tetkik="${t.id}"  title="Sil">🗑️</button>
            <span class="soap-chevron">›</span>
          </div>
        </div>
        <div class="tetkik-kart-baslik">${t.baslik || ''}</div>
        <div class="tetkik-kart-body">
          ${t.ozet ? `<div class="tetkik-ozet">${t.ozet}</div>` : ''}
          ${dosyalar.length ? `
            <div class="tetkik-dosyalar">
              ${dosyalar.map(d => `
                <a class="tetkik-dosya-link" href="${d.url}" target="_blank" rel="noopener">
                  <span class="dosya-icon">${_dosyaIcon(d.tip)}</span>
                  <span class="dosya-ad">${d.ad}</span>
                  <span class="dosya-boyut">${_formatBoyut(d.boyut)}</span>
                </a>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function _dosyaIcon(tip) {
  if (tip?.startsWith('image/')) return '🖼️';
  if (tip === 'application/pdf') return '📄';
  return '📎';
}

function _formatBoyut(b) {
  if (!b && b !== 0) return '';
  if (b < 1024)        return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function _renderNotlarList() {
  const list = _notlar();
  if (!list.length) return `
    <div class="empty-state" style="padding:40px 0">
      <div class="empty-icon">📝</div>
      <div class="empty-title">Henüz not yok</div>
      <div class="empty-sub">SOAP notları burada görünecek</div>
    </div>
  `;
  return list.map(n => `
    <div class="soap-kart" data-not-id="${n.id}">
      <div class="soap-kart-header">
        <div class="soap-kart-meta">
          <span class="soap-kart-tarih">${formatTarih(n.tarih)}</span>
          <span class="badge badge-medical">${_tipLabel(n.tip)}</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="icon-btn danger" data-del-not="${n.id}" style="font-size:12px">🗑️</button>
          <span class="soap-chevron">›</span>
        </div>
      </div>
      <div class="soap-kart-body">
        ${n.S ? `<div class="soap-bolum"><div class="soap-bolum-label">S — Subjektif</div><div class="soap-bolum-icerik">${n.S}</div></div>` : ''}
        ${n.O ? `<div class="soap-bolum"><div class="soap-bolum-label">O — Objektif</div><div class="soap-bolum-icerik">${n.O}</div></div>` : ''}
        ${n.A ? `<div class="soap-bolum"><div class="soap-bolum-label">A — Değerlendirme</div><div class="soap-bolum-icerik">${n.A}</div></div>` : ''}
        ${n.P ? `<div class="soap-bolum"><div class="soap-bolum-label">P — Plan</div><div class="soap-bolum-icerik">${n.P}</div></div>` : ''}
      </div>
    </div>
  `).join('');
}

// --- Attach all listeners ---

function _attachListeners() {
  // Geri
  document.getElementById('hdGeri')?.addEventListener('click', _close);

  // Tabs
  _overlay.querySelectorAll('.top-tab').forEach(tab => {
    tab.addEventListener('click', () => _switchTab(tab.dataset.tab));
  });

  // Dropdown toggle
  document.getElementById('hdMenuBtn')?.addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('hdDropdown')?.classList.toggle('open');
  });
  document.addEventListener('click', _closeDropdown);

  // Düzenle / Sil
  document.getElementById('hdDuzenle')?.addEventListener('click', () => {
    document.getElementById('hdDropdown')?.classList.remove('open');
    openHastaForm(_hasta(), () => {});
  });
  document.getElementById('hdSil')?.addEventListener('click', async () => {
    document.getElementById('hdDropdown')?.classList.remove('open');
    const ok = await confirm(`${_hasta()?.ad} silinecek. Tüm tanı, ilaç ve notlar da silinir. Emin misin?`);
    if (!ok) return;
    await deleteHastaWithRelated(_hastaId);
    showToast('Hasta silindi', 'info');
    _close();
  });

  // Ekle butonları
  document.getElementById('hdTaniEkle')?.addEventListener('click', () =>
    openTaniForm(_hastaId, null));
  document.getElementById('hdIlacEkle')?.addEventListener('click', () =>
    openIlacForm(_hastaId, null));
  document.getElementById('hdAlerjiEkle')?.addEventListener('click', () =>
    _openAlerjiForm(null));
  document.getElementById('hdNotEkle')?.addEventListener('click', () =>
    openNotForm(_hastaId, null));

  document.getElementById('hdTetkikEkle')?.addEventListener('click', () =>
    openTetkikForm(_hastaId, null));

  // Event delegation — tanı/ilaç/alerji/not/tetkik edit+delete
  _overlay.addEventListener('click', _handleDelegated);

  // SOAP + tetkik kart toggle (expand/collapse)
  _overlay.addEventListener('click', e => {
    if (e.target.closest('button') || e.target.closest('a')) return;

    const soap = e.target.closest('.soap-kart');
    if (soap && e.target.closest('.soap-kart-header')) {
      soap.classList.toggle('expanded');
      return;
    }
    const tetkik = e.target.closest('.tetkik-kart');
    if (tetkik && e.target.closest('.tetkik-kart-header')) {
      tetkik.classList.toggle('expanded');
    }
  });
}

function _handleDelegated(e) {
  const el = e.target.closest(
    '[data-edit-tani],[data-del-tani],[data-edit-ilac],[data-del-ilac],' +
    '[data-del-alerji],[data-del-not],[data-edit-metin],' +
    '[data-edit-tetkik],[data-del-tetkik]'
  );
  if (!el) return;
  e.stopPropagation();

  if (el.dataset.editTani) {
    const t = _tanilar().find(x => x.id === el.dataset.editTani);
    if (t) openTaniForm(_hastaId, t);
  } else if (el.dataset.delTani) {
    _confirmDelete('tanıyı', () => deleteTani(el.dataset.delTani), 'Tanı silindi');
  } else if (el.dataset.editIlac) {
    const i = _ilaclar().find(x => x.id === el.dataset.editIlac);
    if (i) openIlacForm(_hastaId, i);
  } else if (el.dataset.delIlac) {
    _confirmDelete('ilacı', () => deleteIlac(el.dataset.delIlac), 'İlaç silindi');
  } else if (el.dataset.delAlerji) {
    _confirmDelete('alerjiyi', () => deleteAlerji(el.dataset.delAlerji), 'Alerji silindi');
  } else if (el.dataset.delNot) {
    _confirmDelete('notu', () => deleteNot(el.dataset.delNot), 'Not silindi');
  } else if (el.dataset.editMetin) {
    _openMetinEditor(el.dataset.editMetin);
  } else if (el.dataset.editTetkik) {
    const t = _tetkikler().find(x => x.id === el.dataset.editTetkik);
    if (t) openTetkikForm(_hastaId, t);
  } else if (el.dataset.delTetkik) {
    _confirmDelete('tetkiki', () => deleteTetkik(el.dataset.delTetkik), 'Tetkik silindi');
  }
}

async function _confirmDelete(neyi, fn, msg) {
  const ok = await confirm(`Bu ${neyi} silmek istediğinden emin misin?`);
  if (!ok) return;
  await fn();
  showToast(msg, 'info');
}

function _closeDropdown(e) {
  if (!e.target.closest('#hdDropdown')) {
    document.getElementById('hdDropdown')?.classList.remove('open');
  }
}

// --- Tab switching ---

function _switchTab(tab) {
  _aktifTab = tab;
  _overlay.querySelectorAll('.top-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab));
  ['ozet', 'semptomlar', 'tetkikler', 'notlar', 'ai'].forEach(name => {
    const panel = document.getElementById(`hdPanel${_capitalize(name)}`);
    if (panel) panel.style.display = name === tab ? 'block' : 'none';
  });
  // Re-attach listeners for the newly shown panel
  if (tab === 'ozet')      _attachOzetListeners();
  if (tab === 'notlar')    _attachNotlarListeners();
  if (tab === 'tetkikler') _attachTetkiklerListeners();
  if (tab === 'ai')        attachAiListeners(_hastaId);
}

function _capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// --- Partial refresh helpers ---

function _refreshHeader() {
  const h = _hasta();
  if (!h) return;
  const el = document.getElementById('hdBaslik');
  if (el) el.textContent = h.ad;
}

function _refreshOzetTab() {
  const h = _hasta();
  if (!h) return;
  const panel = document.getElementById('hdPanelOzet');
  if (!panel) return;
  panel.innerHTML = _renderOzetPanel(h);
  _attachOzetListeners();
}

function _refreshMetinTab(panelId, fields) {
  const h = _hasta();
  if (!h) return;
  const panel = document.getElementById(panelId);
  if (!panel) return;
  panel.innerHTML = _renderMetinPanel(h, fields);
}

function _refreshSection(containerId, renderFn) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = renderFn();
}

function _refreshAiTab() {
  // Sadece geçmiş listesini güncelle; textarea, model seçimi, aktif yanıt bozulmasın
  refreshAiGecmis(_hastaId);
}

function _attachOzetListeners() {
  document.getElementById('hdTaniEkle')?.addEventListener('click', () => openTaniForm(_hastaId, null));
  document.getElementById('hdIlacEkle')?.addEventListener('click', () => openIlacForm(_hastaId, null));
  document.getElementById('hdAlerjiEkle')?.addEventListener('click', () => _openAlerjiForm(null));
}

function _attachNotlarListeners() {
  document.getElementById('hdNotEkle')?.addEventListener('click', () => openNotForm(_hastaId, null));
}

function _attachTetkiklerListeners() {
  document.getElementById('hdTetkikEkle')?.addEventListener('click', () => openTetkikForm(_hastaId, null));
}

// --- Inline Alerji Modal ---

function _openAlerjiForm(alerji) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">${alerji ? 'Alerji Düzenle' : 'Alerji Ekle'}</span>
        <button class="modal-close" id="afClose">✕</button>
      </div>
      <div class="form-group">
        <label class="form-label">Ajan <span style="color:var(--danger)">*</span></label>
        <input type="text" id="afAjan" class="form-control"
               placeholder="Penisilin" value="${alerji?.ajan || ''}">
      </div>
      <div class="form-group">
        <label class="form-label" style="font-weight:500;color:var(--text-secondary)">Reaksiyon</label>
        <input type="text" id="afReaksiyon" class="form-control"
               placeholder="Anafilaksi, ürtiker…" value="${alerji?.reaksiyon || ''}">
      </div>
      <div id="afErr" class="login-error" style="display:none"></div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="afIptal">İptal</button>
        <button class="btn btn-primary"   id="afKaydet">Kaydet</button>
      </div>
    </div>
  `;
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('open'));

  const closeAf = () => { ov.classList.remove('open'); setTimeout(() => ov.remove(), 300); };
  ov.addEventListener('click', e => { if (e.target === ov) closeAf(); });
  document.getElementById('afClose').addEventListener('click', closeAf);
  document.getElementById('afIptal').addEventListener('click', closeAf);
  document.getElementById('afKaydet').addEventListener('click', async () => {
    const ajan     = document.getElementById('afAjan').value.trim();
    const reaksiyon = document.getElementById('afReaksiyon').value.trim();
    if (!ajan) { document.getElementById('afErr').textContent = 'Ajan zorunludur.'; document.getElementById('afErr').style.display = 'block'; return; }
    const btn = document.getElementById('afKaydet');
    btn.disabled = true; btn.textContent = 'Kaydediliyor…';
    await saveAlerji({ ...(alerji||{}), hastaId: _hastaId, ajan, reaksiyon });
    showToast(alerji ? 'Alerji güncellendi' : 'Alerji eklendi', 'success');
    closeAf();
  });
  setTimeout(() => document.getElementById('afAjan')?.focus(), 320);
}

// --- Metin alanı editör modal (semptom + tetkik ortak) ---

function _openMetinEditor(fieldKey) {
  const field = METIN_ALAN_MAP.get(fieldKey);
  if (!field) return;
  const hasta = _hasta();
  const currentValue = hasta?.[fieldKey] || '';

  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">${field.icon} ${field.label}</span>
        <button class="modal-close" id="meClose">✕</button>
      </div>
      <div class="form-group">
        <textarea id="meTextarea" class="form-control" rows="10"
                  style="resize:vertical;min-height:220px;font-family:inherit;line-height:1.5"
                  placeholder="${field.label} bilgisini buraya yazın…"></textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="meIptal">İptal</button>
        <button class="btn btn-primary"   id="meKaydet">Kaydet</button>
      </div>
    </div>
  `;
  document.body.appendChild(ov);
  // Textarea içeriği DOM içine string interpolation ile değil, value ile yerleştir (HTML escape ihtiyacını ortadan kaldırır)
  ov.querySelector('#meTextarea').value = currentValue;

  requestAnimationFrame(() => ov.classList.add('open'));

  const closeMe = () => { ov.classList.remove('open'); setTimeout(() => ov.remove(), 300); };
  ov.addEventListener('click', e => { if (e.target === ov) closeMe(); });
  document.getElementById('meClose').addEventListener('click', closeMe);
  document.getElementById('meIptal').addEventListener('click', closeMe);
  document.getElementById('meKaydet').addEventListener('click', async () => {
    const btn = document.getElementById('meKaydet');
    const yeniMetin = document.getElementById('meTextarea').value;
    btn.disabled = true; btn.textContent = 'Kaydediliyor…';
    await updateHasta(_hastaId, { [fieldKey]: yeniMetin });
    showToast('Kaydedildi', 'success');
    closeMe();
  });
  setTimeout(() => document.getElementById('meTextarea')?.focus(), 320);
}

// --- Label helpers ---

function _durumLabel(d) {
  return { aktif: 'aktif', kesilecek: 'kesilecek', planli: 'planlı' }[d] || d;
}

function _tipLabel(t) {
  return { vizit: 'Vizit', telefon: 'Telefon', lab: 'Lab' }[t] || t;
}

function _emptyRow(msg) {
  return `<div style="padding:12px 0;color:var(--text-secondary);font-size:13px;text-align:center">${msg}</div>`;
}
