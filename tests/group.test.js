const { outcomeOf, resolveGroupRound } = require('../src/services/groupEngine');
const { teamEloDelta } = require('../src/services/rating');
const { buildNpcs, getDungeon } = require('../src/services/dungeons');
const { track, claimQuest, questsView } = require('../src/services/progress');

const stats = {
  strength: 5,
  agility: 5,
  intuition: 5,
  endurance: 5,
  damageMin: 1,
  damageMax: 3,
  armor: 0,
};
const p = (name, team, hp) => ({ name, team, hp, maxHp: 100, stats, fled: false, move: {} });

describe('groupEngine', () => {
  test('outcomeOf: перемагає команда з живими, нічия коли всі впали', () => {
    expect(outcomeOf([p('a', 'A', 10), p('b', 'B', 0)], 1)).toBe('A');
    expect(outcomeOf([p('a', 'A', 0), p('b', 'B', 0)], 1)).toBe('draw');
    expect(outcomeOf([p('a', 'A', 10), { ...p('b', 'B', 10), fled: true }], 1)).toBe('A');
  });

  test('outcomeOf: після ліміту раундів перемагає більше сумарне HP', () => {
    expect(outcomeOf([p('a', 'A', 30), p('b', 'B', 10)], 40)).toBe('A');
    expect(outcomeOf([p('a', 'A', 10), p('b', 'B', 10)], 40)).toBe('draw');
    expect(outcomeOf([p('a', 'A', 30), p('b', 'B', 10)], 5)).toBeNull();
  });

  test('resolveGroupRound: HP не зростає, ходи скидаються, ціль лише з ворогів', () => {
    const parts = [p('a1', 'A', 100), p('a2', 'A', 100), p('b1', 'B', 100)];
    parts[0].move = { attackZone: 'head', blockPair: 'head-chest', targetIdx: 1 };
    const logs = resolveGroupRound(parts, 1);
    expect(logs.length).toBeGreaterThan(0);
    expect(parts[1].hp).toBe(100);
    parts.forEach((x) => {
      expect(x.hp).toBeLessThanOrEqual(100);
      expect(x.move.attackZone).toBeNull();
    });
  });
});

describe('dungeons / rating / progress', () => {
  test('buildNpcs масштабує HP під розмір групи', () => {
    const floor = getDungeon('catacombs').floors[0];
    expect(buildNpcs(floor, 3)[0].maxHp).toBeGreaterThan(buildNpcs(floor, 1)[0].maxHp);
  });

  test('teamEloDelta більший, коли виграє слабша команда', () => {
    expect(teamEloDelta([900], [1200])).toBeGreaterThan(teamEloDelta([1200], [900]));
  });

  test('квест: прогрес, нагорода лише один раз', () => {
    const user = {
      gold: 0,
      level: 1,
      rating: 1000,
      achievements: [],
      counters: {},
      quests: {},
      addXp: () => false,
    };
    ['pveWin', 'pveWin', 'pveWin'].forEach(() => track(user, 'pveWin'));
    const q = questsView(user).find((x) => x.id === 'pve3');
    expect(q.progress).toBe(3);
    expect(claimQuest(user, 'pve3').reward).toBeDefined();
    expect(claimQuest(user, 'pve3').error).toBeDefined();
  });
});
