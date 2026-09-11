import { defineConfig } from 'vite';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ART = resolve('public/art');

function listArt() {
  try {
    return readdirSync(ART)
      .filter((f) => !f.startsWith('.') && /\.(png|jpe?g|webp|gif)$/i.test(f))
      .sort();
  } catch (e) {
    return [];
  }
}

/**
 * Publishes what is actually in public/art as a JSON listing, because a browser
 * cannot read a directory. src/render/artindex.js uses it to match a design's
 * filename — which older bench exports truncated to 22 characters — against the
 * real file. Read fresh on every request so dropping art in during `npm run
 * dev` needs no restart.
 */
function artIndex() {
  return {
    name: 'ridgeline-art-index',
    configureServer(server) {
      server.middlewares.use('/art/index.json', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(listArt()));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'art/index.json', source: JSON.stringify(listArt()) });
    }
  };
}

/**
 * The version in the footer, taken from package.json.
 *
 * Written out by hand in the HTML it would be right on the day it shipped and
 * quietly wrong from the next release onward — a footer nobody looks at is
 * exactly where a stale number survives. One source of truth, substituted at
 * serve time and at build time, so dev and the published site cannot disagree.
 */
function version() {
  const v = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version;
  return {
    name: 'ridgeline-version',
    transformIndexHtml: (html) => html.replaceAll('__VERSION__', v)
  };
}

export default defineConfig({
  /* Relative, so the same build works at a domain root AND under a project
     subpath like /ridgeline/ on GitHub Pages. Pinning an absolute base would
     mean one build per destination. */
  base: './',
  plugins: [artIndex(), version()],
  server: { open: true },
  build: { target: 'es2022' }
});
