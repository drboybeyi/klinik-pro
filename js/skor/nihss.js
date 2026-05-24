// NIHSS — National Institutes of Health Stroke Scale
// Akut inme şiddeti (15 madde, 0-42). Yatak başı nörolojik muayene skalası.
// Tüm maddeler enum; varsayılan 0 (skor baştan hesaplanabilir).

const m = (key, label, secenekler) => ({ key, tip: 'enum', label, secenekler });
const o = arr => arr.map(([v, label]) => ({ v: String(v), label: `${v} — ${label}` }));

export default {
  id: 'nihss',
  ad: 'NIHSS',
  kategori: 'noro',
  kilavuz: 'NIH Stroke Scale',
  aciklama: 'Akut inme şiddeti (0-42)',
  link: 'https://www.mdcalc.com/calc/715/nih-stroke-scale-score-nihss',

  inputs: [
    m('loc',      '1a. Bilinç düzeyi',            o([[0,'Uyanık'],[1,'Uykuya meyilli'],[2,'Stupor'],[3,'Koma']])),
    m('locSoru',  '1b. LOC soruları (ay, yaş)',   o([[0,'İkisi doğru'],[1,'Biri doğru'],[2,'İkisi yanlış']])),
    m('locKomut', '1c. LOC komutları (göz, el)',  o([[0,'İkisini yapar'],[1,'Birini yapar'],[2,'Hiçbirini']])),
    m('bakis',    '2. En iyi bakış',              o([[0,'Normal'],[1,'Kısmi felç'],[2,'Zorlu deviasyon']])),
    m('gorme',    '3. Görme alanı',               o([[0,'Kayıp yok'],[1,'Kısmi hemianopi'],[2,'Tam hemianopi'],[3,'Bilateral hemianopi']])),
    m('fasial',   '4. Fasiyal paralizi',          o([[0,'Normal'],[1,'Minör'],[2,'Kısmi'],[3,'Tam']])),
    m('kolSol',   '5a. Sol kol motor',            o([[0,'Drift yok'],[1,'Drift'],[2,'Yerçekimine karşı çabalar'],[3,'Yerçekimine karşı hareket yok'],[4,'Hareket yok']])),
    m('kolSag',   '5b. Sağ kol motor',            o([[0,'Drift yok'],[1,'Drift'],[2,'Yerçekimine karşı çabalar'],[3,'Yerçekimine karşı hareket yok'],[4,'Hareket yok']])),
    m('bacakSol', '6a. Sol bacak motor',          o([[0,'Drift yok'],[1,'Drift'],[2,'Yerçekimine karşı çabalar'],[3,'Yerçekimine karşı hareket yok'],[4,'Hareket yok']])),
    m('bacakSag', '6b. Sağ bacak motor',          o([[0,'Drift yok'],[1,'Drift'],[2,'Yerçekimine karşı çabalar'],[3,'Yerçekimine karşı hareket yok'],[4,'Hareket yok']])),
    m('ataksi',   '7. Ekstremite ataksisi',       o([[0,'Yok'],[1,'Bir ekstremite'],[2,'İki ekstremite']])),
    m('duyu',     '8. Duyu',                       o([[0,'Normal'],[1,'Hafif-orta kayıp'],[2,'Ağır kayıp']])),
    m('dil',      '9. En iyi dil',                 o([[0,'Afazi yok'],[1,'Hafif-orta afazi'],[2,'Ağır afazi'],[3,'Mutizm / global afazi']])),
    m('dizartri', '10. Dizartri',                  o([[0,'Normal'],[1,'Hafif-orta'],[2,'Ağır']])),
    m('ihmal',    '11. Söndürme / ihmal',          o([[0,'Yok'],[1,'Hafif (tek modalite)'],[2,'Ağır (çoklu)']]))
  ],

  calc(v) {
    const bilesenler = this.inputs.map(inp => ({
      ad: inp.label,
      puan: +v[inp.key] || 0
    }));
    const puan = bilesenler.reduce((s, b) => s + b.puan, 0);
    return { puan, max: 42, bilesenler };
  },

  interpret(r) {
    const p = r.puan;
    if (p === 0) {
      return { etiket: '0 — inme bulgusu yok', seviye: 'stabil',
        mesaj: 'NIHSS 0. Belirgin nörolojik defisit saptanmadı.', detay: '' };
    }
    if (p <= 4) {
      return { etiket: `${p} — minör inme`, seviye: 'izlem',
        mesaj: 'Hafif inme. Reperfüzyon kararı klinik bağlama göre (hafif ama dizabilite yapan defisitlerde tPA değerlendirilebilir).',
        detay: 'Düzenli nörolojik takip; kötüleşmede tekrar skorla.' };
    }
    if (p <= 15) {
      return { etiket: `${p} — orta inme`, seviye: 'kritik',
        mesaj: 'Orta şiddette inme. Akut reperfüzyon (tPA ± trombektomi) için zaman penceresi ve görüntülemeyi değerlendir.',
        detay: 'İnme ünitesi izlemi.' };
    }
    if (p <= 20) {
      return { etiket: `${p} — orta-ağır inme`, seviye: 'kritik',
        mesaj: 'Orta-ağır inme. Büyük damar oklüzyonu olasılığı yüksek — trombektomi açısından acil görüntüleme.',
        detay: 'NIHSS ≥6 + LVO trombektomi adayı olabilir.' };
    }
    return { etiket: `${p} — ağır inme`, seviye: 'kritik',
      mesaj: 'Ağır inme. Yüksek mortalite/dizabilite riski; acil inme ekibi, hemorajik dönüşüm ve havayolu açısından yakın izlem.',
      detay: 'Yüksek NIHSS kanama riskini de artırır — reperfüzyon kararı multidisipliner.' };
  }
};
