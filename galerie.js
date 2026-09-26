import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Abstimmung startet erst am 1. November 2026 — bis dahin ist die Galerie
// reiner Showcase ohne Voting-Buttons.
const VOTING_START = new Date('2026-11-01T00:00:00+01:00');
const votingIsOpen = new Date() >= VOTING_START;

const grid = document.getElementById('gallery-grid');
const intro = document.getElementById('gallery-intro');
const emptyState = document.getElementById('empty-state');

function votedKey(id) {
  return `voted_${id}`;
}

function hasVoted(id) {
  try { return localStorage.getItem(votedKey(id)) === '1'; } catch { return false; }
}

function markVoted(id) {
  try { localStorage.setItem(votedKey(id), '1'); } catch { /* ignore */ }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderCard(entry) {
  const card = document.createElement('div');
  card.className = 'gallery-card';

  const storyShort = entry.story.length > 180 ? entry.story.slice(0, 180) + '…' : entry.story;
  const needsToggle = entry.story.length > 180;

  card.innerHTML = `
    <img src="${escapeHtml(entry.image_path)}" alt="${escapeHtml(entry.child_name)}" class="gallery-photo" loading="lazy">
    <div class="gallery-body">
      <p class="gallery-name">${escapeHtml(entry.child_name)}, ${entry.child_age} Jahre</p>
      <p class="gallery-story">${escapeHtml(storyShort)}</p>
      ${needsToggle ? `<button type="button" class="gallery-more">weiterlesen</button><p class="gallery-story gallery-story-full hidden">${escapeHtml(entry.story)}</p>` : ''}
      <div class="gallery-vote"></div>
    </div>
  `;

  if (needsToggle) {
    const btn = card.querySelector('.gallery-more');
    const full = card.querySelector('.gallery-story-full');
    const short = card.querySelector('.gallery-story:not(.gallery-story-full)');
    btn.addEventListener('click', () => {
      full.classList.toggle('hidden');
      short.classList.toggle('hidden');
      btn.textContent = full.classList.contains('hidden') ? 'weiterlesen' : 'weniger anzeigen';
    });
  }

  const voteContainer = card.querySelector('.gallery-vote');
  if (votingIsOpen) {
    const voted = hasVoted(entry.id);
    voteContainer.innerHTML = voted
      ? `<span class="vote-done">Danke fürs Abstimmen! ♥ (${entry.votes} Stimmen)</span>`
      : `<button type="button" class="vote-btn">Für diese Geschichte abstimmen</button>`;
    if (!voted) {
      voteContainer.querySelector('.vote-btn').addEventListener('click', async (e) => {
        const btn = e.target;
        btn.disabled = true;
        const { error } = await supabase.rpc('cast_vote', { p_id: entry.id });
        if (error) {
          console.error(error);
          btn.disabled = false;
          btn.textContent = 'Fehler – nochmal versuchen';
          return;
        }
        markVoted(entry.id);
        voteContainer.innerHTML = `<span class="vote-done">Danke fürs Abstimmen! ♥</span>`;
      });
    }
  } else {
    voteContainer.innerHTML = `<span class="vote-soon">Abstimmung startet am 1. November</span>`;
  }

  return card;
}

async function loadGallery() {
  const { data, error } = await supabase
    .from('public_submissions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    intro.textContent = 'Die Galerie konnte gerade nicht geladen werden. Bitte versuch es später noch einmal.';
    return;
  }

  if (!data || data.length === 0) {
    intro.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  // Zufällige Reihenfolge, damit keine Geschichte durch ihre Position bevorzugt wird.
  const shuffled = [...data].sort(() => Math.random() - 0.5);

  intro.textContent = votingIsOpen
    ? `${data.length} Geschichten sind dabei – stimm für deine Favoritin oder deinen Favoriten ab!`
    : `${data.length} Kinder haben schon mitgemacht. Die Abstimmung startet am 1. November.`;

  shuffled.forEach(entry => grid.appendChild(renderCard(entry)));
}

loadGallery();
