// Підземелля: послідовність поверхів, останній — бос. Монстри керуються сервером.
const mon = (name, emoji, level, s, a, i, e, extra = {}) => ({
  name,
  emoji,
  level,
  stats: {
    strength: s,
    agility: a,
    intuition: i,
    endurance: e,
    damageMin: 0,
    damageMax: 0,
    armor: 0,
    ...extra.stats,
  },
  hpBonus: extra.hpBonus || 0,
  boss: Boolean(extra.boss),
});

const DUNGEONS = [
  {
    id: 'catacombs',
    name: 'Катакомби',
    minLevel: 1,
    maxParty: 3,
    finalBonus: { xp: 150, gold: 100 },
    floors: [
      {
        name: 'Вхід у катакомби',
        reward: { xp: 40, gold: 25 },
        monsters: [
          mon('Скелет-воїн', '💀', 1, 4, 4, 4, 4),
          mon('Скелет-воїн', '💀', 1, 4, 4, 4, 4),
        ],
      },
      {
        name: 'Зала кісток',
        reward: { xp: 55, gold: 35 },
        monsters: [mon('Скелет-лучник', '🏹', 2, 6, 7, 6, 5), mon('Зомбі', '🧟', 2, 8, 3, 3, 8)],
      },
      {
        name: 'Трон мерця',
        reward: { xp: 90, gold: 60 },
        monsters: [
          mon('Король скелетів', '👑', 4, 10, 6, 7, 14, {
            boss: true,
            stats: { armor: 4, damageMin: 2, damageMax: 5 },
            hpBonus: 40,
          }),
        ],
      },
    ],
  },
  {
    id: 'orc_cave',
    name: 'Печера орків',
    minLevel: 3,
    maxParty: 3,
    finalBonus: { xp: 300, gold: 220 },
    floors: [
      {
        name: 'Табір розвідників',
        reward: { xp: 70, gold: 45 },
        monsters: [
          mon('Орк-розвідник', '👹', 3, 8, 8, 6, 7),
          mon('Орк-розвідник', '👹', 3, 8, 8, 6, 7),
        ],
      },
      {
        name: 'Кузня',
        reward: { xp: 90, gold: 60 },
        monsters: [
          mon('Орк-коваль', '🔨', 4, 12, 5, 5, 10, {
            stats: { armor: 3, damageMin: 2, damageMax: 4 },
          }),
          mon('Орк-розвідник', '👹', 3, 8, 8, 6, 7),
        ],
      },
      {
        name: 'Зала вождя',
        reward: { xp: 160, gold: 110 },
        monsters: [
          mon('Вождь орків', '🪓', 6, 15, 9, 9, 17, {
            boss: true,
            stats: { armor: 6, damageMin: 3, damageMax: 8 },
            hpBonus: 70,
          }),
        ],
      },
    ],
  },
  {
    id: 'dragon_lair',
    name: 'Лігво дракона',
    minLevel: 6,
    maxParty: 3,
    finalBonus: { xp: 600, gold: 450 },
    floors: [
      {
        name: 'Вогняні тунелі',
        reward: { xp: 130, gold: 90 },
        monsters: [
          mon('Вогняний елементаль', '🔥', 6, 13, 10, 10, 11),
          mon('Вогняний елементаль', '🔥', 6, 13, 10, 10, 11),
        ],
      },
      {
        name: 'Скарбниця',
        reward: { xp: 170, gold: 130 },
        monsters: [
          mon('Варта дракона', '🛡️', 8, 17, 9, 9, 15, {
            stats: { armor: 6, damageMin: 3, damageMax: 6 },
          }),
          mon('Варта дракона', '🛡️', 8, 17, 9, 9, 15, {
            stats: { armor: 6, damageMin: 3, damageMax: 6 },
          }),
        ],
      },
      {
        name: 'Лігво',
        reward: { xp: 300, gold: 220 },
        monsters: [
          mon('Древній дракон', '🐉', 11, 22, 11, 13, 24, {
            boss: true,
            stats: { armor: 10, damageMin: 4, damageMax: 10 },
            hpBonus: 120,
          }),
        ],
      },
    ],
  },
];

function getDungeon(id) {
  return DUNGEONS.find((d) => d.id === id) || null;
}

// HP монстра: формула гравця + бонус боса; масштабується під розмір групи
function buildNpcs(floor, partySize) {
  const scale = 1 + 0.6 * (Math.max(1, partySize) - 1);
  return floor.monsters.map((m) => {
    const base = 60 + m.stats.endurance * 10 + (m.level - 1) * 15 + m.hpBonus;
    const maxHp = Math.round(base * scale);
    return {
      name: m.name,
      emoji: m.emoji,
      level: m.level,
      stats: { ...m.stats },
      hp: maxHp,
      maxHp,
      boss: m.boss,
    };
  });
}

function publicDungeon(d) {
  return {
    id: d.id,
    name: d.name,
    minLevel: d.minLevel,
    maxParty: d.maxParty,
    floors: d.floors.map((f) => ({
      name: f.name,
      monsters: f.monsters.map((m) => `${m.emoji} ${m.name}`),
      boss: f.monsters.some((m) => m.boss),
    })),
  };
}

module.exports = { DUNGEONS, getDungeon, buildNpcs, publicDungeon };
