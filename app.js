import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { compressImage } from './image-utils.js';

const MAX_RAW_PHOTO_BYTES = 25 * 1024 * 1024; // Sanity-Limit fürs Original vor der Komprimierung
const ARCHIVE_WAIT_MS = 30000; // so lange wartet das Formular maximal auf den Original-Upload

// Stiller technischer Fehlerbericht (ohne Namen/Mail/Geschichte) in die Tabelle
// "client_errors". Bewusst per einfachem fetch statt über die Supabase-Bibliothek,
// damit er auch dann funktioniert, wenn genau diese Bibliothek nicht geladen wurde.
// Schlägt der Bericht selbst fehl, passiert nichts — er darf nie etwas kaputt machen.
const reportedSteps = new Set();
function reportClientError(step, err, file) {
  if (reportedSteps.has(step)) return;
  reportedSteps.add(step);
  try {
    fetch(`${SUPABASE_URL}/rest/v1/client_errors`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        step,
        message: ((err && (err.message || err.code)) ? String(err.message || err.code) + (err.cause && err.cause.name ? ` (${err.cause.name})` : '') : String(err)).slice(0, 400),
        user_agent: navigator.userAgent.slice(0, 280),
        file_type: file ? (file.type || null) : null,
        file_size: file ? file.size : null,
        page: location.pathname.slice(0, 190)
      }),
      keepalive: true
    }).catch(() => {});
  } catch { /* ignorieren */ }
}

// Konkrete, hilfreiche Meldung je nachdem, in welchem Schritt es gehakt hat.
function messageForFailure(step, err) {
  if (step === 'init') {
    return 'Die Seite konnte nicht vollständig geladen werden. Bitte lade sie neu. Falls das nicht hilft: Werbeblocker, Kindersicherung oder privates DNS für diese Seite ausschalten oder einen anderen Browser nutzen. (Fehlercode: init)';
  }
  if (step === 'compress') {
    if (err && err.code === 'read') {
      return 'Dein Foto konnte nicht vom Gerät gelesen werden. Vermutlich liegt es noch in der Cloud (z. B. Google Fotos). Bitte lade das Foto zuerst auf dein Handy herunter oder mach einen Screenshot davon und wähle diesen aus. (Fehlercode: lesen)';
    }
    if (err && err.code === 'canvas') {
      return 'Dein Foto ist für dieses Gerät zu groß zum Verkleinern. Bitte wähle ein kleineres Foto oder verkleinere es vorher. (Fehlercode: canvas)';
    }
    return 'Dein Foto konnte nicht verarbeitet werden. Bitte wähle ein anderes Foto im JPG- oder PNG-Format (oder mach einen Screenshot vom Foto). (Fehlercode: foto)';
  }
  if (step === 'upload') {
    return 'Das Foto konnte nicht hochgeladen werden. Bitte prüfe deine Internetverbindung (am besten WLAN) und versuch es noch einmal. (Fehlercode: upload)';
  }
  if (step === 'insert') {
    return 'Deine Geschichte konnte nicht gespeichert werden. Bitte versuch es in ein paar Minuten noch einmal. Wenn es weiter nicht klappt, schreib uns kurz an claas.altenhr@freenet.de. (Fehlercode: speichern)';
  }
  return 'Da ist etwas schiefgelaufen. Bitte versuch es später noch einmal.';
}

