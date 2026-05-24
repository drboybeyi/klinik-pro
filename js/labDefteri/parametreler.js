// Lab Defteri — Standart parametre listesi + referans aralıkları (v0.5)
//
// AI tarayıcı (aiTarayici.js) bu key'leri kullanarak PDF'lerden yapılandırılmış
// lab veri çıkarır. Listede olmayan parametreler "_diger" altında saklanır.
//
// Referans aralık alanları:
//   { min, max }                → cinsiyetten bağımsız
//   { min_K, max_K, min_E, max_E } → cinsiyete bağlı (K=kadın, E=erkek)
//   sadece { max } veya { min } → tek yönlü sınır (örn. CRP < 5)

export const STANDART_PARAMETRELER = {
  // KARDİYOVASKÜLER
  BNP:       { birim: 'pg/mL', referans: { max: 100 }, kategori: 'kardiyo', isim: 'BNP' },
  proBNP:    { birim: 'pg/mL', referans: { max: 125 }, kategori: 'kardiyo', isim: 'NT-proBNP' },
  troponin:  { birim: 'ng/mL', referans: { max: 0.04 }, kategori: 'kardiyo', isim: 'Troponin I/T' },
  CKMB:      { birim: 'ng/mL', referans: { max: 5 }, kategori: 'kardiyo', isim: 'CK-MB' },

  // BİYOKİMYA
  kreatinin:        { birim: 'mg/dL', referans: { min: 0.7, max: 1.2 }, kategori: 'biyokimya', isim: 'Kreatinin' },
  BUN:              { birim: 'mg/dL', referans: { min: 7, max: 20 },    kategori: 'biyokimya', isim: 'BUN' },
  ure:              { birim: 'mg/dL', referans: { min: 15, max: 45 },   kategori: 'biyokimya', isim: 'Üre' },
  AST:              { birim: 'U/L',   referans: { max: 40 },            kategori: 'biyokimya', isim: 'AST' },
  ALT:              { birim: 'U/L',   referans: { max: 40 },            kategori: 'biyokimya', isim: 'ALT' },
  ALP:              { birim: 'U/L',   referans: { min: 40, max: 130 },  kategori: 'biyokimya', isim: 'ALP' },
  GGT:              { birim: 'U/L',   referans: { max: 50 },            kategori: 'biyokimya', isim: 'GGT' },
  bilirubin_total:  { birim: 'mg/dL', referans: { max: 1.2 },          kategori: 'biyokimya', isim: 'Total Bilirubin' },
  bilirubin_direkt: { birim: 'mg/dL', referans: { max: 0.3 },          kategori: 'biyokimya', isim: 'Direkt Bilirubin' },
  albumin:          { birim: 'g/dL',  referans: { min: 3.5, max: 5.0 }, kategori: 'biyokimya', isim: 'Albümin' },
  protein_total:    { birim: 'g/dL',  referans: { min: 6.0, max: 8.3 }, kategori: 'biyokimya', isim: 'Total Protein' },
  LDH:              { birim: 'U/L',   referans: { min: 140, max: 280 }, kategori: 'biyokimya', isim: 'LDH' },
  amonyak:          { birim: 'µg/dL', referans: { max: 80 },           kategori: 'biyokimya', isim: 'Amonyak (NH3)' },
  urikAsit:         { birim: 'mg/dL', referans: { min: 3.5, max: 7.2 }, kategori: 'biyokimya', isim: 'Ürik Asit' },

  // ELEKTROLİT
  sodyum:    { birim: 'mEq/L', referans: { min: 136, max: 145 }, kategori: 'elektrolit', isim: 'Sodyum' },
  potasyum:  { birim: 'mEq/L', referans: { min: 3.5, max: 5.0 }, kategori: 'elektrolit', isim: 'Potasyum' },
  klor:      { birim: 'mEq/L', referans: { min: 98, max: 107 },  kategori: 'elektrolit', isim: 'Klor' },
  kalsiyum:  { birim: 'mg/dL', referans: { min: 8.5, max: 10.5 }, kategori: 'elektrolit', isim: 'Kalsiyum' },
  fosfor:    { birim: 'mg/dL', referans: { min: 2.5, max: 4.5 },  kategori: 'elektrolit', isim: 'Fosfor' },
  magnezyum: { birim: 'mg/dL', referans: { min: 1.7, max: 2.2 },  kategori: 'elektrolit', isim: 'Magnezyum' },

  // HEMOGRAM
  hemoglobin: { birim: 'g/dL',     referans: { min_K: 12, max_K: 16, min_E: 13.5, max_E: 17.5 }, kategori: 'hemogram', isim: 'Hemoglobin' },
  hematokrit: { birim: '%',        referans: { min_K: 36, max_K: 46, min_E: 41, max_E: 50 },     kategori: 'hemogram', isim: 'Hematokrit' },
  MCV:        { birim: 'fL',       referans: { min: 80, max: 100 },  kategori: 'hemogram', isim: 'MCV' },
  WBC:        { birim: 'x10³/µL',  referans: { min: 4.5, max: 11.0 }, kategori: 'hemogram', isim: 'WBC' },
  trombosit:  { birim: 'x10³/µL',  referans: { min: 150, max: 400 },  kategori: 'hemogram', isim: 'Trombosit' },
  ferritin:   { birim: 'ng/mL',    referans: { min: 12, max: 300 },   kategori: 'hemogram', isim: 'Ferritin' },
  demir:      { birim: 'µg/dL',    referans: { min: 50, max: 170 },   kategori: 'hemogram', isim: 'Demir' },

  // ENFLAMASYON
  CRP:           { birim: 'mg/L',  referans: { max: 5 },              kategori: 'enflamasyon', isim: 'CRP' },
  ESR:           { birim: 'mm/hr', referans: { max_K: 20, max_E: 15 }, kategori: 'enflamasyon', isim: 'ESR (Sedim)' },
  prokalsitonin: { birim: 'ng/mL', referans: { max: 0.5 },           kategori: 'enflamasyon', isim: 'Prokalsitonin' },

  // ENDOKRİN
  TSH:          { birim: 'µIU/mL', referans: { min: 0.4, max: 4.0 },  kategori: 'endokrin', isim: 'TSH' },
  fT4:          { birim: 'ng/dL',  referans: { min: 0.8, max: 1.8 },  kategori: 'endokrin', isim: 'fT4' },
  fT3:          { birim: 'pg/mL',  referans: { min: 2.3, max: 4.2 },  kategori: 'endokrin', isim: 'fT3' },
  HbA1c:        { birim: '%',      referans: { max: 5.7 },            kategori: 'endokrin', isim: 'HbA1c' },
  glukoz_aclik: { birim: 'mg/dL',  referans: { min: 70, max: 100 },   kategori: 'endokrin', isim: 'Açlık Glukozu' },
  insulin:      { birim: 'µIU/mL', referans: { min: 2.6, max: 24.9 }, kategori: 'endokrin', isim: 'İnsulin' },

  // KOAGÜLASYON
  INR:     { birim: '',     referans: { min: 0.8, max: 1.2 }, kategori: 'koag', isim: 'INR' },
  aPTT:    { birim: 'sn',   referans: { min: 25, max: 35 },   kategori: 'koag', isim: 'aPTT' },
  PT:      { birim: 'sn',   referans: { min: 11, max: 13.5 }, kategori: 'koag', isim: 'PT' },
  D_dimer: { birim: 'µg/mL', referans: { max: 0.5 },          kategori: 'koag', isim: 'D-Dimer' },

  // LİPİD
  totalKolesterol: { birim: 'mg/dL', referans: { max: 200 },              kategori: 'lipid', isim: 'Total Kolesterol' },
  LDL:             { birim: 'mg/dL', referans: { max: 100 },              kategori: 'lipid', isim: 'LDL' },
  HDL:             { birim: 'mg/dL', referans: { min_K: 50, min_E: 40 },  kategori: 'lipid', isim: 'HDL' },
  trigliserit:     { birim: 'mg/dL', referans: { max: 150 },              kategori: 'lipid', isim: 'Trigliserit' },

  // İDRAR
  UACR: { birim: 'mg/g', referans: { max: 30 }, kategori: 'idrar', isim: 'Mikroalbümin/Kreatinin' }

  // Diğer parametreler AI tarafından "_diger" altına eklenir
};

