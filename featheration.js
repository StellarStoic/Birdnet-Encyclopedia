// Bird-focused Nostr client for the standalone Featheration page.
(function initializeFeatherationClient() {
    'use strict';

    const HIDDEN_USERS_KEY = 'birdFeatherationHiddenUsers';
    const MIN_WOT_KEY = 'birdFeatherationMinWot';
    const MAX_HASHTAGS_KEY = 'birdFeatherationMaxHashtags';
    const THEME_KEY = 'birdEncyclopediaTheme';
    const LANGUAGE_KEY = 'birdEncyclopediaLanguage';
    const NOSTR_TOOLS_URL = 'https://esm.sh/nostr-tools@2.10.4?bundle';
    const RELAY_INFO_CACHE_KEY = 'birdFeatherationRelayInfo';

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
            this.renderTimer = null;
            this.activeSearchToken = 0;
            this.lastSearchTerms = [...this.defaultTerms];
            this.currentQueryLabel = 'bird topics';
            this.localFilterTerms = [];
            this.localFilterTags = [];
            this.nostrTools = null;
        }

        async init() {
            // Apply the shared theme and language before any translated text is read.
            this.applyStoredTheme();
            await window.BirdI18n?.ready;
            this.bindEvents();
            this.updateMenuIdentity();
            localStorage.removeItem('birdFeatherationLastSearch');
            await this.loadLoggedInContacts();
            await this.loadBirdTerms();
            this.search('');
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
            document.addEventListener('click', event => {
                if (this.menu?.classList.contains('show') && !event.target.closest('.dropdown-container')) {
                    this.closeMenu();
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

        updateMenuIdentity() {
            // Show the saved Nostr avatar in the burger button when a profile picture is already cached.
            const publicHex = localStorage.getItem('birdNostrPublicKeyHex');
            const profile = publicHex ? this.getCachedProfile(publicHex) : null;
            const imageUrl = profile?.picture || profile?.image || '';
            if (!this.menuNostrAvatar || !this.menuToggle) return;
            if (imageUrl) {
                this.menuNostrAvatar.src = imageUrl;
                this.menuNostrAvatar.hidden = false;
                this.menuToggle.classList.add('nostr-logged-in');
                this.menuNostrAvatar.onerror = () => {
                    this.menuNostrAvatar.hidden = true;
                    this.menuToggle.classList.remove('nostr-logged-in');
                };
            }
        }

        getCachedProfile(pubkey) {
            // Read any locally cached Nostr profile without doing network work for the menu button.
            try {
                const cache = JSON.parse(localStorage.getItem('birdNostrProfileCache') || '{}');
                return cache?.[pubkey] || null;
            } catch (error) {
                return null;
            }
        }

        t(key, values = {}) {
            // Use the shared i18n loader so this separate page can still be translated later.
            return window.BirdI18n?.t?.(key, values) || key;
        }

        async loadBirdTerms() {
            // Load selected-language and English bird names so matching and highlighting know local names too.
            const language = localStorage.getItem(LANGUAGE_KEY) || 'en';
            const files = [...new Set(['en', language])]
                .map(code => `lang/labels_${code}.txt`);
            const termSet = new Set(this.defaultTerms.map(term => this.normalizeText(term)).filter(Boolean));
            await Promise.all(files.map(async file => {
                try {
                    const response = await fetch(file);
                    if (!response.ok) return;
                    const text = await response.text();
                    this.extractBirdTerms(text).forEach(term => termSet.add(term));
                } catch (error) {
                    console.warn(`Could not load bird terms from ${file}:`, error);
                }
            }));
            this.birdTerms = [...termSet]
                .filter(term => term.length >= 4)
                .slice(0, 900);
        }

        extractBirdTerms(labelsText) {
            // Convert BirdNET label rows into searchable common-name terms while avoiding tiny fragments.
            const ignored = new Set(['the', 'and', 'with', 'bird', 'birds', 'common', 'greater', 'lesser', 'northern', 'southern', 'eastern', 'western']);
            const terms = new Set();
            labelsText.split(/\r?\n/).forEach(line => {
                const [, commonName] = line.split('_');
                const normalizedName = this.normalizeText(commonName || '');
                if (normalizedName.length >= 5) terms.add(normalizedName);
                normalizedName.split(/\s+/).forEach(word => {
                    if (word.length >= 5 && !ignored.has(word)) terms.add(word);
                });
            });
            return [...terms];
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
            this.setStatus(this.t('featheration.loading'));
            this.renderEmpty(this.t('featheration.loading'));
            const relays = await this.getReadRelays();
            const searchTerms = this.buildSearchTerms(query);
            this.lastSearchTerms = searchTerms.highlightTerms;
            this.localFilterTerms = searchTerms.localTerms;
            this.localFilterTags = searchTerms.localTags;
            try {
                const relayPlans = await this.buildRelayPlans(relays, searchTerms);
                const events = await this.fetchPlannedRelayEvents(relayPlans, 4500, event => {
                    if (this.activeSearchToken !== searchToken) return;
                    this.addIncomingEvent(event);
                });
                const uniqueEvents = this.sortAndDedupeEvents(events);
                const matchingEvents = uniqueEvents.filter(event => this.eventMatchesLocalSearch(event));
                matchingEvents.forEach(event => this.addIncomingEvent(event, { immediate: false }));
                const accumulatedEvents = this.sortAndDedupeEvents([...this.eventMap.values()]);
                this.lastEvents = accumulatedEvents;
                this.renderFeed(accumulatedEvents);
                this.loadProfilesForEvents(accumulatedEvents).then(() => {
                    if (this.activeSearchToken === searchToken) this.renderFeed(this.lastEvents);
                });
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

        buildSearchTerms(query) {
            // Combine reliable hashtag/recent-note filters with optional relay text search.
            const words = query
                ? query.split(/\s+/).map(value => value.trim()).filter(Boolean)
                : ['bird', 'birds', 'birding'];
            const tags = words
                .filter(word => word.startsWith('#'))
                .map(word => word.replace(/^#+/, ''))
                .filter(Boolean);
            const plainWords = words
                .map(word => word.replace(/^#+/, ''))
                .filter(Boolean)
                .slice(0, query ? 5 : 4);
            const tagFilter = [...new Set(query ? [...tags, ...plainWords] : ['bird', 'birds', 'birding', 'birdphotography'])].slice(0, 10);
            const since = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
            const tagFilters = [];
            if (tagFilter.length) tagFilters.push({ kinds: [1], '#t': tagFilter, since, limit: query ? 100 : 150 });
            const fallbackFilters = [
                ...tagFilters,
                { kinds: [1], since, limit: query ? 260 : 220 }
            ];
            const searchFilters = plainWords.length
                ? [{ kinds: [1], search: plainWords.join(' OR '), limit: query ? 100 : 80 }]
                : [];
            return {
                fallbackFilters,
                searchFilters,
                highlightTerms: [...new Set([...words.map(word => word.replace(/^#+/, '')), ...this.defaultTerms])],
                localTerms: plainWords.map(word => this.normalizeText(word)).filter(Boolean),
                localTags: tagFilter.map(tag => this.normalizeText(tag)).filter(Boolean)
            };
        }

        async buildRelayPlans(relays, searchTerms) {
            // Use NIP-50 search only on relays advertising supported_nips: [50], and use fallback filters everywhere else.
            const infos = await Promise.all(relays.map(relay => this.getRelayInfo(relay)));
            return relays.map((relay, index) => {
                const supportsSearch = infos[index]?.supported_nips?.includes(50);
                const filters = supportsSearch && searchTerms.searchFilters.length
                    ? [...searchTerms.searchFilters, ...searchTerms.fallbackFilters.slice(0, 1)]
                    : searchTerms.fallbackFilters;
                return { relay, filters, supportsSearch };
            });
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
            // Prefer user relays, include enabled app defaults, and add signer relays when available.
            const relays = new Set();
            this.getPersonalRelays().forEach(relay => relays.add(relay));
            if (this.shouldUseDefaultRelays()) this.getDefaultRelays().forEach(relay => relays.add(relay));
            try {
                const signerRelays = await window.nostr?.getRelays?.();
                Object.keys(signerRelays || {}).forEach(relay => {
                    if (/^wss:\/\//i.test(relay)) relays.add(relay.replace(/\/+$/, ''));
                });
            } catch (error) {
                console.warn('Could not read Nostr signer relays:', error);
            }
            return [...relays].slice(0, 5);
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
            return ['wss://nos.lol', 'wss://relay.damus.io', 'wss://relay.primal.net'];
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
                const finish = () => {
                    if (settled) return;
                    settled = true;
                    try {
                        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(['CLOSE', subscriptionId]));
                        if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) socket.close();
                    } catch (error) {
                        console.warn(`Could not close relay ${relay}:`, error);
                    }
                    resolve(events);
                };
                const timer = window.setTimeout(finish, timeoutMs);
                try {
                    socket = new WebSocket(relay);
                    socket.addEventListener('open', () => {
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
                        finish();
                    });
                    socket.addEventListener('close', () => {
                        window.clearTimeout(timer);
                        finish();
                    });
                } catch (error) {
                    window.clearTimeout(timer);
                    finish();
                }
            });
        }

        sortAndDedupeEvents(events) {
            // Keep the newest copy of each event ID and cap rendering work on busy relays.
            const byId = new Map();
            events.forEach(event => {
                if (event?.id && event?.kind === 1 && !byId.has(event.id)) byId.set(event.id, event);
            });
            return [...byId.values()]
                .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0))
                .slice(0, 140);
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
            // Fetch author metadata for rendered notes so names, avatars, and WOT scoring can use it.
            const pubkeys = [...new Set(events.map(event => event.pubkey).filter(Boolean))].slice(0, 35);
            await Promise.all(pubkeys.map(pubkey => this.loadProfile(pubkey)));
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

        getProfileRelays() {
            // Keep profile lookups cheap so they do not flood public relays while the stream loads.
            return ['wss://purplepag.es', 'wss://nos.lol'];
        }

        async loadLoggedInContacts() {
            // Load the logged-in user's follow list for a simple positive WOT signal.
            const publicHex = localStorage.getItem('birdNostrPublicKeyHex');
            if (!publicHex) return;
            const relays = this.getProfileRelays();
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
            return terms.some(term => this.normalizedTermMatches(content, contentTokens, term))
                || tags.some(tag => noteTags.includes(tag) || contentHashtags.includes(tag));
        }

        normalizedTermMatches(content, contentTokens, term) {
            // Match single-word searches exactly and multi-word searches as complete normalized word sequences.
            if (!term) return false;
            if (!term.includes(' ')) return contentTokens.includes(term);
            const escaped = this.escapeRegex(term).replace(/\\ /g, '\\s+');
            return new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'u').test(content);
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
            // Score public notes with transparent local signals instead of pretending to have a global WOT graph.
            const profile = this.profiles.get(event.pubkey) || {};
            const text = this.normalizeText(event.content || '');
            const tokens = this.getNormalizedTokens(event.content || '');
            let score = 0;
            if (this.eventMatchesLocalSearch(event)) score += 1;
            if (profile.name || profile.display_name) score += 2;
            if (profile.picture) score += 1;
            if (profile.nip05) score += 1;
            if (this.followedPubkeys.has(String(event.pubkey || '').toLowerCase())) score += 6;
            if (this.defaultTerms.some(term => this.normalizedTermMatches(text, tokens, this.normalizeText(term)))) score += 2;
            if ((this.birdTerms || []).some(term => this.normalizedTermMatches(text, tokens, term))) score += 3;
            if ((event.tags || []).some(tag => tag[0] === 't' && this.defaultTags.map(value => value.toLowerCase()).includes(String(tag[1] || '').toLowerCase()))) score += 2;
            if (String(event.content || '').length > 1200) score -= 1;
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
            const score = this.calculateWotScore(event);
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
                        <img class="featheration-author-avatar" src="${this.escapeHtml(profile.picture || 'img/origami_bird_B-ICO.png')}" alt="">
                        <div class="featheration-author-copy">
                            <span class="featheration-author-name">${this.escapeHtml(name)}</span>
                            <div class="featheration-author-meta">
                                <span class="featheration-author-npub">${this.escapeHtml(npub)}</span>
                                <span class="featheration-wot">${this.escapeHtml(this.t('featheration.wotScore', { score }))}</span>
                                <time class="featheration-note-time" datetime="${this.escapeHtml(this.eventDate(event).toISOString())}">${this.escapeHtml(this.relativeTime(event))}</time>
                            </div>
                        </div>
                        ${this.renderNoteMenu(event, isHidden)}
                    </header>
                    <div class="featheration-note-content">${this.highlightText(event.content || '')}</div>
                    ${this.renderMediaAttachments(event)}
                    ${this.renderNoteActions(event)}
                </article>
            `;
        }

        renderMediaAttachments(event) {
            // Render safe media URLs found in note content or media tags without executing third-party scripts.
            const media = this.extractMediaAttachments(event);
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
                .map(url => this.classifyMediaUrl(url))
                .filter(Boolean)
                .slice(0, 8);
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
            if (!publicHex) {
                return `<div class="featheration-note-actions"><span class="featheration-note-time">${this.escapeHtml(this.t('featheration.loginForActions'))}</span></div>`;
            }
            const reactions = ['💚', '🐦', '📷', '🔥', '👍']
                .map(emoji => `<button class="featheration-note-action featheration-reaction-button" type="button" data-react="${this.escapeHtml(emoji)}">${this.escapeHtml(emoji)}</button>`)
                .join('');
            return `
                <div class="featheration-note-actions">
                    ${reactions}
                    <button class="featheration-note-action" type="button" data-repost>${this.escapeHtml(this.t('featheration.repost'))}</button>
                    <button class="featheration-note-action" type="button" data-reply>${this.escapeHtml(this.t('featheration.reply'))}</button>
                </div>
            `;
        }

        async handleFeedClick(event) {
            // Route feed button clicks to copy, hide, reaction, repost, and reply handlers.
            const note = event.target.closest('.featheration-note');
            if (!note) return;
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
            // Publish a standard kind-7 reaction with the selected emoji as content.
            const unsigned = this.baseEvent(7, emoji, [
                ['e', event.id],
                ['p', event.pubkey],
                ['k', String(event.kind || 1)]
            ]);
            await this.signAndPublish(unsigned, button, this.t('featheration.reactionSent'));
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
            } catch (error) {
                console.warn('Could not publish Nostr action:', error);
                this.setStatus(error?.message || this.t('featheration.publishFailed'), true);
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

        formatNpub(pubkey) {
            // Use a compact npub-like display until nostr-tools is loaded for signing.
            if (!pubkey) return 'npub...';
            return `npub…${String(pubkey).slice(-8)}`;
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
            // Escape the note first, then mark hashtags and known search/bird terms.
            let escaped = this.escapeHtml(text);
            escaped = escaped.replace(/(^|\s)(#[\p{L}\p{N}_-]+)/gu, '$1<span class="hashtag-match">$2</span>');
            const terms = [...new Set([...(this.lastSearchTerms || []), 'bird', 'birds', 'birding'])]
                .map(term => this.escapeRegex(term.replace(/^#+/, '')))
                .filter(term => term.length >= 3)
                .slice(0, 30);
            if (!terms.length) return escaped;
            const regex = new RegExp(`\\b(${terms.join('|')})\\b`, 'gi');
            return escaped.replace(regex, '<span class="focus-match">$1</span>');
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
