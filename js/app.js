import { geocode, reverseGeocode, earthquakes, wildlife, crime, nationalRiskIndex, NRI_HAZARDS, traffic, airQuality, superfundSites, health, HEALTH_MEASURES } from './api.js';
import { scoreDisasters, scoreWildlife, scoreCrime, scoreRoads, scoreEnvironment, scoreHealth, overall, color } from './score.js';
import { CATEGORIES, topPlaces } from './rankings.js';
import { choroplethLayer, BANDS } from './choropleth.js';

const map = L.map('map', { worldCopyJump: true }).setView([39.5, -98.35], 4);

// Esri dark gray canvas: free, no API key (CARTO's basemaps now require one).
// Labels live in their own pane above the coloured regions so names stay readable.
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
map.createPane('labels');
map.getPane('labels').style.zIndex = 650;
map.getPane('labels').style.pointerEvents = 'none';
L.tileLayer(`${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
  attribution: 'Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors', maxZoom: 16,
}).addTo(map);
L.tileLayer(`${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, {
  pane: 'labels', maxZoom: 16,
}).addTo(map);

// "Color map by" control: shades states/counties by a category's score.
const canvas = L.canvas({ padding: 0.5 }); // canvas keeps ~3,000 county shapes fast
let shading;
let shadingRequest = 0;

const shadeControl = L.control({ position: 'topright' });
shadeControl.onAdd = () => {
  const div = L.DomUtil.create('div', 'shade-control');
  div.innerHTML = `
    <label>Color map by
      <select id="shade-cat">
        <option value="">None</option>
        ${Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join('')}
      </select>
    </label>
    <div id="shade-legend" hidden>
      <div class="legend-bands">${BANDS.map(b => `<span style="background:${b.fill}"></span>`).join('')}</div>
      <div class="legend-labels"><span>0 · safer</span><span>more dangerous · 100</span></div>
      <div class="legend-note" id="shade-note"></div>
    </div>`;
  L.DomEvent.disableClickPropagation(div);
  L.DomEvent.disableScrollPropagation(div);
  return div;
};
shadeControl.addTo(map);

document.getElementById('shade-cat').addEventListener('change', async e => {
  const key = e.target.value;
  const request = ++shadingRequest;
  const legend = document.getElementById('shade-legend');
  const note = document.getElementById('shade-note');
  shading?.remove();
  shading = null;
  legend.hidden = !key;
  if (!key) return;
  note.textContent = 'Loading…';
  try {
    const layer = await choroplethLayer(key, canvas);
    if (request !== shadingRequest) return; // a newer selection won
    shading = layer.addTo(map);
    note.textContent = `By ${CATEGORIES[key].unit === 'states' ? 'state' : 'county'}. Hover for scores, click for details.`;
  } catch (err) {
    if (request === shadingRequest) note.textContent = `Couldn't load: ${err.message}`;
  }
});

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
