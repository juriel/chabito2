import { LitElement, html } from 'lit';

interface ChatbotSession {
  uuid: string;
  status: string;
  qrUrl?: string;
  loading: boolean;
  error?: string;
}

const API_BASE = 'http://localhost:3000';

export class ChabitoApp extends LitElement {
  createRenderRoot() {
    return this;
  }

  static get properties() {
    return {
      route: { type: String },
      sessions: { type: Array },
      uuidInput: { type: String },
      apiError: { type: String }
    };
  }

  declare private route: string;
  declare private sessions: ChatbotSession[];
  declare private uuidInput: string;
  declare private apiError: string;

  constructor() {
    super();
    this.route = window.location.hash || '#/';
    this.sessions = [];
    this.uuidInput = '';
    this.apiError = '';
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('hashchange', this.handleHashChange);
    this.loadSessions();
  }

  private async loadSessions() {
    try {
      const response = await fetch(`${API_BASE}/api/sessions`);
      if (response.ok) {
        const data = await response.json();
        this.sessions = data.sessions.map((s: any) => ({
          uuid: s.uuid,
          status: s.status || 'UNKNOWN',
          loading: false
        }));
        this.requestUpdate('sessions');
        for (const session of this.sessions) {
          this.scheduleQrRefresh(session.uuid);
        }
      }
    } catch (error) {
      console.error('[Frontend] Error loading sessions', error);
    }
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
    console.log('[Frontend] navigate()', { route });
    window.location.hash = route;
    this.route = route;
    this.requestUpdate('route');
  }

