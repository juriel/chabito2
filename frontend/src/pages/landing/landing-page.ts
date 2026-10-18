import { LitElement, html } from 'lit';

export class LandingPage extends LitElement {
  private readonly logoSrc = '/images/chabi-logo-web.svg';

  createRenderRoot() {
    return this;
  }

  private navigate(route: string) {
    window.location.hash = route;
  }

  render() {
    return html`
      <section class="hero">
        <div class="hero-grid">
          <div>
            <div class="hero-logo"><img src="${this.logoSrc}" alt="Logo de Chabito" class="h-14 w-14" /></div>
            <h1 class="hero-title">Chabito</h1>
            <p class="hero-copy">Tu asistente de WhatsApp con IA para lanzar sesiones, vincular cuentas con un QR y administrar tus chatbots desde una interfaz simple.</p>
            <div class="hero-actions">
              <a href="#/chatbots" @click=${(event: Event) => { event.preventDefault(); this.navigate('#/chatbots'); }} class="btn btn-light btn-lg">Administrar chatbots</a>
              <a href="/html/documentation.html" class="btn btn-ghost-light btn-lg">Documentación</a>
            </div>
          </div>
          <div class="hero-preview" aria-hidden="true">
            <div class="preview-head"><span>demo-session</span><span class="badge badge-open">Conectado</span></div>
            <div class="preview-body">
              <div class="preview-avatar">C</div>
              <div><p class="preview-name">Chabito</p><p class="preview-meta">+57 300 000 0000</p></div>
            </div>
            <div class="preview-bubbles">
              <div class="bubble bubble-in">Hola, ¿tienen disponible el plan mensual?</div>
              <div class="bubble bubble-out">¡Hola! Sí, te cuento los detalles 👋</div>
            </div>
          </div>
        </div>
      </section>

      <section class="pt-16">
        <h2 class="section-heading">Cómo funciona</h2>
        <div class="steps">
          <div class="card step"><h3>Crea una instancia</h3><p>Asigna un UUID a tu chatbot desde el panel.</p></div>
          <div class="card step"><h3>Escanea el QR</h3><p>Vincula tu WhatsApp desde Dispositivos vinculados.</p></div>
          <div class="card step"><h3>Listo para responder</h3><p>El estado, número y avatar quedan visibles en el panel.</p></div>
        </div>
      </section>

      <section class="py-16">
        <h2 class="section-heading">Qué puedes hacer</h2>
        <div class="grid gap-6 md:grid-cols-3">
          <div class="card feature-card">
            <div class="feature-icon">🤖</div>
            <h3 class="feature-title">Crear chatbots</h3>
            <p class="feature-copy">Inicializa sesiones por UUID y vincula cada una escaneando su QR.</p>
          </div>
          <div class="card feature-card">
            <div class="feature-icon">📱</div>
            <h3 class="feature-title">Monitorear estado</h3>
            <p class="feature-copy">Consulta si cada sesión está conectada, con el número y el avatar de la cuenta.</p>
          </div>
          <div class="card feature-card">
            <div class="feature-icon">🔄</div>
            <h3 class="feature-title">Renovar el QR</h3>
            <p class="feature-copy">Si una sesión se desconecta, genera un QR nuevo con un clic.</p>
          </div>
        </div>
      </section>
    `;
  }
}

customElements.define('chabito-landing', LandingPage);
