// Skor registry — klinik skor modülleri
import cha2ds2va  from './cha2ds2va.js';
import hasbled    from './hasbled.js';
import ckdEpi2021 from './ckdEpi2021.js';
import meld3      from './meld3.js';
import curb65     from './curb65.js';
import wellsPE    from './wellsPE.js';
import wellsDVT   from './wellsDVT.js';
import pesi       from './pesi.js';
import padua      from './padua.js';
import caprini    from './caprini.js';
import abcd2      from './abcd2.js';
import nihss      from './nihss.js';

export const SKORLAR = [
  cha2ds2va, hasbled, ckdEpi2021, meld3, curb65,
  wellsPE, wellsDVT, pesi, padua, caprini,
  abcd2, nihss
];

const SKOR_MAP = new Map(SKORLAR.map(s => [s.id, s]));

export function getSkor(id) {
  return SKOR_MAP.get(id) || null;
}

export const KATEGORI_LABEL = {
  kardiyo: '❤️ Kardiyoloji',
  renal:   '🫘 Nefroloji',
  hepato:  '🫁 Hepatoloji',
  infek:   '🦠 Enfeksiyon',
  vte:     '🩸 Vasküler / VTE',
  noro:    '🧠 Nöroloji'
};
