// Щоденні квести та досягнення. Функції змінюють документ користувача, але не зберігають його.
const EVENT_COUNTER = {
  pveWin: 'pveWins',
  pvpWin: 'pvpWins',
  groupWin: 'groupWins',
  dungeonClear: 'dungeonClears',
  bossKill: 'bossKills',
  buy: 'purchases',
};

const QUESTS = [
  { id: 'pve3', title: 'Переможи 3 ботів', event: 'pveWin', target: 3, gold: 60, xp: 40 },
  { id: 'pvp1', title: 'Виграй 1 PvP-дуель', event: 'pvpWin', target: 1, gold: 80, xp: 60 },
  { id: 'group1', title: 'Виграй груповий бій', event: 'groupWin', target: 1, gold: 100, xp: 80 },
  {
    id: 'dungeon1',
    title: 'Пройди підземелля',
    event: 'dungeonClear',
    target: 1,
    gold: 150,
    xp: 120,
  },
  { id: 'buy1', title: 'Купи предмет у магазині', event: 'buy', target: 1, gold: 30, xp: 20 },
];

const ACHIEVEMENTS = [
  {
    id: 'first_blood',
    name: 'Перша кров',
    desc: 'Переможи бота',
    gold: 20,
    target: 1,
    value: (u) => u.counters.pveWins,
  },
  {
    id: 'bot_slayer',
    name: 'Винищувач ботів',
    desc: 'Переможи 25 ботів',
    gold: 100,
    target: 25,
    value: (u) => u.counters.pveWins,
  },
  {
    id: 'duelist',
    name: 'Дуелянт',
    desc: 'Виграй 5 PvP-дуелей',
    gold: 120,
    target: 5,
    value: (u) => u.counters.pvpWins,
  },
  {
    id: 'team_player',
    name: 'Командний гравець',
    desc: 'Виграй 3 групові бої',
    gold: 150,
    target: 3,
    value: (u) => u.counters.groupWins,
  },
  {
    id: 'dungeon_delver',
    name: 'Підземний дослідник',
    desc: 'Пройди підземелля',
    gold: 150,
    target: 1,
    value: (u) => u.counters.dungeonClears,
  },
  {
    id: 'boss_hunter',
    name: 'Мисливець на босів',
    desc: 'Переможи 5 босів',
    gold: 250,
    target: 5,
    value: (u) => u.counters.bossKills,
  },
  {
    id: 'shopper',
    name: 'Шопоголік',
    desc: 'Купи 5 предметів',
    gold: 60,
    target: 5,
    value: (u) => u.counters.purchases,
  },
  {
    id: 'level5',
    name: 'Ветеран',
    desc: 'Досягни 5 рівня',
    gold: 100,
    target: 5,
    value: (u) => u.level,
  },
  {
    id: 'level10',
    name: 'Легенда арени',
    desc: 'Досягни 10 рівня',
    gold: 300,
    target: 10,
    value: (u) => u.level,
  },
  {
    id: 'rating1200',
    name: 'Майстер рейтингу',
    desc: 'Досягни рейтингу 1200',
    gold: 200,
    target: 1200,
    value: (u) => u.rating,
  },
  {
    id: 'clan_member',
    name: 'Не сам',
    desc: 'Вступи до клану',
    gold: 40,
    target: 1,
    value: (u) => (u.clanId ? 1 : 0),
  },
];

function todayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

// Створює список квестів на поточну добу, якщо дата змінилась
function ensureQuests(user, now = new Date()) {
  const key = todayKey(now);
  if (!user.quests || user.quests.date !== key || user.quests.list.length !== QUESTS.length) {
    user.quests = {
      date: key,
      list: QUESTS.map((q) => ({ id: q.id, progress: 0, claimed: false })),
    };
  }
}

function checkAchievements(user) {
  const unlocked = [];
  ACHIEVEMENTS.forEach((a) => {
    if (user.achievements.includes(a.id)) return;
    if (a.value(user) >= a.target) {
      user.achievements.push(a.id);
      user.gold += a.gold;
      unlocked.push(`${a.name} (+${a.gold} зол.)`);
    }
  });
  return unlocked;
}

// Реєструє подію: лічильники, прогрес квестів і нові досягнення
function track(user, event, amount = 1) {
  const counter = EVENT_COUNTER[event];
  if (counter) user.counters[counter] += amount;
  ensureQuests(user);
  QUESTS.filter((q) => q.event === event).forEach((q) => {
    const entry = user.quests.list.find((x) => x.id === q.id);
    if (entry && !entry.claimed) entry.progress = Math.min(q.target, entry.progress + amount);
  });
  return checkAchievements(user);
}

function claimQuest(user, questId) {
  ensureQuests(user);
  const def = QUESTS.find((q) => q.id === questId);
  const entry = user.quests.list.find((x) => x.id === questId);
  if (!def || !entry) return { error: 'Квест не знайдено' };
  if (entry.claimed) return { error: 'Нагороду вже отримано' };
  if (entry.progress < def.target) return { error: 'Квест ще не виконано' };
  entry.claimed = true;
  user.gold += def.gold;
  const leveledUp = user.addXp(def.xp);
  return { reward: { gold: def.gold, xp: def.xp, leveledUp } };
}

function questsView(user) {
  ensureQuests(user);
  return QUESTS.map((q) => {
    const e = user.quests.list.find((x) => x.id === q.id);
    return {
      id: q.id,
      title: q.title,
      target: q.target,
      gold: q.gold,
      xp: q.xp,
      progress: e.progress,
      claimed: e.claimed,
    };
  });
}

function achievementsView(user) {
  return ACHIEVEMENTS.map((a) => ({
    id: a.id,
    name: a.name,
    desc: a.desc,
    gold: a.gold,
    target: a.target,
    progress: Math.min(a.target, a.value(user)),
    unlocked: user.achievements.includes(a.id),
  }));
}

module.exports = {
  track,
  claimQuest,
  questsView,
  achievementsView,
  ensureQuests,
  checkAchievements,
  QUESTS,
  ACHIEVEMENTS,
  todayKey,
};
