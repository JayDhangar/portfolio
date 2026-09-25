#!/usr/bin/env node
// Generates index.html from data/portfolio.json + src/index.template.html.
// Run locally with `node build.js`; Vercel runs it on every deploy (see vercel.json).
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const R = require('./assets/render.js');
const RAG = require('./assets/rag.js');

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/portfolio.json'), 'utf8'));
const template = fs.readFileSync(path.join(ROOT, 'src/index.template.html'), 'utf8');

// Production URL for canonical/og tags: explicit SITE_URL, then Vercel's production domain, then the JSON value.
const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const siteUrl = (process.env.SITE_URL || (vercelDomain ? 'https://' + vercelDomain : '') || data.site.url || '').replace(/\/+$/, '');

const ctx = {
  siteUrl,
  year: new Date().getFullYear(),
  passages: RAG.buildChunks(data).length,
};

const slots = {
  head: () => R.head(data, ctx),
  passages: () => String(ctx.passages),
  hero: () => R.hero(data, ctx),
  systems: () => R.systems(data, ctx),
  lab: () => R.lab(data, ctx),
  engineering: () => R.engineering(data, ctx),
  experience: () => R.experience(data, ctx),
  thinking: () => R.thinking(data, ctx),
  contact: () => R.contact(data, ctx),
  footer: () => R.footer(data, ctx),
  askIntro: () => R.esc(data.sections.askIntro),
  askChips: () => R.askChips(data),
};

const used = new Set();
const html = template.replace(/<!--\s*@(\w+)\s*-->/g, (_, key) => {
  if (!slots[key]) throw new Error(`Unknown template slot: @${key}`);
  used.add(key);
  return slots[key]();
});

const unused = Object.keys(slots).filter((k) => !used.has(k));
if (unused.length) throw new Error(`Template is missing slots: ${unused.join(', ')}`);

fs.writeFileSync(path.join(ROOT, 'index.html'), html);
console.log(`index.html built: ${(html.length / 1024).toFixed(1)} KB, ${ctx.passages} RAG passages, site URL: ${siteUrl || '(not set, og:url and canonical omitted)'}`);
