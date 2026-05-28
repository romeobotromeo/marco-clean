const axios = require('axios');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHIEF_CHAT_ID =
  process.env.TELEGRAM_CHIEF_OF_STAFF_CHAT_ID ||
  process.env.TELEGRAM_CHIEF_CHAT_ID ||
  null;

const TELEGRAM_PRIMARY_CHAT_ID =
  process.env.TELEGRAM_PRIMARY_CHAT_ID ||
  process.env.TELEGRAM_OPERATOR_CHAT_ID ||
  process.env.TELEGRAM_OWNER_CHAT_ID ||
  null;

const TELEGRAM_ALLOWED_CHAT_IDS = (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

if (TELEGRAM_CHIEF_CHAT_ID && !TELEGRAM_ALLOWED_CHAT_IDS.includes(String(TELEGRAM_CHIEF_CHAT_ID))) {
  TELEGRAM_ALLOWED_CHAT_IDS.push(String(TELEGRAM_CHIEF_CHAT_ID));
}

if (TELEGRAM_PRIMARY_CHAT_ID && !TELEGRAM_ALLOWED_CHAT_IDS.includes(String(TELEGRAM_PRIMARY_CHAT_ID))) {
  TELEGRAM_ALLOWED_CHAT_IDS.push(String(TELEGRAM_PRIMARY_CHAT_ID));
}

const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || null;

const API_BASE = TELEGRAM_BOT_TOKEN ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}` : null;

function isConfigured() {
  return Boolean(TELEGRAM_BOT_TOKEN);
}

async function sendMessage({
  chatId = TELEGRAM_CHIEF_CHAT_ID,
  text,
  parseMode,
  disableNotification,
  replyMarkup,
}) {
  if (!isConfigured()) throw new Error('telegram_not_configured');

  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) throw new Error('telegram_empty_message');

  if (!chatId) throw new Error('telegram_chat_id_missing');

  const payload = {
    chat_id: chatId,
    text: trimmed,
    disable_web_page_preview: true,
  };

  if (parseMode) payload.parse_mode = parseMode;
  if (typeof disableNotification === 'boolean') payload.disable_notification = disableNotification;
  if (replyMarkup) payload.reply_markup = replyMarkup;

  const { data } = await axios.post(`${API_BASE}/sendMessage`, payload);
  return data;
}

function extractMessage(update) {
  if (!update || typeof update !== 'object') return null;

  const message =
    update.message ||
    update.edited_message ||
    update.channel_post ||
    update.edited_channel_post ||
    (update.callback_query && update.callback_query.message) ||
    null;

  if (!message) return null;

  const text =
    message.text ||
    message.caption ||
    (update.callback_query && update.callback_query.data) ||
    null;

  const from = message.from || (update.callback_query && update.callback_query.from) || null;
  const chatId = (message.chat && message.chat.id) || null;

  return {
    updateId: update.update_id,
    chatId,
    text,
    from,
    message,
  };
}

function isChatAllowed(chatId) {
  if (!chatId) return false;
  if (!TELEGRAM_ALLOWED_CHAT_IDS.length) return true;
  return TELEGRAM_ALLOWED_CHAT_IDS.includes(String(chatId));
}

function formatSender(from) {
  if (!from) return 'unknown';
  const parts = [];
  if (from.first_name || from.last_name) {
    parts.push([from.first_name, from.last_name].filter(Boolean).join(' ').trim());
  }
  if (from.username) {
    parts.push(`@${from.username}`);
  }
  if (!parts.length && from.id) {
    parts.push(String(from.id));
  }
  return parts.filter(Boolean).join(' ');
}

module.exports = {
  isConfigured,
  sendMessage,
  extractMessage,
  isChatAllowed,
  formatSender,
  TELEGRAM_CHIEF_CHAT_ID: TELEGRAM_CHIEF_CHAT_ID ? String(TELEGRAM_CHIEF_CHAT_ID) : null,
  TELEGRAM_PRIMARY_CHAT_ID: TELEGRAM_PRIMARY_CHAT_ID ? String(TELEGRAM_PRIMARY_CHAT_ID) : null,
  TELEGRAM_WEBHOOK_SECRET,
  TELEGRAM_ALLOWED_CHAT_IDS,
};