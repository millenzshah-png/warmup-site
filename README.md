# Warmup storefront

The website for Warmup, a heated hoodie that holds the temperature you set.

**Live site:** https://millenzshah-png.github.io/warmup-site/

Seven pages: home, build your hoodie, how it works, the app, our story, help and a
not-found page. It is a static site with no dependencies. Fonts and pictures are
in the repo, so it also works with no internet.

## Run it

You need Node 20 or newer. Nothing to install.

```bash
npm run build
```

```bash
npm run serve
```

Then open http://localhost:5180/warmup-site/. The local server serves the site
under the same path GitHub Pages uses, with the same not-found page.

## Check it

```bash
npm test
```

This builds the site, then runs three things:

| Check | What it covers |
| --- | --- |
| `tests/*.test.mjs` | Prices, the bag, the temperature scale and the fact sheet (25 tests) |
| `tools/check.mjs` | Every built page: links and anchors land, pictures exist at the size the page says, one h1, headings in order, unique ids, named controls, and no price or temperature that is not in the fact sheet |
| `tools/check-facts.mjs` | The fact sheet against the Warmup app's own `spec.ts`, catalogue and modes (47 facts). It needs the `warmup-app` repo next to this one and is skipped when it is not there |

## How it is put together

```
src/
  facts.mjs        every product fact the site states, in one place
  pages/           one file per page: a small header block, then the page body
  partials/        the layout, header, footer, bag and icon set every page shares
  css/  js/  img/  fonts/
tools/
  build.mjs        src/ -> docs/
  serve.mjs        local server that mirrors GitHub Pages
  check.mjs        checks the built pages
  check-facts.mjs  checks the facts against the app
tests/             unit tests
docs/              the built site. GitHub Pages serves this folder
```

**Change a fact** (a price, a runtime, a mode) in `src/facts.mjs` only. Pages use
facts through `{{tokens}}`, and the browser scripts read the same object from
`docs/js/facts.js`, which the build writes. A token with nothing behind it stops
the build.

**Change a page** in `src/pages`, then run `npm test` and commit both `src/` and
`docs/`.

## Publish

GitHub Pages serves the `docs/` folder of the `main` branch. Build, commit and
push, and the live site updates a minute or so later.

## What is real and what is not

- The bag is saved in the browser on the visitor's own device.
- Checkout is not connected. The bag says so when you press Check out.
- The app screens shown are from the Warmup app, which runs at
  https://millenzshah-png.github.io/warmup-app/ with a simulated hoodie.
