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
      <div class="min-h-screen flex flex-col">
        <header class="site-header">
          <nav>
            <a href="/" class="site-brand">
              <img src="${this.logoSrc}" alt="Logo de Chabito" class="site-logo">
              <h1 class="site-title">Chabito</h1>
            </a>
            <div class="site-nav">
              <a href="#/" @click=${(event: Event) => { event.preventDefault(); this.navigate('#/'); }} class="${this.route === '#/' ? 'active' : ''}">Inicio</a>
              <a href="#/chatbots" @click=${(event: Event) => { event.preventDefault(); this.navigate('#/chatbots'); }} class="${this.route === '#/chatbots' ? 'active' : ''}">Chatbots</a>
              <a href="/html/documentation.html">Documentación</a>
            </div>
          </nav>
        </header>

        <main class="flex-grow mx-auto px-6 py-10 max-w-6xl w-full">
          ${this.renderContent()}
        </main>

        <footer class="footer">
          <p>&copy; 2026 Chabito. Todos los derechos reservados.</p>
        </footer>
      </div>
    `;
  }
}

customElements.define('chabito-app', ChabitoApp);
