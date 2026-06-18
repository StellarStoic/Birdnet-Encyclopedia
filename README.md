# Birds.name

A multilingual, browser-based bird-name guide and BirdNET observation dashboard.

The website combines BirdNET-Pi species translations, eBird taxonomy, Wikipedia
descriptions, iNaturalist media, public BirdWeather observations, and private
BirdNET-Pi export analysis. It is a static website: there is no application
server, build process, database server, or required account for the core
encyclopedia.

## Main Features

### Birds.name

- More than 6,000 BirdNET species and other supported taxa.
- Bird names in every available BirdNET-Pi language file.
- Automatic detection of untranslated names that still match English.
- Search in the selected language and matching results from other languages.
- Direct language switching while preserving the current search.
- Taxonomy-based categories:
  - Waterbirds
  - Birds of prey
  - Songbirds
  - Parrots
  - Gamebirds
- Bird detail pages with:
  - Scientific, English, and localized names
  - iNaturalist photographs
  - Localized Wikipedia descriptions when available
  - Optional AI translation of English descriptions
  - Taxonomic family information
  - Global IUCN conservation status and assessment details from the locally
    generated official IUCN Red List dataset
  - Bird sounds through eBird
  - Recent iNaturalist observation information
  - Links to iNaturalist, Wikipedia, BirdLife, and eBird
- Responsive navigation and search controls.
- Persistent language selection shared with the statistics dashboard.

### My BirdNET

The `My BirdNET` page analyzes either a private observation export or public
BirdWeather station data.

Supported private files:

- BirdNET-Pi CSV exports
- BirdNET-Pi text exports with recognized columns
- Gzip-compressed `.gz` or `.gzip` exports
- BirdNET-Pi eBird checklist CSV exports
- Drag-and-drop and normal file selection

Dashboard features:

- Total detections, species, active days, and date coverage.
- Full-width two-point date range filter.
- Dataset-specific date windows remembered across page reloads. Restored windows
  of two days or less request only targeted hourly Meteostat data.
- Observation timeline.
- Most observed species with bird thumbnails.
- Taxonomy-based category ratios.
- Hourly activity.
- Species activity explorer with:
  - Species selector
  - Detections over time
  - Most active hours
- Optional Meteostat overlays showing temperature and precipitation on:
  - Observation timeline
  - Selected-species detection timeline
  - Weekly species richness
  Weather overlays also include dew point, relative humidity, air pressure,
  wind speed, gusts, wind direction, and readable Meteostat CoCo conditions.
  Selected windows of two days or less use hourly detections and weather;
  longer windows use locally aggregated daily values.
- Monthly and seasonal distribution.
- Species detected exactly once.
- Weekly species richness and detection totals.
- Searchable species table with thumbnails, first/last detection, active days,
  share, category, and average confidence.
- Forest, midnight, sunrise, and paper dashboard themes.
- Mixed, bar, and line chart styles.
- Responsive desktop and mobile layouts.

### BirdWeather Integration

- Find stations near the visitor's location.
- Enter station IDs as `15888`, `ID15888`, `id15888`, or `#15888`.
- Select stations from an interactive map.
- Search map locations with Photon and an ArcGIS fallback.
- Load all stations currently visible in the map viewport.
- Show station ID, station type, activity state, and last detection.
- Mark stations inactive for six months or longer.
- Favourite stations in result lists and on the map.
- Select 24 hours, 7 days, 30 days, 3 months, 6 months, or 12 months.
- Display import progress, percentage, estimated time remaining, and record
  counts.
- Cancel large station imports.
- Cache station histories locally and remove individual station caches.
- Import up to 500,000 detections per station and period as an emergency limit.

## Privacy and Local Storage

Private BirdNET files are parsed in the browser and are not uploaded by this
website.

The browser stores:

| Data | Storage | Purpose |
| --- | --- | --- |
| Selected language | `localStorage` | Restore the encyclopedia language |
| Favourite stations | `localStorage` | Restore BirdWeather favourites |
| AI preference and scoped key | `localStorage` | Optional Pollinations connection |
| AI description translations | `localStorage` | Avoid repeated translation requests |
| Meteostat preference, personal API key, and active weather summary | `localStorage` | Optional weather overlays |
| Meteostat station-year histories | IndexedDB | Reuse downloaded historical weather across datasets |
| Uploaded BirdNET dataset | IndexedDB | Reopen private statistics |
| BirdWeather station histories | IndexedDB | Avoid downloading large histories again |
| BirdWeather cache metadata | IndexedDB | Show which stations are saved locally |

Browser geolocation is requested only when finding nearby BirdWeather stations.
The website does not save the visitor's coordinates.

