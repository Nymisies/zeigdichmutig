import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB

let supabase = null;
function getSupabase() {
  if (!supabase) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabase;
}

// Altersauswahl 5-14 befüllen
const ageSelect = document.getElementById('child_age');
for (let age = 5; age <= 14; age++) {
  const opt = document.createElement('option');
  opt.value = age;
  opt.textContent = `${age} Jahre`;
  ageSelect.appendChild(opt);
}

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

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = 'form-status' + (type ? ' ' + type : '');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus('', '');

  const childName = document.getElementById('child_name').value.trim();
  const childAge = parseInt(document.getElementById('child_age').value, 10);
  const story = document.getElementById('story').value.trim();
  const parentEmail = document.getElementById('parent_email').value.trim();
  const consent = document.getElementById('consent').checked;
  const rules = document.getElementById('rules').checked;
  const file = photoInput.files[0];

  if (!childName || !childAge || !story || !parentEmail || !file) {
    setStatus('Bitte fülle alle Felder aus und wähle ein Foto.', 'error');
    return;
  }
  if (!consent || !rules) {
    setStatus('Bitte bestätige die Einverständniserklärung und die Teilnahmebedingungen.', 'error');
    return;
  }
  if (file.size > MAX_PHOTO_BYTES) {
    setStatus('Das Foto ist zu groß (max. 10 MB).', 'error');
    return;
  }

  submitBtn.disabled = true;
  setStatus('Wird hochgeladen …', '');

  try {
    const supabase = getSupabase();
    const ext = file.name.split('.').pop().toLowerCase();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('photos')
      .upload(fileName, file, { cacheControl: '3600', upsert: false });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage.from('photos').getPublicUrl(fileName);

    const { error: insertError } = await supabase.from('submissions').insert({
      child_name: childName,
      child_age: childAge,
      story: story,
      image_path: publicUrlData.publicUrl,
      parent_email: parentEmail,
      consent: true
    });

    if (insertError) throw insertError;

    form.reset();
    preview.classList.add('hidden');
    setStatus('Danke! Deine Geschichte ist bei uns eingegangen. 🎉', 'success');
  } catch (err) {
    console.error(err);
    setStatus('Da ist etwas schiefgelaufen. Bitte versuch es später noch einmal.', 'error');
  } finally {
    submitBtn.disabled = false;
  }
});
