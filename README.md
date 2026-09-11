# pi

[![Deploy to GitHub Pages](https://github.com/pbotwin/pi/actions/workflows/deploy.yml/badge.svg)](https://github.com/pbotwin/pi/actions/workflows/deploy.yml)

Live site: **https://pbotwin.github.io/pi/**

## Deployment

Every push to `main` triggers `.github/workflows/deploy.yml`, which publishes the
contents of `public/` to GitHub Pages. You can also run it manually from the
Actions tab (`workflow_dispatch`).

There is no build step yet — files in `public/` are served as-is. When the
project gains a toolchain, uncomment the build block in the workflow and make it
emit into `public/`; nothing else needs to change.

## Layout

```
public/              # published to GitHub Pages
.github/workflows/   # CI/CD
```