  private async createSession(uuid: string) {
    console.log('[Frontend] createSession()', { uuid });
    const existingIndex = this.sessions.findIndex((item) => item.uuid === uuid);
    const session: ChatbotSession = {
      uuid,
      status: 'creando',
      loading: true,
    };

    if (existingIndex >= 0) {
      this.sessions = [
        ...this.sessions.slice(0, existingIndex),
        session,
        ...this.sessions.slice(existingIndex + 1),
      ];
    } else {
      this.sessions = [...this.sessions, session];
    }
    this.requestUpdate();

    try {
      console.log('[Frontend] POST', `${API_BASE}/api/sessions/${encodeURIComponent(uuid)}`);
      const response = await fetch(`${API_BASE}/api/sessions/${encodeURIComponent(uuid)}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        console.error('[Frontend] createSession failed', response.status, response.statusText, text);
        const body = (() => {
          try {
            return JSON.parse(text);
          } catch {
            return {};
          }
        })();
        throw new Error(body?.error || `Error creando sesión (${response.status})`);
      }

      console.log('[Frontend] createSession succeeded', uuid);
      await this.refreshSession(uuid);
      this.scheduleQrRefresh(uuid);
      this.apiError = '';
      this.uuidInput = ''; // Clear input on success
      this.requestUpdate();
    } catch (error: unknown) {
      console.error('[Frontend] createSession error', error);
      const message = error instanceof Error ? error.message : String(error);
      this.sessions = this.sessions.map((item) =>
        item.uuid === uuid ? { ...item, status: 'error', loading: false, error: message } : item
      );
      this.apiError = message;
      this.requestUpdate();
    }
  }

  private scheduleQrRefresh(uuid: string, attempt = 0) {
    const maxAttempts = 8;
    const currentSession = this.sessions.find((item) => item.uuid === uuid);

    if (!currentSession || currentSession.status === 'open') {
      console.log('[Frontend] scheduleQrRefresh stop', { uuid, status: currentSession?.status });
      return;
    }

    if (attempt >= maxAttempts) {
      console.warn('[Frontend] scheduleQrRefresh max attempts reached', { uuid, attempt });
      return;
    }

    const delay = attempt === 0 ? 2000 : 5000;
    console.log('[Frontend] scheduleQrRefresh', { uuid, attempt, delay });

    setTimeout(async () => {
      await this.refreshSession(uuid);
      this.scheduleQrRefresh(uuid, attempt + 1);
    }, delay);
  }

  private async refreshSession(uuid: string) {
    const sessionIndex = this.sessions.findIndex((item) => item.uuid === uuid);
    if (sessionIndex < 0) return;

    this.sessions = this.sessions.map((item) =>
      item.uuid === uuid ? { ...item, loading: true, error: undefined } : item
    );
    this.requestUpdate();

    try {
      console.log('[Frontend] refreshSession()', { uuid });
      const statusResponse = await fetch(`${API_BASE}/api/sessions/${encodeURIComponent(uuid)}/status`);
      if (!statusResponse.ok) {
        const text = await statusResponse.text().catch(() => '');
        console.error('[Frontend] refreshSession status failed', statusResponse.status, statusResponse.statusText, text);
        throw new Error(`Status request failed (${statusResponse.status})`);
      }

      const statusData = await statusResponse.json();
      console.log('[Frontend] refreshSession statusData', statusData);
      const status = statusData?.state || 'unknown';
      const qrUrl = statusData?.qr
        ? `${API_BASE}/api/sessions/${encodeURIComponent(uuid)}/qr/png?cache=${Date.now()}`
        : undefined;
      console.log('[Frontend] refreshSession computed qrUrl', { uuid, status, qrUrl });

      this.sessions = this.sessions.map((item) =>
        item.uuid === uuid
          ? { ...item, status, qrUrl, loading: false, error: undefined }
          : item
      );
      this.apiError = '';
      this.requestUpdate();
    } catch (error: unknown) {
      console.error('[Frontend] refreshSession error', error);
      const message = error instanceof Error ? error.message : String(error);
      this.sessions = this.sessions.map((item) =>
        item.uuid === uuid ? { ...item, loading: false, error: message } : item
      );
      this.apiError = message;
      this.requestUpdate();
    }
  }

  private handleQrImageLoad(uuid: string) {
    console.log('[Frontend] QR image loaded', { uuid });
  }

  private handleQrImageError(uuid: string) {
    console.error('[Frontend] QR image failed to load', { uuid });
  }

  private handleCreate = (event: Event) => {
    event.preventDefault();
    const uuid = this.uuidInput.trim();
    console.log('[Frontend] handleCreate()', { uuid });
    if (!uuid) {
      console.warn('[Frontend] handleCreate invalid uuid', { uuid });
      this.apiError = 'Ingresa un UUID válido para crear la sesión.';
      this.requestUpdate();
      return;
    }
    this.apiError = '';
    this.requestUpdate();
    this.createSession(uuid);
  };

  private updateUuid = (event: Event) => {
    const input = event.target as HTMLInputElement;
    this.uuidInput = input.value;
    this.requestUpdate();
  };

  private renderedSession(session: ChatbotSession) {
    const badgeClasses = session.status === 'open'
      ? 'bg-emerald-100 text-emerald-700'
      : session.status === 'error'
      ? 'bg-rose-100 text-rose-700'
      : 'bg-amber-100 text-amber-700';

    return html`
      <article class="rounded-3xl border border-slate-200 bg-white shadow-lg overflow-hidden">
        <div class="px-6 py-5 border-b border-slate-200">
          <h3 class="text-lg font-semibold text-slate-900">${session.uuid}</h3>
          <p class="text-sm text-slate-500 mt-1">
            Estado: <span class="inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${badgeClasses}">${session.status}</span>
          </p>
        </div>
        <div class="p-6 grid gap-4">
          <div class="min-h-[220px] rounded-3xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center">
            ${session.loading
              ? html`<span class="text-slate-500">Cargando QR...</span>`
              : session.qrUrl
              ? html`<img src="${session.qrUrl}" alt="QR de ${session.uuid}" class="max-w-full h-auto rounded-2xl" @load=${() => this.handleQrImageLoad(session.uuid)} @error=${() => this.handleQrImageError(session.uuid)} />`
              : html`<span class="text-slate-500">QR no disponible</span>`}
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <button class="inline-flex items-center justify-center rounded-full bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              @click=${() => this.refreshSession(session.uuid)} ?disabled=${session.loading}>
              Refrescar QR
            </button>
            <button class="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:border-slate-200"
              @click=${() => this.refreshSession(session.uuid)} ?disabled=${session.loading}>
              Actualizar estado
            </button>
          </div>
          ${session.error ? html`<p class="text-sm font-semibold text-rose-600">${session.error}</p>` : ''}
          <p class="text-sm text-slate-500">GET /api/sessions/${session.uuid}/qr/png</p>
        </div>
      </article>
    `;
  }

  private landingPage() {
    return html`
      <section class="rounded-[2rem] bg-gradient-to-br from-violet-700 via-fuchsia-600 to-pink-500 px-8 py-16 text-white shadow-[0_28px_80px_rgba(15,23,42,0.12)] text-center">
        <h1 class="text-4xl font-extrabold tracking-tight sm:text-5xl">Chabito</h1>
        <p class="mx-auto mt-6 max-w-2xl text-base leading-8 text-violet-100 sm:text-lg">
          Tu asistente WhatsApp con IA, listo para lanzar chatbots y emparejar sesiones con QR.
        </p>
        <div class="mt-10 grid gap-4 sm:grid-cols-2 justify-center">
          <a href="#/chatbots" @click=${(event: Event) => { event.preventDefault(); this.navigate('#/chatbots'); }} class="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold transition hover:bg-violet-50" style="color: #6d28d9 !important;">Administrar Chatbots</a>
          <a href="/html/documentation.html" class="inline-flex items-center justify-center rounded-full border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/20">Documentación</a>
        </div>
      </section>

      <section class="py-20">
        <h2 class="text-3xl font-bold text-slate-900 text-center">Qué puedes hacer</h2>
        <div class="mt-12 grid gap-6 lg:grid-cols-3">
          <div class="rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
            <div class="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-3xl bg-violet-100 text-2xl">🤖</div>
            <h3 class="text-xl font-semibold text-slate-900">Crear chatbots</h3>
            <p class="mt-3 text-slate-600">Inicializa sesiones por UUID y muestra su QR en pantalla.</p>
          </div>
          <div class="rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
            <div class="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-3xl bg-fuchsia-100 text-2xl">📱</div>
            <h3 class="text-xl font-semibold text-slate-900">Monitorear estado</h3>
            <p class="mt-3 text-slate-600">Actualiza el estado de cada sesión y revisa si ya fue emparejada.</p>
          </div>
          <div class="rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
            <div class="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-3xl bg-pink-100 text-2xl">⚡</div>
            <h3 class="text-xl font-semibold text-slate-900">Ver QR PNG</h3>
            <p class="mt-3 text-slate-600">Obtén el QR directamente desde el endpoint y refresca la imagen cuando quieras.</p>
          </div>
        </div>
      </section>
    `;
  }

  private chatbotsPage() {
    console.log('[Frontend] chatbotsPage rendering, sessions:', this.sessions.length);
    return html`
      <section class="py-20">
        <div class="mx-auto max-w-4xl rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl">
          <h2 class="text-3xl font-bold text-slate-900">Chatbots</h2>
          <div class="mt-8 grid gap-6">
            <div class="grid gap-3">
              <label for="uuid" class="text-sm font-semibold text-slate-700">UUID del chatbot</label>
              <input id="uuid" type="text" .value=${this.uuidInput} @input=${this.updateUuid} placeholder="ejemplo: demo-session"
                class="rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-violet-500 focus:bg-white" />
            </div>
            <p class="text-sm text-slate-500">Cada UUID crea una nueva sesión /api/sessions/:uuid y permite mostrar su QR.</p>
            ${this.apiError ? html`<p class="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">${this.apiError}</p>` : ''}
            <button class="inline-flex w-full items-center justify-center rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
              @click=${this.handleCreate}>Crear chatbot</button>
          </div>

          <div class="mt-10 grid gap-6 md:grid-cols-2">
            ${this.sessions.length === 0
              ? html`<p class="text-sm text-slate-500">Aún no hay chatbots. Crea uno para ver el QR y el status.</p>`
              : this.sessions.map((session) => this.renderedSession(session))}
          </div>
        </div>
      </section>
    `;
  }

  private renderContent() {
    switch (this.route) {
      case '#/chatbots':
        return this.chatbotsPage();
      default:
        return this.landingPage();
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
            </div>
          </section>
        </main>

        <footer class="border-t border-slate-200 bg-slate-50">
          <div class="mx-auto px-6 py-8 text-center text-sm text-slate-500 max-w-6xl">&copy; 2026 Chabito</div>
        </footer>
      </div>
    `;
  }

  private async refreshAllSessions() {
    await Promise.all(this.sessions.map((session) => this.refreshSession(session.uuid)));
  }
}

customElements.define('chabito-app', ChabitoApp);
