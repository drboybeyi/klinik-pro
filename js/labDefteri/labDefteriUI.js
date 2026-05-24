// Lab Defteri — UI (v0.5)
//
// Tetkikler sekmesi > "Lab Değerleri" alt-tab içeriği: parametre × tarih matrisi,
// patolojik renklendirme, trend okları, kategori filtreleri ve AI toplu tarama akışı.
//
// hastaDetay.js bu modülü iki fonksiyonla kullanır:
//   renderLabDefteriIcerik(hasta)               → içerik HTML'i
//   attachLabDefteriListeners(hasta, tetkikler, refreshFn) → listener bağla
// refreshFn: içerik konteynerini yeniden render edip listener'ları tekrar bağlar.

import { showToast } from '../components/toast.js';
import { formatTarih, gunFarki, bugun } from '../utils.js';
import { saveLabDefteri } from '../db.js';
import { topluLabTara } from './aiTarayici.js';
import {
  KATEGORILER, KATEGORI_SIRA, degerDurumu, referansMetni
} from './parametreler.js';

// --- Modül state ---
let _aktifKategori = 'hepsi';
let _tarama = { aktif: false, abort: null, metin: '' };

export function resetLabDefteriState() {
  if (_tarama.abort) { try { _tarama.abort.abort(); } catch {} }
  _aktifKategori = 'hepsi';
  _tarama = { aktif: false, abort: null, metin: '' };
}

export function labDefteriTaranıyorMu() {
  return _tarama.aktif;
}

// --- Render ---

export function renderLabDefteriIcerik(hasta) {
  if (_tarama.aktif) return _renderTaramaPanel();

  const defter = hasta?.labDefteri;
  const rows = defter ? _rowlar(defter) : [];

  if (!rows.length) return _renderBosMesaj(defter);

  const tarihler = _tumTarihler(rows);
  const meta = _renderHeader(defter, tarihler.length, rows.length);
  const chips = _renderKategoriChips(rows);
  const matris = _renderMatris(rows, tarihler, hasta?.cinsiyet);

  return `<div class="lab-defteri">${meta}${chips}${matris}</div>`;
}

function _renderTaramaPanel() {
  const onceki = _tarama.metin ? `${_tarama.metin.length} karakter alındı…` : 'Başlatılıyor…';
  return `
    <div class="lab-defteri">
      <div class="lab-tarama-panel">
        <div class="lab-tarama-spinner">🔄</div>
        <div class="lab-tarama-baslik">AI tetkikleri tarıyor…</div>
        <div class="lab-tarama-alt" id="labTaramaMetin">${onceki}</div>
        <div class="lab-tarama-not">PDF sayısına göre 30-60 sn sürebilir</div>
        <button class="btn btn-secondary" data-tarama-durdur style="margin-top:14px">⏹ Durdur</button>
      </div>
    </div>
  `;
}

function _renderBosMesaj(defter) {
  const basarisiz = defter?.durum === 'tarama_basarisiz';
  return `
    <div class="lab-defteri">
      <div class="lab-bos-mesaj">
        <div class="lab-bos-icon">📭</div>
        <p>${basarisiz
          ? 'Son tarama başarısız oldu. Tetkik PDF\'lerini kontrol edip tekrar deneyebilirsiniz.'
          : 'Henüz lab defteri oluşturulmadı. Tetkik PDF/görüntülerinden AI ile lab değerlerini çıkaralım.'}</p>
        <button class="btn btn-primary" data-toplu-tara>🚀 Lab Defteri'ni oluştur (AI tarayacak)</button>
      </div>
    </div>
  `;
}

function _renderHeader(defter, tarihSayisi, paramSayisi) {
  const guncel = defter?.sonGuncelleme
    ? new Date(defter.sonGuncelleme).toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      })
    : '—';
  return `
    <div class="lab-defteri-header">
      <div class="lab-durum">
        <span class="lab-status-icon">📊</span>
        Son güncelleme: ${guncel} · ${tarihSayisi} tarih · ${paramSayisi} parametre
      </div>
      <div class="lab-actions">
        <button class="btn btn-secondary" data-toplu-tara
                style="min-height:32px;padding:6px 12px;font-size:12px">🔄 Yeniden tara</button>
      </div>
    </div>
  `;
}

