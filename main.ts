// Token launch radar — entry point (Node 22, standard library only).
//
// Reads the sealed DefiLlama snapshot, scores every pre-token protocol with
// the peer-multiple model in lib/model.ts, and writes the hand-in:
//   board.json    the ranked board the gate checks
//   data.js       the same board, as the dashboard's data
//   dashboard/    the static page (index.html, app.css, app.js)
//   screenshots/  the board, a detail view and a filtered view
//   dossier.json  the judge's summary, built by vendor/makefun-board.ts
//
// In the grader the snapshot is /input/snapshot.json and the hand-in goes to
// /output. Locally: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;

/** --name <value> or --name=<value> out of the arguments, else the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy a directory's regular files into the hand-in, skipping dotfiles. */
function copyDir(from: string, to: string): void {
  if (!existsSync(from)) return;
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    copyFileSync(join(from, name), join(to, name));
  }
}
copyDir(join(here, 'dashboard'), join(out, 'dashboard'));
copyDir(join(here, 'screenshots'), join(out, 'screenshots'));

const dossier = buildDossier(out, {
  text_max_bytes: TEXT_MAX_BYTES,
  screenshots: { max: 4, max_bytes: 524_288 },
});
writeFileSync(join(out, 'dossier.json'), dossier);
process.stdout.write(`token radar: ${board.length} rows, top is ${board[0]!.slug} at $${board[0]!.implied_value_usd}\n`);
