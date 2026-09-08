# Jay Dhangar — Portfolio Hub

A single static site with a landing page ([index.html](index.html)) that links out to four
standalone portfolio designs. No build step, no framework, no backend — plain HTML/CSS/JS,
deployed as-is on Vercel.

## Structure

```
index.html                          # landing page — cinematic design selector
portfolios/
  portfolio-aurora.html             # Style 1: Aurora Dark
  portfolio-bento.html              # Style 2: Bento Grid
  portfolio-kinetic.html            # Style 3: Minimal Editorial
  portfolio-terminal.html           # Style 4: Terminal / Tech
```

Each portfolio file is fully self-contained (inline CSS/JS, no shared assets), so they can be
edited independently without touching anything else.

## Updating a portfolio's content

1. Open the relevant file (e.g. `portfolios/portfolio-aurora.html`) and edit the content
   directly — you can do this locally or straight in GitHub's web editor.
2. Keep the **file name and folder the same** — `index.html` links to these files by path, so
   renaming or moving one breaks its card on the landing page.
3. Commit and push:
   ```
   git add .
   git commit -m "update aurora portfolio content"
   git push
   ```
4. Vercel auto-deploys on every push to the connected branch — the live site updates in ~30
   seconds, no manual redeploy needed.

## Adding a 5th style (optional, later)

1. Add `portfolios/portfolio-<name>.html`.
2. Copy one of the existing `<a class="card ...">` blocks in `index.html`, point its `href` at
   `portfolios/portfolio-<name>.html`, give it a new `c-<name>` class with its own `--acc` color,
   and add a `.prev-<name>` preview scene next to the others in the `<style>` block.

## Deploying on Vercel

1. Push this folder to a GitHub repo (e.g. `JayDhangar/portfolio`).
2. In Vercel: **Add New Project** → import the repo.
3. Framework preset: **Other** (static site). Leave build command and output directory blank —
   Vercel serves the files as-is.
4. Deploy. Every future push to the default branch redeploys automatically.