function _renderKategoriChips(rows) {
  const mevcut = new Set(rows.map(r => r.kategori));
  const sirali = KATEGORI_SIRA.filter(k => mevcut.has(k));
  const chip = (k, label) =>
    `<button class="kategori-chip ${_aktifKategori === k ? 'active' : ''}" data-kategori="${k}">${label}</button>`;
  return `
    <div class="lab-kategori-filtreler">
      ${chip('hepsi', 'Hepsi')}
      ${sirali.map(k => chip(k, KATEGORILER[k]?.isim || k)).join('')}
    </div>
  `;
}

function _renderMatris(rows, tarihler, cinsiyet) {
  const gosterilen = _aktifKategori === 'hepsi'
    ? rows
    : rows.filter(r => r.kategori === _aktifKategori);

  // Kategoriye göre grupla, KATEGORI_SIRA düzeninde
  const gruplar = KATEGORI_SIRA
    .map(k => ({ kat: k, rows: gosterilen.filter(r => r.kategori === k) }))
    .filter(g => g.rows.length);

  const baslikHucreleri = tarihler.map(t => `<th>${_kisaTarih(t)}</th>`).join('');

  const govde = gruplar.map(g => {
    const meta = KATEGORILER[g.kat] || { isim: g.kat };
    const katBaslik = `
      <tr class="lab-kategori-row">
        <td colspan="${tarihler.length + 3}">${meta.isim}</td>
      </tr>`;
    const satirlar = g.rows.map(r => _renderSatir(r, tarihler, cinsiyet)).join('');
    return katBaslik + satirlar;
  }).join('');

  return `
    <div class="lab-matris-wrap">
      <table class="lab-matris">
        <thead>
          <tr>
            <th class="lab-param-col">Parametre</th>
            ${baslikHucreleri}
            <th class="lab-trend-col">Trend</th>
            <th class="lab-ref-col">Referans</th>
          </tr>
        </thead>
        <tbody>${govde}</tbody>
      </table>
    </div>
  `;
}

function _renderSatir(row, tarihler, cinsiyet) {
  const hucreler = tarihler.map(t => {
    const o = row.olcumler.find(x => x.tarih === t);
    if (!o || o.deger == null) return `<td class="lab-value">-</td>`;
    const durum = degerDurumu(o.deger, row.referans, cinsiyet);
    const cls = durum ? `lab-${durum}` : 'lab-normal';
    return `<td class="lab-value ${cls}">${_fmtDeger(o.deger)}</td>`;
  }).join('');

  const tr = _trend(row.olcumler);
  const ref = row.referans
    ? referansMetni(row, cinsiyet)
    : (row.birim || '');

  return `
    <tr class="lab-param-row">
      <td class="lab-param-name">${_esc(row.isim)}</td>
      ${hucreler}
      <td class="lab-trend ${tr.cls}">${tr.sym}</td>
      <td class="lab-ref">${_esc(ref)}</td>
    </tr>
  `;
}

// --- Veri yardımcıları ---

// defter.parametreler → ekran satırları. _diger isim bazında gruplanır.
function _rowlar(defter) {
  const rows = [];
  for (const [key, p] of Object.entries(defter?.parametreler || {})) {
    if (key === '_diger') {
      const grup = {};
      for (const o of (p.olcumler || [])) {
        if (!o?.isim) continue;
        (grup[o.isim] ||= { isim: o.isim, birim: o.birim || '', referans: null, kategori: 'diger', olcumler: [] })
          .olcumler.push({ deger: o.deger, tarih: o.tarih });
      }
      for (const r of Object.values(grup)) {
        r.olcumler.sort((a, b) => new Date(b.tarih) - new Date(a.tarih));
        rows.push(r);
      }
    } else {
      rows.push({
        isim:     p.isim || key,
        birim:    p.birim || '',
        referans: p.referans || null,
        kategori: p.kategori || 'diger',
        olcumler: (p.olcumler || []).slice()
      });
    }
  }
  return rows;
}

// Tüm satırların ölçüm tarihleri (benzersiz, yeni → eski)
function _tumTarihler(rows) {
  const set = new Set();
  for (const r of rows) for (const o of r.olcumler) if (o.tarih) set.add(o.tarih);
  return [...set].sort((a, b) => new Date(b) - new Date(a));
}

