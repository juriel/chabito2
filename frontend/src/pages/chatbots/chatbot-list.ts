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
          ? html`<p class="text-sm text-slate-500">Aún no hay chatbots. Crea uno para ver el QR y el status.</p>`
          : this.sessions.map((session) => html`<chatbot-card .session=${session}></chatbot-card>`)}
      </div>
    `;
  }
}

customElements.define('chatbot-list', ChatbotList);
