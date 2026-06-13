/*Birdnet encyclopedia shows a list of birds from the Birdnet-pi translation files + Bird stats from birdweather stations around you or your own Birdnet-pi exported datasets.>
    Copyright (C) 2026  StellarStoic stellarstoic@tuta.io

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.*/

/* global Papa, pako, fflate, Chart, L */

// Browser-only BirdNET-Pi observation importer and statistics dashboard.
class MyBirdNETDashboard {
    constructor() {
        this.fileInput = document.getElementById('file-input');
        this.dropZone = document.getElementById('drop-zone');
        this.importPanel = document.getElementById('import-panel');
        this.importStatus = document.getElementById('import-status');
        this.dashboard = document.getElementById('dashboard');
        this.metricGrid = document.getElementById('metric-grid');
        this.insightGrid = document.getElementById('insight-grid');
        this.speciesTableBody = document.getElementById('species-table-body');
        this.speciesFilter = document.getElementById('species-filter');
        this.themeSelect = document.getElementById('theme-select');
        this.chartStyleSelect = document.getElementById('chart-style');
        this.stationResults = document.getElementById('station-results');
        this.birdWeatherPeriod = document.getElementById('birdweather-period');
        this.showSavedFileButton = document.getElementById('show-saved-file');
        this.deleteLoadedDatasetButton = document.getElementById('delete-loaded-dataset');
        this.changeStationButton = document.getElementById('change-station');
        this.savedFileCard = document.getElementById('saved-file-card');
        this.savedFileName = document.getElementById('saved-file-name');
        this.stationMapModal = document.getElementById('station-map-modal');
        this.fetchProgressModal = document.getElementById('fetch-progress-modal');
        this.mapPlaceInput = document.getElementById('map-place-input');
        this.mapPlaceRecommendations = document.getElementById('map-place-recommendations');
        this.activitySpeciesSelect = document.getElementById('activity-species-select');
        this.dateRangeStartInput = document.getElementById('date-range-start');
        this.dateRangeEndInput = document.getElementById('date-range-end');
        this.weatherToggle = document.getElementById('weather-toggle');
        this.weatherSettings = document.getElementById('weather-settings');
        this.weatherApiKeyInput = document.getElementById('meteostat-api-key');
        this.weatherApiUsage = document.getElementById('weather-api-usage');
        this.weatherStatus = document.getElementById('weather-status');
        this.floatingDataContext = document.getElementById('floating-data-context');
        this.floatingDataSource = document.getElementById('floating-data-source');
        this.floatingDataRange = document.getElementById('floating-data-range');
        this.weatherMapModal = document.getElementById('weather-map-modal');
        this.weatherStationMapElement = document.getElementById('weather-station-map');
        this.observations = [];
        this.filteredObservations = [];
        this.savedFileDataset = null;
        this.taxonomy = new Map();
        this.taxonomyByCommonName = new Map();
        this.translatedNames = new Map();
        this.charts = new Map();
        this.thumbnailCache = new Map();
        this.thumbnailObserver = null;
        this.chartTooltip = null;
        this.chartTooltipRequest = 0;
        this.nearbyStations = [];
        this.stationMap = null;
        this.stationMapLayer = null;
        this.currentMapLocation = null;
        this.mapStationController = null;
        this.mapStationRequestId = 0;
        this.mapMoveTimer = null;
        this.mapSearchTimer = null;
        this.mapSearchController = null;
        this.mapSearchResults = [];
        this.activeBirdWeatherController = null;
        this.stationCacheMetadata = new Map();
        this.favouriteStations = new Map();
        this.stationViewMode = 'nearby';
        this.selectedActivitySpeciesKey = '';
        this.availableDateKeys = [];
        this.stats = null;
        this.importKind = 'detections';
        this.datasetDetail = '';
        this.datasetName = '';
        this.activeDatasetKey = '';
        this.birdWeatherLimitReached = false;
        this.weatherEnabled = localStorage.getItem('birdWeatherOverlayEnabled') === 'true';
        this.weatherData = new Map();
        this.weatherHourlyData = new Map();
        this.weatherIconCache = new Map();
        this.windDirectionIconCache = new Map();
        this.weatherIconsReady = false;
        this.weatherLocation = null;
        this.weatherLoadId = 0;
        this.activeSourceLocation = null;
        this.weatherStationMap = null;
        this.activeMeteostatController = null;
        this.activeHourlyWeatherController = null;
        this.hourlyWeatherSelectionKey = '';
        this.meteostatRequestChain = Promise.resolve();
        this.currentLanguage = localStorage.getItem('birdEncyclopediaLanguage') || 'en';
        this.currentTheme = localStorage.getItem('birdEncyclopediaTheme') || 'forest';
        document.body.dataset.theme = this.currentTheme;
        this.themeSelect.value = this.currentTheme;
        this.loadFavouriteStations();

        this.bindEvents();
        this.initializeChartSnapshots();
        this.initializeWeatherIcons();
        this.taxonomyPromise = this.loadTaxonomy();
        this.languagePromise = this.loadPreferredLanguage();
        this.restorePromise = this.restorePersistedFile();
        this.stationCachePromise = this.loadStationCacheMetadata();
    }

    bindEvents() {
        // Open the native file picker from the private-file import button.
        document.getElementById('choose-file').addEventListener('click', () => this.fileInput.click());
        document.getElementById('replace-file').addEventListener('click', () => this.fileInput.click());
        this.showSavedFileButton.addEventListener('click', () => this.showSavedFile());
        document.getElementById('open-saved-file').addEventListener('click', () => this.showSavedFile());
        document.getElementById('delete-saved-file').addEventListener('click', () => this.deleteSavedUploadedFile());
        this.deleteLoadedDatasetButton.addEventListener('click', () => this.deleteSavedUploadedFile());
        this.changeStationButton.addEventListener('click', () => this.showImportPanel({ focusStations: true }));
        this.fileInput.addEventListener('change', () => this.handleFile(this.fileInput.files[0]));

        // Discover public BirdWeather stations by browser location or a known station ID.
        document.getElementById('find-nearby-stations').addEventListener('click', () => this.findNearbyStations());
        document.getElementById('choose-station-map').addEventListener('click', () => this.chooseStationFromMap());
        document.getElementById('show-favourite-stations').addEventListener('click', () => this.showFavouriteStations());
        document.getElementById('load-station-id').addEventListener('click', () => this.loadStationById());
        document.getElementById('birdweather-station-id').addEventListener('keydown', event => {
            if (event.key === 'Enter') this.loadStationById();
        });
        document.getElementById('close-station-map').addEventListener('click', () => this.closeStationMap());
        document.getElementById('cancel-station-fetch').addEventListener('click', () => this.cancelBirdWeatherFetch());
        this.mapPlaceInput.addEventListener('input', () => this.scheduleMapPlaceSearch());
        this.mapPlaceInput.addEventListener('keydown', event => this.handleMapPlaceKeydown(event));
        this.mapPlaceInput.addEventListener('focus', () => {
            if (this.mapSearchResults.length) this.showMapPlaceRecommendations();
        });
        this.stationMapModal.addEventListener('click', event => {
            if (event.target === this.stationMapModal) this.closeStationMap();
            if (!event.target.closest('.map-place-search')) this.hideMapPlaceRecommendations();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !this.stationMapModal.hidden) this.closeStationMap();
        });
        document.addEventListener('click', event => {
            const favouriteButton = event.target.closest('[data-toggle-station-favourite]');
            if (favouriteButton) {
                // Favourite controls must not trigger the station's load or map-marker click.
                event.preventDefault();
                event.stopPropagation();
                const station = this.findKnownStation(favouriteButton.dataset.toggleStationFavourite);
                if (station) this.toggleStationFavourite(station);
                return;
            }
            const cacheTag = event.target.closest('[data-delete-station-cache]');
            if (!cacheTag) return;
            // Cache badges are destructive controls, so never let their click select the station underneath.
            event.preventDefault();
            event.stopPropagation();
            this.deleteStationCache(cacheTag.dataset.deleteStationCache);
        }, true);
        this.birdWeatherPeriod.addEventListener('change', () => this.refreshStationCacheTags());

