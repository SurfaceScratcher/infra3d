# Changesets

Every PR that changes a published package adds a changeset:

```bash
npx changeset
```

Pick the packages, the bump (patch / minor / major) and write one line for the changelog.
The release workflow collects pending changesets into a "Version packages" PR; merging it
publishes to npm. While the packages are below 1.0, breaking changes are `minor`.
