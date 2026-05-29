// Lab Defteri — Manuel Düzeltme DB katmanı (v0.4.8 Sprint 5A)
//
// Matris üzerinden manuel edit / sil / yeni ekle işlemleri.
// AI çağrısı YOK — sadece hasta.labDefteri üzerinde CRUD + RTDB'ye yazma.
//
// NOT (tasarım kararı): Granular RTDB-path yazımı yerine labDefteri'nin derin
// kopyası üzerinde işlem yapıp updateHasta(id, { labDefteri }) ile bütün halinde
// yazılır. Böylece users/{uid} path prefix'i doğru kullanılır, yetim node kalmaz
// ve mevcut subscribe('hastalar') → _refreshLabDefteri otomatik yenileme deseni çalışır.

import { updateHasta } from '../db.js';
import { PARAM_META } from './aiTarayici.js';

// labDefteri'nin güvenli derin kopyasını döndür (parametreler + olcumler).
function _klonDefter(hasta) {
  const kaynak = hasta?.labDefteri || {};
  const defter = { parametreler: {}, sonGuncelleme: kaynak.sonGuncelleme || null };
  for (const [key, p] of Object.entries(kaynak.parametreler || {})) {
    defter.parametreler[key] = {
      isim:     p.isim || key,
      birim:    p.birim || '',
      kategori: p.kategori || 'diger',
      referans: p.referans || null,
      olcumler: (p.olcumler || []).map(o => ({ ...o }))
    };
  }
  return defter;
}

function _ref(m) {
  const r = {};
  if (m.min != null) r.min = m.min;
  if (m.max != null) r.max = m.max;
  return Object.keys(r).length ? r : null;
}

// Yeni parametre node'u (metadata PARAM_META'dan; yoksa minimal).
function _yeniParam(paramKey) {
  const m = PARAM_META[paramKey];
  return m
    ? { isim: m.isim, birim: m.birim, kategori: m.kategori, referans: _ref(m), olcumler: [] }
    : { isim: paramKey, birim: '', kategori: 'diger', referans: null, olcumler: [] };
}

/**
 * Bir parametrenin belirli tarihteki ölçümünü ekle veya güncelle (manuel).
 * @returns {Promise<Object>} güncel labDefteri
 */
export async function updateLabDeger(hasta, paramKey, tarih, yeniDeger, opts = {}) {
  const defter = _klonDefter(hasta);

  if (!defter.parametreler[paramKey]) defter.parametreler[paramKey] = _yeniParam(paramKey);

  const olcumler = defter.parametreler[paramKey].olcumler;
  const olcumData = {
    deger:          yeniDeger,
    tarih,
    kaynak:         opts.kaynak || 'manuel',
    manuel:         true,
    duzeltmeTarihi: new Date().toISOString()
  };

  const idx = olcumler.findIndex(o => o.tarih === tarih);
  if (idx >= 0) olcumler[idx] = olcumData;
  else olcumler.push(olcumData);

  // Yeni → eski sırala (matris ve helper bu sıraya güvenir)
  olcumler.sort((a, b) => new Date(b.tarih) - new Date(a.tarih));

  defter.sonGuncelleme = new Date().toISOString();

  await updateHasta(hasta.id, { labDefteri: defter });
  hasta.labDefteri = defter; // lokal obje senkron
  return defter;
}

/**
 * Bir parametrenin belirli tarihteki ölçümünü sil.
 * Parametrenin son ölçümüyse parametreyi tümden kaldırır.
 * @returns {Promise<Object>} güncel labDefteri
 */
export async function deleteLabDeger(hasta, paramKey, tarih) {
  const defter = _klonDefter(hasta);
  const param = defter.parametreler[paramKey];
  if (!param) return defter;

  param.olcumler = (param.olcumler || []).filter(o => o.tarih !== tarih);
  if (param.olcumler.length === 0) delete defter.parametreler[paramKey];

  defter.sonGuncelleme = new Date().toISOString();

  await updateHasta(hasta.id, { labDefteri: defter });
  hasta.labDefteri = defter;
  return defter;
}

/**
 * Yeni lab değeri ekle (updateLabDeger sarmalayıcısı — okunabilirlik için).
 */
export async function addYeniLabDeger(hasta, paramKey, tarih, deger) {
  return updateLabDeger(hasta, paramKey, tarih, deger, { kaynak: 'manuel' });
}
