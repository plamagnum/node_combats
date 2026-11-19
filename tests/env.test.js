const { validateEnv } = require('../src/config/env');

describe('validateEnv', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  test('падає без JWT_SECRET', () => {
    delete process.env.JWT_SECRET;
    expect(() => validateEnv()).toThrow(/JWT_SECRET/);
  });

  test('відхиляє слабкий секрет', () => {
    process.env.JWT_SECRET = 'short';
    process.env.MONGO_URI = 'mongodb://x';
    expect(() => validateEnv()).toThrow(/слабкий/);
  });

  test('приймає коректну конфігурацію', () => {
    process.env.JWT_SECRET = 'a'.repeat(40);
    process.env.MONGO_URI = 'mongodb://x';
    expect(() => validateEnv()).not.toThrow();
  });
});
