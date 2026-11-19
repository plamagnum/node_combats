const ZONES = ['head', 'chest', 'belly', 'legs'];

const ZONE_LABELS = {
  head: 'голову',
  chest: 'груди',
  belly: 'пояс',
  legs: 'ноги',
};

const BLOCK_PAIRS = {
  'head-chest': ['head', 'chest'],
  'chest-belly': ['chest', 'belly'],
  'belly-legs': ['belly', 'legs'],
  'legs-head': ['legs', 'head'],
};

const BLOCK_KEYS = Object.keys(BLOCK_PAIRS);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function resolveStrike(
  attackerName,
  attackerStats,
  defenderName,
  defenderStats,
  attackZone,
  defenderBlockZones,
) {
  const zoneLabel = ZONE_LABELS[attackZone] || attackZone;
  const isBlocked = defenderBlockZones.includes(attackZone);

  const dodgeChance = clamp(5 + defenderStats.agility * 1.4 - attackerStats.agility * 0.6, 3, 45);
  const critChance = clamp(
    5 + attackerStats.intuition * 1.5 - defenderStats.intuition * 0.5,
    4,
    50,
  );

  const weaponMin = attackerStats.damageMin || 0;
  const weaponMax = attackerStats.damageMax || 0;
  const defenderArmor = defenderStats.armor || 0;

  const minDmg = Math.max(3, Math.round(attackerStats.strength * 1.5) + weaponMin);
  const maxDmg = Math.max(minDmg, Math.round(attackerStats.strength * 2.4 + 4) + weaponMax);
  const rawDamage = randomInt(minDmg, maxDmg);
  const isCrit = Math.random() * 100 < critChance;
  const isDodged = Math.random() * 100 < dodgeChance;

  const applyArmor = (dmg) => Math.max(1, Math.round(dmg - defenderArmor * 0.45));

  if (isBlocked) {
    if (isCrit) {
      const piercedDamage = applyArmor(Math.max(2, Math.round(rawDamage * 0.65)));
      return {
        damage: piercedDamage,
        type: 'crit',
        text: `${attackerName} завдав критичного удару в ${zoneLabel} і пробив блок ${defenderName} на -${piercedDamage} HP!`,
      };
    }
    return {
      damage: 0,
      type: 'block',
      text: `${defenderName} заблокував удар ${attackerName} у ${zoneLabel}.`,
    };
  }

  if (isDodged) {
    return {
      damage: 0,
      type: 'dodge',
      text: `${defenderName} спритно ухилився від удару ${attackerName} у ${zoneLabel}!`,
    };
  }

  if (isCrit) {
    const critDamage = applyArmor(Math.round(rawDamage * 1.75));
    return {
      damage: critDamage,
      type: 'crit',
      text: `${attackerName} завдав КРИТИЧНОГО удару в ${zoneLabel} по ${defenderName} на -${critDamage} HP!`,
    };
  }

  const finalDamage = applyArmor(rawDamage);
  return {
    damage: finalDamage,
    type: 'hit',
    text: `${attackerName} влучив у ${zoneLabel} по ${defenderName} на -${finalDamage} HP.`,
  };
}

function chooseBotTurn() {
  const attackZone = randomChoice(ZONES);
  const blockKey = randomChoice(BLOCK_KEYS);
  return {
    attackZone,
    blockKey,
    blockZones: BLOCK_PAIRS[blockKey],
  };
}

module.exports = {
  ZONES,
  ZONE_LABELS,
  BLOCK_PAIRS,
  resolveStrike,
  chooseBotTurn,
};