export const KATEGORILER = {
  kardiyo:     { isim: '🩸 Kardiyovasküler', renk: '#c94a3a' },
  biyokimya:   { isim: '🧪 Biyokimya',       renk: '#8b6f47' },
  elektrolit:  { isim: '🫧 Elektrolit',      renk: '#4a7c8b' },
  hemogram:    { isim: '🩸 Hemogram',        renk: '#9a4a3a' },
  enflamasyon: { isim: '🦠 Enflamasyon',     renk: '#c9923c' },
  endokrin:    { isim: '🧬 Endokrin',        renk: '#7a4a8b' },
  koag:        { isim: '🩺 Koagülasyon',     renk: '#4a8b6f' },
  lipid:       { isim: '💧 Lipid',           renk: '#8b4a7a' },
  idrar:       { isim: '💛 İdrar',           renk: '#c9b03c' },
  diger:       { isim: '📁 Diğer',           renk: '#666' }
};

// Kategori gösterim sırası (matriste kategori gruplarının üstten alta dizilişi)
export const KATEGORI_SIRA = [
  'kardiyo', 'biyokimya', 'elektrolit', 'hemogram',
  'enflamasyon', 'endokrin', 'koag', 'lipid', 'idrar', 'diger'
];

/**
 * Bir değerin referansa göre durumunu döndürür.
 * @returns 'normal' | 'yuksek' | 'dusuk' | 'yuksek-belirgin' | 'dusuk-belirgin' | null
 */
export function degerDurumu(deger, referans, cinsiyet) {
  if (deger == null || Number.isNaN(+deger) || !referans) return null;
  const d = +deger;

  // Cinsiyete bağlı sınırları çöz (cinsiyet: 'E' | 'K')
  const cinsSuffix = cinsiyet === 'K' ? '_K' : '_E';
  const min = referans[`min${cinsSuffix}`] ?? referans.min ?? null;
  const max = referans[`max${cinsSuffix}`] ?? referans.max ?? null;

  if (max != null && d > max) {
    return d > max * 2 ? 'yuksek-belirgin' : 'yuksek';
  }
  if (min != null && d < min) {
    return d < min * 0.5 ? 'dusuk-belirgin' : 'dusuk';
  }
  return 'normal';
}

/**
 * Referans aralığını okunabilir metne çevirir.
 */
export function referansMetni(parametre, cinsiyet) {
  const r = parametre?.referans;
  if (!r) return '';
  const birim = parametre.birim ? ` ${parametre.birim}` : '';
  const cinsSuffix = cinsiyet === 'K' ? '_K' : '_E';
  const min = r[`min${cinsSuffix}`] ?? r.min ?? null;
  const max = r[`max${cinsSuffix}`] ?? r.max ?? null;

  if (min != null && max != null) return `${min}-${max}${birim}`;
  if (max != null)                return `<${max}${birim}`;
  if (min != null)                return `>${min}${birim}`;
  return '';
}
