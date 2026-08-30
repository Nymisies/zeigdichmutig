// Verschickt den Link zum kostenlosen Kurs "Kleine Helden" an die Eltern,
// wenn sie das beim Absenden angehakt haben. Läuft im Hintergrund, ein
// Fehlschlag hier hat keinen Einfluss auf die eigentliche Einreichung
// (die steht schon vorher sicher in der Datenbank).

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FREEBIE_URL = 'https://stark-in-action.thrivecart.com/kleine-helden/';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { parent_email, child_name } = payload;
  if (!parent_email) {
    return { statusCode: 400, body: 'Missing parent_email' };
  }

  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY fehlt für send-freebie');
    return { statusCode: 200, body: 'skipped (missing env)' };
  }

  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Stark in Action <onboarding@resend.dev>',
        to: [parent_email],
        subject: 'Dein Geschenk: Kurs "Kleine Helden"',
        text: `Hallo,\n\nvielen Dank, dass ${child_name || 'ihr'} bei "Zeig dich Mutig" mitmacht!\n\nWie versprochen hier dein kostenloser Kurs "Kleine Helden" – mit Impulsen, wie du dein Kind resilient und mutig begleiten kannst:\n${FREEBIE_URL}\n\nViel Freude damit!\nDein Team von Stark in Action`,
        html: `<p>Hallo,</p><p>vielen Dank, dass ${child_name || 'ihr'} bei <strong>"Zeig dich Mutig"</strong> mitmacht!</p><p>Wie versprochen hier dein kostenloser Kurs <strong>"Kleine Helden"</strong> – mit Impulsen, wie du dein Kind resilient und mutig begleiten kannst:</p><p><a href="${FREEBIE_URL}">${FREEBIE_URL}</a></p><p>Viel Freude damit!<br>Dein Team von Stark in Action</p>`
      })
    });
    if (!emailRes.ok) throw new Error(`Resend-Fehler: ${emailRes.status} ${await emailRes.text()}`);
    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    console.error('send-freebie Fehler:', err);
    return { statusCode: 200, body: 'error logged' };
  }
};
