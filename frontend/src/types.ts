export interface ChatbotSession {
  uuid: string;
  status: string;
  qrUrl?: string;
  loading: boolean;
  error?: string;
}

export const API_BASE = 'http://localhost:3000';
