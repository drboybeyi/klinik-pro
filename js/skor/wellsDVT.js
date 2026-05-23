// Wells skoru — Derin Ven Trombozu (Wells et al. 1997, modifiye 2003)
// 2-tier yorum: ≥2 olası → duplex USG; <2 olası değil → d-dimer

export default {
  id: 'wellsDVT',
  ad: 'Wells skoru — DVT',
  kategori: 'vte',
  kilavuz: 'Wells 1997/2003',
  aciklama: 'Derin ven trombozu klinik olasılık',
  link: 'https://www.nejm.org/doi/full/10.1056/NEJMcp022929',

  inputs: [
    { key: 'malignite',     tip: 'bool', label: 'Aktif malignite (tedavi / son 6 ay / palyatif)',
      autofillTanilar: ['malignite', 'kanser', 'cancer', 'tümör', 'karsinom', 'sarkom', 'lenfoma', 'lösemi', 'malign', 'ca', 'metastatik', 'metastaz'] },
    { key: 'paraliz',       tip: 'bool', label: 'Paraliz / parezi / alt ekstremite alçısı' },
    { key: 'yatakIstCerr',  tip: 'bool', label: '>3 gün yatak istirahati veya son 12 hafta majör cerrahi' },
    { key: 'lokalizeHss',   tip: 'bool', label: 'Derin ven dağılımı boyunca lokalize hassasiyet' },
    { key: 'butunBacak',    tip: 'bool', label: 'Bütün bacakta şişlik' },
    { key: 'baldir3cm',     tip: 'bool', label: 'Baldır asimetrisi >3 cm (10 cm tibial tüberozite altı)' },
    { key: 'pittingOdem',   tip: 'bool', label: 'Etkilenen bacakta pitting ödem' },
    { key: 'kollateral',    tip: 'bool', label: 'Variköz olmayan yüzeyel kollateral venler' },
    { key: 'onceDvt',       tip: 'bool', label: 'Önceki DVT öyküsü',
      autofillTanilar: ['dvt', 'derin ven trombozu', 'vte'] },
    { key: 'altTaniEsit',   tip: 'bool', label: 'Alternatif tanı DVT kadar veya daha muhtemel (−2 puan)' }
  ],

  calc(v) {
    const bilesenler = [
      { ad: 'Aktif malignite',              puan: v.malignite    ?  1 : 0 },
      { ad: 'Paraliz / parezi / alçı',      puan: v.paraliz      ?  1 : 0 },
      { ad: 'Yatak istirahati / cerrahi',   puan: v.yatakIstCerr ?  1 : 0 },
      { ad: 'Lokalize derin ven hassasiyeti', puan: v.lokalizeHss ?  1 : 0 },
      { ad: 'Bütün bacakta şişlik',         puan: v.butunBacak   ?  1 : 0 },
      { ad: 'Baldır asimetrisi >3 cm',      puan: v.baldir3cm    ?  1 : 0 },
      { ad: 'Pitting ödem',                 puan: v.pittingOdem  ?  1 : 0 },
      { ad: 'Yüzeyel kollateral venler',    puan: v.kollateral   ?  1 : 0 },
      { ad: 'Önceki DVT',                   puan: v.onceDvt      ?  1 : 0 },
      { ad: 'Alternatif tanı en az muhtemel', puan: v.altTaniEsit ? -2 : 0 }
    ];
    const puan = bilesenler.reduce((s, b) => s + b.puan, 0);
    return { puan, max: 9, bilesenler };
  },

  interpret(r) {
    const p = r.puan;
    // 2-tier (modifiye 2003)
    if (p >= 2) {
      return {
        etiket: `${p} puan — DVT olası`,
        seviye: 'kritik',
        mesaj: 'Bacak proksimal venöz duplex USG önerilir. Negatifse 1 hafta sonra tekrar veya d-dimer ile destek.',
        detay: p >= 3 ? '3-tier: yüksek olasılık (~%75)' : '3-tier: orta olasılık (~%17)'
      };
    }
    return {
      etiket: `${p} puan — DVT olası değil`,
      seviye: p === 1 ? 'izlem' : 'stabil',
      mesaj: 'D-dimer ile eleme. Negatifse DVT büyük ölçüde dışlanır; pozitifse duplex USG.',
      detay: p === 1 ? '3-tier: orta olasılık' : '3-tier: düşük olasılık (~%3)'
    };
  }
};
