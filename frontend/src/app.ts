import { LitElement, html } from 'lit';
import './pages/landing/landing-page.ts';
import './pages/chatbots/chatbots-page.ts';

export class ChabitoApp extends LitElement {
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
      <div class="min-h-screen bg-slate-50 text-slate-900">
        <header class="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
          <div class="mx-auto flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between max-w-6xl">
            <h1 class="text-3xl font-extrabold tracking-tight text-violet-700">Chabito</h1>
            <nav class="flex flex-wrap items-center gap-4 text-sm font-medium text-slate-700">
              <a href="#/" @click=${(event: Event) => { event.preventDefault(); this.navigate('#/'); }} class="${this.route === '#/' ? 'text-violet-700' : 'text-slate-700 hover:text-violet-700'}">Inicio</a>
              <a href="#/chatbots" @click=${(event: Event) => { event.preventDefault(); this.navigate('#/chatbots'); }} class="${this.route === '#/chatbots' ? 'text-violet-700' : 'text-slate-700 hover:text-violet-700'}">Chatbots</a>
              <a href="/html/documentation.html" class="text-slate-700 hover:text-violet-700">Documentación</a>
            </nav>
          </div>
        </header>

        <main class="mx-auto px-6 py-10 max-w-6xl">
          ${this.renderContent()}

          <section class="mt-16 rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl">
            <h3 class="text-2xl font-semibold text-slate-900">Endpoints disponibles</h3>
            <div class="mt-5 space-y-3 text-sm text-slate-600">
              <p><strong>POST</strong> /api/sessions/:uuid – Crea una nueva sesión en memoria.</p>
              <p><strong>GET</strong> /api/sessions/:uuid/qr – Devuelve el estado y el QR crudo si existe.</p>
              <p><strong>GET</strong> /api/sessions/:uuid/qr/text – Devuelve el QR en texto ASCII.</p>
              <p><strong>GET</strong> /api/sessions/:uuid/qr/png – Devuelve el QR como imagen PNG.</p>
              <p><strong>GET</strong> /api/sessions/:uuid/status – Devuelve el estado actual de la sesión.</p>
              <p><strong>GET</strong> /api/sessions – Devuelve todas las sesiones activas y su estado.</p>
            </div>
          </section>
        </main>

        <footer class="border-t border-slate-200 bg-slate-50">
          <div class="mx-auto px-6 py-8 text-center text-sm text-slate-500 max-w-6xl">&copy; 2026 Chabito</div>
        </footer>
      </div>
    `;
  }
}

customElements.define('chabito-app', ChabitoApp);
