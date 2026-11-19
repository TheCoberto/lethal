# Lethal

Pick any place on the map and see how dangerous it is, broken down by category.

**Status:** early scaffold.

| Category | Source | Status |
|---|---|---|
| Natural disasters | [USGS Earthquake API](https://earthquake.usgs.gov/fdsnws/event/1/) | Earthquakes live |
| Wildlife | Curated `data/wildlife.json` (US states) | 10 states |
| Crime & violence | FBI Crime Data Explorer | Planned |

## Run locally

ES modules need a local server (opening `index.html` directly won't work):

```sh
npx serve .
# or
python -m http.server
```

## Structure

```
index.html        page layout
css/style.css     styles
js/app.js         map, UI, rendering
js/api.js         all fetch calls (geocoding, USGS, local data)
js/score.js       turns raw data into 0-100 scores
data/             static datasets
```

## Roadmap

- [ ] FEMA National Risk Index (floods, hurricanes, tornadoes, wildfire...)
- [ ] Crime data (FBI CDE)
- [ ] Wildlife data for all 50 states, then other countries
- [ ] Compare two places side by side
- [ ] PWA: installable and offline

Scores are relative estimates for curiosity, not safety advice.
