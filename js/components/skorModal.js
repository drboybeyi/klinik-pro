// Generic skor hesaplama modalı — herhangi bir skor modülünü yükler
// Hasta verilmişse yaş/cinsiyet otomatik dolar ve "Kaydet" aktiftir.
// Bool input'lar için: skor modülünde tanımlı autofillTanilar / autofillIlaclar
// keyword listeleriyle hastanın tanıları + klinikOzet ve ilaçları taranır.

import { saveSkor } from '../db.js';
import { getState } from '../state.js';
import { showToast } from './toast.js';
import { formatTarih, gunFarki, bugun } from '../utils.js';

let _overlay = null;
// Mevcut modal için: input key → eşleşmenin kaynağı (gösterim için)
let _autofillKaynak = {};
// Lab defterinden doldurulan input'lar: key → { tarih }
let _labKaynak = {};

// Skor input'larındaki labParseAlan → Lab Defteri parametre key eşleşmesi
// (eski parser alan adları korunuyor; defter key'leri farklı olabilir)
const ALAN_DEFTER_KEY = {
  kreatinin: 'kreatinin',
  bilirubin: 'bilirubin_total',
  inr:       'INR',
  sodyum:    'sodyum',
  albumin:   'albumin',
  ure:       'ure',
  BUN:       'BUN',
  AST:       'AST',
  ALT:       'ALT'
};

// Türkçe karakter-aware match.
//   Kısa keyword (<4 char, örn. 'mi','ht','kah'): tam kelime boundary (önce VE sonra non-word)
//     → 'mi' "MI nedeniyle" ile match olur, "Mikroalbüminüri" ile olmaz.
//   Uzun keyword (≥4 char, örn. 'inme','diyabet'): sadece önce non-word (suffix esnek)
//     → 'diyabet' "Diyabetik" ile match olur, "antidiyabetik" ile olmaz.
function _matchKeyword(text, keyword) {
  if (!text || !keyword) return false;
  const t = text.toLowerCase();
  const k = keyword.toLowerCase();
  const isWord = c => c && /[a-z0-9çğıöşü]/i.test(c);
  const katı = k.length < 4;
  let idx = 0;
  while ((idx = t.indexOf(k, idx)) !== -1) {
    const before = idx > 0 ? t[idx - 1] : '';
    const after  = idx + k.length < t.length ? t[idx + k.length] : '';
    const beforeOk = !isWord(before);
    const afterOk  = !isWord(after);
    if (katı ? (beforeOk && afterOk) : beforeOk) return true;
    idx += k.length;
  }
  return false;
}

function _matchListe(items, keywords, prop) {
  if (!keywords?.length || !items?.length) return null;
  for (const item of items) {
    const text = item[prop] || '';
    for (const k of keywords) {
      if (_matchKeyword(text, k)) return text;
    }
  }
  return null;
}

function _matchMetin(metin, keywords) {
  if (!keywords?.length || !metin) return null;
  for (const k of keywords) {
    if (_matchKeyword(metin, k)) {
      // Kaynak olarak keyword'ün geçtiği kısa parçayı döndür
      const t = metin;
      const idx = t.toLowerCase().indexOf(k.toLowerCase());
      const start = Math.max(0, idx - 12);
      const end = Math.min(t.length, idx + k.length + 18);
      return `…${t.slice(start, end).trim()}…`;
    }
  }
  return null;
}

/**
 * @param {Object} skor     skor modülü (SKORLAR registry'den)
 * @param {Object} hasta    opsiyonel — varsa autofill + kayıt
 * @param {Object} mevcut   opsiyonel — düzenleme için varolan skor kaydı
 */