// Son iki ölçümden trend; tek ölçüm → "Yeni"; en son >90 gün → "Eski"
function _trend(olcumler) {
  if (!olcumler || olcumler.length < 2) return { sym: 'Yeni', cls: 'lab-trend-stable' };

  let fark = null;
  try { fark = gunFarki(bugun(), olcumler[0].tarih); } catch {}
  if (fark != null && fark > 90) return { sym: 'Eski', cls: 'lab-trend-stable' };

  const yeni = +olcumler[0].deger;
  const eski = +olcumler[1].deger;
  if (!Number.isFinite(yeni) || !Number.isFinite(eski) || eski === 0) {
    return { sym: '→', cls: 'lab-trend-stable' };
  }
  const pct = Math.abs(yeni - eski) / Math.abs(eski) * 100;
  if (pct < 5) return { sym: '→', cls: 'lab-trend-stable' };
  const up = yeni > eski;
  if (pct <= 15) return { sym: up ? '↑' : '↓', cls: up ? 'lab-trend-up' : 'lab-trend-down' };
  return { sym: up ? '⇈' : '⇊', cls: up ? 'lab-trend-up' : 'lab-trend-down' };
}

function _kisaTarih(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  const g = String(d.getDate()).padStart(2, '0');
  const a = String(d.getMonth() + 1).padStart(2, '0');
  return `${g}.${a}`;
}

function _fmtDeger(n) {
  const v = +n;
  if (!Number.isFinite(v)) return _esc(String(n));
  return Number.isInteger(v) ? String(v) : String(+v.toFixed(2));
}

function _esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- Listeners ---

export function attachLabDefteriListeners(hasta, tetkikler, refreshFn) {
  // Toplu tara (boş mesaj + header "Yeniden tara")
  document.querySelectorAll('[data-toplu-tara]').forEach(btn => {
    btn.addEventListener('click', () => _baslatTarama(hasta, tetkikler, refreshFn));
  });

  // Tarama durdur
  document.querySelector('[data-tarama-durdur]')?.addEventListener('click', () => {
    if (_tarama.abort) { try { _tarama.abort.abort(); } catch {} }
  });

  // Kategori filtreleri
  document.querySelectorAll('[data-kategori]').forEach(chip => {
    chip.addEventListener('click', () => {
      _aktifKategori = chip.dataset.kategori;
      refreshFn();
    });
  });
}

async function _baslatTarama(hasta, tetkikler, refreshFn) {
  if (_tarama.aktif) return;
  if (!tetkikler?.length) {
    showToast('Bu hastada taranacak tetkik yok', 'info');
    return;
  }

  _tarama = { aktif: true, abort: new AbortController(), metin: '' };
  refreshFn(); // tarama panelini göster

  let sonuc;
  try {
    sonuc = await topluLabTara(hasta, tetkikler, {
      signal: _tarama.abort.signal,
      onChunk: (full) => {
        _tarama.metin = full;
        const el = document.getElementById('labTaramaMetin');
        if (el) el.textContent = `${full.length} karakter alındı…`;
      }
    });
  } catch (e) {
    sonuc = { ok: false, kod: 'exception', mesaj: e.message };
  }

  _tarama = { aktif: false, abort: null, metin: '' };

  if (!sonuc.ok) {
    if (sonuc.kod === 'abort') showToast('Tarama durduruldu', 'info');
    else showToast(`Tarama başarısız: ${sonuc.mesaj}`, 'error');
    refreshFn();
    return;
  }

  try {
    await saveLabDefteri(hasta.id, sonuc.labDefteri);
    const m = sonuc.meta;
    let msg = `✅ ${m.taranansayi} tetkik tarandı · ${m.paramSayisi} parametre`;
    if (m.atilansayi > 0) msg += ` · ${m.atilansayi} tetkik 30 MB sınırından atıldı`;
    showToast(msg, 'success');
    // labDefteri hasta kaydına yazıldı → hastalar listener içeriği yeniler.
  } catch (e) {
    showToast(`Defter kaydedilemedi: ${e.message}`, 'error');
    refreshFn();
  }
}
