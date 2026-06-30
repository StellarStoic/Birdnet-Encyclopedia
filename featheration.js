// Bird-focused Nostr client for the standalone Featheration page.
(function initializeFeatherationClient() {
    'use strict';

    const HIDDEN_USERS_KEY = 'birdFeatherationHiddenUsers';
    const MIN_WOT_KEY = 'birdFeatherationMinWot';
    const MAX_HASHTAGS_KEY = 'birdFeatherationMaxHashtags';
    const LOOKBACK_KEY = 'birdFeatherationLookback';
    const THEME_KEY = 'birdEncyclopediaTheme';
    const LANGUAGE_KEY = 'birdEncyclopediaLanguage';
    // Public Cloudinary unsigned-upload settings for the Birds.name image uploader.
    const CLOUDINARY_CLOUD_NAME = 'dxlvcnmub';
    const CLOUDINARY_UNSIGNED_UPLOAD_PRESET = 'birds_name_featheration_unsigned';
    const NOSTR_TOOLS_URL = 'https://esm.sh/nostr-tools@2.10.4?bundle';
    const RELAY_INFO_CACHE_KEY = 'birdFeatherationRelayInfo';
    const RELAY_HEALTH_CACHE_KEY = 'birdFeatherationRelayHealth';

    class FeatherationClient {
        constructor() {
            this.searchForm = document.getElementById('featheration-search-form');
            this.searchInput = document.getElementById('featheration-search');
            this.quickSearchForm = document.getElementById('featheration-quick-search-form');
            this.quickSearchInput = document.getElementById('featheration-quick-search');
            this.menuToggle = document.getElementById('dropdown-toggle');
            this.menu = document.getElementById('dropdown-menu');
            this.submenuToggles = [...document.querySelectorAll('.submenu-toggle')];
            this.themeOptions = [...document.querySelectorAll('[data-theme-value]')];
            this.menuNostrAvatar = document.getElementById('menu-nostr-avatar');
            this.nostrMenuLoginLabel = document.getElementById('nostr-menu-login-label');
            this.status = document.getElementById('featheration-status');
            this.feed = document.getElementById('featheration-feed');
            this.feedMeta = document.getElementById('featheration-feed-meta');
            this.defaultTerms = ['bird', 'birds', 'birding', 'birdphotography', 'birdPhotography', 'ornithology', 'BirdNET'];
            this.defaultTags = ['bird', 'birds', 'birding', 'birdphotography', 'BirdPhotography', 'Birding'];
            this.nsfwWords = ['nsfw', 'porn', 'porno', 'nude', 'nudity', 'sex', 'xxx', 'onlyfans'];
            this.spamWords = ['airdrop', 'giveaway', 'casino', 'betting', 'crypto pump', 'presale', '100x', 'telegram pump'];
            this.profiles = new Map();
            this.profilePromises = new Map();
            this.relayInfo = new Map();
            this.followedPubkeys = new Set();
            this.lastEvents = [];
            this.eventMap = new Map();
            this.reactionSummary = new Map();
            this.engagementSummary = new Map();
            this.renderTimer = null;
            this.activeSearchToken = 0;
            this.currentRelays = [];
            this.currentSearchTerms = null;
            this.oldestLoadedCreatedAt = 0;
            this.loadingOlderNotes = false;
            this.noMoreOlderNotes = false;
            this.lastSearchTerms = [...this.defaultTerms];
            this.birdHighlightTerms = [];
            this.birdHighlightRecords = [];
            this.birdHighlightRecordsByToken = new Map();
            this.otherNameTermsLoaded = false;
            this.birdLookupByScientificName = new Map();
            this.birdGroupLookup = new Map();
            this.defaultExcludedLabelSpeciesNames = [];
            this.excludedLabelSpeciesNames = this.createExcludedLabelSpeciesSet(this.defaultExcludedLabelSpeciesNames);
            this.birdModal = document.getElementById('featheration-bird-modal');
            this.birdModalClose = document.getElementById('featheration-bird-modal-close');
            this.birdModalTitle = document.getElementById('featheration-bird-modal-title');
            this.birdDetailsFrame = document.getElementById('featheration-bird-details-frame');
            this.composeFab = document.getElementById('featheration-compose-fab');
            this.composeModal = document.getElementById('featheration-compose-modal');
            this.composeClose = document.getElementById('featheration-compose-close');
            this.composeCancel = document.getElementById('featheration-compose-cancel');
            this.composePublish = document.getElementById('featheration-compose-publish');
            this.composeText = document.getElementById('featheration-compose-text');
            this.composeLoginWarning = document.getElementById('featheration-compose-login-warning');
            this.cloudinaryFile = document.getElementById('featheration-cloudinary-file');
            this.cloudinaryUpload = document.getElementById('featheration-cloudinary-upload');
            this.cloudinaryStatus = document.getElementById('featheration-cloudinary-status');
            this.checkOthersMenu = document.getElementById('featheration-check-others-menu');
            this.checkModal = document.getElementById('featheration-check-modal');
            this.checkClose = document.getElementById('featheration-check-close');
            this.checkForm = document.getElementById('featheration-check-form');
            this.checkInput = document.getElementById('featheration-check-identity');
            this.checkSubmit = document.getElementById('featheration-check-submit');
            this.checkStatus = document.getElementById('featheration-check-status');
            this.checkResults = document.getElementById('featheration-check-results');
            this.birdGroupOverlay = null;
            this.currentQueryLabel = 'bird topics';
            this.localFilterTerms = [];
            this.localFilterTags = [];
            this.nostrTools = null;
            this.taxonomyByScientificName = new Map();
            this.taxonomyPromise = null;
        }

        async init() {
            // Apply the shared theme and language before any translated text is read.
            this.applyStoredTheme();
            await window.BirdI18n?.ready;
            this.bindEvents();
            this.updateMenuIdentity();
            this.updateComposeAvailability();
            localStorage.removeItem('birdFeatherationLastSearch');
            await this.loadLoggedInContacts();
            await this.loadExcludedLabelSpeciesNames();
            await this.loadBirdTerms();
            this.search('');
            if (window.location.hash === '#check-others') this.openCheckOthersModal();
        }

        applyStoredTheme() {
            // Match the encyclopedia and dashboard theme by reading the shared localStorage key.
            const theme = localStorage.getItem(THEME_KEY) || 'forest';
            document.body.dataset.theme = theme;
            this.updateThemeMenu(theme);
        }

        bindEvents() {
            // Wire user controls for searching, WOT filtering, local hidden users, and feed actions.
            this.menuToggle?.addEventListener('click', () => this.toggleMenu());
            this.submenuToggles.forEach(toggle => {
                toggle.addEventListener('click', () => this.toggleSubmenu(toggle));
            });
            this.themeOptions.forEach(option => {
                option.addEventListener('click', () => this.applyTheme(option.dataset.themeValue));
            });
            this.menu?.querySelectorAll('[data-index-target]').forEach(button => {
                button.addEventListener('click', () => {
                    window.location.href = `index.html${button.dataset.indexTarget || ''}`;
                });
            });
            this.searchForm?.addEventListener('submit', event => {
                event.preventDefault();
                this.search(this.searchInput.value);
            });
            this.quickSearchForm?.addEventListener('submit', event => {
                event.preventDefault();
                this.search(this.quickSearchInput.value);
            });
            this.feed?.addEventListener('click', event => this.handleFeedClick(event));
            this.feed?.addEventListener('error', event => this.handleFeedImageError(event), true);
            this.birdModalClose?.addEventListener('click', () => this.closeBirdDetailsModal());
            this.birdModal?.addEventListener('click', event => {
                if (event.target === this.birdModal) this.closeBirdDetailsModal();
            });
            this.composeFab?.addEventListener('click', () => this.openComposeModal());
            this.composeClose?.addEventListener('click', () => this.closeComposeModal());
            this.composeCancel?.addEventListener('click', () => this.closeComposeModal());
            this.composePublish?.addEventListener('click', () => this.publishComposeNote());
            this.cloudinaryUpload?.addEventListener('click', () => this.uploadComposeImageToCloudinary());
            this.checkOthersMenu?.addEventListener('click', () => this.openCheckOthersModal());
            this.checkClose?.addEventListener('click', () => this.closeCheckOthersModal());
            this.checkForm?.addEventListener('submit', event => {
                event.preventDefault();
                this.lookupOtherBirder();
            });
            this.checkResults?.addEventListener('click', event => this.handleCheckResultsClick(event));
            this.checkResults?.addEventListener('error', event => this.handleLocalBirdImageError(event), true);
            this.checkModal?.addEventListener('click', event => {
                if (event.target === this.checkModal) this.closeCheckOthersModal();
            });
            this.composeModal?.addEventListener('click', event => {
                if (event.target === this.composeModal) this.closeComposeModal();
            });
            window.addEventListener('scroll', () => this.handleFeedScroll(), { passive: true });
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape' && this.birdModal && !this.birdModal.hidden) this.closeBirdDetailsModal();
                if (event.key === 'Escape' && this.composeModal && !this.composeModal.hidden) this.closeComposeModal();
                if (event.key === 'Escape' && this.checkModal && !this.checkModal.hidden) this.closeCheckOthersModal();
            });
            window.addEventListener('message', event => this.handleBirdDetailsMessage(event));
            window.addEventListener('storage', event => {
                // Keep Nostr-only controls in sync when login state changes from another app page.
                if (event.key === 'birdNostrPublicKeyHex') {
                    this.updateMenuIdentity();
                    this.updateComposeAvailability();
                }
            });
            document.addEventListener('click', event => {
                if (this.menu?.classList.contains('show') && !event.target.closest('.dropdown-container')) {
                    this.closeMenu();
                }
                if (this.birdGroupOverlay && !event.target.closest('.bird-group-trigger') && !event.target.closest('.bird-group-cloud')) {
                    this.closeBirdGroupCloud();
                }
                if (!event.target.closest('.featheration-note-menu')) this.closeAllMenus();
            });
        }

        toggleMenu() {
            // Open or close the shared origami-bird burger menu.
            if (!this.menu || !this.menuToggle) return;
            const willOpen = !this.menu.classList.contains('show');
            this.menu.classList.toggle('show', willOpen);
            this.menuToggle.classList.toggle('active', willOpen);
            this.menuToggle.setAttribute('aria-expanded', String(willOpen));
            this.menuToggle.setAttribute('aria-label', willOpen ? 'Close navigation menu' : 'Open navigation menu');
            if (!willOpen) this.closeSubmenus();
        }

        closeMenu() {
            // Collapse the shared burger menu when the visitor clicks outside it.
            if (!this.menu || !this.menuToggle) return;
            this.menu.classList.remove('show');
            this.menuToggle.classList.remove('active');
            this.menuToggle.setAttribute('aria-expanded', 'false');
            this.menuToggle.setAttribute('aria-label', 'Open navigation menu');
            this.closeSubmenus();
        }

        toggleSubmenu(toggle) {
            // Expand or collapse a nested burger-menu section on the standalone Featheration page.
            const panel = document.getElementById(toggle.getAttribute('aria-controls'));
            if (!panel) return;
            const isOpen = panel.classList.toggle('show');
            toggle.classList.toggle('active', isOpen);
            toggle.setAttribute('aria-expanded', String(isOpen));
        }

        closeSubmenus() {
            // Reset nested menu state when the shared burger menu closes.
            this.submenuToggles.forEach(toggle => {
                const panel = document.getElementById(toggle.getAttribute('aria-controls'));
                panel?.classList.remove('show');
                toggle.classList.remove('active');
                toggle.setAttribute('aria-expanded', 'false');
            });
            this.menu?.querySelectorAll('.iucn-filter-details[open]').forEach(details => {
                details.removeAttribute('open');
            });
        }

        applyTheme(theme) {
            // Persist the shared theme from Featheration so index and My BirdNET pick up the same choice.
            const supportedThemes = new Set(['forest', 'midnight', 'sunrise', 'paper']);
            const selectedTheme = supportedThemes.has(theme) ? theme : 'forest';
            localStorage.setItem(THEME_KEY, selectedTheme);
            document.body.dataset.theme = selectedTheme;
            this.updateThemeMenu(selectedTheme);
        }

        updateThemeMenu(theme) {
            // Mark the active theme option in the copied burger menu.
            this.themeOptions?.forEach(option => {
                const active = option.dataset.themeValue === theme;
                option.classList.toggle('active', active);
                option.setAttribute('aria-pressed', String(active));
            });
        }

        async updateMenuIdentity() {
            // Show the same logged-in Nostr avatar used by the encyclopedia burger menu.
            const publicHex = localStorage.getItem('birdNostrPublicKeyHex') || '';
            if (!this.menuToggle) return;
            if (!publicHex) {
                if (this.menuNostrAvatar) this.menuNostrAvatar.hidden = true;
                if (this.nostrMenuLoginLabel) {
                    this.nostrMenuLoginLabel.setAttribute('data-i18n', 'nostr.signInMenu');
                    this.nostrMenuLoginLabel.textContent = this.t('nostr.signInMenu');
                }
                this.menuToggle.classList.remove('nostr-logged-in');
                return;
            }

            const profile = this.getCachedNostrProfile(publicHex) || await this.loadAndCacheOwnProfile(publicHex);
            const displayName = profile?.display_name || profile?.displayName || profile?.name || this.formatNpub(publicHex);
            const imageUrl = profile?.picture || profile?.image || 'img/origami_bird_B.png';
            if (this.menuNostrAvatar) {
                this.menuNostrAvatar.src = imageUrl;
                this.menuNostrAvatar.hidden = false;
                this.menuNostrAvatar.onerror = () => {
                    this.menuNostrAvatar.src = 'img/origami_bird_B.png';
                };
            }
            if (this.nostrMenuLoginLabel) {
                this.nostrMenuLoginLabel.removeAttribute('data-i18n');
                this.nostrMenuLoginLabel.textContent = this.t('nostr.loggedInAsMenu', { name: displayName });
            }
            this.menuToggle.classList.add('nostr-logged-in');
        }

        updateComposeAvailability() {
            // Only show public-note composing after a Nostr identity is saved in this browser.
            const loggedIn = Boolean(localStorage.getItem('birdNostrPublicKeyHex'));
            if (this.composeFab) this.composeFab.hidden = !loggedIn;
            if (!loggedIn) this.closeComposeModal();
        }

        getCachedNostrProfile(publicHex) {
            // Read the same browser-local Nostr metadata cache used by index.html.
            try {
                const profile = JSON.parse(localStorage.getItem('birdNostrProfile') || 'null');
                return profile?.publicHex === publicHex ? profile : null;
            } catch (error) {
                return null;
            }
        }

        async loadAndCacheOwnProfile(publicHex) {
            // Fetch and cache the logged-in user's kind-0 metadata when Featheration opens first.
            try {
                const profile = await this.fetchLatestProfile(publicHex);
                if (profile && Object.keys(profile).length) {
                    const cachedProfile = { ...profile, publicHex };
                    localStorage.setItem('birdNostrProfile', JSON.stringify(cachedProfile));
                    return cachedProfile;
                }
            } catch (error) {
                console.warn('Could not load Nostr profile for Featheration menu:', error);
            }
            return null;
        }

        t(key, values = {}) {
            // Use the shared i18n loader so this separate page can still be translated later.
            return window.BirdI18n?.t?.(key, values) || key;
        }

        async loadBirdTerms() {
            // Load selected-language and English bird names so matching and highlighting know local names too.
            const language = localStorage.getItem(LANGUAGE_KEY) || 'en';
            const files = [...new Set(['en', language])]
                .map(code => ({ code, url: `lang/labels_${code}.txt` }));
            const termSet = new Set(this.defaultTerms.map(term => this.normalizeText(term)).filter(Boolean));
            const highlightSet = new Set();
            const highlightRecords = new Map();
            await Promise.all(files.map(async file => {
                try {
                    const response = await fetch(file.url);
                    if (!response.ok) return;
                    const text = await response.text();
                    const terms = this.extractBirdTerms(text);
                    terms.matchTerms.forEach(term => termSet.add(term));
                    terms.highlightTerms.forEach(term => highlightSet.add(term));
                    terms.highlightRecords.forEach(record => {
                        record.sourceLanguage = file.code;
                        const recordKey = `${record.scientificName.toLowerCase()}|${this.normalizeText(record.term)}`;
                        if (!highlightRecords.has(recordKey)) highlightRecords.set(recordKey, record);
                        this.rememberBirdRecord(record);
                    });
                } catch (error) {
                    console.warn(`Could not load bird terms from ${file.url}:`, error);
                }
            }));
            this.applyBirdTermCollections(termSet, highlightSet, highlightRecords);
            this.loadOtherNameBirdTermsAfterFirstPaint({ termSet, highlightSet, highlightRecords });
        }

        applyBirdTermCollections(termSet, highlightSet, highlightRecords) {
            // Publish the current bird-name collections and rebuild the small token index used by note highlighting.
            this.birdTerms = [...termSet]
                .filter(term => term.length >= 4)
                .slice(0, 900);
            this.birdHighlightRecords = [...highlightRecords.values()]
                .filter(record => String(record.term || '').trim().length >= 4)
                .sort((a, b) => b.term.length - a.term.length);
            this.birdHighlightTerms = [...highlightSet]
                .filter(term => term.length >= 4)
                .sort((a, b) => b.length - a.length);
            this.birdHighlightRecordsByToken = this.buildBirdHighlightIndex(this.birdHighlightRecords);
            this.buildBirdGroupLookup();
        }

        loadOtherNameBirdTermsAfterFirstPaint(targets) {
            // Defer the large alternate-name file so it cannot block initial LCP or the first relay request.
            if (this.otherNameTermsLoaded) return;
            const start = () => {
                this.loadOtherNameBirdTerms(targets).then(didLoad => {
                    if (!didLoad) return;
                    this.otherNameTermsLoaded = true;
                    this.applyBirdTermCollections(targets.termSet, targets.highlightSet, targets.highlightRecords);
                    if (this.lastEvents.length) this.renderFeed(this.lastEvents);
                });
            };
            if ('requestIdleCallback' in window) {
                window.requestIdleCallback(start, { timeout: 2500 });
            } else {
                window.setTimeout(start, 1200);
            }
        }

        buildBirdHighlightIndex(records) {
            // Index aliases by likely source tokens so each note checks only relevant bird names.
            const index = new Map();
            records.forEach(record => {
                this.getHighlightIndexKeys(record.term).forEach(key => {
                    if (!index.has(key)) index.set(key, []);
                    index.get(key).push(record);
                });
            });
            return index;
        }

        getHighlightIndexKeys(term) {
            // Use first word and joined name keys; multi-word names still require full phrase matching later.
            const normalized = this.normalizeText(term);
            const parts = normalized.split(/\s+/).filter(Boolean);
            const keys = new Set();
            if (parts[0]?.length >= 3) keys.add(parts[0]);
            const joined = parts.join('');
            if (joined.length >= 4) keys.add(joined);
            return [...keys];
        }

        async loadOtherNameBirdTerms(targets) {
            // Load optional alternate bird names for Featheration highlighting without matching language labels in parentheses.
            try {
                const response = await fetch('data/otherNames.txt', { cache: 'no-cache' });
                if (!response.ok) return false;
                this.parseOtherNameBirdTerms(await response.text(), targets);
                return true;
            } catch (error) {
                console.info('Optional data/otherNames.txt was not loaded for Featheration highlighting:', error);
                return false;
            }
        }

        parseOtherNameBirdTerms(text, targets) {
            // Convert rows like "Latin_English-Alias (Language)" into clickable alias highlight records.
            const { termSet, highlightSet, highlightRecords } = targets;
            String(text || '').split(/\r?\n/).forEach(line => {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.includes('_')) return;
                const separatorIndex = trimmed.indexOf('_');
                const scientificName = trimmed.slice(0, separatorIndex).trim();
                const aliasText = trimmed.slice(separatorIndex + 1).trim();
                const record = this.birdLookupByScientificName.get(scientificName.toLowerCase());
                if (!scientificName || !record || !aliasText || this.isExcludedLabelSpecies(scientificName)) return;
                const seenAliases = new Set();
                this.parseOtherNameEntries(aliasText).forEach(entry => {
                    const displayName = String(entry.name || '').trim();
                    const normalizedName = this.normalizeText(displayName);
                    if (normalizedName.length < 4 || seenAliases.has(normalizedName)) return;
                    seenAliases.add(normalizedName);
                    termSet.add(normalizedName);
                    highlightSet.add(displayName);
                    highlightSet.add(displayName.replace(/[\s_-]+/g, ''));
                    highlightRecords.set(`${scientificName.toLowerCase()}|${normalizedName}`, {
                        scientificName,
                        commonName: record.commonName || '',
                        localName: record.localName || '',
                        term: displayName,
                        sourceLanguage: 'otherNames'
                    });
                    highlightRecords.set(`${scientificName.toLowerCase()}|${normalizedName.replace(/\s+/g, '')}`, {
                        scientificName,
                        commonName: record.commonName || '',
                        localName: record.localName || '',
                        term: displayName.replace(/[\s_-]+/g, ''),
                        sourceLanguage: 'otherNames'
                    });
                });
            });
        }

        parseOtherNameEntries(aliasText) {
            // Parse aliases by their trailing language marker so hyphens inside names stay part of the name.
            const entries = [];
            let cursor = 0;
            for (let index = 0; index < aliasText.length; index += 1) {
                if (aliasText[index] !== ')') continue;
                const nextCharacter = aliasText[index + 1] || '';
                if (nextCharacter && nextCharacter !== '-') continue;

                let depth = 0;
                let openIndex = -1;
                for (let probe = index; probe >= cursor; probe -= 1) {
                    if (aliasText[probe] === ')') depth += 1;
                    if (aliasText[probe] === '(') {
                        depth -= 1;
                        if (depth === 0) {
                            openIndex = probe;
                            break;
                        }
                    }
                }
                if (openIndex < cursor) continue;

                let name = aliasText.slice(cursor, openIndex).trim();
                if (name.startsWith('-')) name = name.slice(1).trim();
                if (cursor === 0 && name.includes('-')) name = name.slice(name.lastIndexOf('-') + 1).trim();
                const language = aliasText.slice(openIndex + 1, index).trim();
                if (name) entries.push({ name, language });
                cursor = index + 1;
                if (aliasText[cursor] === '-') cursor += 1;
                index = cursor - 1;
            }
            return entries;
        }

        extractBirdTerms(labelsText) {
            // Convert BirdNET label rows into searchable and highlightable scientific/local name terms.
            const ignored = new Set(['the', 'and', 'with', 'bird', 'birds', 'common', 'greater', 'lesser', 'northern', 'southern', 'eastern', 'western']);
            const matchTerms = new Set();
            const highlightTerms = new Set();
            const highlightRecords = [];
            labelsText.split(/\r?\n/).forEach(line => {
                const [scientificName = '', commonName = ''] = line.split('_');
                if (this.isExcludedLabelSpecies(scientificName, commonName)) return;
                const baseRecord = {
                    scientificName: String(scientificName || '').trim(),
                    commonName: String(commonName || '').trim()
                };
                [scientificName, commonName].forEach(name => {
                    const displayName = String(name || '').trim();
                    const normalizedName = this.normalizeText(displayName);
                    if (!baseRecord.scientificName || !displayName) return;
                    if (normalizedName.length >= 5) {
                        matchTerms.add(normalizedName);
                        highlightTerms.add(displayName);
                        highlightTerms.add(displayName.replace(/[\s_-]+/g, ''));
                        highlightRecords.push({ ...baseRecord, term: displayName });
                        highlightRecords.push({ ...baseRecord, term: displayName.replace(/[\s_-]+/g, '') });
                    }
                    normalizedName.split(/\s+/).forEach(word => {
                        if (word.length >= 5 && !ignored.has(word)) {
                            matchTerms.add(word);
                        }
                    });
                });
            });
            return {
                matchTerms: [...matchTerms],
                highlightTerms: [...highlightTerms],
                highlightRecords
            };
        }

        normalizeLabelSpeciesName(value = '') {
            // Normalize BirdNET label names so non-bird exclusions survive punctuation differences.
            return String(value || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, ' ')
                .trim()
                .replace(/\s+/g, ' ');
        }

        createExcludedLabelSpeciesSet(names = []) {
            // Build a normalized ignore set from maintainable label names.
            return new Set(names.map(name => this.normalizeLabelSpeciesName(name)).filter(Boolean));
        }

        parseExcludedLabelSpeciesLines(text = '') {
            // Support plain names and copied label rows such as "Noise_Noise" in labels_to_ignore.txt.
            return String(text || '')
                .split(/\r?\n/)
                .flatMap(line => {
                    const cleanLine = line.replace(/#.*/, '').trim();
                    if (!cleanLine) return [];
                    const separator = cleanLine.indexOf('_');
                    if (separator < 0) return [cleanLine];
                    return [
                        cleanLine.slice(0, separator).trim(),
                        cleanLine.slice(separator + 1).trim()
                    ].filter(Boolean);
                });
        }

        async loadExcludedLabelSpeciesNames() {
            // Load ignored non-bird labels from lang/labels_to_ignore.txt.
            try {
                const response = await fetch('lang/labels_to_ignore.txt', { cache: 'no-cache' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const names = this.parseExcludedLabelSpeciesLines(await response.text());
                this.excludedLabelSpeciesNames = this.createExcludedLabelSpeciesSet([
                    ...this.defaultExcludedLabelSpeciesNames,
                    ...names
                ]);
            } catch (error) {
                console.warn('Could not load lang/labels_to_ignore.txt; no label exclusions were applied:', error);
            }
        }

        isExcludedLabelSpecies(scientificName, commonName = '') {
            // Treat exact known non-bird label rows as hidden data without changing upstream lang files.
            const excluded = this.excludedLabelSpeciesNames || this.createExcludedLabelSpeciesSet(this.defaultExcludedLabelSpeciesNames);
            return excluded.has(this.normalizeLabelSpeciesName(scientificName))
                || excluded.has(this.normalizeLabelSpeciesName(commonName));
        }

        rememberBirdRecord(record) {
            // Merge repeated English/local label rows into one lookup entry keyed by scientific name.
            const scientificName = String(record?.scientificName || '').trim();
            if (!scientificName) return;
            const key = scientificName.toLowerCase();
            const existing = this.birdLookupByScientificName.get(key) || { scientificName };
            const commonName = String(record.commonName || '').trim();
            const isEnglish = record.sourceLanguage === 'en';
            this.birdLookupByScientificName.set(key, {
                ...existing,
                scientificName,
                commonName: isEnglish ? (commonName || existing.commonName || '') : (existing.commonName || ''),
                localName: isEnglish ? (existing.localName || commonName || '') : (commonName || existing.localName || existing.commonName || '')
            });
        }

        buildBirdGroupLookup() {
            // Build blue broad-group triggers only from common-name nouns that point to many species.
            const ignored = new Set([
                'black', 'white', 'brown', 'gray', 'grey', 'green', 'blue', 'red', 'yellow', 'orange',
                'golden', 'spotted', 'striped', 'streaked', 'rufous', 'pale', 'dark', 'little', 'lovely',
                'common', 'greater', 'lesser', 'northern', 'southern', 'eastern', 'western', 'coconut',
                'bird', 'birds'
            ]);
            const groups = new Map();
            this.birdLookupByScientificName.forEach(record => {
                const name = record.commonName || record.localName || '';
                this.normalizeText(name).split(/\s+/).forEach(word => {
                    if (word.length < 5 || ignored.has(word)) return;
                    if (!groups.has(word)) groups.set(word, new Map());
                    groups.get(word).set(record.scientificName.toLowerCase(), record);
                });
            });
            this.birdGroupLookup = new Map(
                [...groups.entries()]
                    .filter(([, records]) => records.size >= 8)
                    .map(([term, records]) => [term, [...records.values()].sort((a, b) => (a.commonName || a.localName || a.scientificName).localeCompare(b.commonName || b.localName || b.scientificName))])
            );
            const woodpeckers = this.birdGroupLookup.get('woodpecker');
            if (woodpeckers?.length) this.birdGroupLookup.set('woodpacker', woodpeckers);
        }

        async search(rawQuery = '') {
            // Fetch public kind-1 notes from configured relays and render progressively as events arrive.
            const query = String(rawQuery || '').trim();
            this.currentQueryLabel = query || 'bird topics';
            if (this.searchInput && this.searchInput.value !== query) this.searchInput.value = query;
            if (this.quickSearchInput && this.quickSearchInput.value !== query) this.quickSearchInput.value = query;
            const searchToken = Date.now();
            this.activeSearchToken = searchToken;
            this.eventMap = new Map();
            this.lastEvents = [];
            this.reactionSummary = new Map();
            this.engagementSummary = new Map();
            this.setStatus(this.t('featheration.loading'));
            this.renderEmpty(this.t('featheration.loading'));
            const relays = await this.getReadRelays();
            const searchTerms = this.buildSearchTerms(query);
            this.currentRelays = relays;
            this.currentSearchTerms = searchTerms;
            this.oldestLoadedCreatedAt = 0;
            this.loadingOlderNotes = false;
            this.noMoreOlderNotes = false;
            this.lastSearchTerms = searchTerms.highlightTerms;
            this.localFilterTerms = searchTerms.localTerms;
            this.localFilterTags = searchTerms.localTags;
            try {
                const relayPlans = await this.buildRelayPlans(relays, searchTerms);
                const events = await this.fetchPlannedRelayEvents(relayPlans, 6500, event => {
                    if (this.activeSearchToken !== searchToken) return;
                    this.addIncomingEvent(event);
                });
                const uniqueEvents = this.sortAndDedupeEvents(events);
                const matchingEvents = uniqueEvents.filter(event => this.eventMatchesLocalSearch(event));
                matchingEvents.forEach(event => this.addIncomingEvent(event, { immediate: false }));
                const accumulatedEvents = this.sortAndDedupeEvents([...this.eventMap.values()]);
                this.lastEvents = accumulatedEvents;
                this.oldestLoadedCreatedAt = this.getOldestCreatedAt([...uniqueEvents, ...accumulatedEvents]);
                this.renderFeed(accumulatedEvents);
                this.loadProfilesForEvents(accumulatedEvents).then(() => {
                    if (this.activeSearchToken === searchToken) this.renderFeed(this.lastEvents);
                });
                this.loadEngagementForEvents(accumulatedEvents, relays, searchToken);
                this.setStatus(this.t('featheration.loaded', {
                    count: this.formatNumber(this.getVisibleEvents(accumulatedEvents).length),
                    relays: this.formatNumber(relayPlans.length)
                }));
            } catch (error) {
                console.warn('Featheration search failed:', error);
                this.renderError(this.t('featheration.loadFailed'));
                this.setStatus(this.t('featheration.loadFailed'), true);
            }
        }

        handleFeedScroll() {
            // Load the next older Nostr page shortly before the visitor reaches the bottom of the feed.
            if (this.loadingOlderNotes || this.noMoreOlderNotes || !this.currentSearchTerms || !this.oldestLoadedCreatedAt) return;
            const distanceFromBottom = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
            if (distanceFromBottom > 900) return;
            this.loadOlderNotes();
        }

        async loadOlderNotes() {
            // Fetch one older page with an `until` cursor so long lookback windows can reveal more notes.
            if (this.loadingOlderNotes || this.noMoreOlderNotes || !this.currentSearchTerms || !this.currentRelays.length) return;
            const searchToken = this.activeSearchToken;
            const until = Number(this.oldestLoadedCreatedAt || 0) - 1;
            if (until <= 0) return;
            this.loadingOlderNotes = true;
            this.setStatus(this.t('featheration.loading'));
            try {
                const relayPlans = await this.buildRelayPlans(this.currentRelays, this.currentSearchTerms, { until });
                const beforeCount = this.eventMap.size;
                const events = await this.fetchPlannedRelayEvents(relayPlans, 6500, event => {
                    if (this.activeSearchToken !== searchToken) return;
                    this.addIncomingEvent(event);
                });
                if (this.activeSearchToken !== searchToken) return;
                const uniqueEvents = this.sortAndDedupeEvents(events);
                uniqueEvents
                    .filter(event => this.eventMatchesLocalSearch(event))
                    .forEach(event => this.addIncomingEvent(event, { immediate: false }));
                const accumulatedEvents = this.sortAndDedupeEvents([...this.eventMap.values()]);
                this.lastEvents = accumulatedEvents;
                this.oldestLoadedCreatedAt = this.getOldestCreatedAt([...uniqueEvents, ...accumulatedEvents]) || this.oldestLoadedCreatedAt;
                if (this.eventMap.size === beforeCount && !uniqueEvents.length) this.noMoreOlderNotes = true;
                this.renderFeed(accumulatedEvents);
                this.loadProfilesForEvents(accumulatedEvents).then(() => {
                    if (this.activeSearchToken === searchToken) this.renderFeed(this.lastEvents);
                });
                this.loadEngagementForEvents(accumulatedEvents, this.currentRelays, searchToken);
                this.setStatus(this.t('featheration.loaded', {
                    count: this.formatNumber(this.getVisibleEvents(accumulatedEvents).length),
                    relays: this.formatNumber(relayPlans.length)
                }));
            } catch (error) {
                console.warn('Could not load older Featheration notes:', error);
            } finally {
                this.loadingOlderNotes = false;
            }
        }

        getOldestCreatedAt(events) {
            // Find the oldest relay timestamp from a batch so the next request can page backward.
            return events
                .map(event => Number(event?.created_at || 0))
                .filter(value => value > 0)
                .reduce((oldest, value) => oldest ? Math.min(oldest, value) : value, 0);
        }

        buildSearchTerms(query) {
            // Combine reliable hashtag/recent-note filters with optional relay text search.
            const normalizedQuery = this.normalizeText(String(query || '').replace(/^#+/, ''));
            const words = normalizedQuery
                ? normalizedQuery.split(/\s+/).map(value => value.trim()).filter(Boolean)
                : ['bird', 'birds', 'birding'];
            const tags = words
                .filter(word => word.startsWith('#'))
                .map(word => word.replace(/^#+/, ''))
                .filter(Boolean);
            const plainWords = words
                .map(word => word.replace(/^#+/, ''))
                .filter(Boolean)
                .slice(0, query ? 5 : 4);
            const joinedQueryTag = plainWords.length > 1 ? plainWords.join('') : '';
            const shouldExpandBirdRoot = plainWords.length === 1 && ['bird', 'birds'].includes(plainWords[0]);
            const expandedSearchWords = shouldExpandBirdRoot ? this.expandSearchTags(plainWords, { includeRelatedBirdTags: true }) : plainWords;
            const expandedTags = this.expandSearchTags([...tags, ...plainWords, joinedQueryTag].filter(Boolean), { includeRelatedBirdTags: shouldExpandBirdRoot });
            const tagFilter = [...new Set(query ? expandedTags : ['bird', 'birds', 'birding', 'birdphotography'])].slice(0, 12);
            const since = this.getLookbackSince();
            const tagFilters = [];
            if (tagFilter.length) tagFilters.push(this.withRelayWindow({ kinds: [1], '#t': tagFilter, limit: query ? 180 : 220 }, since));
            const fallbackFilters = query
                ? tagFilters
                : [...tagFilters, this.withRelayWindow({ kinds: [1], limit: 260 }, since)];
            const searchFilters = expandedSearchWords.length
                ? [this.withRelayWindow({ kinds: [1], search: expandedSearchWords.slice(0, 8).join(' OR '), limit: query ? 180 : 120 }, since)]
                : [];
            return {
                fallbackFilters,
                searchFilters,
                highlightTerms: [...new Set([...words.map(word => word.replace(/^#+/, '')), joinedQueryTag, ...this.defaultTerms].filter(Boolean))],
                localTerms: [...expandedSearchWords.map(word => this.normalizeText(word)).filter(Boolean), this.normalizeText(joinedQueryTag)].filter(Boolean),
                localTags: tagFilter.map(tag => this.normalizeText(tag)).filter(Boolean)
            };
        }

        expandSearchTags(tags, options = {}) {
            // Add practical singular/plural hashtag variants because relays only match #t values exactly.
            const expanded = new Set();
            tags.forEach(tag => {
                const normalized = this.normalizeText(tag);
                if (!normalized) return;
                expanded.add(normalized);
                if (options.includeRelatedBirdTags && (normalized === 'bird' || normalized === 'birds')) {
                    ['bird', 'birds', 'birding', 'birdphotography', 'birdwatching', 'ornithology'].forEach(value => expanded.add(value));
                }
                if (normalized.endsWith('s') && normalized.length > 4) expanded.add(normalized.slice(0, -1));
            });
            return [...expanded];
        }

        async buildRelayPlans(relays, searchTerms, options = {}) {
            // Use NIP-50 search only on relays advertising supported_nips: [50], and use fallback filters everywhere else.
            const infos = await Promise.all(relays.map(relay => this.getRelayInfo(relay)));
            return relays.map((relay, index) => {
                const supportsSearch = infos[index]?.supported_nips?.includes(50);
                const filters = supportsSearch && searchTerms.searchFilters.length
                    ? [...searchTerms.searchFilters, ...searchTerms.fallbackFilters.slice(0, 1)]
                    : searchTerms.fallbackFilters;
                return { relay, filters: filters.map(filter => this.withRelayPaging(filter, options)), supportsSearch };
            });
        }

        withRelayPaging(filter, options = {}) {
            // Apply backward pagination without changing the user's selected lookback start.
            const until = Number(options.until || 0);
            return until > 0 ? { ...filter, until } : filter;
        }

        async getRelayInfo(relay) {
            // Read and cache NIP-11 relay metadata so search filters are sent only where supported.
            const cached = this.getCachedRelayInfo(relay);
            if (cached) return cached;
            try {
                const url = this.relayUrlToHttp(relay);
                const controller = new AbortController();
                const timeout = window.setTimeout(() => controller.abort(), 1800);
                const response = await fetch(url, {
                    headers: { Accept: 'application/nostr+json' },
                    signal: controller.signal
                });
                window.clearTimeout(timeout);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const info = await response.json();
                this.cacheRelayInfo(relay, info);
                return info;
            } catch (error) {
                const info = { supported_nips: [] };
                this.cacheRelayInfo(relay, info);
                return info;
            }
        }

        relayUrlToHttp(relay) {
            // Convert a websocket relay URL into the HTTP URL used by NIP-11 metadata.
            return String(relay || '').replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
        }

        getCachedRelayInfo(relay) {
            // Reuse relay metadata for one day to avoid repeated NIP-11 requests.
            if (this.relayInfo.has(relay)) return this.relayInfo.get(relay);
            try {
                const cache = JSON.parse(localStorage.getItem(RELAY_INFO_CACHE_KEY) || '{}');
                const entry = cache[relay];
                if (!entry || Date.now() - Number(entry.cachedAt || 0) > 24 * 60 * 60 * 1000) return null;
                this.relayInfo.set(relay, entry.info || {});
                return entry.info || {};
            } catch (error) {
                return null;
            }
        }

        cacheRelayInfo(relay, info) {
            // Store compact relay capabilities so search support is known next time.
            this.relayInfo.set(relay, info || {});
            try {
                const cache = JSON.parse(localStorage.getItem(RELAY_INFO_CACHE_KEY) || '{}');
                cache[relay] = {
                    cachedAt: Date.now(),
                    info: {
                        supported_nips: Array.isArray(info?.supported_nips) ? info.supported_nips : []
                    }
                };
                localStorage.setItem(RELAY_INFO_CACHE_KEY, JSON.stringify(cache));
            } catch (error) {
                console.warn('Could not cache relay metadata:', error);
            }
        }

        async getReadRelays() {
            // Fetch public notes only from user-configured relays plus enabled Birds.name defaults.
            const relays = new Set();
            this.getPersonalRelays().forEach(relay => relays.add(relay));
            if (this.shouldUseDefaultRelays()) this.getDefaultRelays().forEach(relay => relays.add(relay));
            return this.prioritizeHealthyRelays([...relays]).slice(0, 8);
        }

        getPersonalRelays() {
            // Read advanced relay choices saved by the existing Nostr settings modal.
            try {
                const relays = JSON.parse(localStorage.getItem('birdNostrPersonalRelays') || '[]');
                return Array.isArray(relays) ? relays.filter(relay => /^wss:\/\//i.test(relay)) : [];
            } catch (error) {
                return [];
            }
        }

        shouldUseDefaultRelays() {
            // Keep default relays enabled unless the advanced Nostr settings disabled them.
            return localStorage.getItem('birdNostrUseDefaultRelays') !== 'false';
        }

        getDefaultRelays() {
            // Use broad public relays that are already exposed in the app settings.
            return [
                'wss://nos.lol',
                'wss://relay.damus.io',
                'wss://relay.primal.net',
                'wss://nostr.mom',
                'wss://relay.snort.social',
                'wss://offchain.pub'
            ];
        }

        prioritizeHealthyRelays(relays) {
            // Skip relays that recently failed and order the rest by cached browser-local success signals.
            const normalizedRelays = [...new Set(relays.map(relay => this.normalizeRelayUrl(relay)).filter(Boolean))];
            const health = this.getRelayHealthCache();
            const now = Date.now();
            const freshFailureWindow = 10 * 60 * 1000;
            const usableRelays = normalizedRelays.filter(relay => {
                const entry = health[relay];
                if (!entry?.lastFailureAt) return true;
                if (entry.lastSuccessAt && entry.lastSuccessAt > entry.lastFailureAt) return true;
                return now - Number(entry.lastFailureAt || 0) > freshFailureWindow;
            });
            const candidates = usableRelays.length ? usableRelays : normalizedRelays;
            return candidates.sort((a, b) => this.relayHealthScore(b, health) - this.relayHealthScore(a, health));
        }

        relayHealthScore(relay, health) {
            // Rank relays by recent success so responsive relays are queried first on future page loads.
            const entry = health[relay] || {};
            const successes = Number(entry.successes || 0);
            const failures = Number(entry.failures || 0);
            const recentSuccessBonus = entry.lastSuccessAt ? Math.max(0, 20 - ((Date.now() - Number(entry.lastSuccessAt)) / 60000)) : 0;
            const recentFailurePenalty = entry.lastFailureAt ? Math.max(0, 20 - ((Date.now() - Number(entry.lastFailureAt)) / 60000)) : 0;
            return successes * 4 + recentSuccessBonus - failures * 3 - recentFailurePenalty;
        }

        normalizeRelayUrl(relay) {
            // Normalize relay URLs before caching health so trailing slashes do not create duplicate entries.
            const value = String(relay || '').trim().replace(/\/+$/, '');
            return /^wss:\/\//i.test(value) ? value : '';
        }

        getRelayHealthCache() {
            // Read browser-local relay health; stale entries are harmless and only affect ordering.
            try {
                const cache = JSON.parse(localStorage.getItem(RELAY_HEALTH_CACHE_KEY) || '{}');
                return cache && typeof cache === 'object' ? cache : {};
            } catch (error) {
                return {};
            }
        }

        writeRelayHealthCache(cache) {
            // Persist compact relay health signals without any external API or paid relay directory.
            try {
                localStorage.setItem(RELAY_HEALTH_CACHE_KEY, JSON.stringify(cache));
            } catch (error) {
                console.warn('Could not cache relay health:', error);
            }
        }

        markRelaySuccess(relay) {
            // Remember successful websocket opens so future searches start with responsive relays.
            const cleanRelay = this.normalizeRelayUrl(relay);
            if (!cleanRelay) return;
            const cache = this.getRelayHealthCache();
            const entry = cache[cleanRelay] || {};
            cache[cleanRelay] = {
                ...entry,
                successes: Math.min(999, Number(entry.successes || 0) + 1),
                lastSuccessAt: Date.now()
            };
            this.writeRelayHealthCache(cache);
        }

        markRelayFailure(relay) {
            // Remember failed websocket opens briefly so dead relays do not slow the next search.
            const cleanRelay = this.normalizeRelayUrl(relay);
            if (!cleanRelay) return;
            const cache = this.getRelayHealthCache();
            const entry = cache[cleanRelay] || {};
            cache[cleanRelay] = {
                ...entry,
                failures: Math.min(999, Number(entry.failures || 0) + 1),
                lastFailureAt: Date.now()
            };
            this.writeRelayHealthCache(cache);
        }

        fetchEventsFromRelays(relays, filters, timeoutMs, onEvent = null) {
            // Query relays in parallel and stream events to the UI before the final timeout.
            return Promise.allSettled(relays.map(relay => this.fetchEventsFromRelay(relay, filters, timeoutMs, onEvent)))
                .then(results => results.flatMap(result => result.status === 'fulfilled' ? result.value : []));
        }

        fetchPlannedRelayEvents(relayPlans, timeoutMs, onEvent = null) {
            // Query each relay with filters appropriate to its advertised capabilities.
            return Promise.allSettled(relayPlans.map(plan => this.fetchEventsFromRelay(plan.relay, plan.filters, timeoutMs, onEvent)))
                .then(results => results.flatMap(result => result.status === 'fulfilled' ? result.value : []));
        }

        fetchEventsFromRelay(relay, filters, timeoutMs, onEvent = null) {
            // Open one relay websocket, collect matching events, and stream each event immediately.
            return new Promise(resolve => {
                const events = [];
                const subscriptionId = `bn-${Math.random().toString(36).slice(2)}`;
                let socket;
                let settled = false;
                let opened = false;
                const finish = (wasFailure = false) => {
                    if (settled) return;
                    settled = true;
                    if (wasFailure && !opened) this.markRelayFailure(relay);
                    try {
                        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(['CLOSE', subscriptionId]));
                        if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) socket.close();
                    } catch (error) {
                        console.warn(`Could not close relay ${relay}:`, error);
                    }
                    resolve(events);
                };
                const timer = window.setTimeout(() => finish(!opened), timeoutMs);
                try {
                    socket = new WebSocket(relay);
                    socket.addEventListener('open', () => {
                        opened = true;
                        this.markRelaySuccess(relay);
                        socket.send(JSON.stringify(['REQ', subscriptionId, ...filters]));
                    });
                    socket.addEventListener('message', message => {
                        try {
                            const data = JSON.parse(message.data);
                            if (data[0] === 'EVENT' && data[1] === subscriptionId) {
                                events.push(data[2]);
                                onEvent?.(data[2], relay);
                            }
                            if (data[0] === 'EOSE' && data[1] === subscriptionId) {
                                window.clearTimeout(timer);
                                finish();
                            }
                        } catch (error) {
                            console.warn(`Could not parse event from ${relay}:`, error);
                        }
                    });
                    socket.addEventListener('error', () => {
                        window.clearTimeout(timer);
                        finish(true);
                    });
                    socket.addEventListener('close', () => {
                        window.clearTimeout(timer);
                        finish(!opened);
                    });
                } catch (error) {
                    window.clearTimeout(timer);
                    finish(true);
                }
            });
        }

        sortAndDedupeEvents(events) {
            // Keep the newest copy of each event ID and cap rendering work after several older pages.
            const byId = new Map();
            events.forEach(event => {
                if (event?.id && event?.kind === 1 && !byId.has(event.id)) byId.set(event.id, event);
            });
            return [...byId.values()]
                .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0))
                .slice(0, 600);
        }

        addIncomingEvent(event, { immediate = true } = {}) {
            // Merge one relay event into the active result set and schedule a cheap re-render.
            if (!event?.id || event.kind !== 1 || this.eventMap.has(event.id)) return;
            if (!this.eventMatchesLocalSearch(event)) return;
            this.eventMap.set(event.id, event);
            this.lastEvents = this.sortAndDedupeEvents([...this.eventMap.values()]);
            if (immediate) this.scheduleRender();
        }

        scheduleRender() {
            // Batch fast relay bursts so the page stays responsive while still feeling live.
            window.clearTimeout(this.renderTimer);
            this.renderTimer = window.setTimeout(() => this.renderFeed(this.lastEvents), 140);
        }

        async loadProfilesForEvents(events) {
            // Fetch visible author metadata in batches so avatars are not lost to many tiny relay requests.
            const pubkeys = [...new Set(events.map(event => event.pubkey).filter(Boolean))];
            await this.loadProfilesForPubkeys(pubkeys);
        }

        async loadProfilesForPubkeys(pubkeys) {
            // Fetch a compact set of missing profile records for note and reply authors.
            const missingPubkeys = [...new Set(pubkeys.filter(Boolean))]
                .filter(pubkey => !this.profiles.has(pubkey) && !this.profilePromises.has(pubkey))
                .slice(0, 60);
            if (!missingPubkeys.length) return;
            const promise = this.fetchProfilesForPubkeys(missingPubkeys).then(profileMap => {
                missingPubkeys.forEach(pubkey => {
                    this.profiles.set(pubkey, profileMap.get(pubkey) || {});
                    this.profilePromises.delete(pubkey);
                });
                return profileMap;
            });
            missingPubkeys.forEach(pubkey => this.profilePromises.set(pubkey, promise.then(map => map.get(pubkey) || {})));
            await promise;
        }

        async loadEngagementForEvents(events, relays, searchToken) {
            // Fetch reactions, replies, and reposts for visible notes so action counts survive reloads.
            const eventIds = [...new Set(events.map(event => event.id).filter(Boolean))].slice(0, 140);
            if (!eventIds.length) return;
            const chunks = [];
            for (let index = 0; index < eventIds.length; index += 40) {
                chunks.push(eventIds.slice(index, index + 40));
            }
            const filters = chunks.flatMap(ids => [
                { kinds: [7], '#e': ids, limit: 500 },
                { kinds: [6], '#e': ids, limit: 500 },
                { kinds: [1], '#e': ids, limit: 500 }
            ]);
            const engagementEvents = await this.fetchEventsFromRelays(relays, filters, 4200);
            if (this.activeSearchToken !== searchToken) return;
            this.reactionSummary = this.buildReactionSummary(engagementEvents.filter(event => Number(event.kind) === 7), eventIds);
            this.engagementSummary = this.buildEngagementSummary(engagementEvents, eventIds);
            const replyAuthors = [...new Set([...this.engagementSummary.values()].flatMap(summary => summary.replies.map(reply => reply.pubkey)).filter(Boolean))];
            await this.loadProfilesForPubkeys(replyAuthors);
            this.renderFeed(this.lastEvents);
        }

        buildReactionSummary(reactionEvents, knownEventIds) {
            // Count unique positive reaction authors per event and ignore explicit dislike reactions.
            const known = new Set(knownEventIds);
            const summary = new Map();
            reactionEvents.forEach(reaction => {
                const targetId = this.getEventTagValue(reaction, 'e');
                if (!targetId || !known.has(targetId) || !reaction.pubkey || String(reaction.content || '+').trim() === '-') return;
                if (!summary.has(targetId)) summary.set(targetId, new Set());
                summary.get(targetId).add(reaction.pubkey);
            });
            return summary;
        }

        buildEngagementSummary(events, knownEventIds) {
            // Group kind-1 replies and kind-6 reposts by the root note they reference.
            const known = new Set(knownEventIds);
            const summary = new Map([...known].map(id => [id, { replies: [], reposts: new Set() }]));
            events.forEach(event => {
                const targetId = this.getEventTagValues(event, 'e').find(id => known.has(id));
                if (!targetId || !known.has(targetId)) return;
                const entry = summary.get(targetId) || { replies: [], reposts: new Set() };
                if (Number(event.kind) === 6 && event.pubkey) {
                    entry.reposts.add(event.pubkey);
                } else if (Number(event.kind) === 1 && event.id && !known.has(event.id)) {
                    entry.replies.push(event);
                }
                summary.set(targetId, entry);
            });
            summary.forEach(entry => {
                entry.replies = this.sortAndDedupeEvents(entry.replies).slice(0, 8);
            });
            return summary;
        }

        getEventTagValue(event, tagName) {
            // Return the first tag value for compact Nostr relation lookups.
            const tag = (event.tags || []).find(item => item[0] === tagName && item[1]);
            return tag?.[1] || '';
        }

        getEventTagValues(event, tagName) {
            // Return all tag values for relation lookups where replies can include root and parent event IDs.
            return (event.tags || [])
                .filter(item => item[0] === tagName && item[1])
                .map(item => item[1]);
        }

        loadProfile(pubkey) {
            // Cache profile lookups per page load to avoid repeated kind-0 subscriptions.
            if (this.profiles.has(pubkey)) return Promise.resolve(this.profiles.get(pubkey));
            if (this.profilePromises.has(pubkey)) return this.profilePromises.get(pubkey);
            const promise = this.fetchLatestProfile(pubkey).then(profile => {
                this.profiles.set(pubkey, profile || {});
                this.profilePromises.delete(pubkey);
                return profile || {};
            });
            this.profilePromises.set(pubkey, promise);
            return promise;
        }

        async fetchLatestProfile(pubkey) {
            // Read the latest kind-0 metadata event from the available relays.
            const relays = this.getProfileRelays();
            const filters = [{ kinds: [0], authors: [pubkey], limit: 1 }];
            const events = await this.fetchEventsFromRelays(relays, filters, 2200);
            const latest = events.sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0))[0];
            if (!latest?.content) return {};
            try {
                return JSON.parse(latest.content);
            } catch (error) {
                return {};
            }
        }

        async fetchProfilesForPubkeys(pubkeys) {
            // Request kind-0 metadata for many authors at once and keep the newest profile per author.
            const relays = this.getProfileRelays();
            const filters = [];
            for (let index = 0; index < pubkeys.length; index += 20) {
                filters.push({ kinds: [0], authors: pubkeys.slice(index, index + 20), limit: 80 });
            }
            const events = await this.fetchEventsFromRelays(relays, filters, 4200);
            const latestByPubkey = new Map();
            events.forEach(event => {
                if (!event?.pubkey || !event?.content) return;
                const existing = latestByPubkey.get(event.pubkey);
                if (existing && Number(existing.created_at || 0) >= Number(event.created_at || 0)) return;
                latestByPubkey.set(event.pubkey, event);
            });
            const profiles = new Map();
            latestByPubkey.forEach((event, pubkey) => {
                try {
                    profiles.set(pubkey, JSON.parse(event.content));
                } catch (error) {
                    profiles.set(pubkey, {});
                }
            });
            return profiles;
        }

        getProfileRelays() {
            // Fetch kind-0 profile metadata and avatars from Purple Pages instead of public note relays.
            return ['wss://purplepag.es'];
        }

        async loadLoggedInContacts() {
            // Load the logged-in user's follow list for a simple positive WOT signal.
            const publicHex = localStorage.getItem('birdNostrPublicKeyHex');
            if (!publicHex) return;
            const relays = await this.getReadRelays();
            const events = await this.fetchEventsFromRelays(relays, [{ kinds: [3], authors: [publicHex], limit: 1 }], 2200);
            const latest = events.sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0))[0];
            this.followedPubkeys = new Set((latest?.tags || [])
                .filter(tag => tag[0] === 'p' && /^[0-9a-f]{64}$/i.test(tag[1] || ''))
                .map(tag => tag[1].toLowerCase()));
        }

        getVisibleEvents(events) {
            // Filter events by local hard-block words, bird relevance, and the selected WOT threshold.
            const threshold = this.getMinWotSetting();
            const matchingEvents = events.filter(event => {
                if (this.isHardBlocked(event.content)) return false;
                if (this.hasTooManyHashtags(event)) return false;
                if (!this.eventMatchesLocalSearch(event)) return false;
                const score = this.calculateWotScore(event);
                return score >= threshold;
            });
            if (matchingEvents.length || threshold <= 0) return matchingEvents;
            return events.filter(event => !this.isHardBlocked(event.content) && !this.hasTooManyHashtags(event) && this.eventMatchesLocalSearch(event));
        }

        hasTooManyHashtags(event) {
            // Hide spammy notes with excessive hashtag counts when the local setting is enabled.
            const maxHashtags = this.getMaxHashtagsSetting();
            if (maxHashtags <= 0) return false;
            return this.countEventHashtags(event) > maxHashtags;
        }

        getMinWotSetting() {
            // Read the shared Featheration WOT setting from central Nostr settings.
            return Number(localStorage.getItem(MIN_WOT_KEY) || 0);
        }

        getMaxHashtagsSetting() {
            // Read the shared Featheration hashtag limit from central Nostr settings.
            return Number(localStorage.getItem(MAX_HASHTAGS_KEY) || 8);
        }

        getLookbackSince() {
            // Convert the central Featheration post-age setting into a Nostr since timestamp.
            const daysByKey = {
                today: 1,
                week: 7,
                month: 30,
                '3months': 90,
                '6months': 183,
                '1year': 365,
                '3years': 1095
            };
            const value = localStorage.getItem(LOOKBACK_KEY) || 'month';
            if (value === 'all') return null;
            const days = daysByKey[value] || daysByKey.month;
            return Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
        }

        withRelayWindow(filter, since) {
            // Add the selected lookback start to every feed search filter, including NIP-50 text search.
            return since ? { ...filter, since } : filter;
        }

        countEventHashtags(event) {
            // Count both explicit Nostr hashtag tags and visible hashtags inside note content.
            const tagCount = (event.tags || []).filter(tag => tag[0] === 't' && tag[1]).length;
            const contentCount = (String(event.content || '').match(/(^|\s)#[\p{L}\p{N}_-]+/gu) || []).length;
            return Math.max(tagCount, contentCount);
        }

        eventMatchesLocalSearch(event) {
            // Accept a note when any searched word appears as a full token or any searched hashtag appears in tags/content.
            const terms = this.localFilterTerms || [];
            const tags = this.localFilterTags || [];
            if (!terms.length && !tags.length) return true;
            const content = this.normalizeText(event.content || '');
            const contentTokens = this.getNormalizedTokens(event.content || '');
            const contentHashtags = this.getContentHashtags(event.content || '');
            const noteTags = (event.tags || [])
                .filter(tag => tag[0] === 't')
                .map(tag => this.normalizeText(tag[1] || ''));
            const searchableTags = [...noteTags, ...contentHashtags];
            return terms.some(term => this.normalizedTermMatches(content, contentTokens, term)
                    || searchableTags.some(tag => this.normalizedTagMatches(tag, term)))
                || tags.some(tag => searchableTags.some(noteTag => this.normalizedTagMatches(noteTag, tag)));
        }

        normalizedTermMatches(content, contentTokens, term) {
            // Match single-word searches exactly and multi-word searches as complete normalized word sequences.
            if (!term) return false;
            if (!term.includes(' ')) return contentTokens.includes(term);
            const escaped = this.escapeRegex(term).replace(/\\ /g, '\\s+');
            return new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'u').test(content);
        }

        normalizedTagMatches(tag, term) {
            // Match hashtags exactly, and also match multi-word bird names written as one hashtag.
            if (!tag || !term) return false;
            const joinedTerm = term.replace(/\s+/g, '');
            return tag === term || tag === joinedTerm;
        }

        getNormalizedTokens(text) {
            // Tokenize content so "bird" does not match "birdstr" or "birdster".
            return this.normalizeText(text).split(/\s+/).filter(Boolean);
        }

        getContentHashtags(text) {
            // Extract visible hashtags from note content and normalize them without the leading hash.
            return (String(text || '').match(/(^|\s)#[\p{L}\p{N}_-]+/gu) || [])
                .map(tag => this.normalizeText(tag.replace('#', '')))
                .filter(Boolean);
        }

        isHardBlocked(content) {
            // Remove obvious NSFW/spam notes before they reach the feed UI.
            const text = this.normalizeText(content || '');
            return [...this.nsfwWords, ...this.spamWords].some(word => text.includes(this.normalizeText(word)));
        }

        calculateWotScore(event) {
            // Score authors with stable local signals so the same user gets the same WoT value on every note.
            const pubkey = String(event?.pubkey || '').toLowerCase();
            const profile = this.profiles.get(event.pubkey) || {};
            let score = 0;
            if (profile.name || profile.display_name) score += 2;
            if (profile.picture || profile.image || profile.avatar) score += 1;
            if (profile.nip05) score += 1;
            if (this.followedPubkeys.has(pubkey)) score += 6;
            return Math.max(0, Math.min(10, score));
        }

        renderFeed(events) {
            // Render filtered events, keeping hidden authors collapsed instead of fully removing them.
            if (!this.feed) return;
            const visible = this.getVisibleEvents(events);
            this.feedMeta.textContent = this.t('featheration.feedMeta', {
                count: this.formatNumber(visible.length),
                query: this.currentQueryLabel
            });
            if (!visible.length) {
                this.renderEmpty(this.t('featheration.noNotes'));
                return;
            }
            this.feed.innerHTML = visible.map(event => this.renderNote(event)).join('');
        }

        renderNote(event) {
            // Build one public note card with author metadata, moderation state, and optional actions.
            const profile = this.profiles.get(event.pubkey) || {};
            const hiddenUsers = this.getHiddenUsers();
            const isHidden = Boolean(hiddenUsers[event.pubkey]);
            const name = this.getProfileName(profile, event.pubkey);
            const npub = this.formatNpub(event.pubkey);
            const nip05 = this.getProfileNip05(profile);
            const score = this.calculateWotScore(event);
            const media = this.extractMediaAttachments(event);
            const visibleContent = this.removeDisplayedMediaUrls(event.content || '', media);
            const engagement = this.engagementSummary.get(event.id) || { replies: [], reposts: new Set() };
            if (isHidden) {
                return `
                    <article class="featheration-note hidden-author" data-event-id="${this.escapeHtml(event.id)}" data-pubkey="${this.escapeHtml(event.pubkey)}">
                        <div class="featheration-hidden-message">
                            <span>${this.escapeHtml(this.t('featheration.hiddenAuthor', { author: name }))}</span>
                            <button class="featheration-secondary-button" type="button" data-unhide-user="${this.escapeHtml(event.pubkey)}">${this.escapeHtml(this.t('featheration.unhideUser'))}</button>
                        </div>
                    </article>
                `;
            }
            return `
                <article class="featheration-note" data-event-id="${this.escapeHtml(event.id)}" data-pubkey="${this.escapeHtml(event.pubkey)}">
                    <header class="featheration-note-header">
                        <img class="featheration-author-avatar" src="${this.escapeHtml(this.getProfileImageUrl(profile))}" alt="" loading="lazy" decoding="async">
                        <div class="featheration-author-copy">
                            <span class="featheration-author-name">${this.escapeHtml(name)}</span>
                            ${nip05 ? `<span class="featheration-author-nip05">${this.escapeHtml(nip05)}</span>` : ''}
                            <div class="featheration-author-meta">
                                <span class="featheration-author-npub">${this.escapeHtml(npub)}</span>
                                <span class="featheration-wot">${this.escapeHtml(this.t('featheration.wotScore', { score }))}</span>
                                <time class="featheration-note-time" datetime="${this.escapeHtml(this.eventDate(event).toISOString())}">${this.escapeHtml(this.relativeTime(event))}</time>
                            </div>
                        </div>
                        ${this.renderNoteMenu(event, isHidden)}
                    </header>
                    <div class="featheration-note-content">${this.highlightText(visibleContent)}</div>
                    ${this.renderMediaAttachments(media)}
                    ${this.renderRepliesSection(event, engagement)}
                    ${this.renderNoteActions(event)}
                </article>
            `;
        }

        renderMediaAttachments(media) {
            // Render safe media URLs found in note content or media tags without executing third-party scripts.
            if (!media.length) return '';
            return `
                <div class="featheration-media-grid">
                    ${media.map(item => this.renderMediaAttachment(item)).join('')}
                </div>
            `;
        }

        extractMediaAttachments(event) {
            // Collect URL media from common Nostr tags and from the plain note content.
            const urls = new Set();
            (event.tags || []).forEach(tag => {
                if (['r', 'url', 'image', 'imeta'].includes(tag[0])) {
                    tag.slice(1).forEach(value => this.extractUrls(value).forEach(url => urls.add(url)));
                }
            });
            this.extractUrls(event.content || '').forEach(url => urls.add(url));
            return [...urls]
                .map(url => {
                    const media = this.classifyMediaUrl(url);
                    return media ? { ...media, originalUrl: url } : null;
                })
                .filter(Boolean)
                .slice(0, 8);
        }

        removeDisplayedMediaUrls(content, media) {
            // Hide raw source URLs from note text when the same URLs are rendered as media attachments.
            const sourceUrls = new Set();
            (media || []).forEach(item => {
                [item.originalUrl, item.source, item.type !== 'iframe' ? item.url : '']
                    .filter(Boolean)
                    .forEach(url => sourceUrls.add(String(url)));
            });
            let visible = String(content || '');
            sourceUrls.forEach(url => {
                const pattern = new RegExp(`(^|\\s)${this.escapeRegex(url)}(?=\\s|$|[.,!?;:)\\]])`, 'g');
                visible = visible.replace(pattern, '$1');
            });
            return visible
                .replace(/[ \t]{2,}/g, ' ')
                .replace(/[ \t]+\n/g, '\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        }

        extractUrls(text) {
            // Find HTTP(S) URLs and trim punctuation commonly attached at the end of sentences.
            return String(text || '')
                .match(/https?:\/\/[^\s<>"')\]]+/gi)
                ?.map(url => url.replace(/[.,!?;:]+$/g, ''))
                .filter(url => {
                    try {
                        const parsed = new URL(url);
                        return ['http:', 'https:'].includes(parsed.protocol);
                    } catch (error) {
                        return false;
                    }
                }) || [];
        }

        classifyMediaUrl(url) {
            // Classify direct media, common embeds, and plain links for safe rendering.
            let parsed;
            try {
                parsed = new URL(url);
            } catch (error) {
                return null;
            }
            const cleanUrl = parsed.toString();
            const path = parsed.pathname.toLowerCase();
            const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
            if (/\.(avif|bmp|gif|jpe?g|png|svg|webp)(\?.*)?$/i.test(path)) return { type: 'image', url: cleanUrl };
            if (/\.(mp4|m4v|mov|ogv|webm)(\?.*)?$/i.test(path)) return { type: 'video', url: cleanUrl };
            if (/\.(aac|flac|m4a|mp3|oga|ogg|opus|wav|weba)(\?.*)?$/i.test(path)) return { type: 'audio', url: cleanUrl };
            if (/\.(pdf)(\?.*)?$/i.test(path)) return { type: 'document', url: cleanUrl, label: 'PDF' };
            const youtubeId = this.getYouTubeId(parsed, host);
            if (youtubeId) return { type: 'iframe', url: `https://www.youtube-nocookie.com/embed/${youtubeId}`, source: cleanUrl, label: 'YouTube' };
            const vimeoId = this.getVimeoId(parsed, host);
            if (vimeoId) return { type: 'iframe', url: `https://player.vimeo.com/video/${vimeoId}`, source: cleanUrl, label: 'Vimeo' };
            if (host === 'open.spotify.com') return { type: 'iframe', url: `https://open.spotify.com/embed${parsed.pathname}`, source: cleanUrl, label: 'Spotify' };
            return { type: 'link', url: cleanUrl, label: host };
        }

        getYouTubeId(parsed, host) {
            // Extract YouTube video IDs from short, watch, shorts, and embed URLs.
            if (host === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] || '';
            if (!['youtube.com', 'youtube-nocookie.com', 'm.youtube.com'].includes(host)) return '';
            if (parsed.searchParams.get('v')) return parsed.searchParams.get('v');
            const parts = parsed.pathname.split('/').filter(Boolean);
            if (['shorts', 'embed', 'live'].includes(parts[0])) return parts[1] || '';
            return '';
        }

        getVimeoId(parsed, host) {
            // Extract simple Vimeo numeric video IDs.
            if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return '';
            return parsed.pathname.split('/').find(part => /^\d+$/.test(part)) || '';
        }

        renderMediaAttachment(item) {
            // Render one media attachment with native browser controls where possible.
            const url = this.escapeHtml(item.url);
            if (item.type === 'image') {
                return `<a class="featheration-media featheration-media-image" href="${url}" target="_blank" rel="noopener noreferrer"><img src="${url}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>`;
            }
            if (item.type === 'video') {
                return `<video class="featheration-media featheration-media-video" controls preload="metadata" src="${url}"></video>`;
            }
            if (item.type === 'audio') {
                return `<audio class="featheration-media featheration-media-audio" controls preload="metadata" src="${url}"></audio>`;
            }
            if (item.type === 'iframe') {
                return `<iframe class="featheration-media featheration-media-embed" src="${url}" title="${this.escapeHtml(item.label || 'Embedded media')}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" allowfullscreen></iframe>`;
            }
            if (item.type === 'document') {
                return `<a class="featheration-media-link" href="${url}" target="_blank" rel="noopener noreferrer"><i class="fa-regular fa-file-lines" aria-hidden="true"></i><span>${this.escapeHtml(item.label || 'Document')}</span></a>`;
            }
            return `<a class="featheration-media-link" href="${url}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i><span>${this.escapeHtml(item.label || item.url)}</span></a>`;
        }

        getProfileImageUrl(profile) {
            // Accept common Nostr metadata image fields and fall back when the URL is missing or invalid.
            const imageUrl = profile?.picture || profile?.image || profile?.avatar || '';
            if (!imageUrl) return 'img/origami_bird_B.png';
            try {
                const parsed = new URL(String(imageUrl));
                if (!['http:', 'https:'].includes(parsed.protocol)) return 'img/origami_bird_B.png';
                return parsed.toString();
            } catch (error) {
                return 'img/origami_bird_B.png';
            }
        }

        handleFeedImageError(event) {
            // Replace broken author avatars with the local fallback instead of leaving an empty circle.
            const image = event.target.closest?.('.featheration-author-avatar');
            if (!image || image.dataset.fallbackApplied === 'true') return;
            image.dataset.fallbackApplied = 'true';
            image.src = 'img/origami_bird_B.png';
        }

        renderNoteMenu(event, isHidden) {
            // Keep copy and moderation actions behind a compact three-dot menu.
            const hideKey = isHidden ? 'featheration.unhideUser' : 'featheration.hideUser';
            const hideAction = isHidden ? 'unhide' : 'hide';
            return `
                <div class="featheration-note-menu">
                    <button class="featheration-menu-button" type="button" data-open-note-menu aria-label="${this.escapeHtml(this.t('featheration.moreActions'))}">
                        <i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i>
                    </button>
                    <div class="featheration-menu-panel" hidden>
                        <button type="button" data-copy-note-id>${this.escapeHtml(this.t('featheration.copyNoteId'))}</button>
                        <button type="button" data-copy-note-text>${this.escapeHtml(this.t('featheration.copyText'))}</button>
                        <button type="button" data-toggle-hidden-user="${hideAction}">${this.escapeHtml(this.t(hideKey))}</button>
                    </div>
                </div>
            `;
        }

        renderNoteActions(event) {
            // Show Nostr interactions only when this browser has a saved Nostr identity.
            const publicHex = localStorage.getItem('birdNostrPublicKeyHex');
            const likePubkeys = this.reactionSummary.get(event.id) || new Set();
            const engagement = this.engagementSummary.get(event.id) || { replies: [], reposts: new Set() };
            const likedByUser = Boolean(publicHex && likePubkeys.has(publicHex));
            const likeCount = likePubkeys.size;
            const replyCount = engagement.replies?.length || 0;
            const repostCount = engagement.reposts?.size || 0;
            if (!publicHex) {
                return `
                    <div class="featheration-note-actions">
                        <button class="featheration-note-action featheration-reaction-button" type="button" disabled aria-label="${this.escapeHtml(this.t('featheration.like'))}" title="${this.escapeHtml(this.t('featheration.loginForActions'))}">
                            <i class="fa-solid fa-feather-pointed" aria-hidden="true"></i>
                            <span class="featheration-like-count">${this.escapeHtml(this.formatNumber(likeCount))}</span>
                        </button>
                        <span class="featheration-note-time">${this.escapeHtml(this.t('featheration.loginForActions'))}</span>
                    </div>
                `;
            }
            return `
                <div class="featheration-note-actions">
                    <button class="featheration-note-action featheration-reaction-button ${likedByUser ? 'liked' : ''}" type="button" data-react="+" aria-pressed="${likedByUser}" aria-label="${this.escapeHtml(this.t('featheration.like'))}" title="${this.escapeHtml(this.t('featheration.like'))}">
                        <i class="fa-solid fa-feather-pointed" aria-hidden="true"></i>
                        <span class="featheration-like-count">${this.escapeHtml(this.formatNumber(likeCount))}</span>
                    </button>
                    <button class="featheration-note-action" type="button" data-repost>${this.escapeHtml(this.t('featheration.repost'))}${repostCount ? ` <span class="featheration-action-count">${this.escapeHtml(this.formatNumber(repostCount))}</span>` : ''}</button>
                    <button class="featheration-note-action" type="button" data-reply>${this.escapeHtml(this.t('featheration.reply'))}${replyCount ? ` <span class="featheration-action-count">${this.escapeHtml(this.formatNumber(replyCount))}</span>` : ''}</button>
                </div>
            `;
        }

        renderRepliesSection(event, engagement) {
            // Render fetched replies in a native collapsible block when the note has public replies.
            const replies = engagement?.replies || [];
            if (!replies.length) return '';
            return `
                <details class="featheration-replies">
                    <summary>
                        <i class="fa-solid fa-chevron-right featheration-replies-chevron" aria-hidden="true"></i>
                        <span>${this.escapeHtml(this.t('featheration.repliesCount', { count: this.formatNumber(replies.length) }))}</span>
                    </summary>
                    <div class="featheration-reply-list">
                        ${replies.map(reply => this.renderReply(reply)).join('')}
                    </div>
                </details>
            `;
        }

        renderReply(reply) {
            // Render a compact reply preview with author metadata and media links.
            const profile = this.profiles.get(reply.pubkey) || {};
            const nip05 = this.getProfileNip05(profile);
            const media = this.extractMediaAttachments(reply);
            const visibleContent = this.removeDisplayedMediaUrls(reply.content || '', media);
            return `
                <article class="featheration-reply" data-event-id="${this.escapeHtml(reply.id)}">
                    <img class="featheration-author-avatar featheration-reply-avatar" src="${this.escapeHtml(this.getProfileImageUrl(profile))}" alt="" loading="lazy" decoding="async">
                    <div class="featheration-reply-body">
                        <div class="featheration-reply-meta">
                            <strong>${this.escapeHtml(this.getProfileName(profile, reply.pubkey))}</strong>
                            ${nip05 ? `<span class="featheration-author-nip05">${this.escapeHtml(nip05)}</span>` : ''}
                            <time datetime="${this.escapeHtml(this.eventDate(reply).toISOString())}">${this.escapeHtml(this.relativeTime(reply))}</time>
                        </div>
                        <div class="featheration-note-content">${this.highlightText(visibleContent)}</div>
                        ${this.renderMediaAttachments(media)}
                    </div>
                </article>
            `;
        }

        async handleFeedClick(event) {
            // Route feed button clicks to copy, hide, reaction, repost, and reply handlers.
            const groupedSpeciesButton = event.target.closest('[data-bird-group-species]');
            if (groupedSpeciesButton) {
                event.preventDefault();
                event.stopPropagation();
                this.closeBirdGroupCloud();
                await this.openBirdDetailsModal(groupedSpeciesButton.dataset.birdGroupSpecies);
                return;
            }
            const birdGroupButton = event.target.closest('[data-bird-group-term]');
            if (birdGroupButton) {
                event.preventDefault();
                event.stopPropagation();
                this.showBirdGroupCloud(birdGroupButton, birdGroupButton.dataset.birdGroupTerm);
                return;
            }
            const birdButton = event.target.closest('[data-bird-scientific-name]');
            if (birdButton) {
                event.preventDefault();
                event.stopPropagation();
                await this.openBirdDetailsModal(birdButton.dataset.birdScientificName);
                return;
            }
            const note = event.target.closest('.featheration-note');
            if (!note) return;
            if (event.target.closest('.featheration-replies summary')) return;
            const originalEvent = this.lastEvents.find(item => item.id === note.dataset.eventId);
            if (!originalEvent) return;
            if (event.target.closest('[data-open-note-menu]')) {
                this.toggleNoteMenu(event.target.closest('.featheration-note-menu'));
                return;
            }
            if (event.target.closest('[data-copy-note-id]')) return this.copyText(originalEvent.id, this.t('featheration.noteIdCopied'));
            if (event.target.closest('[data-copy-note-text]')) return this.copyText(originalEvent.content || '', this.t('featheration.textCopied'));
            if (event.target.closest('[data-unhide-user]')) {
                this.unhideUser(originalEvent.pubkey);
                this.renderFeed(this.lastEvents);
                return;
            }
            const hiddenToggle = event.target.closest('[data-toggle-hidden-user]');
            if (hiddenToggle) {
                hiddenToggle.dataset.toggleHiddenUser === 'hide' ? this.hideUser(originalEvent.pubkey) : this.unhideUser(originalEvent.pubkey);
                this.renderFeed(this.lastEvents);
                return;
            }
            const reactionButton = event.target.closest('[data-react]');
            if (reactionButton) return this.publishReaction(originalEvent, reactionButton.dataset.react, reactionButton);
            if (event.target.closest('[data-repost]')) return this.publishRepost(originalEvent, event.target.closest('[data-repost]'));
            if (event.target.closest('[data-reply]')) return this.publishReply(originalEvent, event.target.closest('[data-reply]'));
        }

        openCheckOthersModal() {
            // Open the read-only public-observations lookup without requiring the visitor to log in.
            if (!this.checkModal) return;
            this.closeMenu();
            this.checkModal.hidden = false;
            document.body.classList.add('featheration-modal-open');
            if (this.checkStatus) this.checkStatus.textContent = '';
            if (this.checkResults && !this.checkResults.innerHTML.trim()) {
                this.checkResults.innerHTML = `<p class="featheration-check-empty">${this.escapeHtml(this.t('featheration.checkEmpty'))}</p>`;
            }
            window.setTimeout(() => this.checkInput?.focus(), 50);
        }

        closeCheckOthersModal() {
            // Close the public-observations lookup modal.
            if (!this.checkModal) return;
            this.checkModal.hidden = true;
            document.body.classList.remove('featheration-modal-open');
        }

        async lookupOtherBirder() {
            // Resolve npub, hex, or NIP-05 and render public Birds.name species totals plus badges.
            const identity = String(this.checkInput?.value || '').trim();
            if (!identity) {
                this.setCheckStatus(this.t('featheration.checkIdentityRequired'), true);
                return;
            }

            try {
                this.setCheckBusy(true);
                this.setCheckStatus(this.t('featheration.checkResolving'));
                if (this.checkResults) this.checkResults.innerHTML = '';
                const publicHex = await this.resolveNostrIdentity(identity);
                await this.loadNostrTools();
                const profilePromise = this.fetchLatestProfile(publicHex).catch(() => ({}));
                const relays = await this.getReadRelays();
                this.setCheckStatus(this.t('featheration.checkFetching', { relays: this.formatNumber(relays.length) }));
                const events = await this.fetchOtherBirderEvents(publicHex, relays);
                const profile = await profilePromise;
                const summary = this.buildOtherBirderSummary(publicHex, profile, events);
                this.renderOtherBirderSummary(summary);
                this.setCheckStatus(this.t('featheration.checkLoaded', {
                    species: this.formatNumber(summary.totalSpecies),
                    observations: this.formatNumber(summary.totalObservations)
                }));
            } catch (error) {
                console.warn('Could not check Nostr birder:', error);
                this.setCheckStatus(error?.message || this.t('featheration.checkFailed'), true);
                if (this.checkResults) this.checkResults.innerHTML = `<p class="featheration-error">${this.escapeHtml(this.t('featheration.checkFailed'))}</p>`;
            } finally {
                this.setCheckBusy(false);
            }
        }

        setCheckBusy(isBusy) {
            // Disable the lookup form while relay queries are active.
            if (this.checkSubmit) this.checkSubmit.disabled = Boolean(isBusy);
            if (this.checkInput) this.checkInput.disabled = Boolean(isBusy);
        }

        setCheckStatus(message, isError = false) {
            // Report check-others progress inside its modal.
            if (!this.checkStatus) return;
            this.checkStatus.textContent = message || '';
            this.checkStatus.classList.toggle('featheration-error-text', Boolean(isError));
        }

        async resolveNostrIdentity(identity) {
            // Accept hex public keys, npub bech32 keys, and NIP-05 names such as user@example.com.
            const value = String(identity || '').trim();
            if (/^[0-9a-f]{64}$/i.test(value)) return value.toLowerCase();
            if (/^npub1/i.test(value)) {
                const tools = await this.loadNostrTools();
                const decoded = tools.nip19.decode(value);
                if (decoded?.type === 'npub' && /^[0-9a-f]{64}$/i.test(decoded.data)) return decoded.data.toLowerCase();
            }
            if (value.includes('@')) return this.resolveNip05ToPubkey(value);
            throw new Error(this.t('featheration.checkInvalidIdentity'));
        }

        async resolveNip05ToPubkey(nip05) {
            // Resolve a NIP-05 identifier through its well-known nostr.json document.
            const raw = String(nip05 || '').trim();
            const [rawNamePart, rawDomainPart] = raw.split('@');
            const namePart = String(rawNamePart || '').trim();
            const domainPart = String(rawDomainPart || '').trim().toLowerCase();
            if (!namePart || !domainPart || !/^[a-z0-9._-]+$/i.test(namePart)) {
                throw new Error(this.t('featheration.checkInvalidIdentity'));
            }
            const response = await fetch(`https://${domainPart}/.well-known/nostr.json?name=${encodeURIComponent(namePart)}`, {
                headers: { Accept: 'application/json' }
            });
            if (!response.ok) throw new Error(this.t('featheration.checkNip05Failed'));
            const data = await response.json();
            const names = data.names || {};
            const lowerName = namePart.toLowerCase();
            const publicHex = names[namePart] || names[lowerName] || names._ || Object.entries(names)
                .find(([key]) => String(key).toLowerCase() === lowerName)?.[1];
            if (!/^[0-9a-f]{64}$/i.test(publicHex || '')) throw new Error(this.t('featheration.checkNip05Failed'));
            return publicHex.toLowerCase();
        }

        async fetchOtherBirderEvents(publicHex, relays) {
            // Fetch only the public Birds.name observed-species summary and self-attested badge events.
            const filters = [
                { kinds: [30078], authors: [publicHex], '#d': ['birds.name:observed-species:v1'], limit: 12 },
                { kinds: [8], authors: [publicHex], limit: 120 },
                { kinds: [10008], authors: [publicHex], limit: 3 }
            ];
            return this.fetchEventsFromRelays(relays, filters, 6500);
        }

        buildOtherBirderSummary(publicHex, profile = {}, events = []) {
            // Convert public Nostr app-data events into the read-only friend overview shown in the modal.
            const latestObservedEvent = events
                .filter(event => Number(event.kind) === 30078 && this.getEventTag(event, 'd') === 'birds.name:observed-species:v1')
                .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0))[0];
            const payload = this.parseJsonContent(latestObservedEvent?.content) || {};
            const species = Array.isArray(payload.species) ? payload.species : [];
            const normalizedSpecies = species
                .map(item => this.normalizeObservedSpeciesItem(item))
                .filter(item => item.scientificName)
                .sort((left, right) => right.observationCount - left.observationCount || left.displayName.localeCompare(right.displayName));
            const badges = this.extractOtherBirderBadges(events);
            const typeStats = this.calculateOtherBirderTypeStats(normalizedSpecies);

            return {
                publicHex,
                profile,
                observedEvent: latestObservedEvent || null,
                species: normalizedSpecies,
                displayNpub: '',
                totalSpecies: Number(payload.totalSpecies) || normalizedSpecies.length,
                totalObservations: Number(payload.totalObservations) || normalizedSpecies.reduce((sum, item) => sum + item.observationCount, 0),
                typeStats,
                badges
            };
        }

        normalizeObservedSpeciesItem(item = {}) {
            // Merge public summary names with the selected-language local label when this browser has it.
            const scientificName = String(item.scientificName || '').trim();
            const record = this.birdLookupByScientificName.get(scientificName.toLowerCase()) || {};
            const englishName = String(item.englishName || record.commonName || '').trim();
            const localName = String(record.localName || item.localName || '').trim();
            return {
                scientificName,
                englishName,
                localName,
                displayName: localName || englishName || scientificName,
                observationCount: Math.max(Number(item.observationCount) || 0, 1),
                record: { ...record, scientificName, commonName: englishName, localName }
            };
        }

        extractOtherBirderBadges(events = []) {
            // Match Birds.name NIP-58 award events to the local badge catalog for names and images.
            const catalog = this.getBadgeCatalog();
            const byId = new Map(catalog.map(badge => [badge.id, badge]));
            const byCode = new Map(catalog.map(badge => [`${badge.track}|${badge.code}`, badge]));
            const badges = [];
            const seen = new Set();
            events
                .filter(event => Number(event.kind) === 8)
                .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0))
                .forEach(event => {
                    const badgeRef = this.getEventTag(event, 'a') || '';
                    const badgeId = badgeRef.split(':').slice(2).join(':');
                    const track = this.getEventTag(event, 'achievement') || '';
                    const code = this.getEventTag(event, 'badge_code') || '';
                    const badge = byId.get(badgeId) || byCode.get(`${track}|${code}`);
                    if (!badge || seen.has(badge.id)) return;
                    seen.add(badge.id);
                    badges.push({
                        ...badge,
                        eventId: event.id,
                        awardedAt: new Date(Number(event.created_at || 0) * 1000).toISOString()
                    });
                });
            return badges;
        }

        calculateOtherBirderTypeStats(species = []) {
            // Count broad bird types from the same category heuristics used by Birds.name badges.
            const counters = {
                water: { key: 'water', label: this.t('nav.waterbirds'), count: 0 },
                predator: { key: 'predator', label: this.t('nav.birdsOfPrey'), count: 0 },
                song: { key: 'song', label: this.t('nav.songbirds'), count: 0 },
                parrot: { key: 'parrot', label: this.t('nav.parrots'), count: 0 },
                game: { key: 'game', label: this.t('nav.gamebirds'), count: 0 },
                other: { key: 'other', label: this.t('featheration.checkOtherType'), count: 0 }
            };
            species.forEach(item => {
                const category = this.getBirdCategory(item.record || item) || 'other';
                counters[category].count += 1;
            });
            return Object.values(counters).filter(item => item.count > 0);
        }

        renderOtherBirderTypePie(typeStats = []) {
            // Render broad observed-bird categories as a CSS pie chart with an accessible legend.
            const total = typeStats.reduce((sum, item) => sum + item.count, 0);
            if (!total) return '';
            const colors = {
                water: '#3f88c5',
                predator: '#b84a3a',
                song: '#65a765',
                parrot: '#d9a441',
                game: '#8b6fc6',
                other: '#8a9690'
            };
            let cursor = 0;
            const segments = typeStats.map(item => {
                const start = cursor;
                cursor += (item.count / total) * 100;
                return `${colors[item.key] || colors.other} ${start.toFixed(3)}% ${cursor.toFixed(3)}%`;
            }).join(', ');

            return `
                <div class="featheration-check-pie-wrap">
                    <div class="featheration-check-pie"
                        style="background: conic-gradient(${this.escapeHtml(segments)});"
                        role="img"
                        aria-label="${this.escapeHtml(this.t('featheration.checkTypeStats'))}">
                    </div>
                    <div class="featheration-check-pie-legend">
                        ${typeStats.map(item => {
                            const percent = Math.round((item.count / total) * 100);
                            return `
                                <span>
                                    <i style="background:${this.escapeHtml(colors[item.key] || colors.other)}"></i>
                                    <strong>${this.escapeHtml(item.label)}</strong>
                                    <small>${this.escapeHtml(this.formatNumber(item.count))} · ${this.escapeHtml(String(percent))}%</small>
                                </span>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }

        getBirdCategory(record = {}) {
            // Classify observed species into broad Birds.name categories using taxonomy names and common-name fallbacks.
            const text = this.normalizeText([
                record.scientificName,
                record.commonName,
                record.localName,
                record.order,
                record.family,
                record.familyComName
            ].filter(Boolean).join(' '));
            if (/(anseriformes|gaviiformes|podicipediformes|pelecaniformes|suliformes|charadriiformes|ardeidae|anatidae|duck|goose|swan|gull|tern|heron|egret|ibis|stork|pelican|cormorant|grebe|loon|sandpiper|plover|rail|coot)/.test(text)) return 'water';
            if (/(accipitriformes|falconiformes|strigiformes|accipitridae|falconidae|strigidae|hawk|eagle|falcon|kite|harrier|buzzard|vulture|owl|osprey|raptor)/.test(text)) return 'predator';
            if (/(psittaciformes|psittacidae|cockatoo|parrot|parakeet|lorikeet|lovebird|macaw|rosella)/.test(text)) return 'parrot';
            if (/(galliformes|phasianidae|odontophoridae|numididae|megapodiidae|turkey|grouse|quail|pheasant|partridge|guineafowl|chachalaca|curassow)/.test(text)) return 'game';
            if (/(passeriformes|warbler|sparrow|finch|thrush|flycatcher|wren|swallow|lark|tit|babbler|oriole|starling|vireo|pipit|buntting|bunting)/.test(text)) return 'song';
            return '';
        }

        renderOtherBirderSummary(summary) {
            // Render profile, observation totals, type stats, badges, and clickable observed species.
            if (!this.checkResults) return;
            const profileName = this.getProfileName(summary.profile || {}, summary.publicHex);
            const avatar = this.getProfileImageUrl(summary.profile) || 'img/origami_bird_B.png';
            const nip05 = this.getProfileNip05(summary.profile || {});
            const npub = this.toNpub(summary.publicHex) || this.formatNpub(summary.publicHex);
            this.checkResults.innerHTML = `
                <article class="featheration-check-profile">
                    <img src="${this.escapeHtml(avatar)}" alt="" loading="lazy">
                    <div>
                        <strong>${this.escapeHtml(profileName)}</strong>
                        ${nip05 ? `<small>${this.escapeHtml(nip05)}</small>` : ''}
                        <code>${this.escapeHtml(npub)}</code>
                    </div>
                </article>
                <div class="featheration-check-metrics">
                    <span><strong>${this.escapeHtml(this.formatNumber(summary.totalSpecies))}</strong><small>${this.escapeHtml(this.t('featheration.checkSpecies'))}</small></span>
                    <span><strong>${this.escapeHtml(this.formatNumber(summary.totalObservations))}</strong><small>${this.escapeHtml(this.t('featheration.checkObservations'))}</small></span>
                </div>
                ${summary.typeStats.length ? `
                    <section class="featheration-check-section">
                        <h3>${this.escapeHtml(this.t('featheration.checkTypeStats'))}</h3>
                        ${this.renderOtherBirderTypePie(summary.typeStats)}
                    </section>
                ` : ''}
                ${summary.badges.length ? `
                    <section class="featheration-check-section">
                        <h3>${this.escapeHtml(this.t('featheration.checkAchievements'))}</h3>
                        <div class="featheration-check-badges">
                            ${summary.badges.map(badge => `
                                <article class="featheration-check-badge">
                                    <img src="${this.escapeHtml(badge.image)}" alt="${this.escapeHtml(badge.name)}" loading="lazy">
                                    <span>${this.escapeHtml(badge.name)}</span>
                                </article>
                            `).join('')}
                        </div>
                    </section>
                ` : ''}
                <section class="featheration-check-section">
                    <h3>${this.escapeHtml(this.t('featheration.checkSpeciesList'))}</h3>
                    ${summary.species.length ? `
                        <div class="featheration-check-species-list">
                            ${summary.species.map(item => this.renderOtherBirderSpeciesRow(item)).join('')}
                        </div>
                    ` : `<p class="featheration-check-empty">${this.escapeHtml(this.t('featheration.checkNoPublicSpecies'))}</p>`}
                </section>
            `;
        }

        renderOtherBirderSpeciesRow(item) {
            // Render one observed species row with a local thumbnail and a bird-modal click target.
            return `
                <button class="featheration-check-species" type="button" data-check-bird="${this.escapeHtml(item.scientificName)}">
                    <img class="featheration-check-species-image bird-group-species-image"
                        src="${this.escapeHtml(this.getLocalBirdImageUrl(item.record || item))}"
                        alt="" loading="lazy"
                        data-bird-image-key="${this.escapeHtml(this.localBirdImageKey(item.scientificName))}">
                    <span>
                        <strong>${this.escapeHtml(item.displayName)}</strong>
                        <small>${this.escapeHtml(item.scientificName)}${item.englishName && item.englishName !== item.displayName ? ` · ${this.escapeHtml(item.englishName)}` : ''}</small>
                    </span>
                    <em>${this.escapeHtml(this.formatNumber(item.observationCount))}x</em>
                </button>
            `;
        }

        async handleCheckResultsClick(event) {
            // Open the full bird details modal from a friend's public species list.
            const speciesButton = event.target.closest('[data-check-bird]');
            if (!speciesButton) return;
            event.preventDefault();
            await this.openBirdDetailsModal(speciesButton.dataset.checkBird);
        }

        getEventTag(event, name) {
            // Read the first matching tag value from a Nostr event.
            return (event?.tags || []).find(tag => tag[0] === name)?.[1] || '';
        }

        parseJsonContent(content) {
            // Parse public app-data JSON defensively because relay content is user-controlled.
            try {
                return JSON.parse(content || '{}');
            } catch (error) {
                return null;
            }
        }

        getBadgeCatalog() {
            // Mirror the Birds.name badge catalog so public NIP-58 award events can be displayed without fetching definitions.
            return [
                ...[
                    ['B10A', 10],
                    ['B50A', 50],
                    ['B100A', 100],
                    ['B250A', 250],
                    ['B500A', 500]
                ].map(([code, threshold]) => ({
                    id: `birds-name-unique-${code.toLowerCase()}`,
                    code,
                    track: 'unique',
                    threshold,
                    name: `Birds.name ${threshold} unique birds`,
                    image: `img/badges/for_unique_bird_speciments/${code}.png`
                })),
                ...this.buildBadgeCategoryCatalog('water', 'Waterbirds', 'Waterbirds', [['B3W', 3], ['B7W', 7], ['B15W', 15], ['B21W', 21], ['B42W', 42]]),
                ...this.buildBadgeCategoryCatalog('predator', 'Birds of Prey', 'Birds_of_Prey', [['B3P', 3], ['B7P', 7], ['B15P', 15], ['B21P', 21], ['B42P', 42]]),
                ...this.buildBadgeCategoryCatalog('song', 'Songbirds', 'Songbirds', [['B3S', 3], ['B7S', 7], ['B15S', 15], ['B21S', 21], ['B42S', 42]]),
                ...this.buildBadgeCategoryCatalog('parrot', 'Parrots', 'Parrots', [['B3P', 3], ['B7P', 7], ['B15P', 15], ['B21P', 21], ['B42P', 42]]),
                ...this.buildBadgeCategoryCatalog('game', 'Gamebirds', 'Gamebirds', [['B3G', 3], ['B7G', 7], ['B15G', 15], ['B21G', 21], ['B42G', 42]]),
                ...[
                    ['B7NT', 'nt', 7],
                    ['B5V', 'vu', 5],
                    ['B3E', 'en', 3],
                    ['B1C', 'cr', 1]
                ].map(([code, status, threshold]) => ({
                    id: `birds-name-iucn-${code.toLowerCase()}`,
                    code,
                    track: 'iucn',
                    status,
                    threshold,
                    name: `Birds.name ${code} conservation badge`,
                    image: `img/badges/IUCN_statuses_badges_for_seeing_volnurable_bird_species/${code}.png`
                }))
            ];
        }

        buildBadgeCategoryCatalog(category, title, folder, entries) {
            // Build category badge records from the generated badge image folders.
            return entries.map(([code, threshold]) => ({
                id: `birds-name-${category}-${code.toLowerCase()}`,
                code,
                track: 'category',
                category,
                threshold,
                name: `Birds.name ${threshold} ${title}`,
                image: `img/badges/${folder}/${code}.png`
            }));
        }

        async openBirdDetailsModal(scientificName) {
            // Open the real encyclopedia bird details modal in-place through an iframe bridge.
            const cleanScientificName = String(scientificName || '').trim();
            if (!cleanScientificName || !this.birdModal || !this.birdDetailsFrame) return;
            const record = this.birdLookupByScientificName.get(cleanScientificName.toLowerCase()) || { scientificName: cleanScientificName };
            this.birdModal.hidden = false;
            document.body.classList.add('featheration-modal-open');
            if (this.birdModalTitle) this.birdModalTitle.textContent = record.localName || record.commonName || record.scientificName;
            this.birdDetailsFrame.src = `index.html?embed=bird&bird=${encodeURIComponent(record.scientificName)}`;
        }

        closeBirdDetailsModal() {
            // Close the bird details modal and keep the user on the Featheration page.
            if (!this.birdModal) return;
            this.birdModal.hidden = true;
            if (this.birdDetailsFrame) this.birdDetailsFrame.removeAttribute('src');
            document.body.classList.remove('featheration-modal-open');
        }

        handleBirdDetailsMessage(event) {
            // Let the embedded encyclopedia modal ask Featheration to close the outer iframe modal.
            if (event.origin !== window.location.origin) return;
            if (event.source !== this.birdDetailsFrame?.contentWindow) return;
            if (event.data?.type === 'birds-name-bird-modal-closed') this.closeBirdDetailsModal();
        }

        showBirdGroupCloud(anchor, groupTerm) {
            // Spread matching species into non-overlapping viewport cells near the clicked blue group keyword.
            const records = this.birdGroupLookup.get(this.normalizeText(groupTerm)) || [];
            if (!records.length) return;
            this.closeBirdGroupCloud();
            const anchorBox = anchor.getBoundingClientRect();
            const centerX = anchorBox.left + anchorBox.width / 2;
            const centerY = anchorBox.top + anchorBox.height / 2;
            const layout = this.createBirdGroupCloudLayout(records.length, centerX, centerY);
            const cloud = document.createElement('div');
            cloud.className = 'bird-group-cloud';
            cloud.setAttribute('role', 'dialog');
            cloud.setAttribute('aria-label', this.t('featheration.chooseBirdGroup'));
            cloud.style.setProperty('--bird-group-bubble-size', `${layout.bubbleSize}px`);
            cloud.style.setProperty('--bird-group-scroll-height', `${layout.scrollHeight}px`);
            cloud.innerHTML = `
                <div class="bird-group-cloud-title">
                    <strong>${this.escapeHtml(groupTerm)}</strong>
                    <small>${this.escapeHtml(this.t('featheration.groupSpeciesCount', { count: records.length }))}</small>
                    <button type="button" class="bird-group-cloud-close" aria-label="${this.escapeHtml(this.t('action.cancel'))}">&times;</button>
                </div>
                <div class="bird-group-cloud-items"></div>
            `;
            document.body.appendChild(cloud);
            const items = cloud.querySelector('.bird-group-cloud-items');
            records.forEach((record, index) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'bird-group-species';
                button.dataset.birdGroupSpecies = record.scientificName;
                button.innerHTML = `
                    <img class="bird-group-species-image" src="${this.escapeHtml(this.getLocalBirdImageUrl(record, 0))}" alt="" loading="lazy" data-bird-image-key="${this.escapeHtml(this.localBirdImageKey(record.scientificName))}" data-bird-image-index="0">
                    <span>${this.escapeHtml(record.commonName || record.localName || record.scientificName)}</span>
                `;
                const position = layout.positions[index];
                button.style.left = `${position.x}px`;
                button.style.top = `${position.y}px`;
                items.appendChild(button);
            });
            cloud.addEventListener('click', event => this.handleBirdGroupCloudClick(event));
            cloud.addEventListener('error', event => this.handleLocalBirdImageError(event), true);
            cloud.querySelector('.bird-group-cloud-close')?.addEventListener('click', () => this.closeBirdGroupCloud());
            this.birdGroupOverlay = cloud;
        }

        async handleBirdGroupCloudClick(event) {
            // Open a selected species from the temporary blue group cloud.
            const speciesButton = event.target.closest('[data-bird-group-species]');
            if (!speciesButton) return;
            event.preventDefault();
            event.stopPropagation();
            this.closeBirdGroupCloud();
            await this.openBirdDetailsModal(speciesButton.dataset.birdGroupSpecies);
        }

        createBirdGroupCloudLayout(count, centerX, centerY) {
            // Calculate a non-overlapping grid with a minimum bubble size; extra rows continue below the viewport.
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 360;
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 640;
            const margin = viewportWidth < 620 ? 8 : 14;
            const topOffset = viewportWidth < 620 ? 88 : 76;
            const minBubbleSize = viewportWidth < 620 ? 58 : 72;
            const maxBubbleSize = viewportWidth < 620 ? 86 : 104;
            const gap = viewportWidth < 620 ? 10 : 14;
            const availableWidth = Math.max(240, viewportWidth - margin * 2);
            const idealColumns = Math.ceil(Math.sqrt(count * (availableWidth / Math.max(240, viewportHeight - topOffset))));
            const maxColumnsAtMinSize = Math.max(1, Math.floor((availableWidth + gap) / (minBubbleSize + gap)));
            const columns = Math.max(1, Math.min(maxColumnsAtMinSize, idealColumns));
            const rows = Math.max(1, Math.ceil(count / columns));
            const cellWidth = availableWidth / columns;
            const bubbleSize = Math.floor(Math.max(minBubbleSize, Math.min(maxBubbleSize, cellWidth - gap)));
            const rowHeight = bubbleSize + gap;
            const cells = [];
            for (let row = 0; row < rows; row += 1) {
                for (let column = 0; column < columns; column += 1) {
                    const x = margin + column * cellWidth + (cellWidth - bubbleSize) / 2;
                    const y = topOffset + row * rowHeight;
                    const distance = Math.hypot(x - centerX, y - centerY);
                    cells.push({ x, y, distance });
                }
            }
            return {
                bubbleSize,
                scrollHeight: topOffset + rows * rowHeight + margin,
                positions: cells
                    .sort((a, b) => a.distance - b.distance)
                    .slice(0, count)
            };
        }

        handleLocalBirdImageError(event) {
            // Fall back to the origami bird when a generated local thumbnail is unavailable.
            const image = event.target.closest?.('.bird-group-species-image');
            if (!image) return;
            image.removeAttribute('data-bird-image-key');
            image.src = 'img/origami_bird_B.png';
        }

        getLocalBirdImageUrl(record) {
            // Resolve generated thumbnail images into a stable browser path for species bubbles.
            const key = this.localBirdImageKey(record?.scientificName || record);
            if (!key) return 'img/origami_bird_B.png';
            return `data/bird-images/thumbnails/${encodeURIComponent(key)}.webp`;
        }

        localBirdImageKey(scientificName) {
            // Normalize scientific names into filesystem-friendly lowercase image names.
            return String(scientificName || '')
                .toLowerCase()
                .normalize('NFKD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
        }

        closeBirdGroupCloud() {
            // Remove the temporary broad-group chooser without affecting the feed or bird details modal.
            this.birdGroupOverlay?.remove();
            this.birdGroupOverlay = null;
        }

        toggleNoteMenu(menu) {
            // Open one three-dot menu at a time to avoid overlapping panels on small screens.
            const panel = menu?.querySelector('.featheration-menu-panel');
            if (!panel) return;
            const willOpen = panel.hidden;
            this.closeAllMenus();
            panel.hidden = !willOpen;
        }

        closeAllMenus() {
            // Hide every card overflow menu.
            this.feed?.querySelectorAll('.featheration-menu-panel').forEach(panel => {
                panel.hidden = true;
            });
        }

        async publishReaction(event, emoji, button) {
            // Publish a standard kind-7 like reaction while the UI presents it as a feather.
            const publicHex = localStorage.getItem('birdNostrPublicKeyHex');
            if (publicHex && this.reactionSummary.get(event.id)?.has(publicHex)) return;
            const unsigned = this.baseEvent(7, emoji, [
                ['e', event.id],
                ['p', event.pubkey],
                ['k', String(event.kind || 1)]
            ]);
            const signed = await this.signAndPublish(unsigned, button, this.t('featheration.likeSent'));
            if (signed?.pubkey) {
                if (!this.reactionSummary.has(event.id)) this.reactionSummary.set(event.id, new Set());
                this.reactionSummary.get(event.id).add(signed.pubkey);
                this.renderFeed(this.lastEvents);
            }
        }

        async publishRepost(event, button) {
            // Publish a standard kind-6 repost that references the original note.
            const unsigned = this.baseEvent(6, JSON.stringify(event), [
                ['e', event.id],
                ['p', event.pubkey]
            ]);
            await this.signAndPublish(unsigned, button, this.t('featheration.repostSent'));
        }

        async publishReply(event, button) {
            // Ask for reply text, then publish a kind-1 reply linked to the original note.
            const content = window.prompt(this.t('featheration.replyPrompt'));
            if (!content?.trim()) return;
            const unsigned = this.baseEvent(1, content.trim(), [
                ['e', event.id, '', 'reply'],
                ['p', event.pubkey]
            ]);
            await this.signAndPublish(unsigned, button, this.t('featheration.replySent'));
        }

        openComposeModal() {
            // Open the public-note composer and disable publishing until a Nostr identity is available.
            if (!this.composeModal) return;
            const loggedIn = Boolean(localStorage.getItem('birdNostrPublicKeyHex'));
            this.composeModal.hidden = false;
            document.body.classList.add('featheration-modal-open');
            if (this.composeLoginWarning) this.composeLoginWarning.hidden = loggedIn;
            if (this.composePublish) this.composePublish.disabled = !loggedIn;
            if (loggedIn) {
                window.setTimeout(() => this.composeText?.focus(), 30);
            } else {
                this.setStatus(this.t('featheration.composeLoginRequired'), true);
            }
        }

        closeComposeModal() {
            // Close the composer without clearing text so accidental backdrop taps do not lose drafts.
            if (!this.composeModal) return;
            this.composeModal.hidden = true;
            document.body.classList.remove('featheration-modal-open');
        }

        async publishComposeNote() {
            // Publish a standalone public kind-1 note, optionally appending a direct media URL.
            const content = this.buildComposeContent();
            if (!content) {
                this.setStatus(this.t('featheration.composeEmpty'), true);
                this.composeText?.focus();
                return;
            }
            const unsigned = this.baseEvent(1, content, []);
            const signed = await this.signAndPublish(unsigned, this.composePublish, this.t('featheration.composeSent'));
            if (!signed) return;
            this.composeText.value = '';
            this.closeComposeModal();
            this.addEventIfRelevant(signed);
            this.renderFeed(this.lastEvents);
        }

        buildComposeContent() {
            // Publish the textarea exactly as the author composed it, including any uploaded media URLs.
            return this.composeText?.value?.trim() || '';
        }

        async uploadComposeImageToCloudinary() {
            // Upload one selected image through Cloudinary's unsigned browser upload endpoint.
            const cloudName = this.normalizeCloudinaryCloudName(CLOUDINARY_CLOUD_NAME);
            const uploadPreset = String(CLOUDINARY_UNSIGNED_UPLOAD_PRESET || '').trim();
            const file = this.cloudinaryFile?.files?.[0];
            if (!cloudName || !uploadPreset) {
                this.setCloudinaryStatus(this.t('featheration.cloudinaryNotConfigured'), true);
                return;
            }
            if (!file) {
                this.setCloudinaryStatus(this.t('featheration.cloudinaryMissingFile'), true);
                return;
            }
            if (!file.type.startsWith('image/')) {
                this.setCloudinaryStatus(this.t('featheration.cloudinaryInvalidFile'), true);
                return;
            }

            this.setCloudinaryStatus(this.t('featheration.cloudinaryUploading'));
            if (this.cloudinaryUpload) this.cloudinaryUpload.disabled = true;
            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', uploadPreset);
                const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`, {
                    method: 'POST',
                    body: formData
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok || !payload.secure_url) {
                    throw new Error(payload.error?.message || this.t('featheration.cloudinaryUploadFailed'));
                }
                this.appendComposeMediaUrl(payload.secure_url);
                this.setCloudinaryStatus(this.t('featheration.cloudinaryUploaded'));
            } catch (error) {
                console.warn('Cloudinary upload failed:', error);
                this.setCloudinaryStatus(error?.message || this.t('featheration.cloudinaryUploadFailed'), true);
            } finally {
                if (this.cloudinaryUpload) this.cloudinaryUpload.disabled = false;
            }
        }

        appendComposeMediaUrl(url) {
            // Add uploaded media links to the note body so multiple uploads form a gallery-style note.
            if (!this.composeText || !url) return;
            const currentText = this.composeText.value.trimEnd();
            this.composeText.value = currentText ? `${currentText}\n\n${url}` : url;
            this.composeText.focus();
            this.composeText.selectionStart = this.composeText.selectionEnd = this.composeText.value.length;
        }

        setCloudinaryStatus(message, isError = false) {
            // Show upload progress or setup errors inside the compose modal.
            if (!this.cloudinaryStatus) return;
            this.cloudinaryStatus.textContent = message || '';
            this.cloudinaryStatus.classList.toggle('error', Boolean(isError));
        }

        normalizeCloudinaryCloudName(value) {
            // Accept either a raw cloud name or pasted res.cloudinary.com URL and keep only the cloud segment.
            const rawValue = String(value || '').trim();
            const match = rawValue.match(/res\.cloudinary\.com\/([^/?#]+)/i);
            return (match ? match[1] : rawValue)
                .replace(/^https?:\/\//i, '')
                .replace(/\/.*$/, '')
                .trim();
        }

        baseEvent(kind, content, tags) {
            // Create the unsigned Nostr event shell using the logged-in public key.
            return {
                kind,
                content,
                tags,
                created_at: Math.floor(Date.now() / 1000),
                pubkey: localStorage.getItem('birdNostrPublicKeyHex')
            };
        }

        async signAndPublish(unsigned, button, successMessage) {
            // Sign through NIP-07 or the temporary private-key session and send to read relays.
            try {
                button.disabled = true;
                const signed = await this.signEvent(unsigned);
                const relays = await this.getReadRelays();
                const result = await this.publishToRelays(signed, relays);
                this.setStatus(`${successMessage} ${this.t('featheration.publishedToRelays', { count: this.formatNumber(result) })}`);
                return signed;
            } catch (error) {
                console.warn('Could not publish Nostr action:', error);
                this.setStatus(error?.message || this.t('featheration.publishFailed'), true);
                return null;
            } finally {
                button.disabled = false;
            }
        }

        async signEvent(unsigned) {
            // Prefer a browser signer, then NIP-46, then the temporary session private key if present.
            if (window.nostr?.signEvent) return window.nostr.signEvent(unsigned);
            if (this.hasNostrConnectSession()) return this.signEventWithNostrConnect(unsigned);
            const privateHex = sessionStorage.getItem('birdNostrSessionPrivateKeyHex');
            if (!privateHex) throw new Error(this.t('nostr.signerRequired'));
            const tools = await this.loadNostrTools();
            return tools.finalizeEvent(unsigned, this.hexToBytes(privateHex));
        }

        hasNostrConnectSession() {
            // Detect a connected NIP-46 signer created by the main Featheration login modal.
            return Boolean(
                localStorage.getItem('birdNostrConnectClientPrivateKeyHex')
                && localStorage.getItem('birdNostrConnectClientPubkey')
                && localStorage.getItem('birdNostrConnectSignerPubkey')
            );
        }

        getNostrConnectSession() {
            // Read the disposable NIP-46 client key, signer public key, and transport relays.
            let relays = [];
            try {
                relays = JSON.parse(localStorage.getItem('birdNostrConnectRelays') || '[]');
            } catch (error) {
                relays = [];
            }
            const clientPrivateHex = localStorage.getItem('birdNostrConnectClientPrivateKeyHex') || '';
            const clientPubkey = localStorage.getItem('birdNostrConnectClientPubkey') || '';
            const signerPubkey = localStorage.getItem('birdNostrConnectSignerPubkey') || '';
            const sessionRelays = Array.isArray(relays) && relays.length ? relays : this.getDefaultRelays();
            if (!clientPrivateHex || !clientPubkey || !signerPubkey) return null;
            return { clientPrivateHex, clientPubkey, signerPubkey, relays: sessionRelays };
        }

        async signEventWithNostrConnect(event) {
            // Ask the remote NIP-46 signer to sign this public feed action.
            const requestEvent = {
                kind: event.kind,
                created_at: event.created_at || Math.floor(Date.now() / 1000),
                tags: event.tags || [],
                content: event.content || ''
            };
            const result = await this.sendNostrConnectRequest('sign_event', [JSON.stringify(requestEvent)]);
            const signedEvent = typeof result === 'string' ? JSON.parse(result) : result;
            if (!signedEvent?.id || !signedEvent?.sig || !signedEvent?.pubkey) {
                throw new Error(this.t('nostr.connectSignFailed'));
            }
            return signedEvent;
        }

        async sendNostrConnectRequest(method, params = []) {
            // Send one encrypted NIP-46 request and wait for its encrypted response.
            const session = this.getNostrConnectSession();
            if (!session) throw new Error(this.t('nostr.connectMissing'));
            const tools = await this.loadNostrTools();
            const requestId = crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const content = await this.encryptNostrConnectPayload({ id: requestId, method, params }, session.clientPrivateHex, session.signerPubkey);
            const requestEvent = tools.finalizeEvent({
                kind: 24133,
                pubkey: session.clientPubkey,
                created_at: Math.floor(Date.now() / 1000),
                tags: [['p', session.signerPubkey]],
                content
            }, this.hexToBytes(session.clientPrivateHex));
            const responsePromise = this.waitForNostrConnectResponse(requestId, session);
            const reachedRelays = await this.publishToRelays(requestEvent, session.relays);
            if (!reachedRelays) throw new Error(this.t('nostr.connectRelayFailed'));
            return responsePromise;
        }

        waitForNostrConnectResponse(requestId, session) {
            // Listen for matching NIP-46 response events addressed to the disposable client key.
            return new Promise((resolve, reject) => {
                const sockets = [];
                let settled = false;
                const finish = (callback, value) => {
                    if (settled) return;
                    settled = true;
                    sockets.forEach(socket => {
                        try { socket.close(); } catch (error) {}
                    });
                    callback(value);
                };
                const timeout = window.setTimeout(() => finish(reject, new Error(this.t('nostr.connectTimeout'))), 60000);
                session.relays.forEach(relay => {
                    const socket = new WebSocket(relay);
                    sockets.push(socket);
                    socket.addEventListener('open', () => {
                        socket.send(JSON.stringify(['REQ', `bn-nip46-${requestId}`, {
                            kinds: [24133],
                            '#p': [session.clientPubkey],
                            since: Math.floor(Date.now() / 1000) - 10
                        }]));
                    });
                    socket.addEventListener('message', async message => {
                        try {
                            const data = JSON.parse(message.data);
                            const event = data[0] === 'EVENT' ? data[2] : null;
                            if (!event || event.pubkey !== session.signerPubkey) return;
                            const payload = await this.decryptNostrConnectPayload(event, session.clientPrivateHex, session.signerPubkey);
                            if (payload?.id !== requestId) return;
                            window.clearTimeout(timeout);
                            payload.error ? finish(reject, new Error(String(payload.error))) : finish(resolve, payload.result);
                        } catch (error) {
                            console.warn('Invalid NIP-46 feed response:', error);
                        }
                    });
                    socket.addEventListener('error', () => {});
                });
            });
        }

        async encryptNostrConnectPayload(payload, clientPrivateHex, remotePubkey) {
            // Encrypt a NIP-46 request with NIP-44 using the disposable client key.
            const tools = await this.loadNostrTools();
            const conversationKey = tools.nip44.v2.utils.getConversationKey(this.hexToBytes(clientPrivateHex), remotePubkey);
            return tools.nip44.v2.encrypt(JSON.stringify(payload), conversationKey);
        }

        async decryptNostrConnectPayload(event, clientPrivateHex, remotePubkey) {
            // Decrypt a NIP-46 signer response and parse its JSON payload.
            const tools = await this.loadNostrTools();
            const conversationKey = tools.nip44.v2.utils.getConversationKey(this.hexToBytes(clientPrivateHex), remotePubkey);
            return JSON.parse(tools.nip44.v2.decrypt(event.content, conversationKey));
        }

        publishToRelays(event, relays) {
            // Send one signed event to each relay and count successful OK acknowledgements.
            return Promise.allSettled(relays.map(relay => this.publishToRelay(event, relay)))
                .then(results => results.filter(result => result.status === 'fulfilled' && result.value).length);
        }

        publishToRelay(event, relay) {
            // Publish to a single relay and resolve true only when the relay acknowledges the event.
            return new Promise(resolve => {
                let socket;
                const timer = window.setTimeout(() => resolve(false), 6500);
                const finish = value => {
                    window.clearTimeout(timer);
                    try {
                        socket?.close();
                    } catch (error) {
                        console.warn(`Could not close publish relay ${relay}:`, error);
                    }
                    resolve(value);
                };
                try {
                    socket = new WebSocket(relay);
                    socket.addEventListener('open', () => socket.send(JSON.stringify(['EVENT', event])));
                    socket.addEventListener('message', message => {
                        try {
                            const data = JSON.parse(message.data);
                            if (data[0] === 'OK' && data[1] === event.id) finish(Boolean(data[2]));
                        } catch (error) {
                            finish(false);
                        }
                    });
                    socket.addEventListener('error', () => finish(false));
                } catch (error) {
                    finish(false);
                }
            });
        }

        async loadNostrTools() {
            // Load nostr-tools lazily so read-only visitors do not download signing code.
            if (!this.nostrTools) this.nostrTools = await import(NOSTR_TOOLS_URL);
            return this.nostrTools;
        }

        getHiddenUsers() {
            // Read hidden-user moderation choices from localStorage for backup compatibility.
            try {
                const parsed = JSON.parse(localStorage.getItem(HIDDEN_USERS_KEY) || '{}');
                return parsed && typeof parsed === 'object' ? parsed : {};
            } catch (error) {
                return {};
            }
        }

        saveHiddenUsers(hiddenUsers) {
            // Persist hidden-user choices under one localStorage key.
            localStorage.setItem(HIDDEN_USERS_KEY, JSON.stringify(hiddenUsers || {}));
        }

        hideUser(pubkey) {
            // Collapse this author's future notes locally without deleting anything from Nostr.
            const hiddenUsers = this.getHiddenUsers();
            hiddenUsers[pubkey] = { hiddenAt: new Date().toISOString() };
            this.saveHiddenUsers(hiddenUsers);
            this.setStatus(this.t('featheration.userHidden'));
        }

        unhideUser(pubkey) {
            // Restore this author in the local feed.
            const hiddenUsers = this.getHiddenUsers();
            delete hiddenUsers[pubkey];
            this.saveHiddenUsers(hiddenUsers);
            this.setStatus(this.t('featheration.userUnhidden'));
        }

        getProfileName(profile, pubkey) {
            // Prefer display names, then fallback to a shortened Nostr public key.
            return profile.display_name || profile.name || this.formatNpub(pubkey);
        }

        getProfileNip05(profile) {
            // Display a compact NIP-05 identifier from metadata without trying to verify it client-side.
            const nip05 = String(profile?.nip05 || '').trim();
            if (!nip05 || nip05.length > 120 || !nip05.includes('@')) return '';
            return nip05;
        }

        formatNpub(pubkey) {
            // Use a compact npub-like display until nostr-tools is loaded for signing.
            if (!pubkey) return 'npub...';
            return `npub…${String(pubkey).slice(-8)}`;
        }

        toNpub(pubkey) {
            // Encode a real Nostr bech32 npub when nostr-tools has already been loaded.
            try {
                if (!/^[0-9a-f]{64}$/i.test(pubkey || '') || !this.nostrTools?.nip19?.npubEncode) return '';
                return this.nostrTools.nip19.npubEncode(String(pubkey).toLowerCase());
            } catch (error) {
                return '';
            }
        }

        eventDate(event) {
            // Convert Nostr seconds to a JavaScript Date safely.
            return new Date(Number(event.created_at || 0) * 1000 || Date.now());
        }

        relativeTime(event) {
            // Display a short local date for older notes and relative minutes/hours for recent notes.
            const date = this.eventDate(event);
            const diffSeconds = Math.max(1, Math.round((Date.now() - date.getTime()) / 1000));
            if (diffSeconds < 3600) return this.t('featheration.minutesAgo', { count: Math.round(diffSeconds / 60) || 1 });
            if (diffSeconds < 86400) return this.t('featheration.hoursAgo', { count: Math.round(diffSeconds / 3600) });
            return date.toLocaleDateString();
        }

        highlightText(text) {
            // Highlight bird names first in purple, then hashtags and normal search terms without nested spans.
            const source = String(text || '');
            const matches = [
                ...this.collectBirdHighlightMatches(source),
                ...this.collectBirdGroupMatches(source),
                ...this.collectHashtagMatches(source),
                ...this.collectFocusMatches(source)
            ].sort((a, b) => a.start - b.start || b.priority - a.priority || (b.end - b.start) - (a.end - a.start));
            const accepted = [];
            let cursor = 0;
            matches.forEach(match => {
                if (match.start < cursor || match.end <= match.start) return;
                accepted.push(match);
                cursor = match.end;
            });
            if (!accepted.length) return this.escapeHtml(source);
            let html = '';
            cursor = 0;
            accepted.forEach(match => {
                html += this.escapeHtml(source.slice(cursor, match.start));
                html += this.renderHighlightedMatch(match, source.slice(match.start, match.end));
                cursor = match.end;
            });
            return html + this.escapeHtml(source.slice(cursor));
        }

        renderHighlightedMatch(match, text) {
            // Make bird-name matches clickable while keeping normal focus and hashtag highlights passive.
            const safeText = this.escapeHtml(text);
            if (match.className === 'bird-group-match' && match.groupTerm) {
                return `<button class="bird-group-match bird-group-trigger" type="button" data-bird-group-term="${this.escapeHtml(match.groupTerm)}" title="${this.escapeHtml(this.t('featheration.chooseBirdGroup'))}">${safeText}</button>`;
            }
            if (match.className !== 'bird-name-match' || !match.scientificName) {
                return `<span class="${match.className}">${safeText}</span>`;
            }
            return `<button class="bird-name-match" type="button" data-bird-scientific-name="${this.escapeHtml(match.scientificName)}" title="${this.escapeHtml(this.t('featheration.openBirdDetails'))}">${safeText}</button>`;
        }

        collectBirdHighlightMatches(source) {
            // Find scientific and local bird names, including multi-word names joined into hashtags.
            const matches = [];
            const sourceNormalized = this.normalizeText(source);
            const sourceTokens = this.getNormalizedTokens(source);
            const sourceJoined = sourceNormalized.replace(/\s+/g, '');
            const candidateKeys = new Set(sourceTokens);
            this.getContentHashtags(source).forEach(tag => {
                candidateKeys.add(tag);
                candidateKeys.add(tag.replace(/[\s_-]+/g, ''));
            });
            sourceTokens.forEach(token => {
                if (token.length >= 4) candidateKeys.add(token.replace(/[\s_-]+/g, ''));
            });
            const seen = new Set();
            const candidateRecords = this.birdHighlightRecordsByToken?.size
                ? [...candidateKeys].flatMap(key => this.birdHighlightRecordsByToken.get(key) || [])
                : (this.birdHighlightRecords || []);
            const terms = candidateRecords
                .filter(record => String(record.term || '').trim().length >= 4)
                .filter(record => {
                    const normalizedTerm = this.normalizeText(record.term);
                    return sourceNormalized.includes(normalizedTerm)
                        || sourceJoined.includes(normalizedTerm.replace(/\s+/g, ''));
                })
                .filter(record => {
                    const key = `${record.scientificName}|${this.normalizeText(record.term)}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                })
                .slice(0, 240);
            terms.forEach(record => {
                const pattern = this.buildDisplayTermPattern(record.term);
                if (!pattern) return;
                const regex = new RegExp(`(?<![\\p{L}\\p{N}])(${pattern})(?![\\p{L}\\p{N}])`, 'giu');
                for (const match of source.matchAll(regex)) {
                    matches.push({
                        start: match.index,
                        end: match.index + match[0].length,
                        className: 'bird-name-match',
                        scientificName: record.scientificName,
                        priority: 3
                    });
                }
            });
            return matches;
        }

        collectBirdGroupMatches(source) {
            // Turn broad group words such as woodpecker into blue chooser links.
            const matches = [];
            if (!this.birdGroupLookup?.size) return matches;
            const sourceNormalized = this.normalizeText(source);
            const sourceTokens = sourceNormalized.split(/\s+/).map(token => token.replace(/^#+/, ''));
            [...this.birdGroupLookup.keys()]
                .filter(term => sourceTokens.includes(term))
                .forEach(term => {
                    const regex = new RegExp(`(?<![\\p{L}\\p{N}])(#?${this.escapeRegex(term)})(?![\\p{L}\\p{N}])`, 'giu');
                    for (const match of source.matchAll(regex)) {
                        matches.push({
                            start: match.index,
                            end: match.index + match[0].length,
                            className: 'bird-group-match',
                            groupTerm: term,
                            priority: 2.5
                        });
                    }
                });
            return matches;
        }

        buildDisplayTermPattern(term) {
            // Allow spaces, hyphens, and underscores between name parts, plus joined hashtag forms.
            const parts = String(term || '').trim().split(/[\s_-]+/).filter(Boolean);
            if (!parts.length) return '';
            const separated = parts.map(part => this.escapeRegex(part)).join('[\\s_-]+');
            const joined = this.escapeRegex(parts.join(''));
            return parts.length > 1 ? `${separated}|${joined}` : joined;
        }

        collectHashtagMatches(source) {
            // Mark hashtags as focused terms unless a bird-name match already takes precedence.
            const matches = [];
            const regex = /(^|\s)(#[\p{L}\p{N}_-]+)/gu;
            for (const match of source.matchAll(regex)) {
                const prefixLength = match[1]?.length || 0;
                matches.push({
                    start: match.index + prefixLength,
                    end: match.index + prefixLength + match[2].length,
                    className: 'hashtag-match',
                    priority: 2
                });
            }
            return matches;
        }

        collectFocusMatches(source) {
            // Highlight the active query and default bird-topic words in the theme color.
            const terms = [...new Set([...(this.lastSearchTerms || []), 'bird', 'birds', 'birding'])]
                .map(term => String(term || '').replace(/^#+/, '').trim())
                .filter(term => term.length >= 3)
                .slice(0, 30);
            if (!terms.length) return [];
            const pattern = terms.map(term => this.escapeRegex(term)).join('|');
            const regex = new RegExp(`(?<![\\p{L}\\p{N}])(${pattern})(?![\\p{L}\\p{N}])`, 'giu');
            return [...source.matchAll(regex)].map(match => ({
                start: match.index,
                end: match.index + match[0].length,
                className: 'focus-match',
                priority: 1
            }));
        }

        normalizeText(text) {
            // Normalize text for case-insensitive matching without changing what is displayed.
            return String(text || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}#]+/gu, ' ').trim();
        }

        escapeHtml(value) {
            // Prevent public relay text from being interpreted as HTML.
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        escapeRegex(value) {
            // Escape user and bird terms before building highlight expressions.
            return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        hexToBytes(hex) {
            // Convert a hex private key into bytes for nostr-tools signing.
            const clean = String(hex || '').trim();
            const bytes = new Uint8Array(clean.length / 2);
            for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
            return bytes;
        }

        async copyText(text, statusMessage) {
            // Copy text through the Clipboard API and report a local status.
            await navigator.clipboard.writeText(text);
            this.setStatus(statusMessage);
        }

        setStatus(message, isError = false) {
            // Show fetch/publish state without blocking the page.
            if (!this.status) return;
            this.status.textContent = message || '';
            this.status.classList.toggle('featheration-error-text', Boolean(isError));
        }

        renderEmpty(message) {
            // Render a neutral empty state in the feed container.
            if (this.feed) this.feed.innerHTML = `<p class="featheration-empty">${this.escapeHtml(message)}</p>`;
        }

        renderError(message) {
            // Render an error state in the feed container.
            if (this.feed) this.feed.innerHTML = `<p class="featheration-error">${this.escapeHtml(message)}</p>`;
        }

        formatNumber(value) {
            // Format counts with the current browser locale.
            return new Intl.NumberFormat().format(Number(value || 0));
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const client = new FeatherationClient();
        client.init();
        window.BirdsNameFeatheration = client;
    });
}());
