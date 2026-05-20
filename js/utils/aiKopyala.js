// AI yanıt kopyalama yardımcıları — marked.js global olarak yüklü olmalı

export async function copyMarkdown(text) {
  await navigator.clipboard.writeText(text || '');
}

export async function copyPlainText(markdownText) {
  let html = markdownText || '';
  if (window.marked?.parse) {
    try { html = window.marked.parse(markdownText, { breaks: true }); } catch { /* fallback */ }
  }
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const plain = (tmp.textContent || tmp.innerText || '').trim();
  await navigator.clipboard.writeText(plain);
}
