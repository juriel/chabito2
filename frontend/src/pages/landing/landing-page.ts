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
      <section class="hero-float">
        <div class="hero-grid">
          <div>
            <span class="eyebrow">Asistente de WhatsApp con IA</span>
            <h1 class="hero-title">Conversa sin <span>fricción</span>.</h1>
            <p class="hero-copy">Lanza sesiones, vincula cuentas con un QR y administra tus chatbots desde un panel sereno y claro.</p>
            <div class="hero-actions">
              <a href="#/chatbots" @click=${(event: Event) => { event.preventDefault(); this.navigate('#/chatbots'); }} class="btn btn-primary btn-lg">Administrar chatbots</a>
              <a href="/html/documentation.html" class="btn btn-outline btn-lg">Documentación</a>
            </div>
          </div>
          <div class="float-stack" aria-hidden="true">
            <div class="float-card float-main">
              <div class="preview-head"><span>demo-session</span><span class="badge badge-open">Conectado</span></div>
              <div class="preview-body">
                <div class="preview-avatar">C</div>
                <div><p class="preview-name">Chabito</p><p class="preview-meta">+57 300 000 0000</p></div>
              </div>
            </div>
            <div class="float-card float-chat">
              <div class="preview-bubbles">
                <div class="bubble bubble-in">Hola, ¿tienen disponible el plan mensual?</div>
                <div class="bubble bubble-out">¡Hola! Sí, te cuento los detalles 👋</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="split">
        <div>
          <h2 class="section-heading">Tres pasos,<br />sin complicarte.</h2>
          <p class="section-copy">De una instancia nueva a un WhatsApp respondiendo, todo desde el mismo lugar.</p>
        </div>
        <div class="steps">
          <div class="card step"><h3>Crea una instancia</h3><p>Asigna un UUID a tu chatbot desde el panel.</p></div>
          <div class="card step"><h3>Escanea el QR</h3><p>Vincula tu WhatsApp desde Dispositivos vinculados.</p></div>
          <div class="card step"><h3>Listo para responder</h3><p>El estado, el número y el avatar quedan a la vista.</p></div>
        </div>
      </section>

      <section class="features">
        <div class="card lift feature-card">
          <div class="feature-icon">🤖</div>
          <h3 class="feature-title">Crear chatbots</h3>
          <p class="feature-copy">Inicializa sesiones por UUID y vincula cada una escaneando su QR.</p>
        </div>
        <div class="card lift feature-card">
          <div class="feature-icon">📱</div>
          <h3 class="feature-title">Monitorear estado</h3>
          <p class="feature-copy">Consulta si cada sesión está conectada, con el número y el avatar de la cuenta.</p>
        </div>
        <div class="card lift feature-card">
          <div class="feature-icon">🔄</div>
          <h3 class="feature-title">Renovar el QR</h3>
          <p class="feature-copy">Si una sesión se desconecta, genera un QR nuevo con un clic.</p>
        </div>
      </section>
    `;
  }
}

customElements.define('chabito-landing', LandingPage);
