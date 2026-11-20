const { getSkill, magicPower, REGEN_PER_ROUND } = require('./skills');
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

const armorBonus = (p) =>
  (p.buffs || []).filter((b) => b.kind === 'armor').reduce((a, b) => a + b.amount, 0);
const defStats = (p) => ({ ...p.stats, armor: (p.stats.armor || 0) + armorBonus(p) });

// Навичка придатна, якщо вивчена, вистачає мани й вона не на перезарядці
function usableSkill(p, id) {
  const sk = id && getSkill(id);
  if (!sk || !(p.skills || []).includes(id) || p.mana < sk.mana) return null;
  if ((p.cooldowns || []).some((c) => c.id === id && c.left > 0)) return null;
  return sk;
}

function spendSkill(p, sk) {
  p.mana -= sk.mana;
  p.cooldowns = [
    ...(p.cooldowns || []).filter((c) => c.id !== sk.id),
    { id: sk.id, left: sk.cooldown + 1 },
  ];
}

function magicDamage(attacker, sk, rng) {
  const base = magicPower(attacker.stats, attacker.level);
  const mult = sk.id === 'lightning' ? 2.2 : 1.5;
  return Math.max(1, Math.round(base * mult * (0.85 + rng() * 0.3)));
}

// Одночасний розрахунок раунду: усі удари рахуються за станом на початок раунду
function resolveGroupRound(parts, round, rng = Math.random) {
  const logs = [];
  const aliveIdx = parts.map((_, i) => i).filter((i) => isAlive(parts[i]));

  aliveIdx.forEach((i) => {
    if (!hasMove(parts[i])) fillRandomMove(parts[i], rng);
  });

  // 1) Лікування та підсилення діють до ударів
  const used = new Map();
  aliveIdx.forEach((i) => {
    const p = parts[i];
    const sk = usableSkill(p, p.move.skill);
    if (!sk) return;
    used.set(i, sk);
    if (sk.kind === 'heal') {
      const allies = aliveIdx.filter((j) => parts[j].team === p.team);
      const t = allies.includes(p.move.targetIdx) ? parts[p.move.targetIdx] : p;
      const amount = Math.round(15 + (p.stats.intuition || 0) * 3 + p.level * 2);
      const before = t.hp;
      t.hp = Math.min(t.maxHp, t.hp + amount);
      spendSkill(p, sk);
      logs.push({
        round,
        type: 'system',
        text: `${p.name} зцілює ${t.name} (${sk.name}) на +${t.hp - before} HP.`,
      });
    } else if (sk.kind === 'buff') {
      spendSkill(p, sk);
      p.buffs = [...(p.buffs || []), { kind: 'armor', amount: 5, left: 3 }];
      logs.push({
        round,
        type: 'system',
        text: `${p.name} застосовує «${sk.name}»: +5 броні на 3 раунди.`,
      });
    }
  });

  // 2) Атаки (звичайні й за навичками)
  const strikes = [];
  aliveIdx.forEach((i) => {
    const attacker = parts[i];
    const sk = used.get(i);
    if (sk && (sk.kind === 'heal' || sk.kind === 'buff')) return;
    const enemies = aliveIdx.filter((j) => parts[j].team !== attacker.team);
    if (!enemies.length) return;
    const wanted = attacker.move.targetIdx;
    const pickTarget = () => (enemies.includes(wanted) ? wanted : pick(enemies, rng));
    const sk2 = sk || usableSkill(attacker, attacker.move.skill);
    const attack = (targetIdx, mult = 1) => {
      const target = parts[targetIdx];
      const strike = resolveStrike(
        attacker.name,
        attacker.stats,
        target.name,
        defStats(target),
        attacker.move.attackZone,
        BLOCK_PAIRS[target.move.blockPair] || [],
      );
      strikes.push({
        targetIdx,
        damage: Math.round(strike.damage * mult),
        type: strike.type,
        text: strike.text,
      });
    };

    if (!sk2) return attack(pickTarget());
    spendSkill(attacker, sk2);
    if (sk2.id === 'power_strike') {
      const t = pickTarget();
      const strike = resolveStrike(
        attacker.name,
        attacker.stats,
        parts[t].name,
        defStats(parts[t]),
        attacker.move.attackZone,
        BLOCK_PAIRS[parts[t].move.blockPair] || [],
      );
      const dmg = Math.round(strike.damage * 1.6);
      strikes.push({
        targetIdx: t,
        damage: dmg,
        type: strike.type,
        text: `${attacker.name} → «${sk2.name}»: ${strike.text}${strike.damage ? ` (×1.6 = -${dmg})` : ''}`,
      });
    } else if (sk2.kind === 'aoe') {
      enemies.forEach((t) => {
        const r = resolveStrike(
          attacker.name,
          attacker.stats,
          parts[t].name,
          defStats(parts[t]),
          attacker.move.attackZone,
          [],
        );
        strikes.push({
          targetIdx: t,
          damage: Math.round(r.damage * 0.6),
          type: r.type,
          text: `«${sk2.name}»: ${r.text}`,
        });
      });
    } else {
      const t = pickTarget();
      const dmg = magicDamage(attacker, sk2, rng);
      strikes.push({
        targetIdx: t,
        damage: dmg,
        type: 'crit',
        text: `${attacker.name} кидає «${sk2.name}» у ${parts[t].name}: -${dmg} HP!`,
      });
    }
  });

  strikes.forEach(({ targetIdx, damage, type, text }) => {
    const target = parts[targetIdx];
    target.hp = Math.max(0, target.hp - damage);
    logs.push({ round, type, text });
  });

  aliveIdx.forEach((i) => {
    const p = parts[i];
    if (p.hp <= 0) logs.push({ round, type: 'system', text: `${p.name} падає на землю!` });
    p.move = { attackZone: null, blockPair: null, targetIdx: null, skill: null };
    if (p.maxMana) p.mana = Math.min(p.maxMana, p.mana + REGEN_PER_ROUND);
    p.cooldowns = (p.cooldowns || [])
      .map((c) => ({ id: c.id, left: c.left - 1 }))
      .filter((c) => c.left > 0);
    p.buffs = (p.buffs || [])
      .map((b) => ({ kind: b.kind, amount: b.amount, left: b.left - 1 }))
      .filter((b) => b.left > 0);
  });

  return logs;
}

module.exports = {
  usableSkill,
  isAlive,
  hasMove,
  outcomeOf,
  resolveGroupRound,
  fillRandomMove,
  MAX_ROUNDS,
};
