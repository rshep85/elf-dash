// Shared leaderboard for Elf Dash.
//   GET  /api/scores?difficulty=easy|medium|hard   -> { entries: [...] }
//   POST /api/scores { difficulty, name, score, level, won } -> { entries, rank }
// Only the top 10 per difficulty are kept, stored in Netlify Blobs.

import { getStore } from '@netlify/blobs';

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const MAX_ENTRIES = 10;
const MAX_SCORE = 100000;

// Keep these name rules in step with public/game.js.
const BLOCK_PARTS = ['fuck', 'shit', 'cunt', 'bitch', 'nigg', 'fagg', 'slut', 'whore', 'wank',
  'twat', 'porn', 'cock', 'penis', 'nazi', 'hitler', 'dildo'];
const BLOCK_WORDS = ['ass', 'arse', 'dick', 'fag', 'sex', 'butt', 'poo', 'poop', 'pee', 'willy',
  'boob', 'boobs', 'tits', 'hell', 'damn', 'crap'];

function cleanName(raw) {
  return String(raw || '').replace(/[^A-Za-z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
}
function nameIsRude(name) {
  const low = name.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
    .replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't');
  const squashed = low.replace(/[^a-z]/g, '');
  if (BLOCK_PARTS.some((p) => squashed.includes(p))) return true;
  return low.split(/[^a-z]+/).filter(Boolean).some((w) => BLOCK_WORDS.includes(w));
}

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export default async (req) => {
  const store = getStore({ name: 'leaderboard', consistency: 'strong' });

  if (req.method === 'GET') {
    const difficulty = new URL(req.url).searchParams.get('difficulty');
    if (!DIFFICULTIES.includes(difficulty)) return json({ error: 'Unknown difficulty.' }, 400);
    const entries = (await store.get(difficulty, { type: 'json' })) ?? [];
    return json({ entries });
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Bad request.' }, 400); }
    const difficulty = body?.difficulty;
    if (!DIFFICULTIES.includes(difficulty)) return json({ error: 'Unknown difficulty.' }, 400);

    const score = Number(body.score);
    if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) return json({ error: 'That score looks odd.' }, 400);

    const name = cleanName(body.name);
    if (!name) return json({ error: 'Please type a name (letters and numbers).' }, 400);
    if (nameIsRude(name)) return json({ error: "Hmm, let's pick a different name!" }, 400);

    const level = Number(body.level);
    const entry = {
      name,
      score,
      level: Number.isInteger(level) && level >= 1 && level <= 3 ? level : 1,
      won: body.won === true,
      date: new Date().toISOString().slice(0, 10),
    };

    const entries = (await store.get(difficulty, { type: 'json' })) ?? [];
    entries.push(entry);
    entries.sort((a, b) => b.score - a.score); // stable: earlier scores win ties
    const top = entries.slice(0, MAX_ENTRIES);
    const rank = top.indexOf(entry);
    if (rank !== -1) await store.setJSON(difficulty, top);
    return json({ entries: top, rank });
  }

  return json({ error: 'Method not allowed.' }, 405);
};

export const config = { path: '/api/scores' };
