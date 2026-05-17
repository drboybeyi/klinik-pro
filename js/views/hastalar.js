export class HastalarView {
  render() {
    return `
      <div class="view-container">
        <div class="coming-soon">
          <div class="cs-icon">👤</div>
          <div class="cs-title">Hasta Modülü</div>
          <div class="cs-desc">
            Hasta kaydı, SOAP notları, tanı/ilaç/alerji listeleri
            ve detay overlay'i bu fazda gelecek.
          </div>
          <span class="cs-version">v0.2-hasta</span>
        </div>
      </div>
    `;
  }

  afterRender() {}
}
