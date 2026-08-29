// Läuft im Hintergrund nach jeder Einreichung: holt das Original-Foto aus dem
// privaten "originals"-Bucket (per service_role Key, umgeht RLS), schickt es
// per Resend als E-Mail an Claas (Dateiname: laufende Nummer_Name_Alter), löscht
// es danach IMMER wieder aus Supabase — auch wenn der Mailversand fehlschlägt,
// damit sich dort niemals Originaldateien ansammeln.
// Schlägt dieser Hintergrund-Schritt fehl, bleibt die eigentliche Einreichung
// trotzdem gültig (steht schon in der Datenbank, bevor diese Funktion läuft).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'claas.altenhr@freenet.de';

function slugify(name) {
  return (name || 'Kind')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // Umlaute/Akzente entfernen
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Kind';
}

async function getRunningNumber() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/submissions?select=id`, {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        Prefer: 'count=exact',
        Range: '0-0'
      }
    });
    const range = res.headers.get('content-range'); // z.B. "0-0/47"
    const total = range ? parseInt(range.split('/')[1], 10) : null;
    return Number.isFinite(total) ? total : 0;
  } catch {
    return 0;
  }
}

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

  let deleted = false;
  const deleteOriginalOnce = async () => {
    if (deleted) return;
    deleted = true;
    await fetch(`${SUPABASE_URL}/storage/v1/object/originals/${path}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` }
    }).catch(err => console.error('Original-Löschung fehlgeschlagen:', err));
  };

  let downloadedOk = false;
  try {
    // 1) Original aus dem privaten Bucket laden
    const downloadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/originals/${path}`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` }
    });
    if (!downloadRes.ok) throw new Error(`Download fehlgeschlagen: ${downloadRes.status}`);
    downloadedOk = true;
    const arrayBuffer = await downloadRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const ext = path.split('.').pop().toLowerCase();

    const runningNumber = await getRunningNumber();
    const fileName = `${String(runningNumber).padStart(3, '0')}_${slugify(child_name)}_${child_age}.${ext}`;

    try {
      // 2) Per Resend an Claas mailen
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Zeig dich Mutig <onboarding@resend.dev>',
          to: [NOTIFY_EMAIL],
          subject: `#${runningNumber} Neue Einreichung: ${child_name} (${child_age} Jahre)`,
          text: `#${runningNumber} — ${child_name}, ${child_age} Jahre\n\n${story}\n\nKontakt der Eltern: ${parent_email}\n\nDas Originalfoto in Druckqualität ist angehängt (${fileName}).`,
          attachments: [{ filename: fileName, content: base64 }]
        })
      });
      if (!emailRes.ok) throw new Error(`Resend-Fehler: ${emailRes.status} ${await emailRes.text()}`);
    } finally {
      // Original IMMER löschen, sobald wir es heruntergeladen haben — unabhängig
      // davon, ob der Mailversand geklappt hat. Sonst sammeln sich bei einzelnen
      // Resend-Ausfällen dauerhaft Originaldateien im Speicher an.
      await deleteOriginalOnce();
    }

    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    console.error('notify-submission Fehler:', err);
    if (downloadedOk) await deleteOriginalOnce();
    // Auch im Fehlerfall 200: der Haupt-Datensatz ist unabhängig davon längst gespeichert.
    return { statusCode: 200, body: 'error logged' };
  }
};
