import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Abstimmung startet erst am 1. November 2026 — bis dahin ist die Galerie
// reiner Showcase ohne Voting-Buttons.
const VOTING_START = new Date('2026-11-01T00:00:00+01:00');
const votingIsOpen = new Date() >= VOTING_START;

const grid = document.getElementById('gallery-grid');
const intro = document.getElementById('gallery-intro');
const emptyState = document.getElementById('empty-state');
const spotlightSection = document.getElementById('spotlight');

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

// Baut den Inhalt (Innen-HTML) eines Stimm-Bereichs und verdrahtet ihn.
// Wiederverwendet in Grid-Karten und im Spotlight.
function renderVoteControl(container, entry) {
  if (votingIsOpen) {
    const voted = hasVoted(entry.id);
    container.innerHTML = voted
      ? `<span class="vote-done">Danke fürs Abstimmen! ♥</span>`
      : `<button type="button" class="vote-btn">Für diese Geschichte abstimmen</button>`;
    if (!voted) {
      container.querySelector('.vote-btn').addEventListener('click', async (e) => {
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
        container.innerHTML = `<span class="vote-done">Danke fürs Abstimmen! ♥</span>`;
      });
    }
  } else {
    container.innerHTML = `<span class="vote-soon">Abstimmung startet am 1. November</span>`;
  }
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

  renderVoteControl(card.querySelector('.gallery-vote'), entry);
  return card;
}

// ============ SPOTLIGHT-KARUSSELL ============

function setupSpotlight(entries) {
  if (entries.length === 0) { spotlightSection.classList.add('hidden'); return; }

  let current = Math.floor(Math.random() * entries.length);
  const wrap = document.getElementById('spotlight-track');

  function go(delta) {
    current = (current + delta + entries.length) % entries.length;
    render();
  }

  function render() {
    const prevEntry = entries[(current - 1 + entries.length) % entries.length];
    const nextEntry = entries[(current + 1) % entries.length];
    const entry = entries[current];
    const single = entries.length === 1;

    wrap.innerHTML = `
      ${!single ? `<button type="button" class="spot-peek spot-peek-left" aria-label="Vorherige Geschichte">
        <img src="${escapeHtml(prevEntry.image_path)}" alt="">
      </button>` : ''}

      <div class="spot-main">
        <div class="spot-photo-wrap">
          <img src="${escapeHtml(entry.image_path)}" alt="${escapeHtml(entry.child_name)}" class="spot-photo">
        </div>
        <div class="spot-text">
          <p class="gallery-name">${escapeHtml(entry.child_name)}, ${entry.child_age} Jahre</p>
          <div class="spot-story">${escapeHtml(entry.story)}</div>
          <div class="gallery-vote spot-vote"></div>
        </div>
      </div>

      ${!single ? `<button type="button" class="spot-peek spot-peek-right" aria-label="Nächste Geschichte">
        <img src="${escapeHtml(nextEntry.image_path)}" alt="">
      </button>` : ''}
    `;

    renderVoteControl(wrap.querySelector('.spot-vote'), entry);

    if (!single) {
      wrap.querySelector('.spot-peek-left').addEventListener('click', () => go(-1));
      wrap.querySelector('.spot-peek-right').addEventListener('click', () => go(1));
    }
  }

  render();

  if (entries.length > 1) {
    // Pfeiltasten-Navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    });

    // Ziehen/Wischen (Maus + Touch über Pointer Events)
    let startX = null;
    wrap.addEventListener('pointerdown', (e) => { startX = e.clientX; });
    wrap.addEventListener('pointerup', (e) => {
      if (startX === null) return;
      const delta = e.clientX - startX;
      startX = null;
      if (delta > 50) go(-1);
      else if (delta < -50) go(1);
    });
    wrap.addEventListener('pointercancel', () => { startX = null; });
  }

  spotlightSection.classList.remove('hidden');
}

async function loadGallery() {
  const { data, error } = await supabase
    .from('public_submissions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    intro.textContent = 'Die Galerie konnte gerade nicht geladen werden. Bitte versuch es später noch einmal.';
    spotlightSection.classList.add('hidden');
    return;
  }

  if (!data || data.length === 0) {
    intro.classList.add('hidden');
    spotlightSection.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  setupSpotlight(data);

  // Zufällige Reihenfolge fürs Grid, damit keine Geschichte durch ihre Position bevorzugt wird.
  const shuffled = [...data].sort(() => Math.random() - 0.5);

  intro.textContent = votingIsOpen
    ? `${data.length} Geschichten sind dabei – stimm für deine Favoritin oder deinen Favoriten ab!`
    : `${data.length} Kinder haben schon mitgemacht. Die Abstimmung startet am 1. November.`;

  shuffled.forEach(entry => grid.appendChild(renderCard(entry)));
}

loadGallery();
