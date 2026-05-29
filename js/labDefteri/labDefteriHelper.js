// Lab Defteri Helper (v0.4.7 Sprint 4)
//
// Skor modallarında lab değerlerini hasta.labDefteri'nden ANINDA çekmek için.
// AI çağrısı YOK — defter zaten aiTarayici ile doldurulmuş; burada sadece okunur.
//
// labDefteri yapısı (aiTarayici.buildLabDefteri):
//   hasta.labDefteri.parametreler[key].olcumler = [{ deger, tarih, kaynak }, ...]
//   olcumler yeniden → eskiye sıralı (buildLabDefteri sort eder).

/**
 * Lab Defteri'nden bir parametrenin EN GÜNCEL ölçümünü çek.
 * @returns {{deger, tarih, gunFarki, eski, cokEski, kaynak} | null}
 */
export function sonOlcumGetir(hasta, parametreKey) {
  const defter = hasta?.labDefteri?.parametreler?.[parametreKey];
  if (!defter || !defter.olcumler || defter.olcumler.length === 0) return null;

  // olcumler zaten sıralı (yeni → eski)
  const sonOlcum = defter.olcumler[0];
  if (sonOlcum.deger == null || !sonOlcum.tarih) return null;

  const tetkikTarihi = new Date(sonOlcum.tarih);
  const bugun = new Date();
  const gunFarki = Math.floor((bugun - tetkikTarihi) / (1000 * 60 * 60 * 24));

  return {
    deger:   sonOlcum.deger,
    tarih:   sonOlcum.tarih,
    gunFarki,
    eski:    gunFarki > 30,
    cokEski: gunFarki > 90,
    kaynak:  sonOlcum.kaynak,
    isim:    defter.isim || parametreKey
  };
}

/**
 * Bir skor için gereken tüm lab değerlerini Lab Defteri'nden topla.
 * @returns {Object} key → sonOlcumGetir sonucu (veya null)
 */
export function skorLabDegerleriniTopla(hasta, gerekenParametreler) {
  const sonuc = {};
  for (const param of gerekenParametreler) {
    sonuc[param] = sonOlcumGetir(hasta, param);
  }
  return sonuc;
}

/**
 * Tarih formatla: 2026-05-06 → 06.05.2026
 */
export function formatTarih(isoTarih) {
  if (!isoTarih) return '';
  const [yil, ay, gun] = isoTarih.split('-');
  return `${gun}.${ay}.${yil}`;
}
