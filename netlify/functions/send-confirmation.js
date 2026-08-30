// Verschickt nach JEDER Einreichung eine Bestätigungsmail an die Eltern —
// mit Hinweis auf die Abstimmung ab 1. November (Teilen-Aufruf) und, falls
// gewünscht, dem Link zum kostenlosen Kurs "Kleine Helden". Läuft im
// Hintergrund; ein Fehlschlag hier hat keinen Einfluss auf die eigentliche
// Einreichung (die steht schon vorher sicher in der Datenbank).

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SITE_URL = 'https://zeigdichmutig.netlify.app';
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

  const { parent_email, child_name, wants_freebie } = payload;
  if (!parent_email) {
    return { statusCode: 400, body: 'Missing parent_email' };
  }

  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY fehlt für send-confirmation');
    return { statusCode: 200, body: 'skipped (missing env)' };
  }

  const name = child_name || 'dein Kind';

  const freebieTextBlock = wants_freebie
    ? `\nAls Dankeschön für deine Teilnahme hier dein kostenloser Kurs "Kleine Helden":\n${FREEBIE_URL}\n`
    : '';
  const freebieHtmlBlock = wants_freebie
    ? `<p>Als Dankeschön für deine Teilnahme hier dein kostenloser Kurs <strong>"Kleine Helden"</strong>:<br><a href="${FREEBIE_URL}">${FREEBIE_URL}</a></p>`
    : '';

  const text = `Hallo,\n\nvielen Dank, dass ${name} bei "Zeig dich Mutig" mitmacht! Deine Geschichte ist bei uns angekommen.\n\nWie geht's weiter?\n- Einsendeschluss: 31. Oktober 2026\n- Ab dem 1. November kann hier jeder abstimmen: ${SITE_URL}\n- Teile den Link gerne mit Familie und Freunden, damit möglichst viele für ${name} abstimmen!\n- Die 40 Geschichten mit den meisten Stimmen kommen ins Buch "Zeig dich Mutig" (Dezember 2026), die 3 Kinder mit den meisten Stimmen bekommen ein Exemplar geschenkt.\n${freebieTextBlock}\nWir freuen uns auf dich im November!\nDein Team von Stark in Action`;

  const html = `<p>Hallo,</p><p>vielen Dank, dass ${name} bei <strong>"Zeig dich Mutig"</strong> mitmacht! Deine Geschichte ist bei uns angekommen.</p><p><strong>Wie geht's weiter?</strong></p><ul><li>Einsendeschluss: 31. Oktober 2026</li><li>Ab dem 1. November kann hier jeder abstimmen: <a href="${SITE_URL}">${SITE_URL}</a></li><li>Teile den Link gerne mit Familie und Freunden, damit möglichst viele für ${name} abstimmen!</li><li>Die 40 Geschichten mit den meisten Stimmen kommen ins Buch "Zeig dich Mutig" (Dezember 2026), die 3 Kinder mit den meisten Stimmen bekommen ein Exemplar geschenkt.</li></ul>${freebieHtmlBlock}<p>Wir freuen uns auf dich im November!<br>Dein Team von Stark in Action</p>`;

  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Stark in Action <onboarding@resend.dev>',
        to: [parent_email],
        subject: 'Danke für deine Teilnahme bei "Zeig dich Mutig"',
        text,
        html
      })
    });
    if (!emailRes.ok) throw new Error(`Resend-Fehler: ${emailRes.status} ${await emailRes.text()}`);
    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    console.error('send-confirmation Fehler:', err);
    return { statusCode: 200, body: 'error logged' };
  }
};