// Lädt das unkomprimierte Original in den privaten "originals"-Bucket hoch und
// stößt im Hintergrund die Netlify-Funktion an, die es per Mail an Claas schickt
// und danach wieder löscht. Bewusst ohne await im Aufrufer — ein Fehler hier darf
// die bereits erfolgreiche Einreichung (Foto + Datensatz) nicht rückgängig machen.
async function archiveOriginal(originalFile, baseFileName, meta) {
  try {
    const supabase = getSupabase();
    const originalPath = `orig-${baseFileName}`;
    const { error: origUploadError } = await supabase.storage
      .from('originals')
      .upload(originalPath, originalFile, { cacheControl: '3600', upsert: false });
    if (origUploadError) throw origUploadError;

    // Die Benachrichtigungsmail an Claas läuft im Hintergrund weiter (kein await):
    // Das Original liegt jetzt sicher im privaten Bucket, die Mail ist nur ein Extra.
    fetch('/.netlify/functions/notify-submission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: originalPath,
        child_name: meta.childName,
        child_age: meta.childAge,
        story: meta.story,
        parent_email: meta.parentEmail
      }),
      keepalive: true
    }).catch(err => console.error('Benachrichtigung fehlgeschlagen:', err));
  } catch (err) {
    console.error('Original-Archivierung fehlgeschlagen (Einreichung selbst ist trotzdem gültig):', err);
  }
}

let supabase = null;
function getSupabase() {
  if (!supabase) {
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('Supabase-Bibliothek nicht geladen');
    }
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabase;
}

// Altersauswahl 5-16 befüllen
const ageSelect = document.getElementById('child_age');
for (let age = 5; age <= 16; age++) {
  const opt = document.createElement('option');
  opt.value = age;
  opt.textContent = `${age} Jahre`;
  ageSelect.appendChild(opt);
}

// Live-Zeichenzähler für die Geschichte
const storyInput = document.getElementById('story');
const storyCount = document.getElementById('story-count');
const charCounter = document.querySelector('.char-counter');
const STORY_MAX = parseInt(storyInput.getAttribute('maxlength'), 10);
storyInput.addEventListener('input', () => {
  const len = storyInput.value.length;
  storyCount.textContent = len;
  charCounter.classList.toggle('limit-near', len >= STORY_MAX * 0.9 && len < STORY_MAX);
  charCounter.classList.toggle('limit-reached', len >= STORY_MAX);
});

// Foto-Vorschau
const photoInput = document.getElementById('photo');
const preview = document.getElementById('photo-preview');
const previewImg = document.getElementById('photo-preview-img');
photoInput.addEventListener('change', () => {
  const file = photoInput.files[0];
  if (!file) { preview.classList.add('hidden'); return; }
  previewImg.src = URL.createObjectURL(file);
  preview.classList.remove('hidden');
});

const form = document.getElementById('submission-form');
const submitBtn = document.getElementById('submit-btn');
const statusEl = document.getElementById('form-status');
const freebieReveal = document.getElementById('freebie-reveal');
const nextSteps = document.getElementById('next-steps');
const shareBtn = document.getElementById('share-btn');
const shareFeedback = document.getElementById('share-feedback');

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = 'form-status' + (type ? ' ' + type : '');
}

