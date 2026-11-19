const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Bot = require('../models/Bot');
const Item = require('../models/Item');

const DEFAULT_BOTS = [
  {
    name: 'Тіньовий Новобранець',
    title: 'Тренувальний бот (Легкий)',
    level: 1,
    rewardXp: 40,
    rewardGold: 25,
    stats: { strength: 4, agility: 4, intuition: 4, endurance: 4 },
  },
  {
    name: 'Вартовий Арени',
    title: 'Досвідчений мечник (Середній)',
    level: 3,
    rewardXp: 90,
    rewardGold: 60,
    stats: { strength: 8, agility: 7, intuition: 7, endurance: 8 },
  },
  {
    name: 'Залізний Берсерк',
    title: 'Чемпіон підземелля (Складний)',
    level: 5,
    rewardXp: 180,
    rewardGold: 130,
    stats: { strength: 14, agility: 10, intuition: 12, endurance: 13 },
  },
];

const DEFAULT_ITEMS = [
  {
    name: 'Іржавий кинджал',
    description: 'Проста стартова зброя для перших боїв на арені.',
    slot: 'weapon',
    price: 35,
    minLevel: 1,
    bonuses: { strength: 1, damageMin: 2, damageMax: 5 },
  },
  {
    name: 'Сталевий меч гладіатора',
    description: 'Добре збалансований клинок із високою пробивною силою.',
    slot: 'weapon',
    price: 120,
    minLevel: 2,
    bonuses: { strength: 3, intuition: 1, damageMin: 5, damageMax: 10 },
  },
  {
    name: 'Сокира руйнівника',
    description: 'Важка дворучна сокира для нищівних критичних ударів.',
    slot: 'weapon',
    price: 260,
    minLevel: 4,
    bonuses: { strength: 6, intuition: 3, damageMin: 9, damageMax: 17 },
  },
  {
    name: 'Шкіряний нагрудник',
    description: 'Легка броня, що не заважає ухилятися.',
    slot: 'armor',
    price: 45,
    minLevel: 1,
    bonuses: { agility: 1, endurance: 1, armor: 4 },
  },
  {
    name: 'Лицарська кольчуга',
    description: 'Надійний захист корпусу в затяжних дуелях.',
    slot: 'armor',
    price: 150,
    minLevel: 2,
    bonuses: { endurance: 3, armor: 10 },
  },
  {
    name: 'Залізний шолом',
    description: 'Захищає голову від випадкових критичних ударів.',
    slot: 'helmet',
    price: 60,
    minLevel: 1,
    bonuses: { endurance: 2, armor: 5 },
  },
  {
    name: 'Кільце спритності',
    description: 'Тонке срібне кільце, що прискорює реакцію бійця.',
    slot: 'ring',
    price: 75,
    minLevel: 1,
    bonuses: { agility: 3, intuition: 1 },
  },
  {
    name: 'Перстень кривавого вовка',
    description: 'Посилює лють та шанс критичного удару.',
    slot: 'ring',
    price: 190,
    minLevel: 3,
    bonuses: { strength: 3, intuition: 4, endurance: 2 },
  },
];

async function seedInitialData() {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  const existingAdmin = await User.findOne({ username: adminUsername });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const admin = new User({
      username: adminUsername,
      passwordHash,
      role: 'admin',
      level: 5,
      gold: 1000,
      freeStats: 10,
      stats: { strength: 12, agility: 10, intuition: 10, endurance: 12 },
    });
    admin.recalcVitals(true);
    await admin.save();
    console.log(`[SEED] Створено адміністратора: ${adminUsername} / ${adminPassword}`);
  }

  for (const botData of DEFAULT_BOTS) {
    const exists = await Bot.findOne({ name: botData.name });
    if (!exists) {
      await Bot.create(botData);
      console.log(`[SEED] Створено бота: ${botData.name}`);
    }
  }

  for (const itemData of DEFAULT_ITEMS) {
    const exists = await Item.findOne({ name: itemData.name });
    if (!exists) {
      await Item.create(itemData);
      console.log(`[SEED] Створено предмет: ${itemData.name}`);
    }
  }
}

module.exports = { seedInitialData };
