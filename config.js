// Supabase-Zugangsdaten. Der "anon public" Key ist bewusst öffentlich im Frontend-Code
// sichtbar — Sicherheit läuft über Row Level Security in der Datenbank, nicht über
// Geheimhaltung dieses Keys. Den "service_role" Key hier NIEMALS eintragen.
export const SUPABASE_URL = 'HIER_SUPABASE_URL_EINTRAGEN';
export const SUPABASE_ANON_KEY = 'HIER_ANON_KEY_EINTRAGEN';
