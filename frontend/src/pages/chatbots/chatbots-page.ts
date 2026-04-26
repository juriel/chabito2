import { LitElement, html } from 'lit';
import { API_BASE, type ChatbotSession } from '../../types.ts';
import './chatbot-creation-box.ts';
import './chatbot-list.ts';

export class ChatbotsPage extends LitElement {
  createRenderRoot() {
    return this;
  }

  static get properties() {
    return {
      sessions: { type: Array },
      apiError: { type: String }
    };
  }

  declare private sessions: ChatbotSession[];
  declare private apiError: string;

  constructor() {
    super();
    this.sessions = [];
    this.apiError = '';
  }

  connectedCallback() {
    super.connectedCallback();
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

  private handleRefreshSession = (event: CustomEvent<{ uuid: string }>) => {
    this.refreshSession(event.detail.uuid);
  };

  private handleCreateSession = (event: CustomEvent<{ uuid: string }>) => {
    this.createSession(event.detail.uuid);
  };

  private async createSession(uuid: string) {
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
      const response = await fetch(`${API_BASE}/api/sessions/${encodeURIComponent(uuid)}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const body = (() => {
          try {
            return JSON.parse(text);
          } catch {
            return {};
          }
        })();
        throw new Error(body?.error || `Error creando sesión (${response.status})`);
      }

      await this.refreshSession(uuid);
      this.scheduleQrRefresh(uuid);
      this.apiError = '';
      
      // Select the creation box and clear its input
      const creationBox = this.querySelector('chatbot-creation-box') as any;
      if (creationBox) {
        creationBox.uuidInput = '';
        creationBox.requestUpdate();
      }
      
      this.requestUpdate();
    } catch (error: unknown) {
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
      return;
    }

    if (attempt >= maxAttempts) {
      return;
    }

    const delay = attempt === 0 ? 2000 : 5000;
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
      const statusResponse = await fetch(`${API_BASE}/api/sessions/${encodeURIComponent(uuid)}/status`);
      if (!statusResponse.ok) {
        throw new Error(`Status request failed (${statusResponse.status})`);
      }

      const statusData = await statusResponse.json();
      const status = statusData?.state || 'unknown';
      const qrUrl = statusData?.qr
        ? `${API_BASE}/api/sessions/${encodeURIComponent(uuid)}/qr/png?cache=${Date.now()}`
        : undefined;

      this.sessions = this.sessions.map((item) =>
        item.uuid === uuid
          ? { ...item, status, qrUrl, loading: false, error: undefined }
          : item
      );
      this.apiError = '';
      this.requestUpdate();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.sessions = this.sessions.map((item) =>
        item.uuid === uuid ? { ...item, loading: false, error: message } : item
      );
      this.apiError = message;
      this.requestUpdate();
    }
  }

  render() {
    return html`
      <section class="py-20" @refresh-session=${this.handleRefreshSession} @create-session=${this.handleCreateSession}>
        <div class="mx-auto max-w-4xl rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl">
          <h2 class="text-3xl font-bold text-slate-900 mb-8">Chatbots</h2>
          
          <chatbot-creation-box .apiError=${this.apiError}></chatbot-creation-box>

          <chatbot-list .sessions=${this.sessions}></chatbot-list>
        </div>
      </section>
    `;
  }
}

customElements.define('chatbots-page', ChatbotsPage);