export function openSkorModal(skor, hasta = null, mevcut = null) {
  _overlay?.remove();
  _overlay = document.createElement('div');
  _overlay.className = 'modal-overlay skor-modal';
  _autofillKaynak = {};
  _labKaynak = {};

  // Hasta varsa tanılar + ilaçlar — tanılar/ilaçlar ayrı koleksiyon
  const tanilar = hasta
    ? Object.values(getState('tanilar') || {}).filter(t => t.hastaId === hasta.id)
    : [];
  const ilaclar = hasta
    ? Object.values(getState('ilaclar') || {}).filter(i => i.hastaId === hasta.id)
    : [];
  // Tanı listesi + klinikOzet + ozgecmis (3 alan) — autofill kapsamı
  // hikaye/sikayetler/fmBulgular dahil edilmedi: akut bulgular, false positive riski yüksek
  const ozetMetinler = [
    { etiket: 'klinik özet', metin: hasta?.klinikOzet || '' },
    { etiket: 'özgeçmiş',    metin: hasta?.ozgecmis   || '' }
  ].filter(o => o.metin);

  // Başlangıç değerleri:
  //   1) Düzenleme ise mevcut.inputs (autofill atlanır — kullanıcının onayladığı snapshot)
  //   2) Direct field autofill (hasta.yas → input.autofill='yas')
  //   3) Bool için tanı/klinikOzet/özgeçmiş/ilaç keyword eşleşmesi
  //   4) Boş
  const baslangic = {};
  for (const inp of skor.inputs) {
    if (mevcut?.inputs && mevcut.inputs[inp.key] !== undefined) {
      baslangic[inp.key] = mevcut.inputs[inp.key];
      continue;
    }
    if (inp.autofill && hasta && hasta[inp.autofill] !== undefined) {
      baslangic[inp.key] = hasta[inp.autofill];
      continue;
    }
    if (inp.tip === 'bool' && hasta) {
      let kaynak = null;
      if (inp.autofillTanilar) {
        const t = _matchListe(tanilar, inp.autofillTanilar, 'tanim');
        if (t) kaynak = `tanı: ${t}`;
      }
      if (!kaynak && inp.autofillTanilar) {
        for (const o of ozetMetinler) {
          const m = _matchMetin(o.metin, inp.autofillTanilar);
          if (m) { kaynak = `${o.etiket}: ${m}`; break; }
        }
      }
      if (!kaynak && inp.autofillIlaclar) {
        const i = _matchListe(ilaclar, inp.autofillIlaclar, 'ad');
        if (i) kaynak = `ilaç: ${i}`;
      }
      if (kaynak) {
        baslangic[inp.key] = true;
        _autofillKaynak[inp.key] = kaynak;
      } else {
        baslangic[inp.key] = inp.varsayilan !== undefined ? inp.varsayilan : null;
      }
      continue;
    }
    // Varsayilan: modül `varsayilan` tanımladıysa onu kullan (örn. Caprini bool'ları false).
    // enum'da default = ilk seçenek (boş '' ile "eksik" görünmesin — NIHSS baştan 0 hesaplanır).
    if (inp.varsayilan !== undefined) {
      baslangic[inp.key] = inp.varsayilan;
    } else if (inp.tip === 'bool') {
      baslangic[inp.key] = null;
    } else if (inp.tip === 'enum') {
      baslangic[inp.key] = inp.secenekler?.[0]?.v ?? '';
    } else {
      baslangic[inp.key] = '';
    }
  }

  // Lab Defteri'nden anında doldur (AI yok) — yalnızca yeni hesaplamada,
  // hâlâ boş olan lab alanlarına. Düzenlemede kullanıcının snapshot'ı korunur.
  let labDoldurulan = 0;
  if (hasta && !mevcut) {
    const dp = _defterParsed(skor, hasta);
    if (dp) {
      const guncel = skor.applyLabParse ? skor.applyLabParse(dp, {}) : _defaultDefterApply(skor, dp);
      // guncel yalnızca lab-değeri + türetilmiş alanları içerir (yas/cinsiyet/bool DEĞİL),
      // bu yüzden enum default'unu (ör. CURB ureBirim) güvenle ezebilir.
      for (const [key, deger] of Object.entries(guncel)) {
        if (deger == null || deger === '') continue;
        baslangic[key] = deger;
        // Kaynak etiketi yalnızca gerçek lab-değeri input'larına (labParseAlan'lı);
        // CURB-65 ureBirim gibi türetilmiş alanlar doldurulur ama etiketlenmez/sayılmaz.
        const alan = skor.inputs.find(i => i.key === key)?.labParseAlan;
        if (alan) {
          _labKaynak[key] = { tarih: dp[alan]?.tarih || _enGuncelTarih(dp) };
          labDoldurulan++;
        }
      }
    }
  }
    <div class="modal-box modal-box-skor">
      <div class="modal-header">
        <span class="modal-title">${skor.ad}</span>
        <button class="modal-close" id="smClose">✕</button>
      </div>

      <div class="skor-modal-meta">
        <span class="skor-kategori-pill skor-kat-${skor.kategori}">${skor.kilavuz}</span>
        <span class="skor-modal-aciklama">${skor.aciklama}</span>
      </div>

      ${_renderLabDefterUyari(skor, hasta, labDoldurulan)}

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

  // Defter'den dolan bir alan manuel değiştirilince kaynak etiketini "manuel" yap
  document.querySelectorAll('#smForm .skor-input-num, #smForm .skor-input-select').forEach(el => {
    const mark = () => _kaynakManuel(el.dataset.key);
    el.addEventListener('input', mark);
    el.addEventListener('change', mark);
  });
}

