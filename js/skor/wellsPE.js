// Wells skoru — Pulmoner Emboli (Wells et al. 1998, modifiye)
// ESC 2019/2024 PE kılavuzu: Wells veya Geneva + d-dimer/CT-PA stratejisi
// Modern pratik 2-tier yorum (≤4 vs >4), 3-tier detayda gösterilir.

export default {
  id: 'wellsPE',
  ad: 'Wells skoru — PE',
  kategori: 'vte',
  kilavuz: 'Wells 1998 / ESC 2024',
  aciklama: 'Pulmoner emboli klinik olasılık',
  link: 'https://www.escardio.org/Guidelines/Clinical-Practice-Guidelines/Acute-Pulmonary-Embolism-Diagnosis-and-Management-of',

  inputs: [
    { key: 'klinikDvt',  tip: 'bool', label: 'Klinik DVT belirti/bulguları (bacak şişliği + ağrı)' },
    { key: 'altTaniAz',  tip: 'bool', label: 'Alternatif tanı PE\'den daha az olası' },
    { key: 'kh100',      tip: 'bool', label: 'Kalp hızı > 100/dk' },
    { key: 'onceDvtPe',  tip: 'bool', label: 'Önceki DVT veya PE öyküsü',
      autofillTanilar: ['dvt', 'derin ven trombozu', 'pulmoner emboli', 'vte', 'tromboemboli'] },
    { key: 'cerrahiImm', tip: 'bool', label: 'Son 4 hafta cerrahi veya ≥3 gün immobilizasyon' },
    { key: 'hemoptizi',  tip: 'bool', label: 'Hemoptizi' },
    { key: 'malignite',  tip: 'bool', label: 'Aktif malignite (tedavi / son 6 ay / palyatif)',
      autofillTanilar: ['malignite', 'kanser', 'cancer', 'tümör', 'karsinom', 'sarkom', 'lenfoma', 'lösemi', 'malign', 'ca', 'metastatik', 'metastaz'] }
  ],

  calc(v) {
    const bilesenler = [
      { ad: 'Klinik DVT bulguları',         puan: v.klinikDvt  ? 3   : 0 },
      { ad: 'Alternatif tanı PE\'den az',   puan: v.altTaniAz  ? 3   : 0 },
      { ad: 'KH > 100/dk',                  puan: v.kh100      ? 1.5 : 0 },
      { ad: 'Önceki DVT/PE',                puan: v.onceDvtPe  ? 1.5 : 0 },
      { ad: 'Cerrahi / immobilizasyon',     puan: v.cerrahiImm ? 1.5 : 0 },
      { ad: 'Hemoptizi',                    puan: v.hemoptizi  ? 1   : 0 },
      { ad: 'Aktif malignite',              puan: v.malignite  ? 1   : 0 }
    ];
    const toplam = bilesenler.reduce((s, b) => s + b.puan, 0);
    // 0.5 hassasiyetinde göster (1.5'lik puanlar var)
    const puan = Math.round(toplam * 2) / 2;
    return { puan, max: 12.5, bilesenler };
  },

  interpret(r) {
    const p = r.puan;
    // 2-tier (modifiye, ESC 2024 önerisi)
    if (p > 4) {
      // 3-tier üst sınıf: >6 yüksek
      const ucluEtiket = p > 6 ? '3-tier: yüksek olasılık (~%37)' : '3-tier: orta olasılık (~%16)';
      return {
        etiket: `${p} puan — PE olası`,
        seviye: 'kritik',
        mesaj: 'CT-PA (kontrendikasyon varsa V/Q sintigrafi) önerilir. D-dimer ile geçici eleme YETERLİ DEĞİL.',
        detay: `${ucluEtiket}. Hemodinami unstable ise yatak başı EKO + acil değerlendirme.`
      };
    }
    // ≤4 — PE unlikely
    return {
      etiket: `${p} puan — PE olası değil`,
      seviye: p >= 2 ? 'izlem' : 'stabil',
      mesaj: 'D-dimer (yaşa göre düzeltilmiş eşik) ile eleme yapılabilir. Negatifse PE büyük ölçüde dışlanır; pozitifse görüntüleme.',
      detay: `3-tier: ${p < 2 ? 'düşük olasılık (~%1.3)' : 'orta olasılık (~%16)'}. PERC kriterleri uygunsa d-dimer atlanabilir.`
    };
  }
};
