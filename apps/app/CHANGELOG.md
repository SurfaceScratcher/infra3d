# @infra3d/app

## 0.5.0

### Minor Changes

- 61ab561: New default colours: soft pastel nodes and edges on a dark violet background, with periwinkle as the accent; the status colours for down and suspect stay clearly distinct. The app also gets an icon.

### Patch Changes

- Updated dependencies [61ab561]
  - infra3d@0.4.0
  - infra3d-import-compose@0.3.1

## 0.4.0

### Minor Changes

- 3982ecb: Anonymized import reports for bug reports: `-r report.json` writes what the importer read with domains, IPs, host names, e-mail addresses, paths and secret values replaced, and passing a report instead of a directory replays the import. Also available as `createImportReport()`.

### Patch Changes

- Updated dependencies [3982ecb]
  - infra3d-import-compose@0.3.0