function _renderInput(inp, value) {
  if (inp.tip === 'bool') {
    const aktif = value === true ? 'evet' : value === false ? 'hayir' : null;
    const kaynak = _autofillKaynak[inp.key];
    return `
      <div class="skor-input-row">
        <label class="skor-input-label">${inp.label}</label>
        ${kaynak ? `<div class="skor-autofill-rozet" title="Otomatik işaretlendi — kontrol edip değiştirebilirsin">✓ otomatik · ${kaynak}</div>` : ''}
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
        ${_kaynakEtiketi(inp.key)}
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
      ${_kaynakEtiketi(inp.key)}
    </div>
  `;
}

// --- Lab Defteri entegrasyonu (anında, AI yok) ---

function _skorLabAlanlari(skor) {
  const set = new Set();
  for (const inp of skor.inputs) {
    if (inp.labParseAlan) set.add(inp.labParseAlan);
  }
  if (skor.labParseEk) skor.labParseEk.forEach(a => set.add(a));
  return [...set];
}

// Skorun ilgilendiği alanlar için defterdeki son ölçümleri eski parser şeklinde döndürür:
//   { kreatinin: { deger, tarih }, BUN: { deger, tarih }, ... }
// Böylece skor.applyLabParse (CURB-65 BUN/üre mantığı) değişmeden çalışır.
function _defterParsed(skor, hasta) {
  const defter = hasta?.labDefteri;
  if (!defter?.parametreler) return null;
  const alanlar = _skorLabAlanlari(skor);
  if (!alanlar.length) return null;

  const out = {};
  let bulundu = false;
  for (const alan of alanlar) {
    const key = ALAN_DEFTER_KEY[alan] || alan;
    const son = defter.parametreler[key]?.olcumler?.[0]; // yeni → eski sıralı
    if (son && son.deger != null) {
      out[alan] = { deger: son.deger, tarih: son.tarih || null };
      bulundu = true;
    }
  }
  return bulundu ? out : null;
}

function _defaultDefterApply(skor, dp) {
  const out = {};
  for (const inp of skor.inputs) {
    if (!inp.labParseAlan) continue;
    const v = dp[inp.labParseAlan];
    if (v?.deger != null && !Number.isNaN(+v.deger)) out[inp.key] = +v.deger;
  }
  return out;
}

function _enGuncelTarih(dp) {
  const tarihler = Object.values(dp).map(v => v?.tarih).filter(Boolean);
  if (!tarihler.length) return null;
  return tarihler.sort((a, b) => new Date(b) - new Date(a))[0];
}

// Bir input'un defter kaynağı etiketi (tarih + eskilik uyarısı)
function _kaynakEtiketi(key) {
  const k = _labKaynak[key];
  if (!k) return '';
  if (!k.tarih) {
    return `<div class="lab-defter-kaynak" data-defter-kaynak="${key}">📋 Lab defterinden</div>`;
  }
  const fmt = formatTarih(k.tarih);
  let fark; try { fark = gunFarki(bugun(), k.tarih); } catch { fark = null; }

  let cls = 'lab-defter-kaynak', txt;
  if (fark == null || fark < 0)      txt = `📋 ${fmt} defterinden`;
  else if (fark <= 90)               txt = `📋 ${fmt} (${fark} gün önce)`;
  else { cls += ' lab-defter-eski';  txt = `⚠️ ${fmt} (${fark} gün eski — güncelle)`; }

  return `<div class="${cls}" data-defter-kaynak="${key}">${txt}</div>`;
}

function _renderLabDefterUyari(skor, hasta, doldurulan) {
  if (!hasta || _skorLabAlanlari(skor).length === 0) return '';
  if (doldurulan > 0) {
    return `<div class="lab-defter-bar lab-defter-bar-ok">📋 ${doldurulan} değer Lab Defteri'nden dolduruldu — kontrol edip değiştirebilirsin</div>`;
  }
  const defter = hasta?.labDefteri;
  if (!defter?.parametreler || Object.keys(defter.parametreler).length === 0) {
    return `<div class="lab-defter-bar lab-defter-bar-bos">📭 Lab Defteri boş — <strong>Tetkikler › Lab Değerleri</strong>'nden tarayın. Değerleri manuel de girebilirsiniz.</div>`;
  }
  return `<div class="lab-defter-bar lab-defter-bar-bos">📋 Lab Defteri'nde bu skor için uygun değer bulunamadı — manuel girin.</div>`;
}

// Manuel düzenlemede defter kaynağı etiketini "manuel" yap
function _kaynakManuel(key) {
  const el = document.querySelector(`[data-defter-kaynak="${key}"]`);
  if (!el) return;
  el.textContent = '✏️ Manuel';
  el.className = 'lab-defter-kaynak lab-defter-manuel';
  delete _labKaynak[key];
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
