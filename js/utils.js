const AYLAR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
               'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

export function bugun() {
  return new Date().toISOString().slice(0, 10);
}

export function formatTarih(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${AYLAR[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatAy(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + '-01T00:00:00');
  return `${AYLAR[d.getMonth()]} ${d.getFullYear()}`;
}

export function gunFarki(date1, date2) {
  const d1 = new Date(date1 + 'T00:00:00');
  const d2 = new Date(date2 + 'T00:00:00');
  return Math.round((d1 - d2) / 86400000);
}

export function yas(dogumTarih) {
  if (!dogumTarih) return null;
  const bugunD = new Date();
  const dogum  = new Date(dogumTarih);
  let y = bugunD.getFullYear() - dogum.getFullYear();
  const m = bugunD.getMonth() - dogum.getMonth();
  if (m < 0 || (m === 0 && bugunD.getDate() < dogum.getDate())) y--;
  return y;
}

export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
