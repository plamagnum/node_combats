// Навички й магія для групових боїв. kind: attack/aoe/heal/buff; target: enemy/ally/self/all
const SKILLS = [
  {
    id: 'power_strike',
    name: 'Потужний удар',
    icon: '💥',
    kind: 'attack',
    target: 'enemy',
    mana: 8,
    cooldown: 2,
    minLevel: 1,
    price: 80,
    desc: 'Фізичний удар із шкодою ×1.6',
  },
  {
    id: 'fireball',
    name: 'Вогняна куля',
    icon: '🔥',
    kind: 'attack',
    target: 'enemy',
    mana: 14,
    cooldown: 2,
    minLevel: 2,
    price: 150,
    desc: 'Магічна шкода, що ігнорує блок і броню',
  },
  {
    id: 'heal',
    name: 'Зцілення',
    icon: '💚',
    kind: 'heal',
    target: 'ally',
    mana: 12,
    cooldown: 3,
    minLevel: 2,
    price: 150,
    desc: 'Відновлює HP союзнику (або собі)',
  },
  {
    id: 'stone_skin',
    name: 'Кам’яна шкіра',
    icon: '🛡️',
    kind: 'buff',
    target: 'self',
    mana: 10,
    cooldown: 4,
    minLevel: 3,
    price: 200,
    desc: '+5 броні на 3 раунди',
  },
  {
    id: 'whirlwind',
    name: 'Вихор клинків',
    icon: '🌪️',
    kind: 'aoe',
    target: 'all',
    mana: 18,
    cooldown: 3,
    minLevel: 4,
    price: 350,
    desc: 'Б’є всіх ворогів із шкодою ×0.6',
  },
  {
    id: 'lightning',
    name: 'Блискавка',
    icon: '⚡',
    kind: 'attack',
    target: 'enemy',
    mana: 24,
    cooldown: 4,
    minLevel: 6,
    price: 600,
    desc: 'Потужна магічна шкода, що ігнорує блок і броню',
  },
];

const REGEN_PER_ROUND = 5;

const getSkill = (id) => SKILLS.find((s) => s.id === id) || null;
const maxManaFor = (stats) => 30 + (stats.intuition || 0) * 4;
const magicPower = (stats, level) => 8 + (stats.intuition || 0) * 2 + (level || 1) * 2;

module.exports = { SKILLS, REGEN_PER_ROUND, getSkill, maxManaFor, magicPower };
