interface SendMessageParams {
  to: string;
  body: string;
  channel?: "sms" | "whatsapp";
}

export function toE164(phone: string): string {
  if (phone.startsWith("+")) return phone;
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("0")) return "+92" + digits.slice(1);
  if (digits.startsWith("92")) return "+" + digits;
  return "+" + digits;
}

let warned = false;

export async function sendTextMessage({ to, body, channel = "sms" }: SendMessageParams): Promise<void> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, TWILIO_WHATSAPP_FROM } = process.env;
  const from = channel === "whatsapp" ? TWILIO_WHATSAPP_FROM : TWILIO_FROM_NUMBER;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !from) {
    if (!warned) {
      console.warn("[sms] Twilio not configured — messages will be logged to console instead of sent.");
      warned = true;
    }
    console.log(`[sms:not-sent] (${channel}) To: ${to} | ${body}`);
    return;
  }

  const toAddress = channel === "whatsapp" ? `whatsapp:${to}` : to;
  const fromAddress = channel === "whatsapp" ? `whatsapp:${from.replace("whatsapp:", "")}` : from;

  try {
    const params = new URLSearchParams({ To: toAddress, From: fromAddress, Body: body });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64"),
      },
      body: params,
    });
    if (!res.ok) console.error(`[sms] Twilio API error (${res.status}):`, await res.text());
  } catch (err) {
    console.error("[sms] Failed to send:", err);
  }
}
