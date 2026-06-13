# Bird Name Translations

The generated `labels_*.txt` files come from the BirdNET-Pi localization
dictionaries:

https://github.com/Nachtzuster/BirdNET-Pi/tree/main/model/l18n

Run this command from the project root to download and convert the latest files:

```powershell
# Downloads all upstream JSON dictionaries and converts them to the format used by the website.
.\tools\update-birdnet-translations.ps1
```

The updater discovers new upstream languages automatically. It also creates
`labels_zh_CN.txt` and `labels_zh_TW.txt`, and refreshes `labels_zh.txt` as a
Simplified Chinese compatibility alias.

Review the changed translation files before committing them. `UPSTREAM.txt`
records the exact BirdNET-Pi commit used for each update.
