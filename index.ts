import { WhatsappSocketEnvelope } from "./whatsapp_main.js";

const bot = new WhatsappSocketEnvelope();
bot.connect().catch(console.error);
