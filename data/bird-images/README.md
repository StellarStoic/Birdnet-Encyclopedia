# Local Bird Image Thumbnails

Featheration species bubbles use compact WebP thumbnails from:

```text
data/bird-images/thumbnails/
```

The full-size generated images are intentionally ignored by Git because they are too large for normal repository history.

Filename convention:

```text
thumbnails/<normalized-scientific-name>.webp
```

Example:

```text
thumbnails/dryobates-major.webp
```

The thumbnail generator keeps each file at or below the configured size limit:

```text
python tools/create-bird-image-thumbnails.py --max-kb 50
```

If no local thumbnail exists, the UI falls back to `img/origami_bird_B.png`.
