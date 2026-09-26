// Geschützter Zugriff für die Admin-Seite (admin.html): listet Einreichungen
// und ändert ihren Status (approved/rejected) oder löscht sie (z.B. Duplikate).
// Passwort wird serverseitig gegen ADMIN_PASSWORD (Netlify-Umgebungsvariable)
// geprüft — steht niemals im Frontend-Code. Nutzt intern den service_role
// Key, um RLS zu umgehen (die Tabelle ist für anon absichtlich gesperrt).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ADMIN_PASSWORD) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server nicht korrekt konfiguriert (fehlende Umgebungsvariablen).' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { password, action, id, status } = payload;

  if (password !== ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Falsches Passwort' }) };
  }

  const headers = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    if (action === 'list') {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/submissions?select=id,child_name,child_age,story,image_path,parent_email,status,votes,wants_freebie,created_at&order=created_at.desc`,
        { headers }
      );
      const data = await res.json();
      return { statusCode: 200, body: JSON.stringify(data) };
    }

    if (action === 'set_status') {
      if (!id || !['approved', 'rejected', 'pending'].includes(status)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Ungültige Anfrage' }) };
      }
      const res = await fetch(`${SUPABASE_URL}/rest/v1/submissions?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error(`Update fehlgeschlagen: ${res.status}`);
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'delete') {
      if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'Ungültige Anfrage' }) };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/submissions?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { ...headers, Prefer: 'return=minimal' }
      });
      if (!res.ok) throw new Error(`Löschen fehlgeschlagen: ${res.status}`);
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Unbekannte Aktion' }) };
  } catch (err) {
    console.error('admin.js Fehler:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Serverfehler' }) };
  }
};
