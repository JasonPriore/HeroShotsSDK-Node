# Publishing

This package is published to npm. The recommended path is npm Trusted
Publishing from GitHub Actions, so no long-lived npm token is stored in GitHub
secrets.

## One-time npm setup

Create an npm account. The first version must be published once manually,
because npm trusted publisher settings are available only after the package
exists on the registry.

| Field | Value |
|---|---|
| npm package name | `heroshots` |
| GitHub owner | `JasonPriore` |
| GitHub repository | `HeroShotsSDK-Node` |
| Workflow filename | `publish.yml` |

After the first manual publish, open the package settings on npmjs.com and add a
trusted publisher. Choose GitHub Actions and use the values above. The publish
workflow is `.github/workflows/publish.yml`.

## First GitHub setup

This directory starts as a local package. Create a GitHub repository named:

```text
HeroShotsSDK-Node
```

Then connect and push:

```bash
git init
git branch -M main
git add .
git commit -m "Add HeroShots Node SDK"
git remote add origin git@github-personal:JasonPriore/HeroShotsSDK-Node.git
git push -u origin main
```

## First npm publish

After the repo is pushed to GitHub, publish `0.1.0` manually once:

```bash
npm ci
npm test
npm run pack:check
npm login
npm publish
```

Then create the matching GitHub tag/release for history. The publish workflow is
idempotent and skips `npm publish` if the same version already exists on npm:

```bash
git tag v0.1.0
git push origin v0.1.0
gh release create v0.1.0 --title "v0.1.0" --notes "Initial Node SDK release"
```

Finally, configure npm Trusted Publishing for the package.

## Release process after trusted publishing

Run checks:

```bash
npm ci
npm test
npm run pack:check
```

Create a matching SemVer tag and GitHub Release:

```bash
npm version patch
git push origin main
git push origin v0.1.1
gh release create v0.1.1 --title "v0.1.1" --notes "Release v0.1.1"
```

The `Publish to npm` workflow verifies the tag matches `package.json`, runs
tests, checks package contents with `npm pack --dry-run`, then publishes to npm.

npm versions are immutable. If a version has already been published, bump the
version and publish a new release.

## Local release helper

The ignored local script `./send_realese` automates checks, version bumping,
tagging and GitHub Release creation.

```bash
./send_realese
./send_realese minor Add storyboard helpers
./send_realese 0.2.0 Release 0.2.0
```
