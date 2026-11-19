const { applyElo, expectedScore } = require('../src/services/rating');

describe('rating', () => {
  test('рівні суперники: переможець +16, переможений -16', () => {
    const w = { rating: 1000 };
    const l = { rating: 1000 };
    expect(applyElo(w, l)).toBe(16);
    expect([w.rating, l.rating]).toEqual([1016, 984]);
  });

  test('перемога сильнішого дає менше очок', () => {
    const w = { rating: 1400 };
    const l = { rating: 1000 };
    expect(applyElo(w, l)).toBeLessThan(16);
    expect(expectedScore(1400, 1000)).toBeGreaterThan(0.5);
  });

  test('рейтинг не стає від’ємним', () => {
    const w = { rating: 1000 };
    const l = { rating: 5 };
    applyElo(w, l);
    expect(l.rating).toBeGreaterThanOrEqual(0);
  });
});