Clearing site data in the browser removes saved files, station caches,
preferences, favourites, and AI credentials.

## Description and Translation Logic

For an English bird:

1. The website requests the English Wikipedia summary.
2. If Wikipedia is unavailable, it uses the iNaturalist Wikipedia summary.

For a bird in another language:

1. The localized name is compared with the authoritative English name.
2. An identical name is treated as an untranslated fallback.
3. For genuinely translated names, the matching language edition of Wikipedia
   is requested using the localized and scientific names.
4. If no localized description exists, the English description can be
   translated through Pollinations AI after the visitor explicitly opts in.
5. If AI is disabled or unavailable, the English description is shown with a
   notice.

Descriptions are displayed in full. AI-generated translations are labelled and
cached locally.

## Pollinations AI Connection

AI translations are optional because text-generation requests have a cost. The
website operator does not need to fund translations for every visitor.

The integration uses Pollinations' **Bring Your Own Pollen (BYOP)** web
authorization flow:

1. The visitor chooses `AI translations` from the menu.
2. The website explains what will be translated and why an account is needed.
3. `Connect Pollinations` opens the official authorization page:
   `https://enter.pollinations.ai/authorize`.
4. The visitor signs in, reviews the requested budget and access, and approves
   the connection.
5. Pollinations returns a temporary scoped key in the URL fragment.
6. The website validates the authorization state, saves the scoped key locally,
   and removes it from the visible URL.

The current connection requests:

- Model access limited to `openai-fast`
- Seven-day key expiry
- Default budget cap of 5 Pollen

Visitors remain in control of their Pollinations balance, budget, and
revocation.

### Optional Pollinations App Identity

