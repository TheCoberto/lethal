import { disasterDeathScore } from './score.js';

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
    // Drop the country for US places to keep names short ("Miami, Florida").
    name: [a.city || a.town || a.county, a.state, a.country_code === 'us' ? null : a.country]
      .filter(Boolean).join(', ') || 'Unknown location',
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

const NRI = 'https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Counties/FeatureServer/0/query';
export const NRI_HAZARDS = {
  AVLN: 'Avalanche', CFLD: 'Coastal flooding', CWAV: 'Cold wave', DRGT: 'Drought',
  ERQK: 'Earthquake', HAIL: 'Hail', HWAV: 'Heat wave', HRCN: 'Hurricane',
  ISTM: 'Ice storm', LNDS: 'Landslide', LTNG: 'Lightning', IFLD: 'Inland flooding',
  SWND: 'Strong wind', TRND: 'Tornado', TSUN: 'Tsunami', VLCN: 'Volcanic activity',
  WFIR: 'Wildfire', WNTW: 'Winter weather',
};

/** FEMA National Risk Index for the US county containing the point, or null outside the US. */
export async function nationalRiskIndex(lat, lon) {
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: 4326,
    spatialRel: 'esriSpatialRelIntersects', returnGeometry: false, f: 'json',
    outFields: ['COUNTY', 'COUNTYTYPE', 'STATEABBRV', 'STCOFIPS', 'POPULATION', 'EAL_VALP',
      ...Object.keys(NRI_HAZARDS).map(k => `${k}_EALP`)].join(','),
  });
  const data = await (await fetch(`${NRI}?${params}`)).json();
  return data.features?.[0]?.attributes ?? null;
}

let trafficCache;
/** State-level traffic deaths per 100k, keyed by US state code. */
export async function traffic() {
  trafficCache ??= await (await fetch('data/traffic.json')).json();
  return trafficCache;
}

/** Hourly US AQI and PM2.5 for the past 30 days (Open-Meteo, worldwide). */
export async function airQuality(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat, longitude: lon, hourly: 'us_aqi,pm2_5', past_days: 30, forecast_days: 0,
  });
  const { hourly } = await (await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`)).json();
  return { aqi: hourly.us_aqi.filter(v => v != null), pm25: hourly.pm2_5.filter(v => v != null) };
}

const NPL = 'https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/Superfund_National_Priorities_List_(NPL)_Sites_with_Status_Information/FeatureServer/0/query';

/** Active and proposed EPA Superfund (NPL) sites within radiusMi, nearest first. US only. */
export async function superfundSites(lat, lon, radiusMi = 10) {
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: 4326,
    spatialRel: 'esriSpatialRelIntersects', distance: radiusMi, units: 'esriSRUnit_StatuteMile',
    where: "Status <> 'Deleted NPL Site'", outFields: 'Site_Name,City,Status,Latitude,Longitude',
    returnGeometry: false, f: 'json',
  });
  const data = await (await fetch(`${NPL}?${params}`)).json();
  if (data.error) throw new Error(data.error.message);
  return data.features
    .map(({ attributes: a }) => ({
      name: a.Site_Name, city: a.City, proposed: a.Status.startsWith('Proposed'),
      miles: milesBetween(lat, lon, a.Latitude, a.Longitude),
    }))
    .sort((a, b) => a.miles - b.miles);
}

function milesBetween(lat1, lon1, lat2, lon2) {
  const rad = d => (d * Math.PI) / 180;
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

const PLACES = 'https://data.cdc.gov/resource/swc5-untb.json';
export const HEALTH_MEASURES = {
  GHLTH: 'Adults in fair or poor health', CSMOKING: 'Adults who smoke', OBESITY: 'Adult obesity',
  DIABETES: 'Diagnosed diabetes', CHD: 'Coronary heart disease', ACCESS2: 'Uninsured (ages 18-64)',
};
const placesWhere = `year='2023' AND datavaluetypeid='AgeAdjPrv' AND measureid in(${
  Object.keys(HEALTH_MEASURES).map(m => `'${m}'`).join(',')})`;

/** CDC PLACES age-adjusted rates (%) for one county FIPS: { GHLTH: 17.2, ... } or null. */
export async function health(fips) {
  if (!fips) return null;
  const params = new URLSearchParams({ $where: `${placesWhere} AND locationid='${fips}'` });
  const rows = await (await fetch(`${PLACES}?${params}`)).json();
  if (!Array.isArray(rows) || !rows.length) return null;
  return Object.fromEntries(rows.map(r => [r.measureid, +r.data_value]));
}

/** Every US county's PLACES rates, for rankings (~18k rows, fetched once). */
let allHealthCache;
export async function healthAllCounties() {
  allHealthCache ??= (async () => {
    const params = new URLSearchParams({
      $where: placesWhere, $limit: 50000,
      $select: 'locationid,locationname,stateabbr,measureid,data_value,geolocation',
    });
    const rows = await (await fetch(`${PLACES}?${params}`)).json();
    const counties = new Map();
    for (const r of rows) {
      let c = counties.get(r.locationid);
      if (!c) {
        const [lon, lat] = r.geolocation?.coordinates ?? [];
        counties.set(r.locationid, c = { fips: r.locationid, state: r.stateabbr, name: `${r.locationname}, ${r.stateabbr}`, lat, lon, rates: {} });
      }
      c.rates[r.measureid] = +r.data_value;
    }
    return [...counties.values()];
  })();
  return allHealthCache;
}


let countyCache;
/** County homicide and crash death rates per 100k: { fips: [homicide, crash], US: [...] }. */
export async function countyRates() {
  countyCache ??= await (await fetch('data/counties.json')).json();
  return countyCache;
}

/**
 * Every US county's FEMA expected annual deaths from natural hazards, scored per capita:
 * [{ fips, name, lat, lon, score }]. Paged because the service caps pages at 2000.
 */
let allRiskCache;
export async function allRiskCounties() {
  allRiskCache ??= (async () => {
    const rows = [];
    for (let offset = 0; ; offset += 2000) {
      const params = new URLSearchParams({
        where: 'EAL_VALP IS NOT NULL AND POPULATION > 0', orderByFields: 'STCOFIPS',
        outFields: 'STCOFIPS,COUNTY,COUNTYTYPE,STATEABBRV,POPULATION,EAL_VALP',
        returnGeometry: false, returnCentroid: true, outSR: 4326,
        resultOffset: offset, resultRecordCount: 2000, f: 'json',
      });
      const data = await (await fetch(`${NRI}?${params}`)).json();
      if (data.error) throw new Error(data.error.message);
      rows.push(...data.features.map(({ attributes: a, centroid }) => ({
        fips: a.STCOFIPS, name: `${a.COUNTY} ${a.COUNTYTYPE}, ${a.STATEABBRV}`,
        lat: centroid?.y, lon: centroid?.x, score: disasterDeathScore(a.EAL_VALP, a.POPULATION),
        tooSmall: a.POPULATION < 10000, // per-capita rates swing wildly in tiny counties; kept off rankings
      })));
      if (!data.exceededTransferLimit) return rows;
    }
  })();
  return allRiskCache;
}
