// Läuft im Hintergrund nach jeder Einreichung: holt das Original-Foto aus dem
// privaten "originals"-Bucket (per service_role Key, umgeht RLS), schickt es
// per Resend als E-Mail an Claas, löscht es danach wieder aus Supabase.
// Schlägt dieser Hintergrund-Schritt fehl, bleibt die eigentliche Einreichung
// trotzdem gültig (steht schon in der Datenbank, bevor diese Funktion läuft).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'claas.altenhr@freenet.de';

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

  const { path, child_name, child_age, story, parent_email } = payload;
  if (!path || !child_name) {
    return { statusCode: 400, body: 'Missing fields' };
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !RESEND_API_KEY) {
    console.error('Fehlende Umgebungsvariablen für notify-submission');
    // 200 zurück, damit der Client nicht denkt, die Einreichung sei fehlgeschlagen —
    // der eigentliche Datensatz steht ja schon sicher in der Datenbank.
    return { statusCode: 200, body: 'skipped (missing env)' };
  }

  try {
    // 1) Original aus dem privaten Bucket laden
    const downloadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/originals/${path}`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` }
    });
    if (!downloadRes.ok) throw new Error(`Download fehlgeschlagen: ${downloadRes.status}`);
    const arrayBuffer = await downloadRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const ext = path.split('.').pop().toLowerCase();
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';

    // 2) Per Resend an Claas mailen
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Zeig dich Mutig <onboarding@resend.dev>',
        to: [NOTIFY_EMAIL],
        subject: `Neue Einreichung: ${child_name} (${child_age} Jahre)`,
        text: `${child_name}, ${child_age} Jahre\n\n${story}\n\nKontakt der Eltern: ${parent_email}\n\nDas Originalfoto in Druckqualität ist angehängt.`,
        attachments: [{ filename: `original-${child_name}.${ext}`, content: base64 }]
      })
    });
    if (!emailRes.ok) throw new Error(`Resend-Fehler: ${emailRes.status} ${await emailRes.text()}`);

    // 3) Original wieder löschen — nur die Mail in Claas' Postfach bleibt als Archiv
    await fetch(`${SUPABASE_URL}/storage/v1/object/originals/${path}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` }
    });

    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    console.error('notify-submission Fehler:', err);
    // Auch im Fehlerfall 200: der Haupt-Datensatz ist unabhängig davon längst gespeichert.
    return { statusCode: 200, body: 'error logged' };
  }
};