The authorization flow works without an App Key and identifies the website by
its redirect hostname. For a named consent screen, create a publishable App Key
in the [Pollinations dashboard](https://enter.pollinations.ai/), register the
exact deployed redirect URL, and define the following configuration before the
main encyclopedia script:

```html
<script>
    // Identifies this website on the Pollinations authorization screen.
    window.BIRD_ENCYCLOPEDIA_CONFIG = {
        pollinationsAppKey: 'pk_2lwEO7DMMuEkos1g'
    };
</script>
```

Do not put a private account key in the repository. The configured App Key is a
publishable `pk_` identifier; Pollinations returns a separate user-approved,
scoped key after authorization.

See the
[Pollinations BYOP documentation](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md)
for redirect URI, budget, expiry, and App Key details.

## Running Locally

The website uses `fetch()` for local translation and taxonomy files. Opening
`index.html` directly with a `file://` URL may therefore fail because of browser
security rules. Serve the directory over HTTP.

### Python

```powershell
# Starts a local static server from the project directory.
python -m http.server 8080
```

Open:

```text
http://localhost:8080/
```

### Node.js

```powershell
# Runs a temporary static server without adding project dependencies.
npx serve .
```

The application has no build command. Changes to HTML, CSS, JavaScript, data, or
translations are available after refreshing the browser.

## Deployment

Deploy the repository as a static website using GitHub Pages, Netlify, Cloudflare
Pages, an nginx/Apache document root, or another static host.

Deployment requirements:

- Serve the site over HTTPS in production.
- Keep the existing relative directory structure.
- Allow outbound browser connections to the external services listed below.
- Register the exact production URL as a Pollinations redirect URI when using
  an App Key.
- Do not add secret API keys to HTML or JavaScript.
- Configure a Content Security Policy carefully if one is introduced, because
  the application loads external scripts, styles, images, APIs, and map tiles.

There is currently no offline service worker. Core data files are local, but
photographs, descriptions, observations, maps, charts, fonts/icons, and AI
translations require network access or previously cached browser data.

## Interface Translations

Application interface translations are independent JSON files in
[`i18n/`](i18n/README.md). `i18n/en.json` is the source template for Crowdin,
Weblate, or manual translation. Bird species-name translations remain in
`lang/labels_CODE.txt`.

## Updating Bird Translations

Bird name translations come from:

[Nachtzuster/BirdNET-Pi `model/l18n`](https://github.com/Nachtzuster/BirdNET-Pi/tree/main/model/l18n)

Run the updater from the project root:

```powershell
# Downloads all current BirdNET-Pi dictionaries and converts them for this website.
.\tools\update-birdnet-translations.ps1
```

The updater:

- Discovers upstream `labels_*.json` files automatically.
- Converts each dictionary to `lang/labels_*.txt`.
- Writes UTF-8 without a byte-order mark.
- Adds newly introduced languages automatically.
- Maintains `labels_zh_CN.txt` and `labels_zh_TW.txt`.
- Updates `labels_zh.txt` as a Simplified Chinese compatibility alias.
- Records the exact source commit and update time in `lang/UPSTREAM.txt`.

Review generated changes before publishing them. More details are available in
[`lang/README.md`](lang/README.md).

## Data Format

### Bird Translation Files

Each line uses an underscore between the scientific and localized names:

```text
# Maps one scientific name to the localized common name used by the website.
Turdus merula_Common Blackbird
```

The parser treats the first underscore as the separator and preserves
additional underscores in the localized value.

### Recommended BirdNET Export Columns

The most reliable private import contains:

```text
# Recommended CSV header for BirdNET-Pi observation analysis.
Date,Time,Sci_Name,Com_Name,Confidence
```

The importer also recognizes common aliases from database-to-CSV tools and
BirdNET-Pi eBird checklist exports. Dates and times must form valid observation
timestamps, and each row must identify a species.

## External Services and Libraries

### Data and APIs

- [BirdNET-Pi](https://github.com/Nachtzuster/BirdNET-Pi) for bird-name
  localization dictionaries.
- [eBird](https://ebird.org/) and the local `data/taxonomy.json` snapshot for
  taxonomy and sound links.
- [iNaturalist](https://www.inaturalist.org/) for photographs, fallback
  descriptions, taxon records, and recent observations.
- [IUCN Red List of Threatened Species](https://www.iucnredlist.org/) for
  official global conservation categories, assessment narratives, population,
  habitats, threats, taxonomy, and conservation actions.
- [Wikipedia](https://www.wikipedia.org/) for localized bird descriptions.
- [BirdWeather](https://www.birdweather.com/) for public station and detection
  data.
- [Pollinations](https://pollinations.ai/) for optional AI description
  translation.
- [Meteostat](https://dev.meteostat.net/data/) for optional historical weather
  context. The BirdWeather station location or average coordinates from an
  imported file select the three nearest weather stations. Annual station bulk
  files are averaged first; the visitor's RapidAPI key locates stations and
  fills dates missing from all three. A clickable status opens a map connecting
  the source location to every weather station used. Weather caches refresh
  automatically after seven days and can be refreshed manually at any time.
- [OpenStreetMap](https://www.openstreetmap.org/) contributors and
  [CARTO](https://carto.com/) for station map tiles.
- [Photon](https://photon.komoot.io/) with ArcGIS geocoding fallback for map
  place recommendations.

### Browser Libraries

- [Chart.js 4.4.7](https://www.chartjs.org/) for statistics charts.
- [Weather Icons](https://erikflowers.github.io/weather-icons/) for Meteostat
  CoCo chart glyphs. The bundled font is licensed under SIL OFL 1.1.
- [Papa Parse 5.4.1](https://www.papaparse.com/) for robust CSV parsing.
- [pako 2.1.0](https://github.com/nodeca/pako) as a gzip fallback.
- [fflate 0.8.2](https://github.com/101arrowz/fflate) for concatenated
  BirdNET-Pi gzip exports.
- [Leaflet 1.9.4](https://leafletjs.com/) for station maps.
- [Font Awesome 6.4.0](https://fontawesome.com/) for interface icons.

These libraries are currently loaded from public CDNs.

## Project Structure

```text
# Main static website files and data directories.
.
|-- index.html                 # Main encyclopedia
|-- index copy.html            # Synchronized copy of the encyclopedia page
|-- styles.css                 # Encyclopedia and AI modal styles
|-- my-birdnet.html            # Observation dashboard markup
|-- my-birdnet.css             # Responsive dashboard themes and layout
|-- my-birdnet.js              # Imports, BirdWeather, caching, and statistics
|-- data/
|   |-- taxonomy.json          # Local eBird taxonomy data
|   |-- iucn-statuses.json     # Generated global conservation categories
|   `-- iucn-details/          # Generated assessment details by initial
|-- img/                       # Menu and decorative image assets
|-- lang/
|   |-- labels_*.txt           # Generated localized bird names
|   |-- README.md              # Translation maintenance notes
|   `-- UPSTREAM.txt           # Exact BirdNET-Pi source revision
`-- tools/
    |-- update-birdnet-translations.ps1
    `-- update-iucn-statuses.py    # Builds local global conservation data
```

`index.html` is the deployment entry point. When encyclopedia code changes are
made, keep `index copy.html` synchronized unless the duplicate is intentionally
removed from the project.

### Refresh IUCN conservation statuses

The maintenance script in `tools/update-iucn-statuses.py` reads scientific
names from `lang/labels_en.txt` and generates:

- `data/iucn-statuses.json` for the website.
- `data/iucn-details/*.json` for assessment dates, population, elevation,
  habitat, threats, taxonomy, conservation actions, research, and assessment
  narratives. Files are split by scientific-name initial and loaded on demand.
- `data/iucn-update-report.json` for unmatched, not-assessed, and failed names.
- `tools/iucn-statuses.checkpoint.json` as resumable local state. The checkpoint
  is ignored by Git.

For names without a direct IUCN API assessment, including HTTP 404 responses,
the updater queries iNaturalist. It accepts an exact scientific name, an
explicit `matched_term` synonym, or an unambiguous reclassification where the
former species epithet became an infraspecific epithet. A fallback is used only
when iNaturalist exposes a place-independent global IUCN status. These records
are labelled `iNaturalist fallback`, and the accepted scientific name is stored
in the report. Regional statuses and general same-genus approximations are
never substituted.

Published detail buckets intentionally omit references, papers, citations,
assessment authors, contributor credits, common-name lists, and specialist
group metadata. Species absent from the generated status file are not shown
with an IUCN badge or assessment panel.

Set `IUCN_API_TOKEN` near the top of the script, then run the updater from the
project root:

```powershell
# Test authentication and response parsing with five species.
python tools/update-iucn-statuses.py --limit 5 --restart

# Resume or run the complete refresh after the test succeeds.
python tools/update-iucn-statuses.py
```

An `IUCN_API_TOKEN` environment variable can optionally override the token in
the script. The default request delay is 0.6 seconds. Use `--delay 1.0` if the API returns
rate-limit responses. Temporary errors use exponential backoff, and rerunning
the command resumes completed work. Use `--restart` only when a completely new
six-month dataset should replace the checkpoint. The API normally accepts the
token as a raw `Authorization` value; if it returns HTTP 401 or 403, retry with
`--auth-scheme bearer`. Geographic range polygons and assessment points are
intentionally excluded to keep the website data files manageable.

After changing publication fields, rebuild the website files from the completed
checkpoint without contacting either API:

```powershell
# Repackage completed checkpoint data without making network requests.
python tools/update-iucn-statuses.py --publish-only
```

Checkpoint writes retry transient Windows file locks caused by antivirus,
indexing, or synchronization tools. If replacement remains blocked, the updater
keeps running and preserves a valid uniquely named temporary checkpoint. On the
next start it automatically selects the most complete valid main or temporary
checkpoint. Resume an interrupted update without `--restart`:

```powershell
# Continue from the most complete saved checkpoint.
python tools/update-iucn-statuses.py
```

The checkpoint is machine-managed state. Do not edit or save
`tools/iucn-statuses.checkpoint.json` in an editor while the updater is running;
the file changes after every species, so an open editor tab will correctly
report that its copy is older. Close the tab or choose **Revert File** instead
of overwriting it. API-provided Unicode line separators are normalized before
JSON is written to avoid unusual-line-terminator warnings.

## Browser Compatibility

A current version of Chrome, Edge, Firefox, or Safari is recommended.

Important browser capabilities:

- ES2020+ JavaScript
- Fetch API
- IndexedDB
- `localStorage` and `sessionStorage`
- Canvas
- Geolocation for nearby stations
- `AbortController`
- `DecompressionStream` or the loaded pako fallback

Large files and long BirdWeather histories require additional browser memory
and storage. Available IndexedDB capacity depends on the browser, device, free
disk space, and whether persistent storage permission is granted.

## Development Notes

- The project uses plain HTML, CSS, and JavaScript.
- There is no bundler, package manifest, framework, or automated test suite.
- Keep user-facing HTML escaped when inserting external API data.
- Preserve scientific names as stable identifiers across translations.
- Use the local taxonomy map for categories instead of matching common-name
  text.
- Avoid storing large observation arrays in `localStorage`; use IndexedDB.
- Keep credentials out of source control.
- Comment non-obvious code paths, especially API normalization, storage,
  pagination, and translation fallback behavior.

## Known Limits

- External API availability and rate limits can affect media, descriptions,
  maps, station searches, and AI translations.
- Some BirdNET localization files contain English fallback names; these are not
  considered completed translations.
- Wikipedia coverage differs by language and species.
- AI translations may contain errors and are clearly labelled.
- BirdWeather station activity is inferred from detection recency because the
  public API does not provide a direct online-status field.
- A station-period import is capped at 500,000 detections.
- Browser storage can be cleared automatically by the browser under storage
  pressure unless persistence is granted.

## Attribution

Bird names and taxonomy remain the work of their respective source projects.
Photographs, descriptions, observations, map data, and generated translations
are subject to the terms and attribution requirements of their providers.

This repository currently does not include a project license file. Add an
explicit license before redistributing the application or accepting external
contributions.
