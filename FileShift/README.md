# FileShift

A universal file converter that runs entirely on your computer. Double-click
`FileShift.exe` and it opens in your browser; files are never uploaded.

## What it converts

| From | To |
| --- | --- |
| PNG, JPG, WEBP, GIF, BMP, ICO, SVG, AVIF | PNG, JPG, WEBP, BMP, ICO (multi-size), PDF |
| CSV, TSV, JSON, JSONL, YAML, XML, XLSX, XLS, ODS | CSV, TSV, JSON, YAML, XML, XLSX, Markdown table, HTML table |
| Markdown | HTML, PDF, plain text |
| HTML | Markdown, plain text, PDF |
| TXT and source code | PDF, HTML, Markdown |
| PDF | Plain text, PNG or JPG per page |
| MP3, M4A, OGG, FLAC, AAC, OPUS, MP4, WEBM | WAV |
| Any file | Base64, data URI |

Also: batch conversion, "Save all" as a ZIP, merging several images into one
PDF, resizing images, JPG/WEBP quality, PDF page size and render resolution,
and paste (Ctrl+V) of images or text.

## Run

- **Windows:** run `dist/FileShift.exe`. There is no installer and no console
  window. It quits about 20 seconds after you close the FileShift tab.
  Windows SmartScreen may warn because the exe is not code-signed; choose
  *More info → Run anyway*.
- **Anywhere:** open `web/index.html` through any local web server, or run the
  Linux/macOS binaries from `build.sh`.

## Build

```bash
./build.sh   # needs Go 1.22+; writes dist/FileShift.exe, fileshift-linux, fileshift-macos
```

`main.go` embeds `web/` and serves it on `127.0.0.1:47821` (or a free port).
A second launch reuses the running instance.

## Limits

- Text-based PDFs use the standard PDF fonts, so characters outside Western
  European scripts are replaced with `?`.
- WAV output uses your sound device's sample rate (usually 44.1 or 48 kHz).
- Image formats your browser cannot decode (for example HEIC or TIFF in
  Chrome) are reported as unreadable.

## Third-party libraries (bundled in `web/vendor`)

JSZip 3.10.1 (MIT), SheetJS xlsx 0.18.5 (Apache-2.0), js-yaml 4.1.0 (MIT),
marked 12.0.2 (MIT), Turndown 7.1.2 (MIT), jsPDF 2.5.1 (MIT),
pdf.js 3.11.174 (Apache-2.0).
