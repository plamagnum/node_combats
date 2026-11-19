const {
  resolveStrike,
  chooseBotTurn,
  BLOCK_PAIRS,
  ZONES,
} = require('../src/services/combatEngine');

const stats = {
  strength: 10,
  agility: 5,
  intuition: 5,
  endurance: 5,
  damageMin: 0,
  damageMax: 0,
  armor: 0,
};

describe('combatEngine', () => {
  afterEach(() => jest.restoreAllMocks());

  test('заблокований удар без крита не завдає шкоди', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = resolveStrike('A', stats, 'B', stats, 'head', ['head', 'chest']);
    expect(r).toMatchObject({ type: 'block', damage: 0 });
  });

  test('крит пробиває блок і завдає шкоди', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const r = resolveStrike('A', stats, 'B', stats, 'head', ['head', 'chest']);
    expect(r.type).toBe('crit');
    expect(r.damage).toBeGreaterThan(0);
  });

  test('ухилення дає нуль шкоди', () => {
    const seq = [0.5, 0.99, 0.0]; // rawDamage, crit roll (no), dodge roll (yes)
    jest.spyOn(Math, 'random').mockImplementation(() => seq.shift() ?? 0.99);
    const r = resolveStrike('A', stats, 'B', stats, 'legs', ['head', 'chest']);
    expect(r).toMatchObject({ type: 'dodge', damage: 0 });
  });

  test('броня зменшує шкоду, але не нижче 1', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    const armored = { ...stats, armor: 1000 };
    const r = resolveStrike('A', stats, 'B', armored, 'legs', []);
    expect(r.type).toBe('hit');
    expect(r.damage).toBe(1);
  });

  test('хід бота коректний', () => {
    const t = chooseBotTurn();
    expect(ZONES).toContain(t.attackZone);
    expect(t.blockZones).toEqual(BLOCK_PAIRS[t.blockKey]);
  });
});
