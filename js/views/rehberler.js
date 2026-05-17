export class RehberlerView {
  render() {
    return `
      <div class="view-container">
        <div class="coming-soon">
          <div class="cs-icon">📋</div>
          <div class="cs-title">Klinik Rehberler</div>
          <div class="cs-desc">
            HFrEF GDMT, KOAH alevlenme (GOLD 2025), T2DM+KBH (KDIGO 2024),
            hipertiroidi DDx ve FMF Tel-Hashomer algoritmaları bu fazda gelecek.
          </div>
          <span class="cs-version">v0.5-rehber</span>
        </div>
      </div>
    `;
  }

  afterRender() {}
}
