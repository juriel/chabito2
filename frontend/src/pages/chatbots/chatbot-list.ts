import { LitElement, html } from 'lit';
import { type ChatbotSession } from '../../types.ts';
import './chatbot-card.ts';

export class ChatbotList extends LitElement {
  createRenderRoot() {
    return this;
  }

  static get properties() {
    return {
      sessions: { type: Array }
    };
  }

  declare public sessions: ChatbotSession[];

  constructor() {
    super();
    this.sessions = [];
  }

  render() {
    return html`
      <div class="mt-10 grid gap-6 md:grid-cols-2">
        ${this.sessions.length === 0
          ? html`<p class="rounded-[1.5rem] border border-[rgba(183,198,255,0.24)] bg-[rgba(255,255,255,0.22)] px-5 py-4 text-sm text-[color:rgba(26,26,26,0.66)] backdrop-blur-sm">Aún no hay chatbots. Crea uno para ver el QR y el estado.</p>`
          : this.sessions.map((session) => html`<chatbot-card .session=${session}></chatbot-card>`)}
      </div>
    `;
  }
}

customElements.define('chatbot-list', ChatbotList);