        // Weather is opt-in and uses a visitor-owned RapidAPI key stored only in this browser.
        this.weatherToggle.checked = this.weatherEnabled;
        this.weatherSettings.hidden = !this.weatherEnabled;
        this.weatherApiKeyInput.value = localStorage.getItem('meteostatRapidApiKey') || '';
        this.restoreMeteostatApiUsage();
        this.weatherToggle.addEventListener('change', () => this.handleWeatherToggle());
        document.getElementById('save-weather-key').addEventListener('click', () => this.saveWeatherKeyAndLoad());
        document.getElementById('refresh-weather').addEventListener('click', () => this.refreshWeatherNow());
        document.getElementById('clear-weather-cache').addEventListener('click', () => this.clearWeatherCache());
        this.weatherStatus.addEventListener('click', () => this.openWeatherStationMap());
        document.getElementById('close-weather-map').addEventListener('click', () => this.closeWeatherStationMap());
        this.weatherMapModal.addEventListener('click', event => {
            if (event.target === this.weatherMapModal) this.closeWeatherStationMap();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !this.weatherMapModal.hidden) this.closeWeatherStationMap();
        });

        // Allow keyboard users to activate the drop zone.
        this.dropZone.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                this.fileInput.click();
            }
        });

        // Handle drag-and-drop without letting the browser navigate to the dropped file.
        ['dragenter', 'dragover'].forEach(type => {
            this.dropZone.addEventListener(type, event => {
                event.preventDefault();
                this.dropZone.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(type => {
            this.dropZone.addEventListener(type, event => {
                event.preventDefault();
                this.dropZone.classList.remove('drag-over');
            });
        });

        this.dropZone.addEventListener('drop', event => this.handleFile(event.dataTransfer.files[0]));

        // Rebuild chart colors when the dashboard theme changes.
        this.themeSelect.addEventListener('change', () => {
            document.body.dataset.theme = this.themeSelect.value;
            localStorage.setItem('birdEncyclopediaTheme', this.themeSelect.value);
            if (this.stats) this.renderCharts();
        });

        // Synchronize theme changes made in the encyclopedia or another open dashboard tab.
        window.addEventListener('storage', event => {
            if (event.key !== 'birdEncyclopediaTheme' || !event.newValue) return;
            document.body.dataset.theme = event.newValue;
            this.themeSelect.value = event.newValue;
            if (this.stats) this.renderCharts();
        });

        // Let users switch the visual representation without reparsing their data.
        this.chartStyleSelect.addEventListener('change', () => {
            if (this.stats) this.renderCharts();
        });

        this.speciesFilter.addEventListener('input', () => this.renderSpeciesTable());
        this.activitySpeciesSelect.addEventListener('change', () => {
            // Rebuild both explorer charts for the newly selected species.
            this.selectedActivitySpeciesKey = this.activitySpeciesSelect.value;
            if (this.stats) this.renderCharts();
        });
        [this.dateRangeStartInput, this.dateRangeEndInput].forEach(input => {
            input.addEventListener('input', event => this.previewDateRange(event.target));
            input.addEventListener('change', () => this.commitDateRange());
            input.addEventListener('pointerdown', () => {
                // Raise the active handle so overlapping start/end thumbs remain independently draggable.
                this.dateRangeStartInput.style.zIndex = input === this.dateRangeStartInput ? '3' : '2';
                this.dateRangeEndInput.style.zIndex = input === this.dateRangeEndInput ? '3' : '2';
            });
        });
        document.getElementById('reset-date-range').addEventListener('click', () => this.resetDateRange());

        // Recalculate mobile chart density after orientation or viewport changes.
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (this.stats) this.renderCharts();
            }, 180);
        });
    }

    initializeChartSnapshots() {
        // Add one delegated snapshot control to every chart canvas, including both species explorer charts.
        document.querySelectorAll('.chart-wrap canvas').forEach(canvas => {
            const chartWrap = canvas.closest('.chart-wrap');
            if (!chartWrap || chartWrap.querySelector('.chart-snapshot-button')) return;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'chart-snapshot-button';
            button.dataset.chartSnapshot = canvas.id;
            button.title = 'Download chart as PNG';
            button.setAttribute('aria-label', 'Download chart as PNG');
            button.innerHTML = '<i class="fa-solid fa-camera" aria-hidden="true"></i>';
            chartWrap.appendChild(button);
        });

        document.addEventListener('click', event => {
            const button = event.target.closest('[data-chart-snapshot]');
            if (!button) return;
            this.downloadChartSnapshot(button.dataset.chartSnapshot);
        });
    }

    initializeWeatherIcons() {
        // Wait for the bundled icon font before replacing CoCo chart points with weather glyphs.
        if (!document.fonts?.load) return;
        document.fonts.load('24px "Weather Icons"').then(() => {
            this.weatherIconsReady = true;
            this.weatherIconCache.clear();
            if (this.stats) this.renderCharts();
        }).catch(error => {
            console.warn('Weather Icons could not be loaded:', error);
        });
    }

    downloadChartSnapshot(chartId) {
        // Render the chart with its visible title and description onto a standalone high-resolution PNG.
        const chart = this.charts.get(chartId);
        if (!chart?.canvas) return;
        const metadata = this.getChartSnapshotMetadata(chart.canvas);
        const sourceCanvas = chart.canvas;
        const exportWidth = Math.max(1200, sourceCanvas.width);
        const scale = exportWidth / sourceCanvas.width;
        const horizontalPadding = 64;
        const headerHeight = 170;
        const exportHeight = Math.ceil(sourceCanvas.height * scale) + headerHeight + 48;
        const output = document.createElement('canvas');
        output.width = exportWidth + horizontalPadding * 2;
        output.height = exportHeight;
        const context = output.getContext('2d');
        const styles = getComputedStyle(document.body);
        const background = styles.getPropertyValue('--surface-solid').trim() || '#ffffff';
        const textColor = styles.getPropertyValue('--text').trim() || '#17211b';
        const mutedColor = styles.getPropertyValue('--muted').trim() || '#66736b';

        context.fillStyle = background;
        context.fillRect(0, 0, output.width, output.height);
        context.fillStyle = textColor;
        context.font = '700 42px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        context.fillText(metadata.title, horizontalPadding, 62, exportWidth);
        context.fillStyle = mutedColor;
        context.font = '400 24px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        this.drawWrappedCanvasText(
            context,
            metadata.description,
            horizontalPadding,
            105,
            exportWidth,
            32,
            2
        );
        context.drawImage(
            sourceCanvas,
            horizontalPadding,
            headerHeight,
            exportWidth,
            Math.ceil(sourceCanvas.height * scale)
        );

        const link = document.createElement('a');
        link.download = `BE_${this.sanitizeSnapshotName(metadata.title)}_${this.snapshotTimestamp()}.png`;
        link.href = output.toDataURL('image/png');
        link.click();
    }

    getChartSnapshotMetadata(canvas) {
        // Resolve regular chart headings and the individual headings inside the species activity explorer.
        const chartCard = canvas.closest('.chart-card');
        const chartSection = canvas.closest('.species-explorer-grid > div');
        const nestedTitle = chartSection?.querySelector('h4')?.textContent.trim();
        const cardTitle = chartCard?.querySelector('.chart-heading h3')?.textContent.trim();
        const cardDescription = chartCard?.querySelector('.chart-heading p')?.textContent.trim();
        const selectedSpecies = chartCard?.classList.contains('species-explorer-card')
            ? this.activitySpeciesSelect?.selectedOptions?.[0]?.textContent.trim()
            : '';
        return {
            title: nestedTitle || cardTitle || 'Bird observations',
            description: [cardDescription, selectedSpecies ? `Species: ${selectedSpecies}` : '']
                .filter(Boolean)
                .join(' ')
        };
    }

    drawWrappedCanvasText(context, text, x, y, maxWidth, lineHeight, maxLines) {
        // Wrap long chart descriptions into a bounded number of export-header lines.
        const words = String(text || '').split(/\s+/).filter(Boolean);
        let line = '';
        let lineIndex = 0;
        words.forEach(word => {
            if (lineIndex >= maxLines) return;
            const candidate = line ? `${line} ${word}` : word;
            if (context.measureText(candidate).width <= maxWidth) {
                line = candidate;
                return;
            }
            context.fillText(line, x, y + lineIndex * lineHeight);
            line = word;
            lineIndex += 1;
        });
        if (line && lineIndex < maxLines) context.fillText(line, x, y + lineIndex * lineHeight);
    }

    sanitizeSnapshotName(value) {
        // Create a filesystem-friendly chart name while retaining readable words.
        return String(value || 'chart')
            .trim()
            .replace(/[^a-z0-9]+/gi, '_')
            .replace(/^_+|_+$/g, '') || 'chart';
    }

    snapshotTimestamp() {
        // Format the local timestamp without filename-reserved punctuation.
        const date = new Date();
        const pad = value => String(value).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
            + `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
    }

    async loadTaxonomy() {
        // Local eBird taxonomy enriches observations with order, family, and broad category.
        try {
            const response = await fetch('data/taxonomy.json');
            if (!response.ok) throw new Error('Taxonomy could not be loaded');
            const records = await response.json();
            this.taxonomy = new Map(
                records
                    .filter(record => record.sciName)
                    .map(record => [record.sciName.toLowerCase(), record])
            );
            this.taxonomyByCommonName = new Map(
                records
                    .filter(record => record.comName)
                    .map(record => [record.comName.toLowerCase(), record])
            );
        } catch (error) {
            console.warn('Statistics will run without taxonomy enrichment:', error);
        }
    }

    async loadPreferredLanguage() {
        // Reuse the main encyclopedia language and its scientific-name translation file.
        document.documentElement.lang = this.currentLanguage.replace('_', '-');
        const languageNames = {
            en: 'English', sl: 'Slovenščina', de: 'Deutsch', fr: 'Français',
            es: 'Español', it: 'Italiano', hr: 'Hrvatski', nl: 'Nederlands',
            pt: 'Português', pl: 'Polski', cs: 'Čeština', sk: 'Slovenčina',
            zh_CN: '简体中文', zh_TW: '繁體中文'
        };
        document.getElementById('inherited-language').textContent =
            `Encyclopedia language: ${languageNames[this.currentLanguage] || this.currentLanguage}`;
        if (this.currentLanguage === 'en') return;

        try {
            const response = await fetch(`lang/labels_${this.currentLanguage}.txt`);
            if (!response.ok) throw new Error(`Language file returned HTTP ${response.status}`);
            const text = await response.text();
            this.translatedNames = new Map(
                text.split(/\r?\n/)
                    .map(line => {
                        const separator = line.indexOf('_');
                        return separator > 0
                            ? [line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()]
                            : null;
                    })
                    .filter(item => item?.[0] && item?.[1])
            );
        } catch (error) {
            console.warn(`Could not adopt language ${this.currentLanguage}:`, error);
        }
    }

    async handleFile(file) {
        if (!file) return;

        const compressedFile = /\.g(?:z|zip)$/i.test(file.name)
            || ['application/gzip', 'application/x-gzip'].includes(file.type);
        this.setStatus(`${compressedFile ? 'Decompressing' : 'Reading'} ${file.name}...`);

        try {
            // Finish taxonomy loading before normalization so category statistics are deterministic.
            await Promise.all([this.taxonomyPromise, this.languagePromise]);
            const text = await this.readTextFile(file);
            this.setStatus(`Parsing observations from ${file.name}...`);
            // Give the browser one frame to paint the parsing status before processing a large export.
            await new Promise(resolve => requestAnimationFrame(resolve));
            const parsed = this.parseObservations(text);

            if (parsed.observations.length === 0) {
                throw new Error('No valid observations were found in this file.');
            }

            this.observations = this.applyPreferredNames(parsed.observations);
            this.activeSourceLocation = null;
            this.importKind = parsed.kind;
            this.datasetDetail = '';
            this.datasetName = file.name;
            this.activeDatasetKey = this.getUploadedDatasetKey(this.datasetName, this.observations);
            this.initializeDateRange();
            this.birdWeatherLimitReached = false;
            this.savedFileDataset = this.createDatasetSnapshot();
            this.updateSavedFileControls();
            this.setStatus(`Saving ${parsed.observations.length.toLocaleString()} observations in this browser...`);
            await this.persistUploadedFile(this.savedFileDataset);
            this.stats = this.calculateStatistics(this.filteredObservations);
            this.renderDashboard(file.name);
            this.setStatus('');
        } catch (error) {
            console.error(error);
            this.setStatus(error.message || 'The file could not be imported.', true);
        } finally {
            // Reset the input so selecting the same file again still triggers change.
            this.fileInput.value = '';
        }
    }

    async readTextFile(file) {
        // Trust file signatures over names because some downloads retain .gz after automatic HTTP decompression.
        const bytes = new Uint8Array(await file.arrayBuffer());
        const hasGzipName = /\.g(?:z|zip)$/i.test(file.name)
            || ['application/gzip', 'application/x-gzip'].includes(file.type);
        const gzipOffset = this.findGzipOffset(bytes);
        const isGzip = gzipOffset >= 0;

        if (!isGzip) {
            // A proxy or browser may already have expanded the gzip while preserving its original filename.
            if (this.looksLikeTextFile(bytes)) {
                if (hasGzipName) {
                    console.info(`${file.name} is already decompressed text despite its gzip filename.`);
                }
                return new TextDecoder('utf-8').decode(bytes);
            }

            throw new Error(
                `${file.name} is not a valid gzip or text export. Detected file signature: ${this.describeFileSignature(bytes)}.`
            );
        }

        // WinRAR tolerates HTML/download wrappers before gzip data; browser decompressors require the exact boundary.
        const gzipBytes = gzipOffset > 0 ? bytes.slice(gzipOffset) : bytes;
        if (gzipOffset > 0) {
            console.info(`Skipped ${gzipOffset} wrapper bytes before the gzip stream in ${file.name}.`);
        }
        const normalizedGzipBytes = this.skipEmptyGzipMembers(gzipBytes);
        const hasConcatenatedMembers = this.countGzipSignatures(normalizedGzipBytes) > 1;
        const decompressedBytes = await this.decompressGzip(normalizedGzipBytes, {
            concatenated: hasConcatenatedMembers
        });
        const payloadBytes = this.hasGzipSignature(decompressedBytes)
            ? await this.decompressGzip(decompressedBytes)
            : decompressedBytes;

        // Some exports package their CSV inside a tar archive before gzip compression.
        if (this.hasTarSignature(payloadBytes)) {
            return this.extractTextFileFromTar(payloadBytes);
        }

        const text = new TextDecoder('utf-8').decode(payloadBytes);
        if (text.startsWith('SQLite format 3')) {
            throw new Error(
                'This gzip contains a SQLite database backup, not a CSV export. Export the BirdNET-Pi detection history as CSV and upload that file.'
            );
        }

        return text;
    }

    hasGzipSignature(bytes) {
        // RFC 1952 gzip streams always begin with hexadecimal bytes 1F 8B.
        return bytes?.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
    }

    findGzipOffset(bytes) {
        // Locate archives with an HTML or download-link prefix, which desktop archive tools commonly tolerate.
        if (!bytes?.length) return -1;
        for (let index = 0; index < bytes.length - 2; index += 1) {
            if (
                bytes[index] === 0x1f
                && bytes[index + 1] === 0x8b
                && bytes[index + 2] === 0x08
            ) {
                return index;
            }
        }
        return -1;
    }

    skipEmptyGzipMembers(bytes) {
        // BirdNET-Pi exports can begin with a canonical 20-byte empty gzip member before the real CSV members.
        let offset = 0;
        const emptyMember = [
            0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03,
            0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
        ];

        while (
            offset + emptyMember.length <= bytes.length
            && emptyMember.every((value, index) => bytes[offset + index] === value)
        ) {
            offset += emptyMember.length;
        }

        if (offset > 0) {
            console.info(`Skipped ${offset} bytes of empty gzip members before the detection data.`);
        }
        return offset > 0 ? bytes.slice(offset) : bytes;
    }

    countGzipSignatures(bytes) {
        // Concatenated BirdNET-Pi exports contain multiple complete gzip members in one downloaded file.
        let count = 0;
        for (let index = 0; index < bytes.length - 2; index += 1) {
            if (
                bytes[index] === 0x1f
                && bytes[index + 1] === 0x8b
                && bytes[index + 2] === 0x08
            ) {
                count += 1;
            }
        }
        return count;
    }

    looksLikeTextFile(bytes) {
        // Inspect a small sample and reject binary files containing NULs or excessive control characters.
        if (!bytes?.length) return false;
        const sample = bytes.slice(0, Math.min(bytes.length, 4096));
        let controlCharacters = 0;

        for (const value of sample) {
            if (value === 0) return false;
            if (value < 9 || (value > 13 && value < 32)) controlCharacters += 1;
        }

        return controlCharacters / sample.length < 0.02;
    }

    describeFileSignature(bytes) {
        // Convert known archive/database signatures into useful import errors instead of generic decompression failures.
        const startsWith = values => values.every((value, index) => bytes[index] === value);
        if (startsWith([0x50, 0x4b, 0x03, 0x04])) return 'ZIP archive';
        if (startsWith([0x28, 0xb5, 0x2f, 0xfd])) return 'Zstandard stream';
        if (startsWith([0x42, 0x5a, 0x68])) return 'Bzip2 stream';
        if (startsWith([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])) return 'XZ stream';
        if (new TextDecoder('ascii').decode(bytes.slice(0, 16)).startsWith('SQLite format 3')) {
            return 'SQLite database';
        }

        const hexadecimal = [...bytes.slice(0, 8)]
            .map(value => value.toString(16).padStart(2, '0'))
            .join(' ')
            .toUpperCase();
        return hexadecimal ? `unknown binary (${hexadecimal})` : 'empty file';
    }

    async decompressGzip(bytes, { concatenated = false } = {}) {
        let nativeError = null;

        if (concatenated && window.fflate) {
            try {
                // Decompress each member independently because browser streams and pako reject this export format.
                return this.decompressConcatenatedGzip(bytes);
            } catch (error) {
                console.warn('fflate could not decompress the concatenated gzip export:', error);
            }
        }

        if (concatenated && window.pako) {
            try {
                // pako supports concatenated gzip members used by large BirdNET-Pi detection exports.
                return new Uint8Array(window.pako.ungzip(bytes));
            } catch (error) {
                console.warn('Pako could not decompress concatenated gzip members; trying the browser API:', error);
            }
        }

        if ('DecompressionStream' in window) {
            try {
                // Return bytes rather than text so tar archives and nested gzip streams can be detected.
                const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
                return new Uint8Array(await new Response(stream).arrayBuffer());
            } catch (error) {
                nativeError = error;
                console.warn('Native gzip decompression failed; trying pako:', error);
            }
        }

        if (window.pako) {
            try {
                // Use the explicit window global so module-like browser environments resolve pako consistently.
                return new Uint8Array(window.pako.ungzip(bytes));
            } catch (error) {
                const reason = error?.message || String(error) || 'unknown gzip error';
                throw new Error(`The gzip file could not be decompressed: ${reason}`);
            }
        }

        throw new Error(
            nativeError
                ? `The gzip file could not be decompressed: ${nativeError.message || String(nativeError)}`
                : 'This browser cannot decompress gzip files.'
        );
    }

    decompressConcatenatedGzip(bytes) {
        // Split on each gzip member header, inflate members separately, and join their CSV byte ranges.
        const offsets = [];
        for (let index = 0; index < bytes.length - 2; index += 1) {
            if (
                bytes[index] === 0x1f
                && bytes[index + 1] === 0x8b
                && bytes[index + 2] === 0x08
            ) {
                offsets.push(index);
            }
        }

        if (!offsets.length) {
            throw new Error('No gzip members were found.');
        }

        const members = offsets.map((offset, index) => {
            const end = offsets[index + 1] ?? bytes.length;
            return new Uint8Array(window.fflate.gunzipSync(bytes.slice(offset, end)));
        });
        const totalLength = members.reduce((total, member) => total + member.length, 0);
        const output = new Uint8Array(totalLength);
        let outputOffset = 0;

        members.forEach(member => {
            output.set(member, outputOffset);
            outputOffset += member.length;
        });

        return output;
    }

    hasTarSignature(bytes) {
        // POSIX tar archives identify themselves with "ustar" at byte offset 257.
        if (!bytes || bytes.length < 262) return false;
        return new TextDecoder('ascii').decode(bytes.slice(257, 262)) === 'ustar';
    }

    extractTextFileFromTar(bytes) {
        // Walk 512-byte tar records and select the first non-empty CSV or TXT export.
        const decoder = new TextDecoder('utf-8');
        let offset = 0;

        while (offset + 512 <= bytes.length) {
            const header = bytes.slice(offset, offset + 512);
            if (header.every(value => value === 0)) break;

            const name = decoder.decode(header.slice(0, 100)).replace(/\0.*$/, '').trim();
            const sizeText = decoder.decode(header.slice(124, 136)).replace(/\0.*$/, '').trim();
            const size = Number.parseInt(sizeText || '0', 8);
            const contentStart = offset + 512;
            const contentEnd = contentStart + size;

            if (Number.isFinite(size) && size > 0 && /\.(?:csv|txt)$/i.test(name)) {
                return decoder.decode(bytes.slice(contentStart, contentEnd));
            }

            offset = contentStart + Math.ceil(Math.max(0, size) / 512) * 512;
        }

        throw new Error('The gzip contains a tar archive, but no CSV or TXT observation export was found inside it.');
    }

    parseObservations(text) {
        // Papa Parse handles quoted fields, commas inside names, BOMs, and large CSV files.
        const preview = Papa.parse(text, { preview: 3, skipEmptyLines: true });
        if (preview.errors.length && !preview.data.length) {
            throw new Error(preview.errors[0].message);
        }

        const firstRow = preview.data[0] || [];
        const normalizedHeaders = firstRow.map(value => this.normalizeHeader(value));
        const hasDetectionHeaders = normalizedHeaders.some(value =>
            ['date', 'time', 'sciname', 'scientificname', 'comname', 'commonname', 'confidence'].includes(value)
        );

        if (hasDetectionHeaders) {
            return {
                kind: 'detections',
                observations: this.parseHeaderedCSV(text)
            };
        }

        // BirdNET-Pi's eBird export is headerless and uses 19 extended-record columns.
        if (firstRow.length >= 10) {
            return {
                kind: 'ebird',
                observations: this.parseEBirdCSV(text)
            };
        }

        throw new Error('Unsupported CSV layout. Include BirdNET Date, Time, species, and confidence columns.');
    }

    parseHeaderedCSV(text) {
        const result = Papa.parse(text, {
            header: true,
            skipEmptyLines: 'greedy',
            transformHeader: header => this.normalizeHeader(header)
        });

        if (result.errors.length && result.data.length === 0) {
            throw new Error(result.errors[0].message);
        }

        return result.data
            .map(row => this.normalizeDetectionRow(row))
            .filter(Boolean);
    }

    parseEBirdCSV(text) {
        const result = Papa.parse(text, { skipEmptyLines: 'greedy' });

        return result.data
            .map(row => {
                // BirdNET-Pi writes common name, count, date, and time at indexes 0, 3, 8, and 9.
                const date = this.parseDate(row[8], row[9]);
                const commonName = String(row[0] || '').trim();
                if (!date || !commonName) return null;
                const taxonomy = this.taxonomyByCommonName.get(commonName.toLowerCase()) || null;

                return {
                    date,
                    dateKey: this.toDateKey(date),
                    time: String(row[9] || '').trim(),
                    scientificName: taxonomy?.sciName || '',
                    commonName,
                    sourceCommonName: commonName,
                    confidence: null,
                    count: Math.max(1, Number.parseInt(row[3], 10) || 1),
                    latitude: this.toNumber(row[6]),
                    longitude: this.toNumber(row[7]),
                    fileName: '',
                    taxonomy
                };
            })
            .filter(Boolean);
    }

    normalizeDetectionRow(row) {
        // Accept BirdNET-Pi names plus common aliases used by database-to-CSV tools.
        const dateValue = this.pick(row, ['date', 'detectiondate', 'datetime', 'timestamp']);
        const timeValue = this.pick(row, ['time', 'detectiontime']);
        const scientificName = String(this.pick(row, ['sciname', 'scientificname', 'specieslatin', 'latinname']) || '').trim();
        const commonName = String(this.pick(row, ['comname', 'commonname', 'species', 'label']) || '').trim();
        const confidence = this.normalizeConfidence(this.pick(row, ['confidence', 'score', 'probability']));
        const date = this.parseDate(dateValue, timeValue);

        if (!date || (!scientificName && !commonName)) return null;

        const taxonomy = scientificName
            ? this.taxonomy.get(scientificName.toLowerCase()) || null
            : null;

        return {
            date,
            dateKey: this.toDateKey(date),
            time: String(timeValue || '').trim(),
            scientificName,
            commonName: commonName || taxonomy?.comName || scientificName,
            sourceCommonName: commonName || taxonomy?.comName || scientificName,
            confidence,
            count: Math.max(1, Number.parseInt(this.pick(row, ['count', 'detections', 'occurrences']), 10) || 1),
            latitude: this.toNumber(this.pick(row, ['lat', 'latitude'])),
            longitude: this.toNumber(this.pick(row, ['lon', 'lng', 'longitude'])),
            fileName: String(this.pick(row, ['filename', 'file', 'recording']) || '').trim(),
            taxonomy
        };
    }

    initializeDateRange() {
        // Build one slider step per observed date and restore this dataset's last selected window when available.
        this.availableDateKeys = [...new Set(this.observations.map(observation => observation.dateKey))].sort();
        const maximum = Math.max(0, this.availableDateKeys.length - 1);
        const remembered = this.getRememberedDateRange();
        const startIndex = remembered
            ? Math.max(0, this.availableDateKeys.findIndex(date => date >= remembered.start))
            : 0;
        const rememberedEndIndex = remembered
            ? this.availableDateKeys.findLastIndex(date => date <= remembered.end)
            : maximum;
        const endIndex = Math.max(startIndex, rememberedEndIndex >= 0 ? rememberedEndIndex : maximum);
        this.dateRangeStartInput.min = '0';
        this.dateRangeStartInput.max = String(maximum);
        this.dateRangeStartInput.value = String(startIndex);
        this.dateRangeEndInput.min = '0';
        this.dateRangeEndInput.max = String(maximum);
        this.dateRangeEndInput.value = String(endIndex);
        this.applyDateRangeFilter();
    }

    previewDateRange(changedInput) {
        // Move only the date labels and selected track while dragging, avoiding expensive chart rerenders.
        let startIndex = Number(this.dateRangeStartInput.value);
        let endIndex = Number(this.dateRangeEndInput.value);
        if (startIndex > endIndex) {
            if (changedInput === this.dateRangeStartInput) {
                endIndex = startIndex;
                this.dateRangeEndInput.value = String(endIndex);
            } else {
                startIndex = endIndex;
                this.dateRangeStartInput.value = String(startIndex);
            }
        }
        this.updateDateRangeControl(startIndex, endIndex, { preview: true });
    }

    commitDateRange() {
        // Apply the chosen window only after the handle is released or a keyboard change is completed.
        this.applyDateRangeFilter();
        this.rememberDateRange();
        this.refreshFilteredDashboard();
        if (this.weatherEnabled) this.loadWeatherForActiveDataset();
    }

    resetDateRange() {
        // Restore the complete date span for the active file or BirdWeather station.
        this.dateRangeStartInput.value = '0';
        this.dateRangeEndInput.value = String(Math.max(0, this.availableDateKeys.length - 1));
        this.applyDateRangeFilter();
        this.rememberDateRange();
        this.refreshFilteredDashboard();
        if (this.weatherEnabled) this.loadWeatherForActiveDataset();
    }

    applyDateRangeFilter() {
        // Derive the active observation view inclusively from the selected start and end date keys.
        const startIndex = Number(this.dateRangeStartInput.value);
        const endIndex = Number(this.dateRangeEndInput.value);
        const startKey = this.availableDateKeys[startIndex];
        const endKey = this.availableDateKeys[endIndex];
        this.filteredObservations = startKey && endKey
            ? this.observations.filter(observation =>
                observation.dateKey >= startKey && observation.dateKey <= endKey
            )
            : [...this.observations];
        this.updateDateRangeControl(startIndex, endIndex);
    }

    updateDateRangeControl(startIndex, endIndex, { preview = false } = {}) {
        // Update labels and the colored section between both date handles.
        const maximum = Math.max(1, this.availableDateKeys.length - 1);
        const startPercent = (startIndex / maximum) * 100;
        const endPercent = (endIndex / maximum) * 100;
        const selection = document.getElementById('date-range-selection');
        selection.style.left = `${startPercent}%`;
        selection.style.width = `${Math.max(0, endPercent - startPercent)}%`;

        const startDate = this.availableDateKeys[startIndex]
            ? new Date(`${this.availableDateKeys[startIndex]}T00:00:00`)
            : null;
        const endDate = this.availableDateKeys[endIndex]
            ? new Date(`${this.availableDateKeys[endIndex]}T00:00:00`)
            : null;
        document.getElementById('date-range-start-label').textContent =
            startDate ? this.formatShortDate(startDate) : 'N/A';
        document.getElementById('date-range-end-label').textContent =
            endDate ? this.formatShortDate(endDate) : 'N/A';
        this.updateFloatingDataContext(startDate, endDate);

        if (preview) {
            document.getElementById('date-range-result-count').textContent =
                'Release the handle to apply this time window';
        } else {
            const selectedDetections = this.filteredObservations.reduce(
                (total, observation) => total + observation.count,
                0
            );
            document.getElementById('date-range-result-count').textContent =
                `${this.formatNumber(selectedDetections)} observations in selected window`;
        }
    }

    refreshFilteredDashboard() {
        // Recalculate every dashboard section from the selected window without mutating the source dataset.
        this.stats = this.calculateStatistics(this.filteredObservations);
        this.updateDatasetSummary();
        this.renderMetrics();
        this.renderInsights();
        this.renderTopSpeciesThumbnail();
        this.renderCharts();
        this.renderSpeciesTable();
    }

    getUploadedDatasetKey(name, observations) {
        // Distinguish similarly named uploads by their observation count and complete date extent.
        const dates = observations.map(observation => observation.dateKey).filter(Boolean).sort();
        return `file:${name}:${observations.length}:${dates[0] || ''}:${dates.at(-1) || ''}`;
    }

    getRememberedDateRange() {
        // Read the selected calendar dates for only the active file or station-period dataset.
        if (!this.activeDatasetKey) return null;
        try {
            const ranges = JSON.parse(localStorage.getItem('birdnetDateRanges') || '{}');
            const range = ranges[this.activeDatasetKey];
            return range?.start && range?.end ? range : null;
        } catch (error) {
            console.warn('Remembered BirdNET date ranges could not be read:', error);
            return null;
        }
    }

    rememberDateRange() {
        // Persist date values instead of slider indexes so restored ranges survive sparse or updated datasets.
        if (!this.activeDatasetKey || !this.availableDateKeys.length) return;
        const start = this.availableDateKeys[Number(this.dateRangeStartInput.value)];
        const end = this.availableDateKeys[Number(this.dateRangeEndInput.value)];
        if (!start || !end) return;
        try {
            const ranges = JSON.parse(localStorage.getItem('birdnetDateRanges') || '{}');
            ranges[this.activeDatasetKey] = { start, end, updatedAt: new Date().toISOString() };
            localStorage.setItem('birdnetDateRanges', JSON.stringify(ranges));
        } catch (error) {
            console.warn('BirdNET date range could not be remembered:', error);
        }
    }

    getSelectedDateRange() {
        // Return the active inclusive dates for weather caching and targeted API requests.
        const start = this.availableDateKeys[Number(this.dateRangeStartInput.value)];
        const end = this.availableDateKeys[Number(this.dateRangeEndInput.value)];
        return start && end ? { start, end } : null;
    }

    applyPreferredNames(observations) {
        // Translate common names by scientific name while retaining the imported name for future language changes.
        return observations.map(observation => {
            const sourceCommonName = observation.sourceCommonName || observation.commonName;
            const translatedName = observation.scientificName
                ? this.translatedNames.get(observation.scientificName.toLowerCase())
                : null;
            return {
                ...observation,
                sourceCommonName,
                commonName: translatedName || sourceCommonName || observation.scientificName
            };
        });
    }

    createDatasetSnapshot() {
        // Capture only the uploaded-file state so BirdWeather browsing never replaces the private dataset.
        return {
            name: this.datasetName,
            kind: this.importKind,
            detail: this.datasetDetail,
            datasetKey: this.activeDatasetKey,
            savedAt: new Date().toISOString(),
            observations: this.observations
        };
    }

    async restorePersistedFile() {
        // Restore the last uploaded dataset after taxonomy and language maps are ready.
        try {
            await Promise.all([this.taxonomyPromise, this.languagePromise]);
            const database = await this.openDashboardDatabase();
            const snapshot = await new Promise((resolve, reject) => {
                const transaction = database.transaction('datasets', 'readonly');
                const request = transaction.objectStore('datasets').get('uploaded-file');
                request.onsuccess = () => resolve(request.result?.value || null);
                request.onerror = () => reject(request.error);
            });
            database.close();
            if (!snapshot?.observations?.length) return;

            snapshot.observations = this.applyPreferredNames(snapshot.observations.map(observation => ({
                ...observation,
                date: observation.date instanceof Date ? observation.date : new Date(observation.date),
                taxonomy: observation.scientificName
                    ? this.taxonomy.get(observation.scientificName.toLowerCase()) || observation.taxonomy || null
                    : observation.taxonomy || null
            })));
            this.savedFileDataset = snapshot;
            this.updateSavedFileControls();

            // Automatically return visitors to their private file unless another source is already loading.
            if (!this.stats) this.showSavedFile();
        } catch (error) {
            console.warn('Persistent uploaded-file storage is unavailable:', error);
        }
    }

    async persistUploadedFile(snapshot) {
        // IndexedDB supports observation histories larger than localStorage's small string quota.
        try {
            const database = await this.openDashboardDatabase();
            await new Promise((resolve, reject) => {
                const transaction = database.transaction('datasets', 'readwrite');
                transaction.objectStore('datasets').put({ id: 'uploaded-file', value: snapshot });
                transaction.oncomplete = resolve;
                transaction.onerror = () => reject(transaction.error);
                transaction.onabort = () => reject(transaction.error);
            });
            database.close();
        } catch (error) {
            console.warn('The uploaded file could not be persisted:', error);
            this.setStatus('Statistics loaded, but this browser could not persist the uploaded file.', true);
        }
    }

    async deleteSavedUploadedFile() {
        // Remove the persisted upload and close it when it is the dataset currently shown.
        if (!this.savedFileDataset) {
            this.setStatus('There is no saved uploaded file to delete.');
            return;
        }
        const fileName = this.savedFileDataset.name || 'uploaded BirdNET-Pi file';
        if (!window.confirm(`Delete "${fileName}" and its observations from this browser?`)) return;

        try {
            const database = await this.openDashboardDatabase();
            await new Promise((resolve, reject) => {
                const transaction = database.transaction('datasets', 'readwrite');
                transaction.objectStore('datasets').delete('uploaded-file');
                transaction.oncomplete = resolve;
                transaction.onerror = () => reject(transaction.error);
                transaction.onabort = () => reject(transaction.error);
            });
            database.close();
            this.savedFileDataset = null;
            // Deleting the uploaded source returns My BirdNET to a completely fresh initial state.
            this.resetDashboardState();
            this.setStatus(`Deleted ${fileName} from this browser.`);
        } catch (error) {
            console.error(error);
            this.setStatus('The saved uploaded file could not be deleted.', true);
        }
    }

    resetDashboardState() {
        // Clear active data, filters, generated markup, and canvases before showing source selection again.
        this.destroyCharts();
        this.observations = [];
        this.filteredObservations = [];
        this.availableDateKeys = [];
        this.stats = null;
        this.importKind = 'detections';
        this.datasetDetail = '';
        this.datasetName = '';
        this.activeDatasetKey = '';
        this.birdWeatherLimitReached = false;
        this.selectedActivitySpeciesKey = '';
        this.weatherLoadId += 1;
        this.activeMeteostatController?.abort();
        this.activeMeteostatController = null;
        this.activeHourlyWeatherController?.abort();
        this.activeHourlyWeatherController = null;
        this.hourlyWeatherSelectionKey = '';
        this.weatherData = new Map();
        this.weatherHourlyData = new Map();
        this.weatherLocation = null;
        this.activeSourceLocation = null;
        this.setWeatherStatus('');

        this.metricGrid.innerHTML = '';
        this.insightGrid.innerHTML = '';
        this.speciesTableBody.innerHTML = '';
        this.speciesFilter.value = '';
        this.activitySpeciesSelect.innerHTML = '';

        // Reset the date controls and all labels so hidden dashboard content cannot retain old values.
        [this.dateRangeStartInput, this.dateRangeEndInput].forEach(input => {
            input.min = '0';
            input.max = '0';
            input.value = '0';
            input.style.zIndex = '';
        });
        document.getElementById('date-range-selection').style.left = '0%';
        document.getElementById('date-range-selection').style.width = '0%';
        document.getElementById('date-range-start-label').textContent = 'Start';
        document.getElementById('date-range-end-label').textContent = 'End';
        document.getElementById('date-range-result-count').textContent = '';
        document.getElementById('dataset-name').textContent = 'Observations';
        document.getElementById('dataset-summary').textContent = '';
        this.floatingDataContext.hidden = true;

        // Restore the placeholder image used by the most-observed species card.
        const topSpeciesThumbnail = document.getElementById('top-species-thumbnail');
        if (topSpeciesThumbnail) {
            topSpeciesThumbnail.src = this.placeholderImage();
            topSpeciesThumbnail.alt = 'Most observed bird';
        }

        this.fileInput.value = '';
        this.dashboard.hidden = true;
        this.importPanel.hidden = false;
        this.updateSavedFileControls();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    openDashboardDatabase() {
        // Create versioned stores for the uploaded file and reusable BirdWeather station histories.
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject(new Error('IndexedDB is not supported'));
                return;
            }
            const request = indexedDB.open('bird-encyclopedia-my-birdnet', 4);
            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains('datasets')) {
                    database.createObjectStore('datasets', { keyPath: 'id' });
                }
                if (!database.objectStoreNames.contains('birdweather-cache')) {
                    const store = database.createObjectStore('birdweather-cache', { keyPath: 'id' });
                    store.createIndex('stationId', 'stationId', { unique: false });
                }
                if (!database.objectStoreNames.contains('birdweather-cache-metadata')) {
                    database.createObjectStore('birdweather-cache-metadata', { keyPath: 'id' });
                }
                if (!database.objectStoreNames.contains('meteostat-cache')) {
                    database.createObjectStore('meteostat-cache', { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async loadStationCacheMetadata() {
        // Load only cache headers at startup so station badges do not deserialize large observation arrays.
        try {
            const database = await this.openDashboardDatabase();
            const records = await new Promise((resolve, reject) => {
                const transaction = database.transaction('birdweather-cache-metadata', 'readonly');
                const request = transaction.objectStore('birdweather-cache-metadata').getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
            database.close();
            this.stationCacheMetadata = new Map(records.map(record => [
                record.id,
                {
                    stationId: String(record.stationId),
                    periodLabel: record.periodLabel,
                    savedAt: record.savedAt,
                    observationCount: record.observationCount
                }
            ]));
            this.refreshStationCacheTags();
        } catch (error) {
            console.warn('BirdWeather cache metadata could not be loaded:', error);
        }
    }

    getStationCacheKey(stationId, period = this.getBirdWeatherPeriod()) {
        // Exact station and duration values prevent a short history from masquerading as a longer cached period.
        return `station:${stationId}:period:${period.count}:${period.unit}`;
    }

    getStationCacheEntries(stationId) {
        return [...this.stationCacheMetadata.entries()]
            .filter(([, metadata]) => metadata.stationId === String(stationId));
    }

    getCurrentStationCache(stationId) {
        return this.stationCacheMetadata.get(this.getStationCacheKey(stationId)) || null;
    }

    async readStationCache(stationId, period) {
        // Read the large observation payload only after the visitor selects its exact cached station period.
        const database = await this.openDashboardDatabase();
        const record = await new Promise((resolve, reject) => {
            const transaction = database.transaction('birdweather-cache', 'readonly');
            const request = transaction.objectStore('birdweather-cache').get(
                this.getStationCacheKey(stationId, period)
            );
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
        database.close();
        return record;
    }

    async persistStationCache(station, period, observations) {
        // Store compact source records; taxonomy is restored from the local taxonomy map when the cache is opened.
        if (navigator.storage?.persist) {
            // Best-effort persistence reduces automatic eviction of large station histories.
            try {
                await navigator.storage.persist();
            } catch (error) {
                console.warn('Persistent storage permission could not be requested:', error);
            }
        }
        const id = this.getStationCacheKey(station.id, period);
        const compactObservations = observations.map(observation => ({
            date: observation.date,
            dateKey: observation.dateKey,
            time: observation.time,
            scientificName: observation.scientificName,
            commonName: observation.sourceCommonName || observation.commonName,
            sourceCommonName: observation.sourceCommonName || observation.commonName,
            confidence: observation.confidence,
            count: observation.count,
            latitude: observation.latitude,
            longitude: observation.longitude,
            fileName: observation.fileName
        }));
        const record = {
            id,
            stationId: String(station.id),
            station,
            period,
            periodLabel: period.label,
            savedAt: new Date().toISOString(),
            observationCount: compactObservations.reduce((total, item) => total + item.count, 0),
            observations: compactObservations
        };
        const database = await this.openDashboardDatabase();
        await new Promise((resolve, reject) => {
            const transaction = database.transaction(
                ['birdweather-cache', 'birdweather-cache-metadata'],
                'readwrite'
            );
            transaction.objectStore('birdweather-cache').put(record);
            transaction.objectStore('birdweather-cache-metadata').put({
                id,
                stationId: String(station.id),
                periodLabel: period.label,
                savedAt: record.savedAt,
                observationCount: record.observationCount
            });
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
        database.close();
        this.stationCacheMetadata.set(id, {
            stationId: String(station.id),
            periodLabel: period.label,
            savedAt: record.savedAt,
            observationCount: record.observationCount
        });
        this.refreshStationCacheTags();
    }

    async deleteStationCache(stationId) {
        // Remove every cached period for the selected station after an explicit badge click.
        const entries = this.getStationCacheEntries(stationId);
        if (!entries.length) return;
        try {
            const database = await this.openDashboardDatabase();
            await new Promise((resolve, reject) => {
                const transaction = database.transaction(
                    ['birdweather-cache', 'birdweather-cache-metadata'],
                    'readwrite'
                );
                const cacheStore = transaction.objectStore('birdweather-cache');
                const metadataStore = transaction.objectStore('birdweather-cache-metadata');
                entries.forEach(([key]) => {
                    cacheStore.delete(key);
                    metadataStore.delete(key);
                });
                transaction.oncomplete = resolve;
                transaction.onerror = () => reject(transaction.error);
                transaction.onabort = () => reject(transaction.error);
            });
            database.close();
            entries.forEach(([key]) => this.stationCacheMetadata.delete(key));
            this.refreshStationCacheTags();
            this.setStatus(`Deleted locally saved BirdWeather data for station ${stationId}.`);
        } catch (error) {
            console.error(error);
            this.setStatus(`Could not delete cached data for station ${stationId}.`, true);
        }
    }

    refreshStationCacheTags() {
        // Repaint visible list and map badges after period changes, cache saves, or cache deletion.
        if (this.stationResults && this.nearbyStations.length) {
            const visibleStations = this.stationViewMode === 'favourites'
                ? this.nearbyStations
                : this.nearbyStations.slice(0, 8);
            this.renderStationResults(visibleStations);
        }
        if (this.stationMap && !this.stationMapModal.hidden && this.nearbyStations.length) {
            this.renderMapStations(this.nearbyStations);
        }
    }

    renderStationCacheTag(stationId, { map = false } = {}) {
        // The badge reports the selected period cache and deletes every local period for this station when clicked.
        const currentCache = this.getCurrentStationCache(stationId);
        const entries = this.getStationCacheEntries(stationId);
        if (!entries.length) return '';
        const label = currentCache
            ? `Saved locally: ${currentCache.periodLabel}`
            : `${entries.length} saved period${entries.length === 1 ? '' : 's'}`;
        return `
            <button
                class="station-cache-tag ${map ? 'map-cache-tag' : ''}"
                type="button"
                data-delete-station-cache="${this.escapeHTML(stationId)}"
                title="Delete all locally saved data for this station">
                <i class="fa-solid fa-database" aria-hidden="true"></i>
                ${this.escapeHTML(label)}
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
        `;
    }

    loadFavouriteStations() {
        // Restore complete station records so favourites remain usable without geolocation or a new API search.
        try {
            const records = JSON.parse(localStorage.getItem('birdWeatherFavouriteStations') || '[]');
            this.favouriteStations = new Map(
                records
                    .filter(station => station?.id)
                    .map(station => [String(station.id), station])
            );
        } catch (error) {
            console.warn('Favourite stations could not be restored:', error);
            this.favouriteStations = new Map();
        }
        this.updateFavouriteStationCount();
    }

    persistFavouriteStations() {
        // Favourites are small station metadata records, so localStorage is sufficient and immediately available.
        localStorage.setItem(
            'birdWeatherFavouriteStations',
            JSON.stringify([...this.favouriteStations.values()])
        );
        this.updateFavouriteStationCount();
    }

    isStationFavourite(stationId) {
        return this.favouriteStations.has(String(stationId));
    }

    findKnownStation(stationId) {
        // Resolve a station from current search/map results or the persistent favourites collection.
        const id = String(stationId);
        return this.nearbyStations.find(station => String(station.id) === id)
            || this.favouriteStations.get(id)
            || null;
    }

    toggleStationFavourite(station) {
        // Add or remove the station independently from its cached observation histories.
        const id = String(station.id);
        if (this.favouriteStations.has(id)) {
            this.favouriteStations.delete(id);
            this.setStatus(`Removed ${station.name || `station ${id}`} from favourites.`);
        } else {
            this.favouriteStations.set(id, {
                id: station.id,
                name: station.name,
                type: station.type,
                location: station.location,
                state: station.state,
                country: station.country,
                latestDetectionAt: station.latestDetectionAt,
                coords: station.coords,
                distance: station.distance
            });
            this.setStatus(`Added ${station.name || `station ${id}`} to favourites.`);
        }
        this.persistFavouriteStations();
        this.refreshFavouriteStationViews();
    }

    updateFavouriteStationCount() {
        const count = document.getElementById('favourite-station-count');
        if (count) count.textContent = String(this.favouriteStations.size);
    }

    refreshFavouriteStationViews() {
        // Repaint visible station stars and map marker shapes after a favourite changes.
        if (this.stationResults && this.nearbyStations.length) {
            const visibleStations = this.stationViewMode === 'favourites'
                ? [...this.favouriteStations.values()]
                    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
                : this.nearbyStations.slice(0, 8);
            if (this.stationViewMode === 'favourites') this.nearbyStations = visibleStations;
            this.renderStationResults(visibleStations);
        }
        if (this.stationMap && !this.stationMapModal.hidden && this.nearbyStations.length) {
            this.renderMapStations(this.nearbyStations);
        }
    }

    showFavouriteStations() {
        // Display persistent favourites without requesting location or replacing locally cached observations.
        const favourites = [...this.favouriteStations.values()]
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        this.nearbyStations = favourites;
        this.stationViewMode = 'favourites';
        this.renderStationResults(favourites);
        this.setStatus(favourites.length
            ? `${favourites.length} favourite station${favourites.length === 1 ? '' : 's'}.`
            : 'No favourite stations yet. Use the star beside a station to add one.');
    }

    renderFavouriteButton(stationId, { map = false } = {}) {
        // A filled gold star marks favourites; an outline star adds a new favourite.
        const favourite = this.isStationFavourite(stationId);
        return `
            <button
                class="station-favourite-button ${favourite ? 'active' : ''} ${map ? 'map-favourite-button' : ''}"
                type="button"
                data-toggle-station-favourite="${this.escapeHTML(stationId)}"
                aria-label="${favourite ? 'Remove station from favourites' : 'Add station to favourites'}"
                title="${favourite ? 'Remove from favourites' : 'Add to favourites'}">
                <i class="${favourite ? 'fa-solid' : 'fa-regular'} fa-star" aria-hidden="true"></i>
            </button>
        `;
    }

    showSavedFile() {
        // Reopen the persisted private dataset without reparsing or discarding a visited BirdWeather station.
        if (!this.savedFileDataset?.observations?.length) {
            this.showImportPanel();
            this.setStatus('Upload a BirdNET-Pi file first.', true);
            return;
        }

        this.observations = this.savedFileDataset.observations;
        this.activeSourceLocation = null;
        this.importKind = this.savedFileDataset.kind;
        this.datasetDetail = this.savedFileDataset.detail || '';
        this.datasetName = this.savedFileDataset.name || 'Saved BirdNET-Pi export';
        this.activeDatasetKey = this.savedFileDataset.datasetKey
            || this.getUploadedDatasetKey(this.datasetName, this.observations);
        this.initializeDateRange();
        this.birdWeatherLimitReached = false;
        this.stats = this.calculateStatistics(this.filteredObservations);
        this.renderDashboard(this.datasetName);
    }

    updateSavedFileControls() {
        // Keep saved-file shortcuts synchronized in both source selection and BirdWeather views.
        const hasSavedFile = Boolean(this.savedFileDataset?.observations?.length);
        this.savedFileCard.hidden = !hasSavedFile;
        this.showSavedFileButton.hidden = !hasSavedFile || this.importKind !== 'birdweather';
        this.deleteLoadedDatasetButton.hidden = !hasSavedFile;
        if (hasSavedFile) {
            this.savedFileName.textContent = this.savedFileDataset.name || 'Saved BirdNET-Pi export';
        }
    }

    async findNearbyStations() {
        // Browser geolocation is requested only after a user action and is not persisted locally.
        this.setStatus('Requesting your location...');
        this.stationResults.innerHTML = '';

        try {
            const location = await this.getCurrentLocation();
            await this.queryNearbyStations(location.latitude, location.longitude);
        } catch (error) {
            this.setStatus(error.message, true);
        }
    }

    async chooseStationFromMap() {
        // Open a viewport-driven map; its station query intentionally ignores the nearby-list radius.
        this.setStatus('Preparing the station map...');
        try {
            const location = await this.getCurrentLocation();
            this.currentMapLocation = location;
            this.openStationMap();
            this.setStatus('');
        } catch (error) {
            this.setStatus(error.message, true);
        }
    }

    getCurrentLocation() {
        // Wrap browser geolocation in a promise shared by list and map station discovery.
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('This browser does not provide location access. Enter a BirdWeather station ID instead.'));
                return;
            }
            navigator.geolocation.getCurrentPosition(
                position => resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                }),
                error => {
                    reject(new Error(error.code === error.PERMISSION_DENIED
                        ? 'Location permission was declined. Enter a BirdWeather station ID instead.'
                        : 'Your location could not be determined. Enter a BirdWeather station ID instead.'));
                },
                { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
            );
        });
    }

    async queryNearbyStations(latitude, longitude) {
        const radius = Number(document.getElementById('birdweather-radius').value);
        const latitudeDelta = radius / 111.32;
        const longitudeDelta = radius / Math.max(1, 111.32 * Math.cos(latitude * Math.PI / 180));
        const query = `
            query NearbyStations($first: Int, $after: String, $ne: InputLocation, $sw: InputLocation) {
                stations(first: $first, after: $after, ne: $ne, sw: $sw, bats: false) {
                    nodes {
                        id name type location state country latestDetectionAt
                        coords { lat lon }
                    }
                    pageInfo { hasNextPage endCursor }
                }
            }
        `;

        this.setStatus(`Looking for public stations within ${radius} km...`);

        try {
            const stationNodes = [];
            let cursor = null;
            let hasNextPage = true;
            while (hasNextPage && stationNodes.length < 500) {
                const data = await this.birdWeatherQuery(query, {
                    first: 100,
                    after: cursor,
                    ne: { lat: latitude + latitudeDelta, lon: longitude + longitudeDelta },
                    sw: { lat: latitude - latitudeDelta, lon: longitude - longitudeDelta }
                });
                stationNodes.push(...(data.stations?.nodes || []));
                hasNextPage = Boolean(data.stations?.pageInfo?.hasNextPage);
                cursor = data.stations?.pageInfo?.endCursor || null;
                if (!cursor) break;
            }

            const stations = stationNodes
                .map(station => ({
                    ...station,
                    distance: this.distanceInKilometres(latitude, longitude, station.coords?.lat, station.coords?.lon)
                }))
                .filter(station => station.distance <= radius)
                .sort((a, b) => a.distance - b.distance);

            this.nearbyStations = stations;
            this.stationViewMode = 'nearby';
            this.currentMapLocation = { latitude, longitude, radius };
            this.renderStationResults(stations.slice(0, 8));
            this.setStatus(stations.length ? '' : `No active BirdWeather stations were found within ${radius} km.`);
        } catch (error) {
            console.error(error);
            this.setStatus(error.message || 'BirdWeather stations could not be loaded.', true);
        }
    }

    openStationMap() {
        // Build a muted Leaflet map whose visible bounds determine the BirdWeather station query.
        if (typeof L === 'undefined') {
            this.setStatus('The map library could not be loaded. Use the station list or station ID instead.', true);
            return;
        }
        if (!this.currentMapLocation) {
            this.setStatus('Your location is needed to open the station map.', true);
            return;
        }

        this.stationMapModal.hidden = false;
        document.body.classList.add('modal-open');

        if (!this.stationMap) {
            this.stationMap = L.map('station-map', { preferCanvas: true });
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                maxZoom: 20,
                subdomains: 'abcd',
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            }).addTo(this.stationMap);
            this.stationMapLayer = L.layerGroup().addTo(this.stationMap);
            this.stationMap.on('moveend', () => {
                // Debounce viewport requests while Leaflet finishes a pan or zoom animation.
                clearTimeout(this.mapMoveTimer);
                this.mapMoveTimer = setTimeout(() => this.loadStationsInMapViewport(), 180);
            });
        }

        const { latitude, longitude } = this.currentMapLocation;
        this.stationMap.setView([latitude, longitude], 9);
        this.stationMapLayer.clearLayers();
        L.circleMarker([latitude, longitude], {
            radius: 8,
            color: '#ffffff',
            weight: 3,
            fillColor: '#2678d8',
            fillOpacity: 1
        }).bindTooltip('Your approximate location').addTo(this.stationMapLayer);
        setTimeout(() => {
            this.stationMap.invalidateSize();
            this.loadStationsInMapViewport();
        }, 0);
    }

    scheduleMapPlaceSearch() {
        // Debounce suggestions to avoid sending a request for every keystroke.
        clearTimeout(this.mapSearchTimer);
        const query = this.mapPlaceInput.value.trim();
        if (query.length < 3) {
            this.mapSearchController?.abort();
            this.mapSearchResults = [];
            this.hideMapPlaceRecommendations();
            return;
        }
        this.mapSearchTimer = setTimeout(() => this.searchMapPlaces(query), 400);
    }

    async searchMapPlaces(query) {
        // Try Photon first, then ArcGIS so temporary provider or network failures do not disable place search.
        const controller = new AbortController();
        this.mapSearchController?.abort();
        this.mapSearchController = controller;

        try {
            let results;
            let provider;
            try {
                results = await this.searchPhotonPlaces(query, controller.signal);
                provider = 'Photon / OpenStreetMap';
            } catch (photonError) {
                if (photonError.name === 'AbortError') throw photonError;
                console.warn('Photon place search failed; trying ArcGIS:', photonError);
                results = await this.searchArcGISPlaces(query, controller.signal);
                provider = 'ArcGIS World Geocoding';
            }
            if (this.mapPlaceInput.value.trim() !== query) return;
            this.mapSearchResults = results;
            document.getElementById('map-search-attribution').textContent =
                `Place recommendations provided by ${provider}.`;
            this.renderMapPlaceRecommendations();
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.warn('Map place search failed:', error);
                this.mapPlaceRecommendations.innerHTML =
                    '<div class="map-place-empty">Place search is unavailable from both providers. Check your connection and try again.</div>';
                this.showMapPlaceRecommendations();
            }
        } finally {
            if (this.mapSearchController === controller) this.mapSearchController = null;
        }
    }

    async searchPhotonPlaces(query, signal) {
        // Photon supplies OpenStreetMap-based autocomplete recommendations.
        const url = new URL('https://photon.komoot.io/api/');
        url.searchParams.set('q', query);
        url.searchParams.set('limit', '7');
        url.searchParams.set('lang', this.getPhotonLanguage());
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error(`Photon returned HTTP ${response.status}`);
        const data = await response.json();
        return (data.features || [])
            .map(feature => this.normalizeMapPlace(feature))
            .filter(Boolean);
    }

    async searchArcGISPlaces(query, signal) {
        // ArcGIS provides a no-key browser fallback when Photon cannot be reached.
        const url = new URL(
            'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates'
        );
        url.searchParams.set('SingleLine', query);
        url.searchParams.set('f', 'json');
        url.searchParams.set('maxLocations', '7');
        url.searchParams.set('outFields', 'PlaceName,City,Region,Country');
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error(`ArcGIS returned HTTP ${response.status}`);
        const data = await response.json();
        return (data.candidates || [])
            .map(candidate => this.normalizeArcGISPlace(candidate))
            .filter(Boolean);
    }

    getPhotonLanguage() {
        // Photon localizes only English, German, and French; all other site languages use its default labels.
        const language = this.currentLanguage.split('_')[0];
        return ['de', 'en', 'fr'].includes(language) ? language : 'default';
    }

    normalizeMapPlace(feature) {
        // Convert Photon GeoJSON into a concise label and Leaflet-compatible coordinates.
        const coordinates = feature?.geometry?.coordinates;
        if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
        const properties = feature.properties || {};
        const primary = properties.name
            || properties.street
            || properties.city
            || properties.county
            || properties.state
            || properties.country;
        if (!primary) return null;
        const context = [
            properties.street && properties.street !== primary ? properties.street : null,
            properties.city && properties.city !== primary ? properties.city : null,
            properties.county && properties.county !== primary ? properties.county : null,
            properties.state && properties.state !== primary ? properties.state : null,
            properties.country && properties.country !== primary ? properties.country : null
        ].filter(Boolean);
        return {
            label: primary,
            context: [...new Set(context)].join(', '),
            latitude: Number(coordinates[1]),
            longitude: Number(coordinates[0]),
            type: properties.osm_value || properties.type || 'Place'
        };
    }

    normalizeArcGISPlace(candidate) {
        // Convert ArcGIS candidates to the same recommendation shape used by Photon.
        const latitude = Number(candidate?.location?.y);
        const longitude = Number(candidate?.location?.x);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
        const attributes = candidate.attributes || {};
        const label = attributes.PlaceName || candidate.address;
        if (!label) return null;
        const context = [
            attributes.City && attributes.City !== label ? attributes.City : null,
            attributes.Region && attributes.Region !== label ? attributes.Region : null,
            attributes.Country && attributes.Country !== label ? attributes.Country : null
        ].filter(Boolean);
        return {
            label,
            context: [...new Set(context)].join(', '),
            latitude,
            longitude,
            type: 'Place'
        };
    }

    renderMapPlaceRecommendations() {
        // Render keyboard-accessible recommendations and select a place without closing the map.
        if (!this.mapSearchResults.length) {
            this.mapPlaceRecommendations.innerHTML =
                '<div class="map-place-empty">No matching places found.</div>';
            this.showMapPlaceRecommendations();
            return;
        }
        this.mapPlaceRecommendations.innerHTML = this.mapSearchResults.map((place, index) => `
            <button
                class="map-place-option"
                type="button"
                role="option"
                data-place-index="${index}"
                aria-selected="false">
                <i class="fa-solid fa-location-dot" aria-hidden="true"></i>
                <span>
                    <strong>${this.escapeHTML(place.label)}</strong>
                    <small>${this.escapeHTML(place.context || place.type)}</small>
                </span>
            </button>
        `).join('');
        this.mapPlaceRecommendations.querySelectorAll('[data-place-index]').forEach(button => {
            button.addEventListener('click', () => this.selectMapPlace(Number(button.dataset.placeIndex)));
        });
        this.showMapPlaceRecommendations();
    }

    handleMapPlaceKeydown(event) {
        // Arrow keys navigate recommendations; Enter selects the highlighted or first result.
        const options = [...this.mapPlaceRecommendations.querySelectorAll('.map-place-option')];
        if (!options.length || this.mapPlaceRecommendations.hidden) return;
        const currentIndex = options.findIndex(option => option.classList.contains('active'));
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            const nextIndex = currentIndex < 0
                ? direction > 0 ? 0 : options.length - 1
                : (currentIndex + direction + options.length) % options.length;
            options.forEach((option, index) => option.classList.toggle('active', index === nextIndex));
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const selected = currentIndex >= 0 ? currentIndex : 0;
            this.selectMapPlace(Number(options[selected].dataset.placeIndex));
        } else if (event.key === 'Escape') {
            this.hideMapPlaceRecommendations();
        }
    }

    selectMapPlace(index) {
        // Center the map on the selected recommendation; moveend then refreshes visible stations.
        const place = this.mapSearchResults[index];
        if (!place || !this.stationMap) return;
        this.mapPlaceInput.value = place.context ? `${place.label}, ${place.context}` : place.label;
        this.hideMapPlaceRecommendations();
        this.stationMap.setView([place.latitude, place.longitude], 11, { animate: true });
    }

    showMapPlaceRecommendations() {
        this.mapPlaceRecommendations.hidden = false;
        this.mapPlaceInput.setAttribute('aria-expanded', 'true');
    }

    hideMapPlaceRecommendations() {
        this.mapPlaceRecommendations.hidden = true;
        this.mapPlaceInput.setAttribute('aria-expanded', 'false');
    }

    async loadStationsInMapViewport() {
        // Fetch every paginated BirdWeather station inside the map's current rectangular viewport.
        if (!this.stationMap || this.stationMapModal.hidden) return;
        const bounds = this.stationMap.getBounds();
        const query = `
            query ViewportStations($first: Int, $after: String, $ne: InputLocation, $sw: InputLocation) {
                stations(first: $first, after: $after, ne: $ne, sw: $sw, bats: false) {
                    nodes {
                        id name type location state country latestDetectionAt
                        coords { lat lon }
                    }
                    pageInfo { hasNextPage endCursor }
                }
            }
        `;
        const controller = new AbortController();
        this.mapStationController?.abort();
        this.mapStationController = controller;
        const requestId = ++this.mapStationRequestId;
        const stations = [];
        let cursor = null;
        let hasNextPage = true;
        document.getElementById('station-map-status').textContent = 'Loading stations in the visible map area...';

        try {
            while (hasNextPage) {
                const data = await this.birdWeatherQuery(query, {
                    first: 100,
                    after: cursor,
                    ne: { lat: bounds.getNorth(), lon: bounds.getEast() },
                    sw: { lat: bounds.getSouth(), lon: bounds.getWest() }
                }, controller.signal);
                stations.push(...(data.stations?.nodes || []));
                hasNextPage = Boolean(data.stations?.pageInfo?.hasNextPage);
                cursor = data.stations?.pageInfo?.endCursor || null;
                document.getElementById('station-map-status').textContent =
                    `Loading visible stations: ${this.formatNumber(stations.length)} found...`;
                if (!cursor) break;
            }
            if (requestId !== this.mapStationRequestId || controller.signal.aborted) return;
            this.nearbyStations = stations;
            this.stationViewMode = 'map';
            this.renderMapStations(stations);
            document.getElementById('station-map-status').textContent = stations.length
                ? `${this.formatNumber(stations.length)} stations in the visible area. Click a marker to select it.`
                : 'No BirdWeather stations are present in the visible area.';
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error(error);
                document.getElementById('station-map-status').textContent =
                    'Stations could not be loaded for this map area.';
            }
        } finally {
            if (this.mapStationController === controller) this.mapStationController = null;
        }
    }

    renderMapStations(stations) {
        // Replace map markers without changing the viewport or triggering another bounds request.
        this.stationMapLayer.clearLayers();
        const { latitude, longitude } = this.currentMapLocation;
        L.circleMarker([latitude, longitude], {
            radius: 8,
            color: '#ffffff',
            weight: 3,
            fillColor: '#2678d8',
            fillOpacity: 1
        }).bindTooltip('Your approximate location').addTo(this.stationMapLayer);

        stations.forEach(station => {
            if (!Number.isFinite(station.coords?.lat) || !Number.isFinite(station.coords?.lon)) return;
            const activity = this.getStationActivity(station.latestDetectionAt);
            const favourite = this.isStationFavourite(station.id);
            const marker = L.marker([station.coords.lat, station.coords.lon], {
                icon: L.divIcon({
                    className: '',
                    html: favourite
                        ? `<span class="map-favourite-marker ${activity.statusClass}"><i class="fa-solid fa-star"></i></span>`
                        : `<span class="map-station-marker ${activity.statusClass}"></span>`,
                    iconSize: favourite ? [30, 30] : [24, 24],
                    iconAnchor: favourite ? [15, 15] : [12, 24]
                }),
                title: station.name || `Station ${station.id}`
            });
            const place = [station.location, station.state, station.country].filter(Boolean).join(', ');
            marker.bindTooltip(`
                <div class="map-tooltip-content">
                    <div>
                        <strong>${this.escapeHTML(station.name || `Station ${station.id}`)}</strong>
                        <span>Station ID: ${this.escapeHTML(station.id)}</span>
                        <span>Type: ${this.escapeHTML(this.getStationTypeLabel(station.type))}</span>
                        ${this.renderFavouriteButton(station.id, { map: true })}
                    </div>
                    <div>
                        <span>${this.escapeHTML(activity.lastSeen)}</span>
                        ${place ? `<span>${this.escapeHTML(place)}</span>` : ''}
                        ${this.renderStationCacheTag(station.id, { map: true })}
                    </div>
                    <b>Click to select</b>
                </div>
            `, {
                direction: 'top',
                offset: [0, -18],
                className: 'station-map-tooltip',
                interactive: true
            });
            marker.on('click', () => {
                this.closeStationMap();
                this.loadBirdWeatherStation(station);
            });
            marker.addTo(this.stationMapLayer);
        });
    }

    closeStationMap() {
        // Close the map without changing the selected source or nearby-station results.
        this.mapStationController?.abort();
        this.mapStationController = null;
        this.mapSearchController?.abort();
        this.mapSearchController = null;
        this.hideMapPlaceRecommendations();
        this.stationMapModal.hidden = true;
        if (this.fetchProgressModal.hidden) document.body.classList.remove('modal-open');
    }

    renderStationResults(stations) {
        // Nearby results expose station activity, last detection, distance, and location before history is loaded.
        this.stationResults.innerHTML = stations.map(station => {
            const place = [station.location, station.state, station.country].filter(Boolean).join(', ');
            const activity = this.getStationActivity(station.latestDetectionAt);
            const distanceLabel = Number.isFinite(station.distance)
                ? `${station.distance.toFixed(1)} km away${place ? ` • ${place}` : ''}`
                : place || 'Location unavailable';
            return `
                <article class="station-result">
                    <div>
                        <div class="station-result-heading">
                            <strong>${this.escapeHTML(station.name || `Station ${station.id}`)}</strong>
                            <span class="station-status ${activity.statusClass}">
                                <span class="station-status-dot" aria-hidden="true"></span>
                                ${this.escapeHTML(activity.label)}
                            </span>
                            ${this.renderFavouriteButton(station.id)}
                        </div>
                        <span class="station-id">Station ID: ${this.escapeHTML(station.id)}</span>
                        <span class="station-type">Type: ${this.escapeHTML(this.getStationTypeLabel(station.type))}</span>
                        <span>${this.escapeHTML(distanceLabel)}</span>
                        <span class="station-last-seen" title="${this.escapeHTML(activity.exact)}">
                            <i class="fa-regular fa-clock" aria-hidden="true"></i>
                            ${this.escapeHTML(activity.lastSeen)}
                        </span>
                        ${this.renderStationCacheTag(station.id)}
                    </div>
                    <button class="primary-button" type="button" data-station-id="${this.escapeHTML(station.id)}">View statistics</button>
                </article>
            `;
        }).join('');

        this.stationResults.querySelectorAll('[data-station-id]').forEach(button => {
            button.addEventListener('click', () => {
                const station = stations.find(item => String(item.id) === button.dataset.stationId);
                if (station) this.loadBirdWeatherStation(station);
            });
        });
    }

    getStationActivity(latestDetectionAt) {
        // BirdWeather has no connection-status field, so a detection within 15 minutes indicates recent online activity.
        if (!latestDetectionAt) {
            return {
                isOnline: false,
                statusClass: 'inactive',
                label: 'No recent activity',
                lastSeen: 'Last detection unavailable',
                exact: 'No detection timestamp is available'
            };
        }

        const latest = new Date(latestDetectionAt);
        if (Number.isNaN(latest.getTime())) {
            return {
                isOnline: false,
                statusClass: 'inactive',
                label: 'No recent activity',
                lastSeen: 'Last detection unavailable',
                exact: 'No detection timestamp is available'
            };
        }

        const elapsedMilliseconds = Math.max(0, Date.now() - latest.getTime());
        const elapsedMinutes = Math.floor(elapsedMilliseconds / 60000);
        const isOnline = elapsedMinutes <= 15;
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const isStale = latest <= sixMonthsAgo;
        let relativeTime;

        if (isStale) {
            const now = new Date();
            let elapsedMonths = (now.getFullYear() - latest.getFullYear()) * 12
                + now.getMonth() - latest.getMonth();
            if (now.getDate() < latest.getDate()) elapsedMonths -= 1;
            relativeTime = `${Math.max(6, elapsedMonths)} months since last detection`;
        } else if (elapsedMinutes < 1) {
            relativeTime = 'just now';
        } else if (elapsedMinutes < 60) {
            relativeTime = `${elapsedMinutes} minute${elapsedMinutes === 1 ? '' : 's'} ago`;
        } else {
            const elapsedHours = Math.floor(elapsedMinutes / 60);
            if (elapsedHours < 48) {
                relativeTime = `${elapsedHours} hour${elapsedHours === 1 ? '' : 's'} ago`;
            } else {
                const elapsedDays = Math.floor(elapsedHours / 24);
                relativeTime = `${elapsedDays} day${elapsedDays === 1 ? '' : 's'} ago`;
            }
        }

        return {
            isOnline,
            statusClass: isStale ? 'stale' : isOnline ? 'online' : 'inactive',
            label: isStale ? 'Inactive 6+ months' : isOnline ? 'Online' : 'Not recently active',
            lastSeen: isStale ? relativeTime : `Last detection ${relativeTime}`,
            exact: `Last detection: ${new Intl.DateTimeFormat(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short'
            }).format(latest)}`
        };
    }

    getStationTypeLabel(type) {
        // Translate BirdWeather's station type codes into labels visitors can understand.
        const labels = {
            birdnetpi: 'BirdNET-Pi',
            puc: 'BirdWeather PUC',
            stream_audio: 'Audio stream',
            stream_youtube: 'YouTube stream'
        };
        return labels[type] || String(type || 'Unknown').replaceAll('_', ' ');
    }

    async loadStationById() {
        // Direct ID lookup is the non-location fallback and also supports shared BirdWeather station links.
        const stationIdInput = document.getElementById('birdweather-station-id');
        const id = this.normalizeStationId(stationIdInput.value);
        if (!id) {
            this.setStatus('Enter a station ID such as 15888, ID15888, or #15888.', true);
            return;
        }
        stationIdInput.value = id;

        const query = `
            query Station($id: ID!) {
                station(id: $id) {
                    id name type location state country latestDetectionAt
                    coords { lat lon }
                }
            }
        `;

        this.setStatus(`Finding BirdWeather station ${id}...`);
        try {
            const data = await this.birdWeatherQuery(query, { id });
            if (!data.station) throw new Error(`BirdWeather station ${id} was not found.`);
            await this.loadBirdWeatherStation(data.station);
        } catch (error) {
            console.error(error);
            this.setStatus(error.message || 'The BirdWeather station could not be loaded.', true);
        }
    }

    normalizeStationId(value) {
        // Accept common copied station formats while rejecting mixed or ambiguous text.
        const match = String(value || '').trim().match(/^(?:id\s*|#\s*)?(\d+)$/i);
        return match ? match[1] : null;
    }

    async loadBirdWeatherStation(station) {
        // Fetch detection pages for one public station and normalize them into the local dashboard model.
        const period = this.getBirdWeatherPeriod();
        await this.stationCachePromise;
        try {
            const cached = await this.readStationCache(station.id, period);
            if (cached?.observations?.length) {
                await Promise.all([this.taxonomyPromise, this.languagePromise]);
                const observations = this.applyPreferredNames(cached.observations.map(observation => ({
                    ...observation,
                    date: observation.date instanceof Date
                        ? observation.date
                        : new Date(observation.date),
                    taxonomy: observation.scientificName
                        ? this.taxonomy.get(observation.scientificName.toLowerCase()) || null
                        : null
                })));
                this.openBirdWeatherObservations(
                    cached.station || station,
                    cached.period || period,
                    observations,
                    cached.observationCount || observations.length,
                    true
                );
                this.setStatus(
                    `Loaded ${this.formatNumber(cached.observationCount || observations.length)} observations from local storage.`
                );
                return;
            }
        } catch (error) {
            console.warn('Cached BirdWeather data could not be opened; fetching again:', error);
        }

        const pageSize = 500;
        // Allow large annual histories while retaining an emergency ceiling for multi-million-record stations.
        const maximumDetections = 500000;
        const detections = [];
        const controller = new AbortController();
        this.activeBirdWeatherController?.abort();
        this.activeBirdWeatherController = controller;
        let cursor = null;
        let hasNextPage = true;
        let reportedTotal = 0;
        const query = `
            query StationDetections($stationIds: [ID!], $period: InputDuration, $first: Int, $after: String) {
                detections(
                    stationIds: $stationIds
                    classifications: ["avian"]
                    period: $period
                    first: $first
                    after: $after
                    sortBy: "timestamp_desc"
                ) {
                    nodes {
                        timestamp confidence
                        coords { lat lon }
                        species { commonName scientificName thumbnailUrl imageUrl }
                    }
                    pageInfo { hasNextPage endCursor }
                    totalCount
                }
            }
        `;

        const startedAt = performance.now();
        this.showFetchProgress(station, period);
        this.setStatus('');

        try {
            await Promise.all([this.taxonomyPromise, this.languagePromise]);
            while (hasNextPage && detections.length < maximumDetections) {
                const data = await this.birdWeatherQuery(query, {
                    stationIds: [String(station.id)],
                    period: { count: period.count, unit: period.unit },
                    first: pageSize,
                    after: cursor
                }, controller.signal);
                if (controller.signal.aborted) throw new DOMException('Import cancelled', 'AbortError');
                const connection = data.detections;
                detections.push(...(connection.nodes || []));
                reportedTotal = Number(connection.totalCount) || detections.length;
                hasNextPage = Boolean(connection.pageInfo?.hasNextPage);
                cursor = connection.pageInfo?.endCursor || null;
                this.updateFetchProgress(
                    Math.min(detections.length, maximumDetections),
                    reportedTotal,
                    maximumDetections,
                    startedAt
                );
                if (!cursor) break;
            }

            if (controller.signal.aborted) throw new DOMException('Import cancelled', 'AbortError');
            const observations = this.applyPreferredNames(detections
                .map(detection => this.normalizeBirdWeatherDetection(detection))
                .filter(Boolean));
            if (!observations.length) {
                throw new Error(`No bird observations were found at this station during the ${period.label.toLowerCase()}.`);
            }

            document.getElementById('fetch-progress-message').textContent =
                `Saving ${this.formatNumber(observations.length)} observations in this browser...`;
            document.getElementById('fetch-progress-eta').textContent = 'Creating local station cache...';
            try {
                await this.persistStationCache(station, period, observations);
            } catch (cacheError) {
                console.warn('BirdWeather observations could not be cached:', cacheError);
                this.setStatus('Observations loaded, but this browser could not save them locally.', true);
            }
            this.openBirdWeatherObservations(station, period, observations, reportedTotal, false);
            this.hideFetchProgress();
            if (!this.importStatus.classList.contains('error')) this.setStatus('');
        } catch (error) {
            this.hideFetchProgress();
            if (error.name === 'AbortError') {
                this.setStatus('BirdWeather import cancelled.');
            } else {
                console.error(error);
                this.setStatus(error.message || 'BirdWeather observations could not be loaded.', true);
            }
        } finally {
            if (this.activeBirdWeatherController === controller) {
                this.activeBirdWeatherController = null;
            }
        }
    }

    openBirdWeatherObservations(station, period, observations, reportedTotal, fromCache) {
        // Apply fetched or cached station observations through the same dashboard initialization path.
        this.observations = observations;
        this.activeSourceLocation = Number.isFinite(station.coords?.lat) && Number.isFinite(station.coords?.lon)
            ? { lat: station.coords.lat, lon: station.coords.lon, source: 'BirdWeather station' }
            : null;
        this.importKind = 'birdweather';
        this.datasetDetail = `${period.label} public station history${fromCache ? ' • saved locally' : ''}`;
        this.datasetName = station.name || `BirdWeather station ${station.id}`;
        this.activeDatasetKey = `birdweather:${station.id}:${period.count}:${period.unit}`;
        this.initializeDateRange();
        this.birdWeatherLimitReached = reportedTotal > observations.length;
        this.stats = this.calculateStatistics(this.filteredObservations);
        this.renderDashboard(this.datasetName);
    }

    getBirdWeatherPeriod() {
        // Parse selector values into BirdWeather's native duration count/unit format and a readable label.
        const [countValue, unit = 'day'] = this.birdWeatherPeriod.value.split(':');
        const count = Math.max(1, Number.parseInt(countValue, 10) || 1);
        const label = unit === 'month'
            ? `Last ${count} months`
            : count === 1
                ? 'Last 24 hours'
                : `Last ${count} days`;
        return { count, unit, label };
    }

    showFetchProgress(station, period) {
        // Open a centered progress dialog before the first page reveals the station's total observation count.
        document.getElementById('fetch-progress-title').textContent =
            station.name || `BirdWeather station ${station.id}`;
        document.getElementById('fetch-progress-message').textContent =
            `Loading observations from the ${period.label.toLowerCase()}...`;
        document.getElementById('fetch-progress-percent').textContent = '0%';
        document.getElementById('fetch-progress-count').textContent = 'Waiting for the first page...';
        document.getElementById('fetch-progress-eta').textContent = 'Calculating time remaining...';
        document.getElementById('fetch-progress-fill').style.width = '0%';
        document.getElementById('fetch-progress-bar').setAttribute('aria-valuenow', '0');
        this.fetchProgressModal.hidden = false;
        document.body.classList.add('modal-open');
    }

    updateFetchProgress(loaded, availableTotal, maximumDetections, startedAt) {
        // Calculate progress against the browser import cap while still displaying the station's full available total.
        const importTotal = Math.max(1, Math.min(availableTotal, maximumDetections));
        const completed = Math.min(loaded, importTotal);
        const percentage = Math.min(100, Math.round((completed / importTotal) * 100));
        const elapsedSeconds = Math.max(0.1, (performance.now() - startedAt) / 1000);
        const rate = completed / elapsedSeconds;
        const remainingSeconds = rate > 0 ? Math.max(0, (importTotal - completed) / rate) : null;
        const cappedLabel = availableTotal > maximumDetections
            ? `; ${this.formatNumber(availableTotal)} available at this station`
            : '';

        document.getElementById('fetch-progress-percent').textContent = `${percentage}%`;
        document.getElementById('fetch-progress-count').textContent =
            `${this.formatNumber(completed)} of ${this.formatNumber(importTotal)} observations${cappedLabel}`;
        document.getElementById('fetch-progress-eta').textContent = remainingSeconds === null
            ? 'Calculating time remaining...'
            : remainingSeconds < 2
                ? 'Finishing...'
                : `Approximately ${this.formatDuration(remainingSeconds)} remaining`;
        document.getElementById('fetch-progress-fill').style.width = `${percentage}%`;
        document.getElementById('fetch-progress-bar').setAttribute('aria-valuenow', String(percentage));
    }

    formatDuration(seconds) {
        // Keep the estimated time compact enough for the progress modal on narrow screens.
        const roundedSeconds = Math.max(1, Math.round(seconds));
        if (roundedSeconds < 60) return `${roundedSeconds} second${roundedSeconds === 1 ? '' : 's'}`;
        const minutes = Math.ceil(roundedSeconds / 60);
        return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    }

    cancelBirdWeatherFetch() {
        // Abort the active GraphQL page request and leave any previously loaded dashboard untouched.
        if (!this.activeBirdWeatherController) return;
        document.getElementById('fetch-progress-message').textContent = 'Cancelling import...';
        document.getElementById('cancel-station-fetch').disabled = true;
        this.activeBirdWeatherController.abort();
    }

    hideFetchProgress() {
        // Reset the progress dialog after success, error, or cancellation.
        this.fetchProgressModal.hidden = true;
        document.getElementById('cancel-station-fetch').disabled = false;
        if (this.stationMapModal.hidden) document.body.classList.remove('modal-open');
    }

    normalizeBirdWeatherDetection(detection) {
        // Convert BirdWeather timestamps, species metadata, and image URLs to the importer record shape.
        const date = this.parseBirdWeatherDate(detection.timestamp);
        const scientificName = String(detection.species?.scientificName || '').trim();
        const commonName = String(detection.species?.commonName || scientificName).trim();
        if (!date || !commonName) return null;

        const taxonomy = scientificName
            ? this.taxonomy.get(scientificName.toLowerCase()) || null
            : null;
        const thumbnail = detection.species?.thumbnailUrl || detection.species?.imageUrl;
        const cacheKey = (scientificName || commonName).toLowerCase();
        if (thumbnail && cacheKey) this.thumbnailCache.set(cacheKey, Promise.resolve(thumbnail));

        return {
            date,
            dateKey: this.toDateKey(date),
            time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            scientificName,
            commonName,
            sourceCommonName: commonName,
            confidence: this.normalizeConfidence(detection.confidence),
            count: 1,
            latitude: this.toNumber(detection.coords?.lat),
            longitude: this.toNumber(detection.coords?.lon),
            fileName: '',
            taxonomy
        };
    }

    parseBirdWeatherDate(timestamp) {
        // Preserve the station's wall-clock date and time instead of converting remote stations to the visitor's timezone.
        const match = String(timestamp || '').match(
            /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/
        );
        if (!match) return null;
        const [, year, month, day, hour, minute, second = '0'] = match;
        const date = new Date(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            Number(minute),
            Number(second)
        );
        return Number.isNaN(date.getTime()) ? null : date;
    }

    async birdWeatherQuery(query, variables, signal = undefined) {
        // A small GraphQL client keeps public API errors consistent across station and detection requests.
        const response = await fetch('https://app.birdweather.com/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables }),
            signal
        });
        if (!response.ok) throw new Error(`BirdWeather returned HTTP ${response.status}.`);

        const payload = await response.json();
        if (payload.errors?.length) throw new Error(payload.errors[0].message);
        return payload.data;
    }

    distanceInKilometres(latitudeA, longitudeA, latitudeB, longitudeB) {
        // Haversine distance removes stations outside the circular radius of the API bounding box.
        if (![latitudeA, longitudeA, latitudeB, longitudeB].every(Number.isFinite)) return Infinity;
        const radians = value => value * Math.PI / 180;
        const earthRadius = 6371;
        const latitudeDelta = radians(latitudeB - latitudeA);
        const longitudeDelta = radians(longitudeB - longitudeA);
        const a = Math.sin(latitudeDelta / 2) ** 2
            + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB))
            * Math.sin(longitudeDelta / 2) ** 2;
        return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    async handleWeatherToggle() {
        // Persist the switch and load weather only when an active dataset and coordinates are available.
        this.weatherEnabled = this.weatherToggle.checked;
        localStorage.setItem('birdWeatherOverlayEnabled', String(this.weatherEnabled));
        this.weatherSettings.hidden = !this.weatherEnabled;

        if (!this.weatherEnabled) {
            this.weatherLoadId += 1;
            this.activeMeteostatController?.abort();
            this.activeMeteostatController = null;
            this.weatherData = new Map();
            this.weatherHourlyData = new Map();
            this.setWeatherStatus('');
            if (this.stats) this.renderCharts();
            return;
        }

        if (this.stats) await this.loadWeatherForActiveDataset();
    }

    async saveWeatherKeyAndLoad() {
        // Store the visitor-owned RapidAPI key locally; it is never sent anywhere except Meteostat.
        const key = this.weatherApiKeyInput.value.trim();
        if (!key) {
            this.setWeatherStatus('Enter your Meteostat RapidAPI key first.', true);
            return;
        }
        localStorage.setItem('meteostatRapidApiKey', key);
        this.weatherToggle.checked = true;
        this.weatherEnabled = true;
        localStorage.setItem('birdWeatherOverlayEnabled', 'true');
        await this.loadWeatherForActiveDataset({ force: true });
    }

    async refreshWeatherNow() {
        // Explicit refresh bypasses both the active summary and station-year caches.
        if (!this.stats) {
            this.setWeatherStatus('Load a BirdNET file or BirdWeather station first.', true);
            return;
        }
        await this.loadWeatherForActiveDataset({ force: true });
    }

    isWeatherCacheFresh(savedAt) {
        // Weather caches automatically expire after seven days.
        const savedTime = new Date(savedAt).getTime();
        return Number.isFinite(savedTime) && Date.now() - savedTime < 7 * 24 * 60 * 60 * 1000;
    }

    getDatasetWeatherLocation() {
        // Prefer the selected BirdWeather station; private files use the average of their valid coordinates.
        if (this.importKind === 'birdweather' && this.activeSourceLocation) {
            return this.activeSourceLocation;
        }
        const coordinates = this.observations
            .filter(item => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
        if (!coordinates.length) return null;

        return {
            lat: coordinates.reduce((sum, item) => sum + item.latitude, 0) / coordinates.length,
            lon: coordinates.reduce((sum, item) => sum + item.longitude, 0) / coordinates.length,
            source: 'imported file'
        };
    }

    async loadWeatherForActiveDataset({ force = false } = {}) {
        if (!this.weatherEnabled || !this.observations.length || !this.availableDateKeys.length) return;
        const location = this.getDatasetWeatherLocation();
        if (!location) {
            this.setWeatherStatus('Weather needs latitude and longitude in the loaded observations.', true);
            return;
        }

        const apiKey = localStorage.getItem('meteostatRapidApiKey') || '';
        if (!apiKey) {
            this.weatherSettings.hidden = false;
            this.setWeatherStatus('Add a Meteostat RapidAPI key to locate the nearest weather station.', true);
            return;
        }

        const selectedRange = this.getSelectedDateRange();
        if (!selectedRange) return;
        const { start, end } = selectedRange;
        const cacheKey = `three-stations-v5:${location.lat.toFixed(3)}:${location.lon.toFixed(3)}:${start}:${end}`;
        if (!force) {
            try {
                const cached = JSON.parse(localStorage.getItem('meteostatWeatherCache') || 'null');
                if (
                    cached?.key === cacheKey
                    && Array.isArray(cached.records)
                    && this.isWeatherCacheFresh(cached.savedAt)
                ) {
                    this.weatherData = new Map(cached.records.map(record => [record.date, record]));
                    this.weatherHourlyData = new Map(
                        (cached.hourlyRecords || []).map(record => [record.time, record])
                    );
                    this.weatherLocation = cached.location || location;
                    const ageDays = Math.max(0, Math.floor(
                        (Date.now() - new Date(cached.savedAt).getTime()) / 86400000
                    ));
                    this.setWeatherStatus(
                        `Weather loaded from local cache (${this.weatherData.size} days, updated ${ageDays === 0 ? 'today' : `${ageDays} day${ageDays === 1 ? '' : 's'} ago`}). Click to view stations.`
                    );
                    this.renderCharts();
                    this.ensureSelectedHourlyWeather();
                    return;
                }
            } catch (error) {
                console.warn('Saved Meteostat weather cache could not be read:', error);
            }
        }

        const requestId = ++this.weatherLoadId;
        this.activeMeteostatController?.abort();
        const controller = new AbortController();
        this.activeMeteostatController = controller;
        this.setWeatherStatus(`Finding the three nearest Meteostat stations for the ${location.source || 'dataset'} location...`);

        try {
            const stations = await this.fetchNearestMeteostatStations(location, apiKey, controller.signal);
            const stationsWithMetadata = [];
            for (const station of stations) {
                if (requestId !== this.weatherLoadId || controller.signal.aborted) return;
                stationsWithMetadata.push(
                    await this.fetchMeteostatStationMetadata(station, apiKey, controller.signal)
                );
            }
            const stationRecords = new Map(stationsWithMetadata.map(station => [station.id, new Map()]));
            const stationHourlyRecords = new Map(stationsWithMetadata.map(station => [station.id, new Map()]));
            const selectedDays = Math.floor(
                (new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86400000
            ) + 1;

            if (selectedDays <= 2) {
                // Short restored windows use targeted station-hour API requests instead of annual bulk files.
                this.setWeatherStatus(`Loading hourly weather for the selected ${selectedDays}-day window...`);
                for (const station of stationsWithMetadata) {
                    if (requestId !== this.weatherLoadId || controller.signal.aborted) return;
                    const hourly = await this.fetchMeteostatStationHourly(
                        station,
                        start,
                        end,
                        apiKey,
                        controller.signal
                    );
                    stationHourlyRecords.set(station.id, hourly);
                    stationRecords.set(station.id, this.aggregateHourlyWeatherByDay(hourly));
                }
            } else {
                const firstYear = Number(start.slice(0, 4));
                const lastYear = Number(end.slice(0, 4));
                for (let year = firstYear; year <= lastYear; year += 1) {
                    if (requestId !== this.weatherLoadId) return;
                    this.setWeatherStatus(`Loading ${year} weather from ${stationsWithMetadata.length} nearby stations...`);
                    const annualResults = await Promise.all(stationsWithMetadata.map(async station => ({
                        station,
                        records: await this.fetchMeteostatBulkYear(station.id, year, { forceRefresh: force }),
                        hourlyRecords: await this.fetchMeteostatHourlyYear(
                            station.id,
                            year,
                            { forceRefresh: force }
                        )
                    })));
                    annualResults.forEach(result => {
                        const target = stationRecords.get(result.station.id);
                        const hourlyTarget = stationHourlyRecords.get(result.station.id);
                        result.hourlyRecords.forEach((record, time) => hourlyTarget.set(time, record));
                        const hourlyDaily = this.aggregateHourlyWeatherByDay(result.hourlyRecords);
                        result.records.forEach(record => {
                            if (record.date >= start && record.date <= end) {
                                const hourly = hourlyDaily.get(record.date);
                                target.set(record.date, {
                                    ...record,
                                    ...hourly,
                                    date: record.date
                                });
                            }
                        });
                        hourlyDaily.forEach((hourly, date) => {
                            if (date >= start && date <= end && !target.has(date)) {
                                target.set(date, { date, ...hourly });
                            }
                        });
                    });
                }
            }

            const records = this.averageMeteostatStations(stationRecords);
            const hourlyRecords = this.averageMeteostatHourlyStations(stationHourlyRecords);
            const missingDates = this.availableDateKeys.filter(
                date => date >= start && date <= end && !records.has(date)
            );
            if (missingDates.length) {
                this.setWeatherStatus(`Filling ${missingDates.length} missing weather dates through the Meteostat API...`);
                const pointRecords = await this.fetchMeteostatPointDaily(
                    location,
                    start,
                    end,
                    apiKey,
                    controller.signal
                );
                pointRecords.forEach(record => {
                    if (!records.has(record.date)) records.set(record.date, record);
                });
            }

            if (requestId !== this.weatherLoadId) return;
            this.weatherData = records;
            this.weatherHourlyData = hourlyRecords;
            this.weatherLocation = { ...location, stations: stationsWithMetadata };
            try {
                // Keep one compact active-location cache to avoid repeated bulk and API requests.
                localStorage.setItem('meteostatWeatherCache', JSON.stringify({
                    key: cacheKey,
                    savedAt: new Date().toISOString(),
                    location: this.weatherLocation,
                    records: [...records.values()],
                    hourlyRecords: [...hourlyRecords.values()]
                }));
            } catch (error) {
                console.warn('Meteostat weather could not be cached locally:', error);
            }
            this.setWeatherStatus(
                `Weather ready: ${records.size} days averaged from ${stationsWithMetadata.length} nearby Meteostat station${stationsWithMetadata.length === 1 ? '' : 's'}. Click to view them on the map.`
            );
            this.renderCharts();
            this.ensureSelectedHourlyWeather();
        } catch (error) {
            if (error.name === 'AbortError') return;
            console.error('Meteostat weather loading failed:', error);
            this.setWeatherStatus(error.message || 'Weather data could not be loaded.', true);
        } finally {
            if (this.activeMeteostatController === controller) {
                this.activeMeteostatController = null;
            }
        }
    }

    async fetchNearestMeteostatStations(location, apiKey, signal) {
        // Find three stations so local gaps and outlying measurements have less influence on bird comparisons.
        const url = new URL('https://meteostat.p.rapidapi.com/stations/nearby');
        url.search = new URLSearchParams({
            lat: location.lat,
            lon: location.lon,
            limit: '3'
        });
        const response = await this.meteostatFetch(url, {
            headers: {
                'Content-Type': 'application/json',
                'X-RapidAPI-Key': apiKey,
                'X-RapidAPI-Host': 'meteostat.p.rapidapi.com'
            },
            signal
        });
        if (!response.ok) {
            throw new Error(await this.getMeteostatApiError(response, 'station lookup'));
        }
        const payload = await response.json();
        const stations = (payload.data || []).filter(station => station?.id).slice(0, 3).map(station => ({
            id: station.id,
            name: station.name?.en || Object.values(station.name || {})[0] || station.id,
            distance: station.distance || 0
        }));
        if (!stations.length) throw new Error('No Meteostat weather station was found near these observations.');
        return stations;
    }

    meteostatFetch(url, options = {}) {
        // Serialize RapidAPI calls with a short pause to avoid per-second throttling on metadata batches.
        const run = async () => {
            if (options.signal?.aborted) throw new DOMException('Weather request cancelled', 'AbortError');
            const response = await fetch(url, options);
            this.updateMeteostatApiUsage(response);
            await new Promise(resolve => setTimeout(resolve, 350));
            return response;
        };
        const request = this.meteostatRequestChain.then(run, run);
        this.meteostatRequestChain = request.catch(() => {});
        return request;
    }

    restoreMeteostatApiUsage() {
        // Restore the last quota report because RapidAPI may not expose headers on cached-only page loads.
        if (!this.weatherApiUsage) return;
        try {
            const usage = JSON.parse(localStorage.getItem('meteostatApiUsage') || 'null');
            if (!Number.isFinite(usage?.remaining)) return;
            this.renderMeteostatApiUsage(usage);
        } catch (error) {
            console.warn('Saved Meteostat API usage could not be read:', error);
        }
    }

    updateMeteostatApiUsage(response) {
        // Read any monthly quota headers exposed by RapidAPI without assuming every plan returns all fields.
        if (!this.weatherApiUsage) return;
        const readNumber = names => {
            for (const name of names) {
                const value = Number.parseInt(response.headers.get(name), 10);
                if (Number.isFinite(value)) return value;
            }
            return null;
        };
        const remaining = readNumber([
            'x-ratelimit-requests-remaining',
            'x-ratelimit-rapid-free-plans-hard-limit-remaining'
        ]);
        const limit = readNumber([
            'x-ratelimit-requests-limit',
            'x-ratelimit-rapid-free-plans-hard-limit'
        ]);
        const resetSeconds = readNumber([
            'x-ratelimit-requests-reset',
            'x-ratelimit-rapid-free-plans-hard-limit-reset'
        ]);

        if (!Number.isFinite(remaining)) {
            this.weatherApiUsage.textContent =
                'RapidAPI did not expose a remaining-request header. Check the Meteostat usage page in your RapidAPI dashboard for the exact quota.';
            return;
        }

        const usage = {
            remaining,
            limit,
            resetSeconds,
            updatedAt: new Date().toISOString()
        };
        localStorage.setItem('meteostatApiUsage', JSON.stringify(usage));
        this.renderMeteostatApiUsage(usage);
    }

    renderMeteostatApiUsage(usage) {
        // Present the most recent quota count and optional reset time in a compact dashboard message.
        const limitText = Number.isFinite(usage.limit) ? ` of ${this.formatNumber(usage.limit)}` : '';
        const resetText = Number.isFinite(usage.resetSeconds)
            ? ` Reset expected in about ${this.formatQuotaDuration(usage.resetSeconds)}.`
            : '';
        this.weatherApiUsage.textContent =
            `RapidAPI requests remaining: ${this.formatNumber(usage.remaining)}${limitText}.${resetText}`;
    }

    formatQuotaDuration(seconds) {
        // Convert a provider reset duration into a short human-readable estimate.
        const value = Math.max(0, Number(seconds));
        const unit = (amount, label) => `${amount} ${label}${amount === 1 ? '' : 's'}`;
        if (value < 120) return unit(Math.ceil(value), 'second');
        if (value < 3600) return unit(Math.ceil(value / 60), 'minute');
        if (value < 86400) return unit(Math.ceil(value / 3600), 'hour');
        return unit(Math.ceil(value / 86400), 'day');
    }

    async fetchMeteostatStationMetadata(station, apiKey, signal) {
        // Add coordinates for the weather-source map while retaining nearby-search distance and name.
        const cacheId = `station-meta:${station.id}`;
        try {
            const database = await this.openDashboardDatabase();
            const cached = await new Promise((resolve, reject) => {
                const transaction = database.transaction('meteostat-cache', 'readonly');
                const request = transaction.objectStore('meteostat-cache').get(cacheId);
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error);
            });
            database.close();
            if (cached?.station && this.isWeatherCacheFresh(cached.savedAt)) {
                return { ...station, ...cached.station, distance: station.distance };
            }
        } catch (error) {
            console.warn(`Meteostat metadata cache for ${station.id} could not be read:`, error);
        }

        const url = new URL('https://meteostat.p.rapidapi.com/stations/meta');
        url.search = new URLSearchParams({ id: station.id });
        const response = await this.meteostatFetch(url, {
            headers: {
                'Content-Type': 'application/json',
                'X-RapidAPI-Key': apiKey,
                'X-RapidAPI-Host': 'meteostat.p.rapidapi.com'
            },
            signal
        });
        if (!response.ok) {
            throw new Error(await this.getMeteostatApiError(response, `metadata for station ${station.id}`));
        }
        const payload = await response.json();
        const metadata = payload.data || {};
        const result = {
            ...station,
            name: metadata.name?.en || station.name,
            latitude: Number(metadata.location?.latitude),
            longitude: Number(metadata.location?.longitude),
            elevation: Number(metadata.location?.elevation),
            timezone: metadata.timezone || ''
        };
        try {
            const database = await this.openDashboardDatabase();
            await new Promise((resolve, reject) => {
                const transaction = database.transaction('meteostat-cache', 'readwrite');
                transaction.objectStore('meteostat-cache').put({
                    id: cacheId,
                    stationId: station.id,
                    savedAt: new Date().toISOString(),
                    station: result
                });
                transaction.oncomplete = resolve;
                transaction.onerror = () => reject(transaction.error);
                transaction.onabort = () => reject(transaction.error);
            });
            database.close();
        } catch (error) {
            console.warn(`Meteostat metadata for ${station.id} could not be cached:`, error);
        }
        return result;
    }

    averageMeteostatStations(stationRecords) {
        // Average each available parameter by date across stations which reported a finite value.
        const dates = new Set();
        stationRecords.forEach(records => records.forEach((_, date) => dates.add(date)));
        const output = new Map();
        const fields = ['tavg', 'tmin', 'tmax', 'dwpt', 'rhum', 'prcp', 'wspd', 'wpgt', 'pres'];

        dates.forEach(date => {
            const records = [...stationRecords.values()]
                .map(station => station.get(date))
                .filter(Boolean);
            if (!records.length) return;

            const averaged = { date, stationCount: records.length };
            fields.forEach(field => {
                const values = records.map(record => record[field]).filter(Number.isFinite);
                averaged[field] = values.length
                    ? values.reduce((sum, value) => sum + value, 0) / values.length
                    : null;
            });
            // Compass directions wrap at 360°, so use a circular mean instead of an arithmetic average.
            const windDirections = records.map(record => record.wdir).filter(Number.isFinite);
            averaged.wdir = this.circularMean(windDirections);
            const conditions = records.map(record => record.coco).filter(Number.isFinite);
            const counts = new Map();
            conditions.forEach(code => counts.set(code, (counts.get(code) || 0) + 1));
            averaged.coco = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
            output.set(date, averaged);
        });

        return output;
    }

    async fetchMeteostatBulkYear(stationId, year, { forceRefresh = false } = {}) {
        // Reuse station-year history from IndexedDB before downloading the free annual bulk file.
        const cacheId = `daily-v2:${stationId}:${year}`;
        const database = await this.openDashboardDatabase();
        const cached = await new Promise((resolve, reject) => {
            const transaction = database.transaction('meteostat-cache', 'readonly');
            const request = transaction.objectStore('meteostat-cache').get(cacheId);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
        database.close();
        if (
            !forceRefresh
            && cached?.records?.length
            && this.isWeatherCacheFresh(cached.savedAt)
        ) {
            return cached.records;
        }

        // Annual daily station files are free, gzip-compressed, and may legitimately be unavailable.
        const response = await fetch(`https://data.meteostat.net/daily/${year}/${encodeURIComponent(stationId)}.csv.gz`);
        if (response.status === 404) return [];
        if (!response.ok) throw new Error(`Meteostat bulk data for ${year} returned HTTP ${response.status}.`);
        const compressed = new Uint8Array(await response.arrayBuffer());
        const decompressed = window.fflate
            ? window.fflate.gunzipSync(compressed)
            : await this.decompressGzip(compressed);
        const records = this.parseMeteostatDailyCSV(new TextDecoder('utf-8').decode(decompressed));
        const cacheDatabase = await this.openDashboardDatabase();
        await new Promise((resolve, reject) => {
            const transaction = cacheDatabase.transaction('meteostat-cache', 'readwrite');
            transaction.objectStore('meteostat-cache').put({
                id: cacheId,
                stationId,
                year,
                savedAt: new Date().toISOString(),
                records
            });
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
        cacheDatabase.close();
        return records;
    }

    async fetchMeteostatHourlyYear(stationId, year, { forceRefresh = false } = {}) {
        // Cache normalized hourly weather used for short-window charts and expanded daily statistics.
        const cacheId = `hourly-v4:${stationId}:${year}`;
        const database = await this.openDashboardDatabase();
        const cached = await new Promise((resolve, reject) => {
            const transaction = database.transaction('meteostat-cache', 'readonly');
            const request = transaction.objectStore('meteostat-cache').get(cacheId);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
        database.close();
        if (
            !forceRefresh
            && cached?.records
            && this.isWeatherCacheFresh(cached.savedAt)
        ) {
            return new Map(cached.records.map(record => [record.time, record]));
        }

        const response = await fetch(
            `https://data.meteostat.net/hourly/${year}/${encodeURIComponent(stationId)}.csv.gz`
        );
        if (response.status === 404) return new Map();
        if (!response.ok) throw new Error(`Meteostat hourly bulk data for ${year} returned HTTP ${response.status}.`);
        const compressed = new Uint8Array(await response.arrayBuffer());
        const decompressed = window.fflate
            ? window.fflate.gunzipSync(compressed)
            : await this.decompressGzip(compressed);
        const parsed = Papa.parse(new TextDecoder('utf-8').decode(decompressed), {
            header: true,
            skipEmptyLines: true
        });
        const records = parsed.data
            .map(row => this.normalizeMeteostatHourlyRecord(row))
            .filter(Boolean);

        const cacheDatabase = await this.openDashboardDatabase();
        await new Promise((resolve, reject) => {
            const transaction = cacheDatabase.transaction('meteostat-cache', 'readwrite');
            transaction.objectStore('meteostat-cache').put({
                id: cacheId,
                stationId,
                year,
                savedAt: new Date().toISOString(),
                records
            });
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
        cacheDatabase.close();
        return new Map(records.map(record => [record.time, record]));
    }

    normalizeMeteostatHourlyRecord(row) {
        // Normalize API timestamps and bulk year/month/day/hour columns into one stable cache schema.
        const rawTime = String(row.time || '').trim();
        const timeMatch = rawTime.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2})/);
        const bulkYear = Number.parseInt(row.year, 10);
        const bulkMonth = Number.parseInt(row.month, 10);
        const bulkDay = Number.parseInt(row.day, 10);
        const bulkHour = Number.parseInt(row.hour, 10);
        const bulkTime = [bulkYear, bulkMonth, bulkDay, bulkHour].every(Number.isFinite)
            ? `${String(bulkYear).padStart(4, '0')}-${String(bulkMonth).padStart(2, '0')}-${String(bulkDay).padStart(2, '0')} `
                + `${String(bulkHour).padStart(2, '0')}:00:00`
            : '';
        const time = timeMatch ? `${timeMatch[1]} ${timeMatch[2]}:00:00` : bulkTime;
        if (!/^\d{4}-\d{2}-\d{2} \d{2}:00:00$/.test(time)) return null;
        const number = value => {
            const parsed = Number.parseFloat(value);
            return Number.isFinite(parsed) ? parsed : null;
        };
        return {
            time,
            date: time.slice(0, 10),
            temp: number(row.temp),
            dwpt: number(row.dwpt),
            rhum: number(row.rhum),
            prcp: number(row.prcp),
            wdir: number(row.wdir),
            wspd: number(row.wspd),
            wpgt: number(row.wpgt),
            pres: number(row.pres),
            coco: number(row.coco)
        };
    }

    aggregateHourlyWeatherByDay(hourlyRecords) {
        // Reduce hourly values to daily averages, precipitation totals, maximum gusts, and modal condition.
        const grouped = new Map();
        hourlyRecords.forEach(record => {
            if (!grouped.has(record.date)) grouped.set(record.date, []);
            grouped.get(record.date).push(record);
        });
        const output = new Map();
        grouped.forEach((records, date) => {
            output.set(date, this.aggregateWeatherRecords(records, { precipitationTotal: true }));
        });
        return output;
    }

    averageMeteostatHourlyStations(stationRecords) {
        // Average matching hourly timestamps across the selected Meteostat stations.
        const times = new Set();
        stationRecords.forEach(records => records.forEach((_, time) => times.add(time)));
        const output = new Map();
        times.forEach(time => {
            const records = [...stationRecords.values()].map(items => items.get(time)).filter(Boolean);
            if (!records.length) return;
            output.set(time, {
                time,
                date: time.slice(0, 10),
                ...this.aggregateWeatherRecords(records)
            });
        });
        return output;
    }

    aggregateWeatherRecords(records, { precipitationTotal = false } = {}) {
        // Apply parameter-appropriate aggregation, including circular wind and modal condition codes.
        const average = field => {
            const values = records.map(record => record[field]).filter(Number.isFinite);
            return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
        };
        const directions = records.map(record => record.wdir).filter(Number.isFinite);
        const conditions = records.map(record => record.coco).filter(Number.isFinite);
        const conditionCounts = new Map();
        conditions.forEach(code => conditionCounts.set(code, (conditionCounts.get(code) || 0) + 1));
        const coco = [...conditionCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        const gusts = records.map(record => record.wpgt).filter(Number.isFinite);
        const precipitation = records.map(record => record.prcp).filter(Number.isFinite);

        return {
            tavg: average('temp') ?? average('tavg'),
            dwpt: average('dwpt'),
            rhum: average('rhum'),
            prcp: precipitation.length
                ? precipitationTotal
                    ? precipitation.reduce((sum, value) => sum + value, 0)
                    : average('prcp')
                : null,
            wdir: directions.length ? this.circularMean(directions) : null,
            wspd: average('wspd'),
            wpgt: gusts.length ? Math.max(...gusts) : null,
            pres: average('pres'),
            coco
        };
    }

    circularMean(values) {
        // Average compass bearings without treating north as numerically opposite across 0/360 degrees.
        if (!values.length) return null;
        const radians = values.map(value => value * Math.PI / 180);
        const sine = radians.reduce((sum, value) => sum + Math.sin(value), 0) / radians.length;
        const cosine = radians.reduce((sum, value) => sum + Math.cos(value), 0) / radians.length;
        return (Math.atan2(sine, cosine) * 180 / Math.PI + 360) % 360;
    }

    parseMeteostatDailyCSV(text) {
        // Normalize only the daily values used by chart overlays, keeping the browser cache compact.
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
        return parsed.data.map(row => this.normalizeMeteostatRecord(row)).filter(Boolean);
    }

    normalizeMeteostatRecord(row) {
        const date = String(row.date || row.time || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
        const number = value => {
            const parsed = Number.parseFloat(value);
            return Number.isFinite(parsed) ? parsed : null;
        };
        return {
            date,
            tavg: number(row.tavg),
            tmin: number(row.tmin),
            tmax: number(row.tmax),
            dwpt: number(row.dwpt ?? row.dewpoint),
            rhum: number(row.rhum),
            prcp: number(row.prcp),
            wspd: number(row.wspd),
            wdir: number(row.wdir),
            wpgt: number(row.wpgt),
            pres: number(row.pres),
            coco: number(row.coco)
        };
    }

    async fetchMeteostatPointDaily(location, start, end, apiKey, signal) {
        // Point daily data fills station gaps; Meteostat permits up to ten years per request.
        const records = [];
        let chunkStart = new Date(`${start}T00:00:00`);
        const finalDate = new Date(`${end}T00:00:00`);

        while (chunkStart <= finalDate) {
            const chunkEnd = new Date(chunkStart);
            chunkEnd.setFullYear(chunkEnd.getFullYear() + 10);
            chunkEnd.setDate(chunkEnd.getDate() - 1);
            if (chunkEnd > finalDate) chunkEnd.setTime(finalDate.getTime());

            const url = new URL('https://meteostat.p.rapidapi.com/point/daily');
            url.search = new URLSearchParams({
                lat: location.lat,
                lon: location.lon,
                start: this.toDateKey(chunkStart),
                end: this.toDateKey(chunkEnd),
                units: 'metric'
            });
            const response = await this.meteostatFetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-RapidAPI-Key': apiKey,
                    'X-RapidAPI-Host': 'meteostat.p.rapidapi.com'
                },
                signal
            });
            if (!response.ok) {
                throw new Error(await this.getMeteostatApiError(response, 'point weather data'));
            }
            const payload = await response.json();
            records.push(...(payload.data || []).map(row => this.normalizeMeteostatRecord(row)).filter(Boolean));
            chunkStart = new Date(chunkEnd);
            chunkStart.setDate(chunkStart.getDate() + 1);
        }
        return records;
    }

    async ensureSelectedHourlyWeather() {
        // Fill only the selected short window with station-hour observations when bulk coverage is incomplete.
        if (!this.shouldUseHourlyWeather() || !this.weatherLocation?.stations?.length) return;
        const labels = this.getHourlyChartLabels();
        if (!labels.length) return;
        const coveredHours = labels.filter(label => this.weatherHourlyData.has(label)).length;
        if (coveredHours >= labels.length * 0.9) {
            this.setWeatherStatus(
                `Hourly weather ready: ${coveredHours} of ${labels.length} hours available. Click to view stations.`
            );
            return;
        }

        const start = labels[0].slice(0, 10);
        const end = labels.at(-1).slice(0, 10);
        const stationIds = this.weatherLocation.stations.map(station => station.id).join(',');
        const selectionKey = `${stationIds}:${start}:${end}`;
        if (selectionKey === this.hourlyWeatherSelectionKey) return;
        this.hourlyWeatherSelectionKey = selectionKey;

        const apiKey = localStorage.getItem('meteostatRapidApiKey') || '';
        if (!apiKey) return;
        this.activeHourlyWeatherController?.abort();
        const controller = new AbortController();
        this.activeHourlyWeatherController = controller;
        this.setWeatherStatus(
            `Loading hourly weather for ${start}${start === end ? '' : ` to ${end}`}...`
        );

        try {
            const stationRecords = new Map();
            for (const station of this.weatherLocation.stations) {
                if (controller.signal.aborted) return;
                stationRecords.set(
                    station.id,
                    await this.fetchMeteostatStationHourly(
                        station,
                        start,
                        end,
                        apiKey,
                        controller.signal
                    )
                );
            }
            const averaged = this.averageMeteostatHourlyStations(stationRecords);
            averaged.forEach((record, time) => this.weatherHourlyData.set(time, record));
            this.persistActiveWeatherCache();
            const availableHours = labels.filter(label => this.weatherHourlyData.has(label)).length;
            this.setWeatherStatus(
                `Hourly weather ready: ${availableHours} of ${labels.length} hours averaged from ${stationRecords.size} nearby station${stationRecords.size === 1 ? '' : 's'}. Click to view them on the map.`
            );
            this.renderCharts();
        } catch (error) {
            if (error.name === 'AbortError') return;
            this.hourlyWeatherSelectionKey = '';
            console.warn('Selected hourly Meteostat weather could not be loaded:', error);
            this.setWeatherStatus(error.message || 'Hourly weather could not be loaded.', true);
        } finally {
            if (this.activeHourlyWeatherController === controller) {
                this.activeHourlyWeatherController = null;
            }
        }
    }

    async fetchMeteostatStationHourly(station, start, end, apiKey, signal) {
        // Request at most two days of station-hour data in the weather station's local timezone.
        const url = new URL('https://meteostat.p.rapidapi.com/stations/hourly');
        url.search = new URLSearchParams({
            station: station.id,
            start,
            end,
            tz: station.timezone || 'UTC',
            model: 'true',
            units: 'metric'
        });
        const response = await this.meteostatFetch(url, {
            headers: {
                'Content-Type': 'application/json',
                'X-RapidAPI-Key': apiKey,
                'X-RapidAPI-Host': 'meteostat.p.rapidapi.com'
            },
            signal
        });
        if (!response.ok) {
            throw new Error(await this.getMeteostatApiError(response, `hourly data for station ${station.id}`));
        }
        const payload = await response.json();
        const records = (payload.data || [])
            .map(row => this.normalizeMeteostatHourlyRecord(row))
            .filter(Boolean);
        return new Map(records.map(record => [record.time, record]));
    }

    persistActiveWeatherCache() {
        // Update the active-location browser cache after a targeted hourly API fill.
        try {
            const cached = JSON.parse(localStorage.getItem('meteostatWeatherCache') || 'null');
            if (!cached?.key) return;
            cached.hourlyUpdatedAt = new Date().toISOString();
            cached.hourlyRecords = [...this.weatherHourlyData.values()];
            localStorage.setItem('meteostatWeatherCache', JSON.stringify(cached));
        } catch (error) {
            console.warn('Hourly Meteostat weather could not be added to the active cache:', error);
        }
    }

    async getMeteostatApiError(response, operation) {
        // Turn RapidAPI status codes and response messages into actionable setup guidance.
        let providerMessage = '';
        try {
            const payload = await response.clone().json();
            providerMessage = payload.message || payload.error || '';
        } catch (error) {
            try {
                providerMessage = (await response.text()).trim();
            } catch (textError) {
                providerMessage = '';
            }
        }

        if (response.status === 401) {
            return 'The Meteostat RapidAPI key is invalid. Check the key copied from your RapidAPI application.';
        }
        if (response.status === 403) {
            const detail = providerMessage ? ` RapidAPI says: ${providerMessage}` : '';
            return `RapidAPI denied Meteostat access.${detail} Confirm that the selected RapidAPI application is subscribed to Meteostat and that this exact key belongs to that application.`;
        }
        if (response.status === 429) {
            const retryAfter = response.headers.get('retry-after');
            const remaining = response.headers.get('x-ratelimit-requests-remaining')
                || response.headers.get('x-ratelimit-rapid-free-plans-hard-limit-remaining');
            const quotaMessage = providerMessage.toLowerCase();
            if (quotaMessage.includes('monthly') || quotaMessage.includes('quota exceeded')) {
                return `The Meteostat RapidAPI monthly quota has been reached.${providerMessage ? ` RapidAPI says: ${providerMessage}` : ''}`;
            }
            const retryText = retryAfter
                ? ` Retry after approximately ${retryAfter} second${retryAfter === '1' ? '' : 's'}.`
                : ' Wait briefly and try again.';
            const remainingText = remaining !== null ? ` Monthly requests remaining: ${remaining}.` : '';
            return `Meteostat temporarily rate-limited rapid requests.${retryText}${remainingText}${providerMessage ? ` RapidAPI says: ${providerMessage}` : ''}`;
        }

        const detail = providerMessage ? ` ${providerMessage}` : '';
        return `Meteostat ${operation} returned HTTP ${response.status}.${detail}`;
    }

    async clearWeatherCache() {
        // Remove active and reusable station-year weather while retaining opt-in and the visitor's API key.
        localStorage.removeItem('meteostatWeatherCache');
        try {
            const database = await this.openDashboardDatabase();
            await new Promise((resolve, reject) => {
                const transaction = database.transaction('meteostat-cache', 'readwrite');
                transaction.objectStore('meteostat-cache').clear();
                transaction.oncomplete = resolve;
                transaction.onerror = () => reject(transaction.error);
                transaction.onabort = () => reject(transaction.error);
            });
            database.close();
        } catch (error) {
            console.warn('Persistent Meteostat cache could not be cleared:', error);
        }
        this.weatherLoadId += 1;
        this.activeHourlyWeatherController?.abort();
        this.hourlyWeatherSelectionKey = '';
        this.weatherData = new Map();
        this.weatherHourlyData = new Map();
        this.weatherLocation = null;
        this.setWeatherStatus('Weather cache cleared.');
        if (this.stats) this.renderCharts();
    }

    setWeatherStatus(message, isError = false) {
        if (!this.weatherStatus) return;
        this.weatherStatus.textContent = message;
        this.weatherStatus.classList.toggle('error', isError);
        const hasMappableStations = !isError
            && this.weatherLocation?.stations?.some(station =>
                Number.isFinite(station.latitude) && Number.isFinite(station.longitude)
            );
        this.weatherStatus.disabled = !hasMappableStations;
        this.weatherStatus.title = hasMappableStations ? 'Show weather stations on map' : '';
    }

    openWeatherStationMap() {
        // Plot the source and weather stations, then connect each station to the BirdNET data location.
        const stations = this.weatherLocation?.stations?.filter(station =>
            Number.isFinite(station.latitude) && Number.isFinite(station.longitude)
        ) || [];
        if (!stations.length || !window.L) return;

        this.weatherMapModal.hidden = false;
        document.body.classList.add('modal-open');
        if (!this.weatherStationMap) {
            this.weatherStationMap = L.map(this.weatherStationMapElement, {
                zoomControl: true,
                preferCanvas: true
            });
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
            }).addTo(this.weatherStationMap);
        }

        this.weatherStationMap.eachLayer(layer => {
            if (!(layer instanceof L.TileLayer)) this.weatherStationMap.removeLayer(layer);
        });
        const source = [this.weatherLocation.lat, this.weatherLocation.lon];
        const sourceIcon = L.divIcon({
            className: '',
            html: '<span class="weather-source-marker"><i class="fa-solid fa-binoculars"></i></span>',
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });
        L.marker(source, { icon: sourceIcon })
            .bindTooltip(`${this.weatherLocation.source || 'BirdNET data'} location`)
            .addTo(this.weatherStationMap);

        const bounds = L.latLngBounds([source]);
        stations.forEach((station, index) => {
            const point = [station.latitude, station.longitude];
            const stationIcon = L.divIcon({
                className: '',
                html: `<span class="weather-station-marker">${index + 1}</span>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });
            L.marker(point, { icon: stationIcon })
                .bindTooltip(
                    `<strong>${this.escapeHTML(station.name || station.id)}</strong><br>`
                    + `ID: ${this.escapeHTML(station.id)}<br>`
                    + `${(station.distance / 1000).toFixed(1)} km from source`
                )
                .addTo(this.weatherStationMap);
            L.polyline([source, point], {
                color: '#378bc4',
                weight: 2,
                opacity: 0.72,
                dashArray: '7 6'
            }).addTo(this.weatherStationMap);
            bounds.extend(point);
        });

        setTimeout(() => {
            this.weatherStationMap.invalidateSize();
            this.weatherStationMap.fitBounds(bounds.pad(0.22), { maxZoom: 10 });
        }, 0);
    }

    closeWeatherStationMap() {
        // Close the mini-map without changing weather data or the active dashboard.
        this.weatherMapModal.hidden = true;
        if (this.stationMapModal.hidden && this.fetchProgressModal.hidden) {
            document.body.classList.remove('modal-open');
        }
    }

    showImportPanel({ focusStations = false } = {}) {
        // Return to source selection without clearing either the saved file or current station controls.
        this.destroyCharts();
        this.dashboard.hidden = true;
        this.importPanel.hidden = false;
        this.setStatus('');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (focusStations) {
            document.querySelector('.birdweather-source')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    calculateStatistics(observations) {
        const totalDetections = observations.reduce((sum, observation) => sum + observation.count, 0);
        const species = new Map();
        const daily = new Map();
        const weekly = new Map();
        const hour = Array(24).fill(0);
        const weekday = Array(7).fill(0);
        const month = Array(12).fill(0);
        const confidence = Array(10).fill(0);
        const categories = new Map();
        const orders = new Map();
        const activeDates = new Set();
        let confidenceTotal = 0;
        let confidenceCount = 0;

        observations.forEach(observation => {
            const count = observation.count;
            const speciesKey = (observation.scientificName || observation.commonName).toLowerCase();
            const category = this.getBirdCategory(observation.taxonomy);
            const order = observation.taxonomy?.order || 'Unknown';
            const weekKey = this.getISOWeekKey(observation.date);
            const hourValue = observation.date.getHours();
            const monthValue = observation.date.getMonth();
            const weekdayValue = observation.date.getDay();

            activeDates.add(observation.dateKey);
            this.incrementMap(daily, observation.dateKey, count);
            this.incrementMap(categories, category, count);
            this.incrementMap(orders, order, count);
            hour[hourValue] += count;
            weekday[weekdayValue] += count;
            month[monthValue] += count;

            if (!weekly.has(weekKey)) {
                weekly.set(weekKey, { detections: 0, species: new Set() });
            }
            weekly.get(weekKey).detections += count;
            weekly.get(weekKey).species.add(speciesKey);

            if (observation.confidence !== null) {
                const bucket = Math.min(9, Math.floor(observation.confidence * 10));
                confidence[bucket] += count;
                confidenceTotal += observation.confidence * count;
                confidenceCount += count;
            }

            if (!species.has(speciesKey)) {
                species.set(speciesKey, {
                    commonName: observation.commonName || observation.scientificName,
                    scientificName: observation.scientificName,
                    category,
                    count: 0,
                    confidenceTotal: 0,
                    confidenceCount: 0,
                    firstSeen: observation.date,
                    lastSeen: observation.date,
                    activeDates: new Set()
                });
            }

            const item = species.get(speciesKey);
            item.count += count;
            item.activeDates.add(observation.dateKey);
            if (observation.date < item.firstSeen) item.firstSeen = observation.date;
            if (observation.date > item.lastSeen) item.lastSeen = observation.date;
            if (observation.confidence !== null) {
                item.confidenceTotal += observation.confidence * count;
                item.confidenceCount += count;
            }
        });

        const speciesList = [...species.values()]
            .map(item => ({
                ...item,
                averageConfidence: item.confidenceCount ? item.confidenceTotal / item.confidenceCount : null,
                activeDays: item.activeDates.size,
                share: totalDetections ? item.count / totalDetections : 0
            }))
            .sort((a, b) => b.count - a.count);

        const sortedDates = [...activeDates].sort();
        const firstDate = sortedDates[0] ? new Date(`${sortedDates[0]}T00:00:00`) : null;
        const lastDate = sortedDates.at(-1) ? new Date(`${sortedDates.at(-1)}T00:00:00`) : null;
        const spanDays = firstDate && lastDate
            ? Math.max(1, Math.round((lastDate - firstDate) / 86400000) + 1)
            : 1;

        return {
            totalDetections,
            uniqueSpecies: speciesList.length,
            activeDays: activeDates.size,
            spanDays,
            firstDate,
            lastDate,
            averageConfidence: confidenceCount ? confidenceTotal / confidenceCount : null,
            detectionsPerActiveDay: activeDates.size ? totalDetections / activeDates.size : 0,
            speciesList,
            daily,
            weekly,
            hour,
            weekday,
            month,
            confidence,
            categories,
            orders
        };
    }

    renderDashboard(fileName) {
        // Reveal the dashboard and synchronize its floating source/range context.
        this.importPanel.hidden = true;
        this.dashboard.hidden = false;
        document.getElementById('dataset-name').textContent = fileName;
        this.updateFloatingDataContext();
        this.updateSavedFileControls();
        this.changeStationButton.innerHTML = this.importKind === 'birdweather'
            ? '<i class="fa-solid fa-location-dot" aria-hidden="true"></i> Change station or location'
            : '<i class="fa-solid fa-location-dot" aria-hidden="true"></i> Explore nearby stations';

        this.updateDatasetSummary();

        this.renderMetrics();
        this.renderInsights();
        this.renderTopSpeciesThumbnail();
        this.renderCharts();
        this.renderSpeciesTable();
        if (this.weatherEnabled) this.loadWeatherForActiveDataset();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    updateFloatingDataContext(startDate = null, endDate = null) {
        // Show the active station or local filename above the currently selected inclusive date range.
        if (!this.floatingDataContext || !this.stats && !this.observations.length) return;
        const startKey = this.availableDateKeys[Number(this.dateRangeStartInput.value)];
        const endKey = this.availableDateKeys[Number(this.dateRangeEndInput.value)];
        const resolvedStart = startDate || (startKey ? new Date(`${startKey}T00:00:00`) : null);
        const resolvedEnd = endDate || (endKey ? new Date(`${endKey}T00:00:00`) : null);
        const sourcePrefix = this.importKind === 'birdweather' ? 'Station' : 'Local';
        this.floatingDataSource.textContent = `${sourcePrefix}: ${this.datasetName || 'Observations'}`;
        this.floatingDataRange.textContent = resolvedStart && resolvedEnd
            ? `Range: ${this.formatShortDate(resolvedStart)} – ${this.formatShortDate(resolvedEnd)}`
            : 'Range unavailable';
        this.floatingDataContext.hidden = false;
    }

    updateDatasetSummary() {
        // Describe the source and currently selected date-window total in the dataset toolbar.
        const formatLabel = this.importKind === 'ebird'
            ? 'Aggregated BirdNET-Pi eBird checklist'
            : this.importKind === 'birdweather'
                ? `Public BirdWeather data${this.datasetDetail ? ` • ${this.datasetDetail}` : ''}`
                : 'Full detection export';
        const limitLabel = this.birdWeatherLimitReached
            ? ' • showing the latest 500,000 observations'
            : '';
        document.getElementById('dataset-summary').textContent =
            `${formatLabel} • ${this.formatNumber(this.stats.totalDetections)} observations${limitLabel}`;
    }

    renderMetrics() {
        const stats = this.stats;
        const metrics = [
            ['Detections', this.formatNumber(stats.totalDetections), this.importKind === 'ebird' ? 'Aggregated records' : 'All imported records'],
            ['Species', this.formatNumber(stats.uniqueSpecies), 'Unique imported species'],
            ['Active days', this.formatNumber(stats.activeDays), `${stats.spanDays} calendar-day span`],
            ['Per active day', stats.detectionsPerActiveDay.toFixed(1), 'Average detections'],
            ['Average confidence', stats.averageConfidence === null ? 'N/A' : `${(stats.averageConfidence * 100).toFixed(1)}%`, 'Across scored detections'],
            ['Date range', stats.firstDate ? this.formatShortDate(stats.firstDate) : 'N/A', stats.lastDate ? `to ${this.formatShortDate(stats.lastDate)}` : '']
        ];

        this.metricGrid.innerHTML = metrics.map(([label, value, detail]) => `
            <article class="metric-card">
                <span class="metric-label">${this.escapeHTML(label)}</span>
                <strong class="metric-value">${this.escapeHTML(value)}</strong>
                <span class="metric-detail">${this.escapeHTML(detail)}</span>
            </article>
        `).join('');
    }

    renderInsights() {
        const topSpecies = this.stats.speciesList[0];
        const peakHour = this.indexOfMax(this.stats.hour);
        const peakMonth = this.indexOfMax(this.stats.month);
        const category = this.sortedMap(this.stats.categories)[0];
        const rareSpecies = this.stats.speciesList.filter(item => item.count === 1).length;

        const insights = [
            ['fa-crown', 'Most observed', topSpecies?.commonName || 'N/A', topSpecies ? `${this.formatNumber(topSpecies.count)} detections` : '', true],
            ['fa-clock', 'Peak activity', `${String(peakHour).padStart(2, '0')}:00–${String((peakHour + 1) % 24).padStart(2, '0')}:00`, `${this.formatNumber(this.stats.hour[peakHour])} detections`],
            ['fa-calendar-days', 'Busiest month', this.monthNames()[peakMonth], `${this.formatNumber(this.stats.month[peakMonth])} detections`],
            ['fa-chart-pie', 'Largest category', category?.[0] || 'Unknown', category ? `${this.percent(category[1] / this.stats.totalDetections)} of detections` : ''],
            ['fa-binoculars', 'Single appearances', this.formatNumber(rareSpecies), 'Species detected once'],
            ['fa-seedling', 'Taxonomy matched', this.formatNumber(this.stats.speciesList.filter(item => item.category !== 'Unknown').length), 'Species assigned a category'],
            ['fa-sun', 'Daytime share', this.percent(this.sum(this.stats.hour.slice(6, 18)) / this.stats.totalDetections), '06:00–17:59'],
            ['fa-moon', 'Night share', this.percent((this.sum(this.stats.hour.slice(18)) + this.sum(this.stats.hour.slice(0, 6))) / this.stats.totalDetections), '18:00–05:59']
        ];

        this.insightGrid.innerHTML = insights.map(([icon, label, value, detail, hasThumbnail]) => `
            <article class="insight ${hasThumbnail ? 'insight-with-thumbnail' : ''}">
                ${hasThumbnail ? `
                    <img
                        class="insight-thumbnail species-thumbnail"
                        src="${this.placeholderImage()}"
                        data-scientific-name="${this.escapeHTML(topSpecies?.scientificName || '')}"
                        data-common-name="${this.escapeHTML(topSpecies?.commonName || '')}"
                        alt="${this.escapeHTML(topSpecies?.commonName || 'Most observed bird')}">
                ` : ''}
                <i class="fa-solid ${icon}" aria-hidden="true"></i>
                <span>${this.escapeHTML(label)}</span>
                <strong>${this.escapeHTML(value)}</strong>
                <span>${this.escapeHTML(detail)}</span>
            </article>
        `).join('');

        // The top bird is visible immediately, so its thumbnail can load without observation.
        const topThumbnail = this.insightGrid.querySelector('.insight-thumbnail');
        if (topThumbnail && topSpecies) this.loadThumbnailForImage(topThumbnail);
    }

    renderTopSpeciesThumbnail() {
        // Show the leading species beside its chart title as a visual summary.
        const topSpecies = this.stats.speciesList[0];
        const image = document.getElementById('top-species-thumbnail');
        if (!image || !topSpecies) return;

        image.src = this.placeholderImage();
        image.dataset.scientificName = topSpecies.scientificName || '';
        image.dataset.commonName = topSpecies.commonName || '';
        image.alt = topSpecies.commonName || 'Most observed bird';
        this.loadThumbnailForImage(image);
    }

    renderCharts() {
        // Rebuild every visualization from the active date window and current display preferences.
        this.destroyCharts();
        this.renderActivitySpeciesOptions();

        const colors = this.getThemeColors();
        const style = this.chartStyleSelect.value;
        const isMobile = window.matchMedia('(max-width: 600px)').matches;
        const axisColor = getComputedStyle(document.body).getPropertyValue('--muted').trim();
        const gridColor = getComputedStyle(document.body).getPropertyValue('--border').trim();
        const baseOptions = this.chartOptions(axisColor, gridColor, {}, isMobile);

        const daily = [...this.stats.daily.entries()].sort(([a], [b]) => a.localeCompare(b));
        const useHourlyTimeline = this.shouldUseHourlyWeather();
        const timelineLabels = useHourlyTimeline
            ? this.getHourlyChartLabels()
            : daily.map(([date]) => date);
        const timelineDetections = useHourlyTimeline
            ? this.getHourlyDetectionValues(this.filteredObservations, timelineLabels)
            : daily.map(([, count]) => count);
        const timelineGranularity = useHourlyTimeline ? 'hourly' : 'daily';
        const topSpecies = this.stats.speciesList.slice(0, 12);
        const categories = this.sortedMap(this.stats.categories);
        const weeks = [...this.stats.weekly.entries()].sort(([a], [b]) => a.localeCompare(b));
        const singleSpecies = this.stats.speciesList
            .filter(item => item.count === 1)
            .sort((a, b) => b.firstSeen - a.firstSeen);
        const visibleSingleSpecies = singleSpecies.slice(0, 30);
        const hiddenSingleSpeciesCount = Math.max(0, singleSpecies.length - visibleSingleSpecies.length);
        const singleSpeciesChartWrap = document.querySelector('.chart-wrap-single');
        if (singleSpeciesChartWrap) {
            // Give each horizontal species label enough vertical space on narrow screens.
            singleSpeciesChartWrap.style.height = isMobile
                ? `${Math.max(300, visibleSingleSpecies.length * 34 + 80)}px`
                : `${Math.max(330, visibleSingleSpecies.length * 24 + 70)}px`;
        }
        document.getElementById('single-species-description').textContent = hiddenSingleSpeciesCount
            ? `Showing 30 most recent one-off species; ${hiddenSingleSpeciesCount} more are listed in the table`
            : 'Each bar names a species observed exactly once';
        const timelineDescription = document.getElementById('timeline-chart-description');
        if (timelineDescription) {
            timelineDescription.textContent = useHourlyTimeline
                ? 'Hourly detection activity for the selected two-day-or-shorter window'
                : 'Detection activity by day';
        }
        const speciesTimelineDescription = document.getElementById('species-timeline-description');
        if (speciesTimelineDescription) {
            speciesTimelineDescription.textContent = useHourlyTimeline
                ? 'Hourly detections over the selected window'
                : 'Daily detections over the selected window';
        }

        const timelineWeatherDatasets = this.getWeatherChartDatasets(timelineLabels, timelineGranularity);
        this.createChart('timeline-chart', {
            type: style === 'bars' ? 'bar' : 'line',
            data: {
                labels: timelineLabels,
                datasets: [
                    this.dataset('Detections', timelineDetections, colors[0], style !== 'bars'),
                    ...timelineWeatherDatasets
                ]
            },
            options: this.chartOptions(axisColor, gridColor, {
                ...this.getWeatherChartOverrides(axisColor, timelineWeatherDatasets)
            }, isMobile)
        });

        this.createChart('species-chart', {
            type: style === 'lines' ? 'line' : 'bar',
            data: {
                labels: topSpecies.map(item => item.commonName),
                datasets: [this.dataset('Detections', topSpecies.map(item => item.count), colors[1], style === 'lines')]
            },
            options: this.chartOptions(axisColor, gridColor, {
                indexAxis: style === 'lines' ? 'x' : 'y',
                interaction: { mode: 'nearest', intersect: true },
                plugins: {
                    tooltip: this.speciesTooltipOptions(topSpecies, species => [
                        `${this.formatNumber(species.count)} detections`,
                        `${this.percent(species.share)} of all observations`,
                        species.category
                    ])
                }
            }, isMobile)
        });

        this.createChart('category-chart', {
            type: style === 'bars' ? 'bar' : 'doughnut',
            data: {
                labels: categories.map(([name]) => name),
                datasets: [{
                    label: 'Detections',
                    data: categories.map(([, count]) => count),
                    backgroundColor: categories.map((_, index) => colors[index % colors.length]),
                    borderWidth: 0
                }]
            },
            options: style === 'bars'
                ? baseOptions
                : { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: axisColor } } } }
        });

        this.createChart('hour-chart', {
            type: style === 'lines' ? 'line' : 'bar',
            data: {
                labels: Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`),
                datasets: [this.dataset('Detections', this.stats.hour, colors[2], style === 'lines')]
            },
            options: baseOptions
        });

        const selectedSpeciesActivity = this.getSelectedSpeciesActivity();
        const selectedSpeciesDaily = [...selectedSpeciesActivity.daily.entries()]
            .sort(([dateA], [dateB]) => dateA.localeCompare(dateB));
        const selectedSpeciesLabels = useHourlyTimeline
            ? timelineLabels
            : selectedSpeciesDaily.map(([date]) => date);
        const selectedSpeciesDetections = useHourlyTimeline
            ? this.getHourlyDetectionValues(selectedSpeciesActivity.observations, selectedSpeciesLabels)
            : selectedSpeciesDaily.map(([, count]) => count);
        const speciesWeatherDatasets = this.getWeatherChartDatasets(selectedSpeciesLabels, timelineGranularity);
        this.createChart('selected-species-timeline-chart', {
            type: style === 'bars' ? 'bar' : 'line',
            data: {
                labels: selectedSpeciesLabels,
                datasets: [
                    this.dataset(
                        selectedSpeciesActivity.species?.commonName || 'Detections',
                        selectedSpeciesDetections,
                        colors[4],
                        style !== 'bars'
                    ),
                    ...speciesWeatherDatasets
                ]
            },
            options: this.chartOptions(axisColor, gridColor, {
                ...this.getWeatherChartOverrides(axisColor, speciesWeatherDatasets)
            }, isMobile)
        });

        this.createChart('selected-species-hour-chart', {
            type: style === 'lines' ? 'line' : 'bar',
            data: {
                labels: Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`),
                datasets: [this.dataset(
                    selectedSpeciesActivity.species?.commonName || 'Detections',
                    selectedSpeciesActivity.hour,
                    colors[2],
                    style === 'lines'
                )]
            },
            options: baseOptions
        });

        this.createChart('month-chart', {
            type: style === 'lines' ? 'line' : 'bar',
            data: {
                labels: this.monthNames(),
                datasets: [this.dataset('Detections', this.stats.month, colors[3], style === 'lines')]
            },
            options: baseOptions
        });

        this.createChart('single-species-chart', {
            type: 'bar',
            data: {
                labels: visibleSingleSpecies.map(item => item.commonName),
                datasets: [{
                    ...this.dataset(
                        'Observation date',
                        visibleSingleSpecies.map(() => 1),
                        colors[5],
                        false
                    ),
                    backgroundColor: visibleSingleSpecies.map((_, index) => colors[index % colors.length])
                }]
            },
            options: this.chartOptions(axisColor, gridColor, {
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: this.speciesTooltipOptions(visibleSingleSpecies, species => [
                        `Seen ${this.formatShortDate(species.firstSeen)}`,
                        species.category,
                        species.scientificName || 'Scientific name unavailable'
                    ])
                },
                interaction: { mode: 'nearest', intersect: true },
                scales: {
                    x: {
                        display: false,
                        min: 0,
                        max: 1
                    },
                    y: {
                        // Keep one label for every one-off species bar instead of auto-skipping alternate names.
                        ticks: {
                            color: axisColor,
                            autoSkip: false
                        },
                        grid: { display: false }
                    }
                }
            }, isMobile)
        });

        const weeklyWeatherDatasets = this.getWeatherChartDatasets(
            weeks.map(([week]) => week),
            'weekly'
        );
        this.createChart('week-chart', {
            type: style === 'bars' ? 'bar' : 'line',
            data: {
                labels: weeks.map(([week]) => week),
                datasets: [
                    this.dataset('Detections', weeks.map(([, value]) => value.detections), colors[0], style !== 'bars'),
                    {
                        ...this.dataset('Unique species', weeks.map(([, value]) => value.species.size), colors[5], true),
                        yAxisID: 'species'
                    },
                    ...weeklyWeatherDatasets
                ]
            },
            options: this.chartOptions(axisColor, gridColor, {
                plugins: this.getWeatherTooltipPlugin(),
                scales: {
                    species: {
                        position: 'right',
                        beginAtZero: true,
                        ticks: { color: axisColor },
                        grid: { drawOnChartArea: false }
                    },
                    ...this.getWeatherChartScales(axisColor, weeklyWeatherDatasets)
                }
            }, isMobile)
        });
    }

    renderActivitySpeciesOptions() {
        // Populate the explorer from the active file or station and retain a valid selection across rerenders.
        const availableKeys = new Set(this.stats.speciesList.map(species => this.getSpeciesKey(species)));
        if (!availableKeys.has(this.selectedActivitySpeciesKey)) {
            this.selectedActivitySpeciesKey = this.getSpeciesKey(this.stats.speciesList[0]);
        }
        // Sort translated display names with the visitor's current locale for a predictable A-Z selector.
        const sortedSpecies = [...this.stats.speciesList].sort((speciesA, speciesB) =>
            speciesA.commonName.localeCompare(speciesB.commonName, undefined, {
                sensitivity: 'base',
                numeric: true
            })
        );
        this.activitySpeciesSelect.innerHTML = sortedSpecies.map(species => {
            const key = this.getSpeciesKey(species);
            const scientificName = species.scientificName ? ` (${species.scientificName})` : '';
            return `
                <option value="${this.escapeHTML(key)}" ${key === this.selectedActivitySpeciesKey ? 'selected' : ''}>
                    ${this.escapeHTML(`${species.commonName}${scientificName}`)}
                </option>
            `;
        }).join('');
    }

    getSelectedSpeciesActivity() {
        // Aggregate the selected species independently by calendar date and hour of day.
        const species = this.stats.speciesList.find(item =>
            this.getSpeciesKey(item) === this.selectedActivitySpeciesKey
        ) || this.stats.speciesList[0];
        const key = this.getSpeciesKey(species);
        const daily = new Map();
        const hour = Array(24).fill(0);
        const observations = [];

        this.filteredObservations.forEach(observation => {
            if (this.getSpeciesKey(observation) !== key) return;
            observations.push(observation);
            this.incrementMap(daily, observation.dateKey, observation.count);
            hour[observation.date.getHours()] += observation.count;
        });
        return { species, daily, hour, observations };
    }

    shouldUseHourlyWeather() {
        // Select hourly chart resolution from the date window, even before hourly weather finishes loading.
        if (!this.weatherEnabled || !this.availableDateKeys.length) return false;
        const startKey = this.availableDateKeys[Number(this.dateRangeStartInput.value)];
        const endKey = this.availableDateKeys[Number(this.dateRangeEndInput.value)];
        if (!startKey || !endKey) return false;
        const durationDays = Math.floor(
            (new Date(`${endKey}T00:00:00`) - new Date(`${startKey}T00:00:00`)) / 86400000
        ) + 1;
        return durationDays <= 2;
    }

    getHourlyChartLabels() {
        // Build a continuous local-hour timeline so hours with weather but no detections remain visible.
        const startKey = this.availableDateKeys[Number(this.dateRangeStartInput.value)];
        const endKey = this.availableDateKeys[Number(this.dateRangeEndInput.value)];
        if (!startKey || !endKey) return [];
        const cursor = new Date(`${startKey}T00:00:00`);
        const end = new Date(`${endKey}T23:00:00`);
        const labels = [];
        while (cursor <= end) {
            labels.push(
                `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')} `
                + `${String(cursor.getHours()).padStart(2, '0')}:00:00`
            );
            cursor.setHours(cursor.getHours() + 1);
        }
        return labels;
    }

    getHourlyDetectionValues(observations, labels) {
        // Align observation counts to the continuous hourly labels used by short-range charts.
        const counts = new Map();
        observations.forEach(observation => {
            const key = `${observation.dateKey} ${String(observation.date.getHours()).padStart(2, '0')}:00:00`;
            counts.set(key, (counts.get(key) || 0) + observation.count);
        });
        return labels.map(label => counts.get(label) || 0);
    }

    getWeatherChartDatasets(labels, granularity) {
        // Align cached hourly, daily, or weekly weather to the matching detection labels.
        const source = granularity === 'hourly' ? this.weatherHourlyData : this.weatherData;
        if (!this.weatherEnabled || !source.size) return [];
        let weatherByLabel;

        if (granularity === 'weekly') {
            weatherByLabel = new Map();
            this.weatherData.forEach(record => {
                const date = new Date(`${record.date}T00:00:00`);
                const week = this.getISOWeekKey(date);
                if (!weatherByLabel.has(week)) {
                    weatherByLabel.set(week, {
                        tavg: [], dwpt: [], rhum: [], pres: [], wspd: [], wpgt: [], wdir: [], coco: [],
                        precipitation: 0, precipitationDays: 0
                    });
                }
                const aggregate = weatherByLabel.get(week);
                ['tavg', 'dwpt', 'rhum', 'pres', 'wspd', 'wpgt', 'wdir', 'coco'].forEach(field => {
                    if (Number.isFinite(record[field])) aggregate[field].push(record[field]);
                });
                if (Number.isFinite(record.prcp)) {
                    aggregate.precipitation += record.prcp;
                    aggregate.precipitationDays += 1;
                }
            });
        }

        const average = values => values.length
            ? values.reduce((sum, value) => sum + value, 0) / values.length
            : null;
        const circularAverage = values => {
            if (!values.length) return null;
            const radians = values.map(value => value * Math.PI / 180);
            const sine = average(radians.map(Math.sin));
            const cosine = average(radians.map(Math.cos));
            return (Math.atan2(sine, cosine) * 180 / Math.PI + 360) % 360;
        };
        const mode = values => {
            const counts = new Map();
            values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
            return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        };
        const valuesFor = field => labels.map(label => {
            if (granularity === 'weekly') {
                const values = weatherByLabel.get(label)?.[field] || [];
                if (field === 'wdir') return circularAverage(values);
                if (field === 'coco') return mode(values);
                if (field === 'wpgt') return values.length ? Math.max(...values) : null;
                return average(values);
            }
            const record = source.get(label);
            // Raw station hours use "temp"; averaged station hours use the normalized "tavg" field.
            if (granularity === 'hourly' && field === 'tavg') {
                return record?.temp ?? record?.tavg ?? null;
            }
            return record?.[field] ?? null;
        });
        const temperatures = valuesFor('tavg');
        const dewPoints = valuesFor('dwpt');
        const humidity = valuesFor('rhum');
        const pressure = valuesFor('pres');
        const windSpeed = valuesFor('wspd');
        const windGust = valuesFor('wpgt');
        const windDirection = valuesFor('wdir');
        const conditions = valuesFor('coco');
        const precipitation = labels.map(label => {
            if (granularity === 'weekly') {
                const aggregate = weatherByLabel.get(label);
                return aggregate?.precipitationDays ? aggregate.precipitation : null;
            }
            return source.get(label)?.prcp ?? null;
        });
        const periodLabel = granularity === 'weekly' ? 'Weekly' : granularity === 'hourly' ? 'Hourly' : 'Daily';

        const datasets = [
            {
                type: 'line',
                label: granularity === 'weekly' ? 'Average temperature (°C)' : 'Temperature (°C)',
                data: temperatures,
                yAxisID: 'temperature',
                borderColor: '#d65a31',
                backgroundColor: 'rgba(214, 90, 49, 0.12)',
                borderWidth: 2,
                pointRadius: labels.length > 90 ? 0 : 2,
                tension: 0.25,
                spanGaps: true
            },
            {
                type: 'line',
                label: granularity === 'weekly' ? 'Average dew point (°C)' : 'Dew point (°C)',
                data: dewPoints,
                yAxisID: 'temperature',
                borderColor: '#2474c6',
                backgroundColor: 'rgba(36, 116, 198, 0.1)',
                borderWidth: 2,
                pointRadius: labels.length > 90 ? 0 : 2,
                tension: 0.25,
                spanGaps: true
            },
            {
                type: 'line',
                label: granularity === 'weekly' ? 'Average humidity (%)' : 'Relative humidity (%)',
                data: humidity,
                yAxisID: 'humidity',
                borderColor: '#29a3a3',
                borderDash: [3, 3],
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.25,
                spanGaps: true
            },
            {
                type: 'bar',
                label: granularity === 'weekly' ? 'Precipitation total (mm)' : 'Precipitation (mm)',
                data: precipitation,
                yAxisID: 'precipitation',
                backgroundColor: 'rgba(55, 139, 196, 0.24)',
                borderColor: '#378bc4',
                borderWidth: 1,
                barPercentage: 0.8
            },
            {
                type: 'line',
                label: granularity === 'weekly' ? 'Average pressure (hPa)' : 'Pressure (hPa)',
                data: pressure,
                yAxisID: 'pressure',
                borderColor: '#7d57a5',
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.25,
                spanGaps: true
            },
            {
                type: 'line',
                label: granularity === 'weekly' ? 'Average wind speed (km/h)' : 'Wind speed (km/h)',
                data: windSpeed,
                yAxisID: 'windSpeed',
                borderColor: '#3f8f68',
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.25,
                spanGaps: true
            },
            {
                type: 'line',
                label: granularity === 'weekly' ? 'Peak gust (km/h)' : 'Wind gust (km/h)',
                data: windGust,
                yAxisID: 'windSpeed',
                borderColor: '#d0812b',
                borderDash: [7, 3],
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.2,
                spanGaps: true
            },
            {
                type: 'line',
                label: granularity === 'weekly' ? 'Average wind direction' : 'Wind direction',
                data: windDirection.map(direction => Number.isFinite(direction) ? 0.9 : null),
                windDirections: windDirection,
                yAxisID: 'windDirectionBand',
                borderColor: '#536b78',
                backgroundColor: 'transparent',
                borderWidth: 0,
                pointStyle: windDirection.map(direction => this.getWindDirectionPointStyle(direction)),
                pointRadius: labels.length > 366 ? 5 : labels.length > 168 ? 6 : 8,
                pointHoverRadius: labels.length > 366 ? 8 : 11,
                showLine: false,
                spanGaps: false
            },
            {
                type: 'line',
                label: `${periodLabel} weather condition (CoCo)`,
                data: conditions,
                yAxisID: 'condition',
                borderColor: '#6b7280',
                backgroundColor: 'transparent',
                borderWidth: 0,
                pointStyle: conditions.map(code => this.getWeatherConditionPointStyle(code)),
                pointRadius: labels.length > 366 ? 5 : labels.length > 168 ? 7 : 10,
                pointHoverRadius: labels.length > 366 ? 8 : 13,
                showLine: false,
                spanGaps: false
            }
        ];

        // Omit unsupported weather parameters from the chart and legend for this exact visible range.
        return datasets.filter(dataset => dataset.data.some(value => Number.isFinite(value)));
    }

    getWeatherChartOverrides(axisColor, weatherDatasets) {
        // Add weather axes and a condition-aware tooltip to detection timeline charts.
        return {
            plugins: this.getWeatherTooltipPlugin(),
            scales: this.getWeatherChartScales(axisColor, weatherDatasets)
        };
    }

    getWeatherTooltipPlugin() {
        // Convert CoCo values to readable conditions while preserving normal labels for all other series.
        return {
            tooltip: {
                displayColors: true,
                callbacks: {
                    label: context => {
                        const value = context.raw;
                        if (context.dataset.yAxisID === 'windDirectionBand') {
                            const direction = context.dataset.windDirections?.[context.dataIndex];
                            return Number.isFinite(direction)
                                ? `${context.dataset.label}: from ${this.getCompassDirection(direction)} (${Math.round(direction)}°)`
                                : `${context.dataset.label}: unavailable`;
                        }
                        if (context.dataset.yAxisID === 'condition') {
                            return `${context.dataset.label}: ${this.getWeatherConditionLabel(value)} (${value})`;
                        }
                        return `${context.dataset.label}: ${context.formattedValue}`;
                    }
                }
            }
        };
    }

    getWindDirectionPointStyle(direction) {
        // Draw a cached arrow which points where wind travels from the reported source bearing.
        if (!Number.isFinite(direction)) return 'circle';
        const roundedDirection = Math.round(direction) % 360;
        if (this.windDirectionIconCache.has(roundedDirection)) {
            return this.windDirectionIconCache.get(roundedDirection);
        }
        const icon = document.createElement('canvas');
        icon.width = 28;
        icon.height = 28;
        const context = icon.getContext('2d');
        context.translate(14, 14);
        context.rotate((roundedDirection + 180) * Math.PI / 180);
        context.strokeStyle = '#536b78';
        context.fillStyle = '#536b78';
        context.lineWidth = 2.2;
        context.lineCap = 'round';
        context.beginPath();
        context.moveTo(0, 9);
        context.lineTo(0, -8);
        context.stroke();
        context.beginPath();
        context.moveTo(0, -10);
        context.lineTo(-4.5, -3);
        context.lineTo(4.5, -3);
        context.closePath();
        context.fill();
        this.windDirectionIconCache.set(roundedDirection, icon);
        return icon;
    }

    getCompassDirection(direction) {
        // Convert meteorological degrees into the nearest sixteen-point compass direction.
        const labels = [
            'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
            'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
        ];
        const normalized = (Number(direction) % 360 + 360) % 360;
        return labels[Math.round(normalized / 22.5) % labels.length];
    }

    getWeatherConditionLabel(code) {
        // Map Meteostat's official CoCo weather condition codes to concise chart labels.
        const conditions = {
            1: 'Clear', 2: 'Fair', 3: 'Cloudy', 4: 'Overcast', 5: 'Fog',
            6: 'Freezing fog', 7: 'Light rain', 8: 'Rain', 9: 'Heavy rain',
            10: 'Freezing rain', 11: 'Heavy freezing rain', 12: 'Sleet',
            13: 'Heavy sleet', 14: 'Light snowfall', 15: 'Snowfall',
            16: 'Heavy snowfall', 17: 'Rain shower', 18: 'Heavy rain shower',
            19: 'Sleet shower', 20: 'Heavy sleet shower', 21: 'Snow shower',
            22: 'Heavy snow shower', 23: 'Lightning', 24: 'Hail',
            25: 'Thunderstorm', 26: 'Heavy thunderstorm', 27: 'Storm'
        };
        return conditions[Math.round(Number(code))] || 'Unknown';
    }

    getWeatherConditionPointStyle(code) {
        // Render the mapped Weather Icons glyph into a canvas accepted by Chart.js as a point style.
        if (!Number.isFinite(code) || !this.weatherIconsReady) return 'circle';
        const normalizedCode = Math.round(Number(code));
        if (this.weatherIconCache.has(normalizedCode)) {
            return this.weatherIconCache.get(normalizedCode);
        }
        const glyph = this.getWeatherConditionGlyph(normalizedCode);
        const icon = document.createElement('canvas');
        icon.width = 32;
        icon.height = 32;
        const context = icon.getContext('2d');
        context.font = '24px "Weather Icons"';
        context.fillStyle = this.getWeatherConditionColor(normalizedCode);
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(glyph, 16, 17);
        this.weatherIconCache.set(normalizedCode, icon);
        return icon;
    }

    getWeatherConditionGlyph(code) {
        // Map Meteostat CoCo codes to neutral Weather Icons glyphs without assuming daylight.
        const glyphs = {
            1: '\uf00d',
            2: '\uf002',
            3: '\uf041',
            4: '\uf013',
            5: '\uf014',
            6: '\uf014',
            7: '\uf01c',
            8: '\uf019',
            9: '\uf018',
            10: '\uf017',
            11: '\uf017',
            12: '\uf0b5',
            13: '\uf0b5',
            14: '\uf01b',
            15: '\uf01b',
            16: '\uf064',
            17: '\uf01a',
            18: '\uf01d',
            19: '\uf0b5',
            20: '\uf0b5',
            21: '\uf01b',
            22: '\uf064',
            23: '\uf016',
            24: '\uf015',
            25: '\uf01e',
            26: '\uf01e',
            27: '\uf0ce'
        };
        return glyphs[code] || '\uf07b';
    }

    getWeatherConditionColor(code) {
        // Color related conditions consistently while retaining distinct severe-weather emphasis.
        if (code <= 2) return '#e5a000';
        if (code <= 6) return '#7b8794';
        if (code <= 13 || (code >= 17 && code <= 20)) return '#378bc4';
        if (code <= 16 || (code >= 21 && code <= 22)) return '#72a9c7';
        if (code === 24) return '#4d8ca8';
        if (code >= 23) return '#8a4ea1';
        return '#6b7280';
    }

    getWeatherChartScales(axisColor, weatherDatasets = []) {
        // Add only the independent unit axes required by weather series which contain visible data.
        const activeAxes = new Set(weatherDatasets.map(dataset => dataset.yAxisID));
        if (!this.weatherEnabled || !activeAxes.size) return {};
        const scales = {
            temperature: {
                type: 'linear',
                position: 'right',
                ticks: {
                    color: '#d65a31',
                    callback: value => `${value}°C`
                },
                grid: { drawOnChartArea: false },
                title: { display: true, text: 'Temperature', color: axisColor }
            },
            precipitation: {
                type: 'linear',
                position: 'right',
                beginAtZero: true,
                offset: true,
                ticks: {
                    color: '#378bc4',
                    callback: value => `${value} mm`
                },
                grid: { drawOnChartArea: false },
                title: { display: true, text: 'Precipitation', color: axisColor }
            },
            pressure: {
                type: 'linear',
                position: 'right',
                display: false,
                grid: { drawOnChartArea: false }
            },
            windSpeed: {
                type: 'linear',
                position: 'right',
                display: false,
                beginAtZero: true,
                grid: { drawOnChartArea: false }
            },
            windDirectionBand: {
                type: 'linear',
                position: 'right',
                display: false,
                min: 0,
                max: 1,
                grid: { drawOnChartArea: false }
            },
            humidity: {
                type: 'linear',
                position: 'right',
                display: false,
                min: 0,
                max: 100,
                grid: { drawOnChartArea: false }
            },
            condition: {
                type: 'linear',
                position: 'right',
                display: false,
                min: 1,
                max: 27,
                grid: { drawOnChartArea: false }
            }
        };
        return Object.fromEntries(
            Object.entries(scales).filter(([axisId]) => activeAxes.has(axisId))
        );
    }

    getSpeciesKey(species) {
        // Scientific names provide a stable identity when common names are translated.
        return String(species?.scientificName || species?.commonName || '').trim().toLowerCase();
    }

    renderSpeciesTable() {
        if (!this.stats) return;
        const filter = this.speciesFilter.value.trim().toLowerCase();
        const rows = this.stats.speciesList.filter(item =>
            `${item.commonName} ${item.scientificName} ${item.category}`.toLowerCase().includes(filter)
        );

        this.speciesTableBody.innerHTML = rows.map(item => `
            <tr>
                <td data-label="Image">
                    <img
                        class="species-thumbnail table-thumbnail"
                        src="${this.placeholderImage()}"
                        data-scientific-name="${this.escapeHTML(item.scientificName || '')}"
                        data-common-name="${this.escapeHTML(item.commonName || '')}"
                        alt="${this.escapeHTML(item.commonName || 'Bird')}">
                </td>
                <td data-label="Species">${this.escapeHTML(item.commonName || 'Unknown')}</td>
                <td data-label="Scientific name"><em>${this.escapeHTML(item.scientificName || 'Not provided')}</em></td>
                <td data-label="Category">${this.escapeHTML(item.category)}</td>
                <td data-label="Detections">${this.formatNumber(item.count)}</td>
                <td data-label="Share">${this.percent(item.share)}</td>
                <td data-label="Avg. confidence">${item.averageConfidence === null ? 'N/A' : `${(item.averageConfidence * 100).toFixed(1)}%`}</td>
                <td data-label="First seen">${this.formatShortDate(item.firstSeen)}</td>
                <td data-label="Last seen">${this.formatShortDate(item.lastSeen)}</td>
                <td data-label="Active days">${this.formatNumber(item.activeDays)}</td>
            </tr>
        `).join('');

        this.observeSpeciesThumbnails();
    }

    observeSpeciesThumbnails() {
        // Fetch table images only as rows approach the viewport to avoid excessive API traffic.
        if (this.thumbnailObserver) this.thumbnailObserver.disconnect();

        this.thumbnailObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                this.thumbnailObserver.unobserve(entry.target);
                this.loadThumbnailForImage(entry.target);
            });
        }, { rootMargin: '250px' });

        this.speciesTableBody
            .querySelectorAll('.species-thumbnail')
            .forEach(image => this.thumbnailObserver.observe(image));
    }

    async loadThumbnailForImage(image) {
        const scientificName = image.dataset.scientificName;
        const commonName = image.dataset.commonName;
        const cacheKey = (scientificName || commonName).toLowerCase();
        if (!cacheKey) return;

        if (!this.thumbnailCache.has(cacheKey)) {
            this.thumbnailCache.set(cacheKey, this.fetchSpeciesThumbnail(scientificName, commonName));
        }

        const thumbnail = await this.thumbnailCache.get(cacheKey);
        if (thumbnail && image.isConnected) image.src = thumbnail;
    }

    async fetchSpeciesThumbnail(scientificName, commonName) {
        // Query iNaturalist and prefer an exact scientific-name species match.
        const query = scientificName || commonName;
        if (!query) return null;

        try {
            const response = await fetch(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(query)}&per_page=10`);
            if (!response.ok) return null;
            const data = await response.json();
            const normalizedScientificName = String(scientificName || '').toLowerCase();
            const exact = data.results?.find(result =>
                result.rank === 'species' &&
                normalizedScientificName &&
                result.name?.toLowerCase() === normalizedScientificName
            );
            const match = exact || data.results?.find(result => result.rank === 'species') || data.results?.[0];
            return match?.default_photo?.square_url || match?.default_photo?.medium_url || null;
        } catch (error) {
            console.warn(`Thumbnail lookup failed for ${query}:`, error);
            return null;
        }
    }

    speciesTooltipOptions(speciesList, detailBuilder) {
        // Disable the canvas tooltip and render an image-capable popup for the exact hovered species index.
        return {
            enabled: false,
            external: context => this.renderSpeciesChartTooltip(context, speciesList, detailBuilder)
        };
    }

    async renderSpeciesChartTooltip(context, speciesList, detailBuilder) {
        // Position one reusable HTML tooltip at the pointer and load its bird image asynchronously.
        const tooltipModel = context.tooltip;
        const tooltip = this.getChartTooltip();
        if (!tooltipModel || tooltipModel.opacity === 0 || !tooltipModel.dataPoints?.length) {
            tooltip.hidden = true;
            return;
        }

        const dataPoint = tooltipModel.dataPoints[0];
        const species = speciesList[dataPoint.dataIndex];
        if (!species) {
            tooltip.hidden = true;
            return;
        }

        const requestId = ++this.chartTooltipRequest;
        const details = detailBuilder(species).filter(Boolean);
        const cacheKey = (species.scientificName || species.commonName).toLowerCase();
        tooltip.dataset.speciesKey = cacheKey;
        tooltip.innerHTML = `
            <img class="chart-tooltip-image" src="${this.placeholderImage()}" alt="">
            <div class="chart-tooltip-content">
                <strong>${this.escapeHTML(species.commonName || 'Unknown species')}</strong>
                ${species.scientificName ? `<em>${this.escapeHTML(species.scientificName)}</em>` : ''}
                ${details.map(detail => `<span>${this.escapeHTML(detail)}</span>`).join('')}
            </div>
        `;

        tooltip.hidden = false;
        const canvasRectangle = context.chart.canvas.getBoundingClientRect();
        const pointerEvent = context.chart._lastEvent;
        const pointerX = canvasRectangle.left + (pointerEvent?.x ?? tooltipModel.caretX);
        const pointerY = canvasRectangle.top + (pointerEvent?.y ?? tooltipModel.caretY);
        this.positionChartTooltipAtPointer(tooltip, pointerX, pointerY);

        if (!this.thumbnailCache.has(cacheKey)) {
            this.thumbnailCache.set(
                cacheKey,
                this.fetchSpeciesThumbnail(species.scientificName, species.commonName)
            );
        }
        const thumbnail = await this.thumbnailCache.get(cacheKey);
        if (
            thumbnail &&
            requestId === this.chartTooltipRequest &&
            tooltip.dataset.speciesKey === cacheKey
        ) {
            tooltip.querySelector('.chart-tooltip-image').src = thumbnail;
        }
    }

    positionChartTooltipAtPointer(tooltip, pointerX, pointerY) {
        // Keep the popup near the cursor while flipping and clamping it inside the visible viewport.
        const viewportPadding = 8;
        const pointerGap = 14;
        const tooltipWidth = tooltip.offsetWidth;
        const tooltipHeight = tooltip.offsetHeight;
        let left = pointerX + pointerGap;
        let top = pointerY + pointerGap;

        if (left + tooltipWidth > window.innerWidth - viewportPadding) {
            left = pointerX - tooltipWidth - pointerGap;
        }
        if (top + tooltipHeight > window.innerHeight - viewportPadding) {
            top = pointerY - tooltipHeight - pointerGap;
        }

        tooltip.style.left = `${Math.max(viewportPadding, Math.min(left, window.innerWidth - tooltipWidth - viewportPadding))}px`;
        tooltip.style.top = `${Math.max(viewportPadding, Math.min(top, window.innerHeight - tooltipHeight - viewportPadding))}px`;
    }

    getChartTooltip() {
        // Create the shared tooltip once so repeated chart hovers do not add extra DOM elements.
        if (this.chartTooltip?.isConnected) return this.chartTooltip;
        const tooltip = document.createElement('div');
        tooltip.className = 'chart-species-tooltip';
        tooltip.hidden = true;
        document.body.appendChild(tooltip);
        this.chartTooltip = tooltip;
        return tooltip;
    }

    placeholderImage() {
        // Inline SVG avoids a broken-image icon while a remote thumbnail is loading.
        return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' rx='12' fill='%23e7eee4'/%3E%3Cpath d='M20 48c10-20 27-25 42-15-8 1-14 5-18 11 8-2 14 0 18 5-16 9-31 7-42-1Z' fill='%23769a70'/%3E%3C/svg%3E";
    }

    createChart(id, config) {
        const canvas = document.getElementById(id);
        this.charts.set(id, new Chart(canvas, config));
    }

    destroyCharts() {
        this.charts.forEach(chart => chart.destroy());
        this.charts.clear();
        // Hide stale hover content while charts are rebuilt for themes, styles, or responsive layouts.
        if (this.chartTooltip) this.chartTooltip.hidden = true;
    }

    dataset(label, data, color, filled) {
        // Shared dataset styling keeps chart themes consistent across chart types.
        return {
            label,
            data,
            borderColor: color,
            backgroundColor: filled ? this.withAlpha(color, 0.18) : this.withAlpha(color, 0.78),
            fill: filled,
            tension: 0.28,
            borderWidth: 2,
            pointRadius: data.length > 90 ? 0 : 2
        };
    }

    chartOptions(axisColor, gridColor, overrides = {}, isMobile = false) {
        // Shared Chart.js options keep axes legible after live theme changes.
        const base = {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: axisColor } },
                tooltip: { displayColors: true }
            },
            scales: {
                x: {
                    ticks: {
                        color: axisColor,
                        maxRotation: isMobile ? 60 : 45,
                        minRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: isMobile ? 7 : 14
                    },
                    grid: { color: gridColor }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: axisColor,
                        autoSkip: true,
                        maxTicksLimit: isMobile ? 8 : 12
                    },
                    grid: { color: gridColor }
                }
            }
        };

        return this.deepMerge(base, overrides);
    }

    getBirdCategory(taxonomy) {
        // Broad ecological groups are derived from stable eBird orders and selected waterbird families.
        if (!taxonomy) return 'Unknown';
        const order = taxonomy.order || '';
        const family = taxonomy.familySciName || '';
        const waterOrders = new Set([
            'Anseriformes', 'Charadriiformes', 'Gaviiformes', 'Pelecaniformes',
            'Phaethontiformes', 'Phoenicopteriformes', 'Podicipediformes',
            'Procellariiformes', 'Sphenisciformes', 'Suliformes'
        ]);
        const waterFamilies = new Set(['Aramidae', 'Gruidae', 'Heliornithidae', 'Rallidae']);

        if (waterOrders.has(order) || waterFamilies.has(family)) return 'Waterbirds';
        if (['Accipitriformes', 'Falconiformes', 'Strigiformes'].includes(order)) return 'Birds of prey';
        if (order === 'Passeriformes') return 'Songbirds';
        if (order === 'Psittaciformes') return 'Parrots';
        if (order === 'Galliformes') return 'Gamebirds';
        if (order === 'Columbiformes') return 'Pigeons and doves';
        if (order === 'Piciformes') return 'Woodpeckers and allies';
        if (order === 'Apodiformes') return 'Swifts and hummingbirds';
        return 'Other birds';
    }

    getISOWeekKey(date) {
        // Convert a local observation date to an ISO week label such as 2026-W24.
        const working = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const day = working.getUTCDay() || 7;
        working.setUTCDate(working.getUTCDate() + 4 - day);
        const yearStart = new Date(Date.UTC(working.getUTCFullYear(), 0, 1));
        const week = Math.ceil((((working - yearStart) / 86400000) + 1) / 7);
        return `${working.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    }

    parseDate(dateValue, timeValue = '') {
        // Support ISO dates, SQLite timestamps, and BirdNET-Pi's MM/DD/YYYY eBird export.
        const dateText = String(dateValue || '').trim();
        const timeText = String(timeValue || '').trim();
        if (!dateText) return null;

        let year;
        let month;
        let day;
        let match = dateText.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](.*))?$/);

        if (match) {
            [, year, month, day] = match;
            if (!timeText && match[4]) timeValue = match[4];
        } else {
            match = dateText.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (!match) return null;
            [, month, day, year] = match;
        }

        const timeMatch = String(timeValue || '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        const hour = timeMatch ? Number(timeMatch[1]) : 0;
        const minute = timeMatch ? Number(timeMatch[2]) : 0;
        const second = timeMatch?.[3] ? Number(timeMatch[3]) : 0;
        const date = new Date(Number(year), Number(month) - 1, Number(day), hour, minute, second);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    normalizeConfidence(value) {
        // Accept both BirdNET's 0-1 scores and percentage-style 0-100 values.
        const number = this.toNumber(value);
        if (number === null) return null;
        return Math.max(0, Math.min(1, number > 1 ? number / 100 : number));
    }

    normalizeHeader(value) {
        return String(value || '')
            .replace(/^\uFEFF/, '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
    }

    pick(row, keys) {
        for (const key of keys) {
            if (row[key] !== undefined && row[key] !== '') return row[key];
        }
        return null;
    }

    toDateKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    toNumber(value) {
        if (value === null || value === undefined || value === '') return null;
        const number = Number.parseFloat(value);
        return Number.isFinite(number) ? number : null;
    }

    incrementMap(map, key, count = 1) {
        map.set(key, (map.get(key) || 0) + count);
    }

    sortedMap(map) {
        return [...map.entries()].sort((a, b) => b[1] - a[1]);
    }

    getThemeColors() {
        const styles = getComputedStyle(document.body);
        return Array.from({ length: 6 }, (_, index) => styles.getPropertyValue(`--chart-${index + 1}`).trim());
    }

    withAlpha(hex, alpha) {
        const normalized = hex.replace('#', '');
        const value = normalized.length === 3
            ? normalized.split('').map(character => character + character).join('')
            : normalized;
        const number = Number.parseInt(value, 16);
        const red = (number >> 16) & 255;
        const green = (number >> 8) & 255;
        const blue = number & 255;
        return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    }

    deepMerge(target, source) {
        // Merge chart option objects without replacing unrelated nested defaults.
        const output = { ...target };
        Object.entries(source).forEach(([key, value]) => {
            output[key] = value && typeof value === 'object' && !Array.isArray(value)
                ? this.deepMerge(target[key] || {}, value)
                : value;
        });
        return output;
    }

    indexOfMax(values) {
        return values.reduce((best, value, index) => value > values[best] ? index : best, 0);
    }

    monthNames() {
        return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    }

    sum(values) {
        return values.reduce((total, value) => total + value, 0);
    }

    percent(value) {
        return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '0.0%';
    }

    formatNumber(value) {
        return new Intl.NumberFormat().format(value);
    }

    formatShortDate(date) {
        return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
    }

    escapeHTML(value) {
        const element = document.createElement('div');
        element.textContent = String(value ?? '');
        return element.innerHTML;
    }

    setStatus(message, isError = false) {
        this.importStatus.textContent = message;
        this.importStatus.classList.toggle('error', isError);
    }
}

// Expose the class for lightweight parser tests while keeping normal browser startup automatic.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MyBirdNETDashboard;
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        // Initialize the importer only after all dashboard elements are available.
        new MyBirdNETDashboard();
    });
}
