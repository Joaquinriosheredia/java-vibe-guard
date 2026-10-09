// Corpus selection for the B0 extended-corpus audit — exactly PREREGISTRATION.md
// "Corpus selection". Uses the gh CLI (authenticated) for the GitHub REST API.
// Writes search-hits.json and corpus.json next to this file.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const QUERY = 'org.springframework.scheduling.annotation.Async CompletableFuture language:Java';
const SLICES = ['size:<1500', 'size:1500..2999', 'size:3000..5999', 'size:6000..11999', 'size:>=12000'];
const EXCLUDED = new Set(['eugenp/tutorials', 'spring-projects/spring-petclinic']);
const EXCLUDED_OWNER = 'joaquinriosheredia';
const N = 50;

const sleep = ms => new Promise(r => setTimeout(r, ms));
function api(path) {
  return JSON.parse(execFileSync('gh', ['api', '-H', 'Accept: application/vnd.github+json', path],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
}
async function apiRetry(path) {
  for (let attempt = 1; ; attempt++) {
    try { return api(path); } catch (e) {
      if (attempt >= 6) throw e;
      process.stderr.write(`retry ${attempt} ${path}: ${String(e.stderr || e.message).trim().split('\n').pop()}\n`);
      await sleep(65_000);   // code search: 10 requests/minute
    }
  }
}

const searchedAt = new Date().toISOString();
const hits = [];
const slices = [];
for (const slice of SLICES) {
  const q = `${QUERY} ${slice}`;
  let total = null;
  for (let page = 1; page <= 10; page++) {
    const r = await apiRetry(`search/code?q=${encodeURIComponent(q)}&per_page=100&page=${page}`);
    total = r.total_count;
    for (const it of r.items) hits.push({ repo: it.repository.full_name, path: it.path, slice });
    process.stderr.write(`${slice} page ${page}: ${r.items.length} (total_count ${total})\n`);
    await sleep(7_000);
    if (r.items.length < 100 || page * 100 >= total) break;
  }
  slices.push({ slice, total_count: total });
}
writeFileSync(join(HERE, 'search-hits.json'), JSON.stringify({ query: QUERY, searchedAt, slices, hits }, null, 2) + '\n');

const candidates = [...new Set(hits.map(h => h.repo))].sort();
const meta = [];
for (const full of candidates) {
  if (EXCLUDED.has(full) || full.split('/')[0].toLowerCase() === EXCLUDED_OWNER) continue;
  let r;
  try { r = await apiRetry(`repos/${full}`); } catch { continue; }   // deleted / renamed since indexing
  if (r.fork) continue;
  meta.push({ repo: r.full_name, stars: r.stargazers_count, defaultBranch: r.default_branch, archived: r.archived });
}
meta.sort((a, b) => b.stars - a.stars || (a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : 0));
const chosen = meta.slice(0, N);
for (const c of chosen) {
  c.commit = (await apiRetry(`repos/${c.repo}/commits/${encodeURIComponent(c.defaultBranch)}`)).sha;
}
writeFileSync(join(HERE, 'corpus.json'), JSON.stringify({
  selectedAt: new Date().toISOString(), searchedAt, query: QUERY, slices: SLICES, n: N,
  candidates: candidates.length, eligible: meta.length, repos: chosen,
}, null, 2) + '\n');
process.stderr.write(`candidates ${candidates.length}, eligible ${meta.length}, chosen ${chosen.length}\n`);
