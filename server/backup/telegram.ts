export async function sendTelegramAlert(text: string): Promise<{ sent: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ALERTS_CHAT_ID;
  if (!token || !chatId) return { sent: false };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    if (!r.ok) {
      const body = await r.text();
      return { sent: false, error: `${r.status} ${body.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (err: any) {
    return { sent: false, error: err.message };
  }
}
