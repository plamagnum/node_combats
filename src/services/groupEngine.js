const { ZONES, BLOCK_PAIRS, resolveStrike } = require('./combatEngine');

const BLOCK_KEYS = Object.keys(BLOCK_PAIRS);
const MAX_ROUNDS = 40;

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

function isAlive(p) {
  return p.hp > 0 && !p.fled;
}

function hasMove(p) {
  return Boolean(p.move && p.move.attackZone && p.move.blockPair);
}

function fillRandomMove(p, rng) {
  p.move = { attackZone: pick(ZONES, rng), blockPair: pick(BLOCK_KEYS, rng), targetIdx: null };
}

// Результат: 'A' | 'B' | 'draw' | null (бій триває). Після ліміту раундів перемагає команда з більшим сумарним HP.
function outcomeOf(parts, roundsPlayed, maxRounds = MAX_ROUNDS) {
  const alive = (team) => parts.some((p) => p.team === team && isAlive(p));
  const a = alive('A');
  const b = alive('B');
  if (!a && !b) return 'draw';
  if (!a) return 'B';
  if (!b) return 'A';
  if (roundsPlayed >= maxRounds) {
    const sum = (team) =>
      parts.filter((p) => p.team === team && isAlive(p)).reduce((s, p) => s + p.hp, 0);
    const sa = sum('A');
    const sb = sum('B');
    if (sa === sb) return 'draw';
    return sa > sb ? 'A' : 'B';
  }
  return null;
}

// Одночасний розрахунок раунду: усі удари рахуються за станом на початок раунду
function resolveGroupRound(parts, round, rng = Math.random) {
  const logs = [];
  const aliveIdx = parts.map((_, i) => i).filter((i) => isAlive(parts[i]));

  aliveIdx.forEach((i) => {
    if (!hasMove(parts[i])) fillRandomMove(parts[i], rng);
  });

  const strikes = [];
  aliveIdx.forEach((i) => {
    const attacker = parts[i];
    const enemies = aliveIdx.filter((j) => parts[j].team !== attacker.team);
    if (!enemies.length) return;
    const wanted = attacker.move.targetIdx;
    const targetIdx = enemies.includes(wanted) ? wanted : pick(enemies, rng);
    const target = parts[targetIdx];
    const strike = resolveStrike(
      attacker.name,
      attacker.stats,
      target.name,
      target.stats,
      attacker.move.attackZone,
      BLOCK_PAIRS[target.move.blockPair] || [],
    );
    strikes.push({ targetIdx, strike });
  });

  strikes.forEach(({ targetIdx, strike }) => {
    const target = parts[targetIdx];
    target.hp = Math.max(0, target.hp - strike.damage);
    logs.push({ round, type: strike.type, text: strike.text });
  });

  aliveIdx.forEach((i) => {
    if (parts[i].hp <= 0)
      logs.push({ round, type: 'system', text: `${parts[i].name} падає на землю!` });
    parts[i].move = { attackZone: null, blockPair: null, targetIdx: null };
  });

  return logs;
}

module.exports = { isAlive, hasMove, outcomeOf, resolveGroupRound, fillRandomMove, MAX_ROUNDS };
