// All network calls live here so they're easy to swap or cache later.

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const USGS = 'https://earthquake.usgs.gov/fdsnws/event/1/query';

/** Turn a search string into { lat, lon }. */
export async function geocode(query) {
  const url = `${NOMINATIM}/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const [hit] = await (await fetch(url)).json();
  if (!hit) throw new Error('Place not found');
  return { lat: +hit.lat, lon: +hit.lon };
}

/** Turn coordinates into a place name and US state code (e.g. "CA"), if any. */
export async function reverseGeocode(lat, lon) {
  const url = `${NOMINATIM}/reverse?format=json&zoom=10&lat=${lat}&lon=${lon}`;
  const data = await (await fetch(url)).json();
  const a = data.address || {};
  const iso = a['ISO3166-2-lvl4'] || ''; // e.g. "US-CA"
  return {
    name: [a.city || a.town || a.county, a.state, a.country].filter(Boolean).join(', ') || 'Unknown location',
    state: iso.startsWith('US-') ? iso.slice(3) : null,
  };
}

/** Significant earthquakes (M4.5+) within radiusKm since 1990, largest first. */
export async function earthquakes(lat, lon, radiusKm = 250) {
  const params = new URLSearchParams({
    format: 'geojson', latitude: lat, longitude: lon, maxradiuskm: radiusKm,
    minmagnitude: 4.5, starttime: '1990-01-01', orderby: 'magnitude', limit: 2000,
  });
  const data = await (await fetch(`${USGS}?${params}`)).json();
  return data.features.map(f => ({
    mag: f.properties.mag,
    place: f.properties.place,
    year: new Date(f.properties.time).getFullYear(),
  }));
}

let wildlifeCache;
/** Curated wildlife data, keyed by US state code. */
export async function wildlife() {
  wildlifeCache ??= await (await fetch('data/wildlife.json')).json();
  return wildlifeCache;
}

let crimeCache;
/** State-level violent crime rates per 100k, keyed by US state code. */
export async function crime() {
  crimeCache ??= await (await fetch('data/crime.json')).json();
  return crimeCache;
}
