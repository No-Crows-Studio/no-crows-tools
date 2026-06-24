# No Crows tools

A small collection of simple, browser-based tools. Everything runs locally in the
browser — nothing is uploaded.

## Hosting on GitHub Pages

Push this repo to GitHub, then in **Settings → Pages** set the source to the
default branch, root (`/`) folder. The site will be served from
`https://<user>.github.io/<repo>/`.

## Structure

```
index.html                       landing page + tool directory
style.css                        landing page styles
tools/
  transparent-cropper/           crops PNGs to their non-transparent bounds
    index.html
    style.css
    cropper.js
```

## Tools

- **Transparent PNG Cropper** — drop one or more PNGs and download each cropped
  to the tightest box that still contains every non-transparent pixel, saved as
  `name_tcropped.png`.
