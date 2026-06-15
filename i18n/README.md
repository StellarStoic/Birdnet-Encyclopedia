# Interface translations

This folder contains user-interface translations for `index.html` and
`my-birdnet.html`. Each language has one standalone JSON file, so translators
only need to edit their language.

## Source language

`en.json` is the source template and defines every supported key. Do not rename,
remove, or translate the keys on the left side.

```json
{
  "action.search": "Search",
  "chart.timeline": "Observation timeline"
}
```

Translate only the values:

```json
{
  "action.search": "Išči",
  "chart.timeline": "Časovnica opazovanj"
}
```

Empty values automatically fall back to English in the application.

The initial non-English catalogs include machine-translated drafts. Native
speakers should review terminology, grammar, and taxonomy wording before a
locale is considered final.

## Adding or updating a language

1. Copy `en.json` to the appropriate locale name, for example `de.json`.
2. Translate the JSON values without changing the keys.
3. Keep product names such as BirdNET-Pi, BirdWeather, Meteostat, Pollinations,
   eBird, iNaturalist, and IUCN unchanged unless a standard local name exists.
4. Keep placeholders such as `{count}`, `{species}`, and `{date}` unchanged.
5. Save the file as UTF-8 JSON.

The file name must match the code used by `lang/labels_CODE.txt`. Chinese uses
`zh_CN.json` and `zh_TW.json`.

## Crowdin and Weblate

Use `en.json` as the source file and `i18n/%locale%.json` as the translated-file
pattern.

Recommended settings:

- File format: JSON key-value
- Source language: English
- Preserve keys: enabled
- Export untranslated strings as empty: enabled
- Character encoding: UTF-8

These files contain interface text only. Bird species names remain in
`lang/labels_CODE.txt`.
