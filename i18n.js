/* Shared JSON locale loader for the encyclopedia and My BirdNET dashboard. */
(function initializeBirdI18n(global) {
    'use strict';

    const STORAGE_KEY = 'birdEncyclopediaLanguage';
    const SUPPORTED_LOCALES = [
        'af', 'ar', 'ca', 'cs', 'da', 'de', 'en', 'es', 'et', 'fi', 'fr', 'hr',
        'hu', 'id', 'is', 'it', 'ja', 'ko', 'lt', 'lv', 'nl', 'no', 'pl', 'pt',
        'ro', 'ru', 'sk', 'sl', 'sr', 'sv', 'th', 'tr', 'uk', 'vi', 'zh_CN', 'zh_TW'
    ];
    const catalogs = {};
    const loadingCatalogs = new Map();
    let currentLanguage = localStorage.getItem(STORAGE_KEY) || 'en';

    // Replace named placeholders such as {count} without breaking on missing values.
    function interpolate(template, values = {}) {
        return String(template).replace(/\{(\w+)\}/g, (match, key) => (
            Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
        ));
    }

    // Fetch each locale once; empty translated values intentionally fall back to English.
    async function loadCatalog(languageCode) {
        const locale = SUPPORTED_LOCALES.includes(languageCode) ? languageCode : 'en';
        if (catalogs[locale]) return catalogs[locale];
        if (loadingCatalogs.has(locale)) return loadingCatalogs.get(locale);

        const request = fetch(`i18n/${locale}.json`)
            .then(response => {
                if (!response.ok) throw new Error(`Locale ${locale} returned HTTP ${response.status}`);
                return response.json();
            })
            .then(messages => {
                catalogs[locale] = messages;
                loadingCatalogs.delete(locale);
                return messages;
            })
            .catch(error => {
                loadingCatalogs.delete(locale);
                console.warn(`Could not load interface locale ${locale}:`, error);
                return {};
            });
        loadingCatalogs.set(locale, request);
        return request;
    }

    function t(key, values = {}) {
        const translatedValue = catalogs[currentLanguage]?.[key];
        const englishValue = catalogs.en?.[key];
        return interpolate(translatedValue || englishValue || key, values);
    }

    // Apply marked text and attributes after a locale loads or dynamic markup is inserted.
    function apply(root = document) {
        root.querySelectorAll?.('[data-i18n]').forEach(element => {
            element.textContent = t(element.dataset.i18n);
        });
        root.querySelectorAll?.('[data-i18n-placeholder]').forEach(element => {
            element.placeholder = t(element.dataset.i18nPlaceholder);
        });
        root.querySelectorAll?.('[data-i18n-aria-label]').forEach(element => {
            element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
        });
        const titleKey = document.documentElement.dataset.i18nTitle;
        if (titleKey) document.title = t(titleKey);
    }

    async function setLanguage(languageCode, { persist = true } = {}) {
        currentLanguage = SUPPORTED_LOCALES.includes(languageCode) ? languageCode : 'en';
        document.documentElement.lang = currentLanguage.replace('_', '-');
        document.documentElement.dir = currentLanguage === 'ar' ? 'rtl' : 'ltr';
        if (persist) localStorage.setItem(STORAGE_KEY, currentLanguage);

        // English always loads first because every incomplete locale falls back to it by key.
        await loadCatalog('en');
        if (currentLanguage !== 'en') await loadCatalog(currentLanguage);
        apply();
        document.dispatchEvent(new CustomEvent('bird-i18n-change', {
            detail: { language: currentLanguage }
        }));
        return currentLanguage;
    }

    global.BirdI18n = {
        apply,
        catalogs,
        getLanguage: () => currentLanguage,
        loadCatalog,
        ready: null,
        setLanguage,
        supportedLocales: [...SUPPORTED_LOCALES],
        t
    };

    // Applications await this promise before rendering language-dependent dynamic content.
    global.BirdI18n.ready = setLanguage(currentLanguage, { persist: false });
    document.addEventListener('DOMContentLoaded', () => {
        global.BirdI18n.ready.then(() => apply());
    });
}(window));
