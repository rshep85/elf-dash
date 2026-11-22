# Elf Dash: design decisions

A small Christmas game for the family's own kids (ages 5–10, tuned for 8–10). Hosted publicly on Netlify; strangers playing it is fine.

## Decided together
| Topic | Decision |
|---|---|
| Hero | An elf, seen from behind |
| Genre | Endless-runner style: the elf runs forward automatically in **3 lanes**, can **switch lanes** and **jump** |
| Structure | **3 levels**, each with a finish line. Game over sends you back to level 1 |
| Difficulty | **Easy / Medium / Hard**, chosen at the start |
| Lives | Start with **5**. After a hit you get ~1.6 s of flashing safety |
| Bad things | Fake presents, snowballs, Grumples. All equally bad: one hit = one life |
| Good things | Bauble = 1 pt, Santa = 5 pts, candy cane = +1 life (rare) |
| Streak | 5 good things in a row = **x2 points** until you get hit |
| Sleigh | Speed boost (risky, not a reward). Getting hit during a boost costs a life and ends the boost |
| Leaderboard | **Shared** across devices, **separate top 10 per difficulty**, 1st–3rd shown on a podium. Players type a name |
| Look / sound | Flat vector-style graphics; chiptune ("Nintendo-style") Christmas music |
| Devices | Keyboard first; touch (swipe/tap) already works for tablets |

## Defaults chosen during the build (easy to change)
| Topic | Default | Where to change |
|---|---|---|
| Grinch | Replaced by an original "Grumple" (the Grinch is a trademarked character) | `drawGrumple` in `public/game.js` |
| Jump vs. dodge | Presents and snowballs can be jumped **or** dodged; Grumples are too tall and **must** be dodged | `tall` in `makeObj` |
| Fairness | Every row leaves at least one lane open that you can already reach | `spawnRow` |
| Level clear bonus | +25 × level number | `LEVEL_BONUS` |
| Max lives | 9 (a candy cane at max lives gives 10 pts instead) | `MAX_LIVES` |
| Music | Public-domain carols: Jingle Bells, Deck the Halls, We Wish You a Merry Christmas | `SONGS` |
| Names | Max 12 letters/numbers, with a simple rude-word filter (client and server) | `BLOCK_PARTS` / `BLOCK_WORDS` |
| Zero-point games | Not offered for the leaderboard | `showEnd` |

## Known limits
- The leaderboard API is public, so a technically minded stranger could post a fake score. Acceptable for a family game. If it becomes a problem, add a shared secret or a reset button.
- No accounts or personal data: the only thing stored is the typed name, score, level and date.
