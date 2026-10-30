#!/usr/bin/env bash
# Builds dist/FileShift.exe (Windows x64) plus Linux and macOS binaries.
# Requires Go 1.22+. The icon resource is regenerated from winres/icon.png.
set -euo pipefail
cd "$(dirname "$0")"
go run github.com/tc-hib/go-winres@v0.3.3 simply --arch amd64 --icon winres/icon.png --manifest gui \
  --product-name FileShift --file-description "FileShift file converter" \
  --product-version 1.0.0 --file-version 1.0.0 --original-filename FileShift.exe
mkdir -p dist
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -H windowsgui" -o dist/FileShift.exe .
GOOS=linux   GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o dist/fileshift-linux .
GOOS=darwin  GOARCH=arm64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o dist/fileshift-macos .
ls -la dist
