// HAS-BLED — Pisters et al. 2010, ESC 2024 onaylı
// OAK alacak/alan AF hastasında majör kanama riski

export default {
  id: 'hasbled',
  ad: 'HAS-BLED',
  kategori: 'kardiyo',
  kilavuz: 'Pisters 2010',
  aciklama: 'OAK altında majör kanama riski',
  link: 'https://www.chestnet.org/journal/articles/article-detail?ArticleID=1081',

  inputs: [
    { key: 'ht',          tip: 'bool', label: 'Kontrolsüz HT (sistolik >160 mmHg)' },
    { key: 'renal',       tip: 'bool', label: 'Anormal renal fonksiyon (diyaliz, transplant, Cr ≥2.26 mg/dL)' },
    { key: 'hepatik',     tip: 'bool', label: 'Anormal karaciğer fonksiyonu (siroz, Bil >2x, AST/ALT >3x)' },
    { key: 'inme',        tip: 'bool', label: 'İnme öyküsü' },
    { key: 'kanama',      tip: 'bool', label: 'Kanama öyküsü / predispozisyon' },
    { key: 'labilInr',    tip: 'bool', label: 'Labil INR (TTR <%60, sadece VKA için)' },
    { key: 'yas',         tip: 'sayi', label: 'Yaş', min: 0, max: 120, autofill: 'yas' },
    { key: 'ilac',        tip: 'bool', label: 'Kanamaya yatkın ilaç (NSAİD, antiplatelet)' },
    { key: 'alkol',       tip: 'bool', label: 'Alkol kullanımı (≥8 birim/hafta)' }
  ],

  calc(v) {
    const yas = +v.yas || 0;
    const bilesenler = [
      { ad: 'Hipertansiyon',      puan: v.ht        ? 1 : 0 },
      { ad: 'Anormal renal',      puan: v.renal     ? 1 : 0 },
      { ad: 'Anormal hepatik',    puan: v.hepatik   ? 1 : 0 },
      { ad: 'İnme öyküsü',        puan: v.inme      ? 1 : 0 },
      { ad: 'Kanama öyküsü',      puan: v.kanama    ? 1 : 0 },
      { ad: 'Labil INR',          puan: v.labilInr  ? 1 : 0 },
      { ad: 'Yaş >65',            puan: yas > 65    ? 1 : 0 },
      { ad: 'Kanamaya yatkın ilaç', puan: v.ilac    ? 1 : 0 },
      { ad: 'Alkol',              puan: v.alkol     ? 1 : 0 }
    ];
    const puan = bilesenler.reduce((s, b) => s + b.puan, 0);
    return { puan, max: 9, bilesenler };
  },

  interpret(r) {
    const p = r.puan;
    if (p >= 3) {
      return {
        etiket: `${p} puan — yüksek kanama riski`,
        seviye: 'kritik',
        mesaj: 'Yıllık majör kanama riski ~%5.8+. OAK kontraendike değildir; düzeltilebilir risk faktörlerini hedefle (HT kontrolü, NSAİD kesimi, alkol azaltma). Daha sık takip.',
        detay: 'HAS-BLED yüksek = OAK\'a kontrendikasyon DEĞİL — risk faktörü yönetimi gerektirir.'
      };
    }
    if (p === 2) {
      return {
        etiket: '2 puan — orta risk',
        seviye: 'izlem',
        mesaj: 'Yıllık majör kanama riski ~%1.9. OAK güvenli; rutin takip.',
        detay: ''
      };
    }
    return {
      etiket: `${p} puan — düşük risk`,
      seviye: 'stabil',
      mesaj: 'Yıllık majör kanama riski ~%1.0. OAK güvenli.',
      detay: ''
    };
  }
};
