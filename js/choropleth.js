// Colours US states or counties by a category's score. Uses us-atlas outlines + topojson-client (global).
import { CATEGORIES, allScores } from './rankings.js';

const ATLAS = 'https://cdn.jsdelivr.net/npm/us-atlas@3.0.1';

// Single-hue sequential ramp (dark -> bright red), five bands of 20 points.
export const BANDS = [
  { max: 20, fill: '#3d1d20' },
  { max: 40, fill: '#6e2327' },
  { max: 60, fill: '#a12a2e' },
  { max: 80, fill: '#d63a3c' },
  { max: 101, fill: '#ff6b62' },
];
const bandFill = score => BANDS.find(b => score < b.max).fill;

const shapeCache = {};
function shapes(unit) {
  const file = unit === 'states' ? 'states-10m' : 'counties-10m';
  shapeCache[unit] ??= fetch(`${ATLAS}/${file}.json`)
    .then(r => r.json())
    .then(topo => topojson.feature(topo, topo.objects[unit]).features);
  return shapeCache[unit];
}

/**
 * Returns a Leaflet layer for the category. Clicks bubble to the map, so clicking a
 * region runs the normal analysis for that spot.
 */
export async function choroplethLayer(key, renderer) {
  const { unit } = CATEGORIES[key];
  const [features, rows] = await Promise.all([shapes(unit), allScores(key)]);
  const scoreById = new Map(rows.map(r => [unit === 'states' ? r.name : r.fips, r.score]));
  const scoreOf = f => scoreById.get(unit === 'states' ? f.properties.name : f.id);

  return L.geoJSON({ type: 'FeatureCollection', features }, {
    renderer,
    style: f => {
      const score = scoreOf(f);
      return score == null
        ? { stroke: false, fillOpacity: 0 }
        : { fillColor: bandFill(score), fillOpacity: 0.7, color: '#111214', weight: unit === 'states' ? 1 : 0.3 };
    },
    onEachFeature: (f, layer) => {
      const score = scoreOf(f);
      if (score != null) layer.bindTooltip(`${f.properties.name}: <b>${score}</b>`, { sticky: true });
    },
  });
}
