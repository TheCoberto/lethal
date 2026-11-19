import { geocode, reverseGeocode, earthquakes, wildlife, crime, nationalRiskIndex, NRI_HAZARDS, traffic, airQuality, superfundSites, health, HEALTH_MEASURES } from './api.js';
import { scoreDisasters, scoreWildlife, scoreCrime, scoreRoads, scoreEnvironment, scoreHealth, overall, color } from './score.js';
import { CATEGORIES, topPlaces } from './rankings.js';

const map = L.map('map', { worldCopyJump: true }).setView([39.5, -98.35], 4);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 18,
}).addTo(map);

const panel = document.getElementById('panel');
let marker;

map.on('click', e => analyze(e.latlng.lat, e.latlng.wrap().lng));

document.getElementById('search-form').addEventListener('submit', async e => {
  e.preventDefault();
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;
  try {
    const { lat, lon } = await geocode(q);
    map.setView([lat, lon], 8);
    analyze(lat, lon);
  } catch (err) {
    panel.innerHTML = `<p class="hint">${escape(err.message)}</p>`;
  }
});

async function analyze(lat, lon) {
  marker?.remove();
  marker = L.marker([lat, lon]).addTo(map);
  history.replaceState(null, '', `#${lat.toFixed(4)},${lon.toFixed(4)}`);
  panel.innerHTML = '<p class="hint">Analyzing…</p>';

  try {
    const nriLookup = nationalRiskIndex(lat, lon).catch(() => null);
    const [place, quakes, wild, crimes, nri, roads, air, sites, rates] = await Promise.all([
      reverseGeocode(lat, lon), earthquakes(lat, lon), wildlife(), crime(),
      // optional sources: don't fail the whole lookup
      nriLookup,
      traffic(),
      airQuality(lat, lon).catch(() => null),
      superfundSites(lat, lon).catch(() => null),
      nriLookup.then(n => health(n?.STCOFIPS)).catch(() => null), // CDC data is keyed by county FIPS
    ]);

    const categories = [
      { name: '🌋 Natural Disasters', ...scoreDisasters(nri, NRI_HAZARDS, quakes) },
      { name: '🐍 Wildlife', ...scoreWildlife(wild, place.state) },
      { name: '🔪 Crime & Violence', ...scoreCrime(crimes, place.state) },
      { name: '🚗 Roads', ...scoreRoads(roads, place.state) },
      { name: '☣️ Environment', ...scoreEnvironment(air, place.state ? sites : null) },
      { name: '🦠 Health & Disease', ...scoreHealth(rates, HEALTH_MEASURES) },
    ];
    render(place.name, categories);
  } catch (err) {
    panel.innerHTML = `<p class="hint">Something went wrong: ${escape(err.message)}</p>`;
  }
}

function render(name, categories) {
  const total = overall(categories);
  panel.innerHTML = `
    <p class="place">${escape(name)}</p>
    <div class="overall">
      <div class="score" style="color:${color(total)}">${total ?? '—'}</div>
      <div class="label">Lethality Score</div>
    </div>
    ${categories.map(card).join('')}
  `;
}

function card(c) {
  return `
    <div class="card ${c.pending ? 'pending' : ''}">
      <h3><span>${c.name}</span><span style="color:${color(c.score)}">${c.score ?? '—'}</span></h3>
      <div class="bar"><span style="width:${c.score ?? 0}%;background:${color(c.score)}"></span></div>
      <ul>${c.details.map(d => `<li>${escape(d)}</li>`).join('')}</ul>
    </div>`;
}

// Rankings: pick a category and how many, click a row to analyze that place.
let rankKey = 'overall';
let rankCount = 25;
let rankRequest = 0;

document.getElementById('rankings-btn').addEventListener('click', showRankings);

async function showRankings() {
  const request = ++rankRequest; // ignore results from an older, slower selection
  panel.innerHTML = `
    <div class="rank-controls">
      <select id="rank-cat">${Object.entries(CATEGORIES).map(([k, c]) =>
        `<option value="${k}" ${k === rankKey ? 'selected' : ''}>${c.label}</option>`).join('')}</select>
      <select id="rank-n">${[10, 25, 50, 100].map(n =>
        `<option ${n === rankCount ? 'selected' : ''}>${n}</option>`).join('')}</select>
    </div>
    <p class="hint" id="rank-status">Loading…</p>
    <ol class="rank-list" id="rank-list"></ol>`;
  document.getElementById('rank-cat').onchange = e => { rankKey = e.target.value; showRankings(); };
  document.getElementById('rank-n').onchange = e => { rankCount = +e.target.value; showRankings(); };

  try {
    const rows = await topPlaces(rankKey, rankCount);
    if (request !== rankRequest) return;
    const { unit } = CATEGORIES[rankKey];
    document.getElementById('rank-status').textContent =
      `Top ${rows.length} ${unit} by ${unit === 'states' ? 'state-level ' : ''}score. Click one to see its full breakdown.`;
    const list = document.getElementById('rank-list');
    list.innerHTML = rows.map((r, i) => `
      <li data-i="${i}">
        <span class="rank-name">${escape(r.name)}</span>
        <span class="rank-score" style="color:${color(r.score)}">${r.score}</span>
      </li>`).join('');
    list.onclick = e => {
      const li = e.target.closest('li');
      if (li) goTo(rows[+li.dataset.i]);
    };
  } catch (err) {
    if (request === rankRequest) document.getElementById('rank-status').textContent = `Couldn't load rankings: ${err.message}`;
  }
}

async function goTo(row) {
  try {
    const { lat, lon } = row.lat != null ? row : await geocode(row.query);
    map.setView([lat, lon], row.query ? 6 : 8);
    analyze(lat, lon);
  } catch (err) {
    panel.innerHTML = `<p class="hint">${escape(err.message)}</p>`;
  }
}

// Shareable links: #lat,lon in the URL reopens that spot.
const [hLat, hLon] = location.hash.slice(1).split(',').map(Number);
if (location.hash.length > 1 && Number.isFinite(hLat) && Number.isFinite(hLon)) {
  map.setView([hLat, hLon], 8);
  analyze(hLat, hLon);
}

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escape(s) {
  return String(s).replace(/[&<>"']/g, ch => ENTITIES[ch]);
}
