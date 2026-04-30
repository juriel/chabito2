import { LitElement, html } from 'lit';
import './pages/landing/landing-page.ts';
import './pages/chatbots/chatbots-page.ts';

export class ChabitoApp extends LitElement {
  private readonly logoSrc = '/images/chabi-logo-web.svg';

  createRenderRoot() {
    return this;
  }

  static get properties() {
    return {
      route: { type: String }
    };
  }

  declare private route: string;

  constructor() {
    super();
    this.route = window.location.hash || '#/';
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('hashchange', this.handleHashChange);
  }

  disconnectedCallback() {
    window.removeEventListener('hashchange', this.handleHashChange);
    super.disconnectedCallback();
  }

  private handleHashChange = () => {
    this.route = window.location.hash || '#/';
    this.requestUpdate('route');
  };

  private navigate(route: string) {
    window.location.hash = route;
    this.route = route;
    this.requestUpdate('route');
  }

  private renderContent() {
    switch (this.route) {
      case '#/chatbots':
        return html`<chatbots-page></chatbots-page>`;
      default:
        return html`<chabito-landing></chabito-landing>`;
    }
  }

  render() {
    return html`
      <div class="min-h-screen text-[color:var(--color-text-on-light)]">
        <header class="sticky top-0 z-20 border-b border-[color:var(--color-border)] bg-[rgba(255,255,255,0.94)]">
          <div class="mx-auto flex flex-col gap-4 px-6 py-4 md:flex-row md:items-center md:justify-between max-w-6xl">
            <a href="#/" @click=${(event: Event) => { event.preventDefault(); this.navigate('#/'); }} class="flex items-center gap-3.5">
              <div class="brand-shell h-12 w-12 rounded-[var(--radius-soft)] border border-[color:var(--color-border)] bg-white p-1.5 shadow-[0_8px_18px_rgba(39,0,136,0.05)]">
                <img src="${this.logoSrc}" alt="Logo de Chabito" class="h-full w-full rounded-[4px] bg-white p-1" />
              </div>
              <div class="min-w-0">
                <p class="text-[2rem] leading-none font-black tracking-[0.1em] uppercase text-[color:var(--color-primary)]">Chabito</p>
                <p class="mt-1 text-sm leading-tight text-[color:rgba(26,26,26,0.62)]">Asistente conversacional para WhatsApp</p>
              </div>
            </a>
            <nav class="flex flex-wrap items-center gap-3 text-sm font-semibold tracking-[0.04em] text-[color:rgba(26,26,26,0.76)]">
              <a href="#/" @click=${(event: Event) => { event.preventDefault(); this.navigate('#/'); }} class="panel-chip rounded-[var(--radius-soft)] px-4 py-2 transition ${this.route === '#/' ? 'bg-[color:var(--color-primary)] text-[color:var(--color-text-on-dark)]' : 'hover:bg-[color:var(--color-surface-muted)] hover:text-[color:var(--color-primary)]'}">Inicio</a>
              <a href="#/chatbots" @click=${(event: Event) => { event.preventDefault(); this.navigate('#/chatbots'); }} class="panel-chip rounded-[var(--radius-soft)] px-4 py-2 transition ${this.route === '#/chatbots' ? 'bg-[color:var(--color-primary)] text-[color:var(--color-text-on-dark)]' : 'hover:bg-[color:var(--color-surface-muted)] hover:text-[color:var(--color-primary)]'}">Chatbots</a>
              <a href="/html/documentation.html" class="panel-chip rounded-[var(--radius-soft)] px-4 py-2 transition hover:bg-[color:var(--color-surface-muted)] hover:text-[color:var(--color-primary)]">Documentación</a>
            </nav>
          </div>
        </header>

        <main class="mx-auto px-6 py-10 max-w-6xl">
          ${this.renderContent()}

          <section class="frost-panel mt-16 rounded-[12px] p-8">
            <h3 class="text-2xl font-semibold tracking-[0.04em] text-[color:var(--color-primary)]">Endpoints disponibles</h3>
            <div class="mt-5 space-y-3 text-sm text-[color:rgba(26,26,26,0.76)]">
              <p><strong>POST</strong> /api/sessions/:uuid – Crea una nueva sesión en memoria.</p>
              <p><strong>GET</strong> /api/sessions/:uuid/qr – Devuelve el estado y el QR crudo si existe.</p>
              <p><strong>GET</strong> /api/sessions/:uuid/qr/text – Devuelve el QR en texto ASCII.</p>
              <p><strong>GET</strong> /api/sessions/:uuid/qr/png – Devuelve el QR como imagen PNG.</p>
              <p><strong>GET</strong> /api/sessions/:uuid/status – Devuelve el estado actual de la sesión.</p>
              <p><strong>GET</strong> /api/sessions – Devuelve todas las sesiones activas y su estado.</p>
            </div>
          </section>
        </main>

        <footer class="border-t border-[color:var(--color-border)] bg-[rgba(255,255,255,0.85)]">
          <div class="mx-auto px-6 py-8 text-center text-sm text-[color:rgba(26,26,26,0.62)] max-w-6xl">&copy; 2026 Chabito</div>
        </footer>
      </div>
    `;
  }
}

customElements.define('chabito-app', ChabitoApp);
