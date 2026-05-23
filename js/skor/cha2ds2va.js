// CHA₂DS₂-VA — ESC 2024 (cinsiyet kategorisi kaldırıldı, max 7)
// Ref: ESC 2024 AF kılavuzu (Van Gelder et al. Eur Heart J 2024)

export default {
  id: 'cha2ds2va',
  ad: 'CHA₂DS₂-VA',
  kategori: 'kardiyo',
  kilavuz: 'ESC 2024',
  aciklama: 'AF\'de inme/sistemik emboli riski',
  link: 'https://academic.oup.com/eurheartj/article/45/36/3314/7738779',

  inputs: [
    { key: 'kky',     tip: 'bool', label: 'Konjestif kalp yetmezliği / LV disfonksiyonu' },
    { key: 'ht',      tip: 'bool', label: 'Hipertansiyon' },
    { key: 'yas',     tip: 'sayi', label: 'Yaş', min: 0, max: 120, autofill: 'yas' },
    { key: 'dm',      tip: 'bool', label: 'Diabetes mellitus' },
    { key: 'inme',    tip: 'bool', label: 'İnme / TIA / tromboemboli öyküsü' },
    { key: 'vask',    tip: 'bool', label: 'Vasküler hastalık (KAH, PAH, aort plağı)' }
  ],

  calc(v) {
    const yas = +v.yas || 0;
    const yasP = yas >= 75 ? 2 : (yas >= 65 ? 1 : 0);

    const bilesenler = [
      { ad: 'KKY / LV disfonksiyonu', puan: v.kky  ? 1 : 0 },
      { ad: 'Hipertansiyon',          puan: v.ht   ? 1 : 0 },
      { ad: 'Yaş ≥75',                puan: yas >= 75 ? 2 : 0 },
      { ad: 'Diabetes mellitus',      puan: v.dm   ? 1 : 0 },
      { ad: 'İnme / TIA / TE',        puan: v.inme ? 2 : 0 },
      { ad: 'Vasküler hastalık',      puan: v.vask ? 1 : 0 },
      { ad: 'Yaş 65-74',              puan: (yas >= 65 && yas < 75) ? 1 : 0 }
    ];

    const puan = bilesenler.reduce((s, b) => s + b.puan, 0);
    return { puan, max: 7, bilesenler };
  },

  interpret(r) {
    const p = r.puan;
    if (p >= 2) {
      return {
        etiket: `${p} puan — yüksek risk`,
        seviye: 'kritik',
        mesaj: 'OAK güçlü öneri (Class I). Kontrendikasyon yoksa DOAC tercih edilir; valvüler AF veya mekanik kapakta warfarin.',
        detay: 'Yıllık inme riski yaklaşık %2.5-12 (puana göre artar).'
      };
    }
    if (p === 1) {
      return {
        etiket: '1 puan — orta risk',
        seviye: 'izlem',
        mesaj: 'OAK düşünülebilir (Class IIa). Hasta tercihi, kanama riski (HAS-BLED) ve net klinik fayda birlikte değerlendirilmeli.',
        detay: 'Yıllık inme riski ~%1.3.'
      };
    }
    return {
      etiket: '0 puan — düşük risk',
      seviye: 'stabil',
      mesaj: 'OAK önerilmez. Yıllık takip, risk faktörlerinin yeniden değerlendirilmesi.',
      detay: 'Yıllık inme riski <%0.5.'
    };
  }
};
