import { geocode, reverseGeocode, earthquakes, wildlife, crime, nationalRiskIndex, NRI_HAZARDS, traffic, airQuality } from './api.js';
import { scoreDisasters, scoreWildlife, scoreCrime, scoreRoads, scoreEnvironment, overall, color } from './score.js';

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
    const [place, quakes, wild, crimes, nri, roads, air] = await Promise.all([
      reverseGeocode(lat, lon), earthquakes(lat, lon), wildlife(), crime(),
      // optional sources: don't fail the whole lookup
      nationalRiskIndex(lat, lon).catch(() => null),
      traffic(),
      airQuality(lat, lon).catch(() => null),
    ]);

    const categories = [
      { name: '🌋 Natural Disasters', ...scoreDisasters(nri, NRI_HAZARDS, quakes) },
      { name: '🐍 Wildlife', ...scoreWildlife(wild, place.state) },
      { name: '🔪 Crime & Violence', ...scoreCrime(crimes, place.state) },
      { name: '🚗 Roads', ...scoreRoads(roads, place.state) },
      { name: '☣️ Environment', ...scoreEnvironment(air) },
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