// "Seite teilen": auf dem Handy öffnet sich das Teilen-Menü, sonst wird der Link kopiert.
shareBtn.addEventListener('click', async () => {
  const shareUrl = location.origin + '/';
  const shareData = {
    title: 'Zeig dich Mutig',
    text: 'Mach mit bei "Zeig dich Mutig": Foto und Geschichte vom Mut deines Kindes einreichen.',
    url: shareUrl
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
    await navigator.clipboard.writeText(shareUrl);
    shareFeedback.textContent = 'Link kopiert – jetzt kannst du ihn verschicken.';
  } catch (err) {
    // Abbruch im Teilen-Menü ist normal; nur wenn auch Kopieren scheitert, Link anzeigen.
    if (err && err.name === 'AbortError') return;
    shareFeedback.textContent = 'Link zum Weitergeben: ' + shareUrl;
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus('', '');
  freebieReveal.classList.add('hidden');
  nextSteps.classList.add('hidden');
  shareFeedback.textContent = '';

  const childName = document.getElementById('child_name').value.trim();
  const childAge = parseInt(document.getElementById('child_age').value, 10);
  const story = document.getElementById('story').value.trim();
  const parentEmail = document.getElementById('parent_email').value.trim();
  const consent = document.getElementById('consent').checked;
  const rules = document.getElementById('rules').checked;
  const wantsFreebie = document.getElementById('wants_freebie').checked;
  const file = photoInput.files[0];
  const honeypot = document.getElementById('website').value;

  if (honeypot) {
    // Bot hat das unsichtbare Feld ausgefüllt — Einsendung still verwerfen,
    // ohne dem Bot einen Fehler zu verraten.
    form.reset();
    setStatus('Danke! Deine Geschichte ist bei uns eingegangen.', 'success');
    return;
  }

  if (!childName || !childAge || !story || !parentEmail || !file) {
    setStatus('Bitte fülle alle Felder aus und wähle ein Foto.', 'error');
    return;
  }
  if (!consent || !rules) {
    setStatus('Bitte bestätige die Einverständniserklärung und die Teilnahmebedingungen.', 'error');
    return;
  }
  if (file.size > MAX_RAW_PHOTO_BYTES) {
    setStatus('Das Foto ist zu groß (max. 25 MB).', 'error');
    return;
  }

  submitBtn.disabled = true;
  setStatus('Foto wird verkleinert …', '');

  // Merkt sich, in welchem Schritt es zuletzt war — für eine konkrete Fehlermeldung.
  let step = 'init';

  try {
    const supabase = getSupabase();

    step = 'compress';
    const compressed = await compressImage(file);
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

    step = 'upload';
    setStatus('Wird hochgeladen …', '');
    const { error: uploadError } = await supabase.storage
      .from('photos')
      .upload(fileName, compressed, { cacheControl: '3600', upsert: false, contentType: 'image/jpeg' });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage.from('photos').getPublicUrl(fileName);

    step = 'insert';
    const { error: insertError } = await supabase.from('submissions').insert({
      child_name: childName,
      child_age: childAge,
      story: story,
      image_path: publicUrlData.publicUrl,
      parent_email: parentEmail,
      consent: true,
      wants_freebie: wantsFreebie
    });

    if (insertError) throw insertError;

    // Einreichung steht sicher in der DB. Jetzt noch das Original in Druckqualität sichern
    // und darauf WARTEN (höchstens ARCHIVE_WAIT_MS): Wer die Seite direkt nach der
    // Danke-Meldung schließt oder das Handy sperrt, würde den Upload sonst abbrechen.
    // Ein Fehler oder Timeout hier macht die Einreichung nicht ungültig.
    setStatus('Geschichte und Foto sind gespeichert. Dein Originalfoto in Druckqualität wird noch gesichert – bitte lass diese Seite kurz geöffnet …', '');
    await Promise.race([
      archiveOriginal(file, fileName, { childName, childAge, story, parentEmail }),
      new Promise((resolve) => setTimeout(resolve, ARCHIVE_WAIT_MS))
    ]);

    form.reset();
    preview.classList.add('hidden');
    setStatus('Danke! Deine Geschichte ist bei uns eingegangen.', 'success');

    if (wantsFreebie) {
      freebieReveal.classList.remove('hidden');
    }
    nextSteps.classList.remove('hidden');

    // Bestätigungsmail an die Eltern — geht IMMER raus (nicht nur bei Freebie-Wunsch),
    // mit Hinweis auf die Abstimmung ab 1. November + Teilen-Aufruf.
    fetch('/.netlify/functions/send-confirmation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_email: parentEmail, child_name: childName, wants_freebie: wantsFreebie }),
      keepalive: true
    }).catch(err => console.error('Bestätigungsmail fehlgeschlagen:', err));
  } catch (err) {
    console.error(`Einreichung fehlgeschlagen im Schritt "${step}":`, err);
    reportClientError(step, err, file);
    setStatus(messageForFailure(step, err), 'error');
  } finally {
    submitBtn.disabled = false;
  }
});
