const { avatarUpdateSchema, AVATAR_OPTIONS, DEFAULT_AVATAR } = require('../src/services/avatar');

describe('avatar', () => {
  test('дефолтний аватар відповідає допустимим варіантам', () => {
    Object.entries(DEFAULT_AVATAR).forEach(([k, v]) => expect(AVATAR_OPTIONS[k]).toContain(v));
  });

  test('приймає часткове оновлення', () => {
    expect(avatarUpdateSchema.safeParse({ hat: 'crown', gender: 'female' }).success).toBe(true);
  });

  test('відхиляє невідомі значення та поля', () => {
    expect(avatarUpdateSchema.safeParse({ hat: 'rocket' }).success).toBe(false);
    expect(avatarUpdateSchema.safeParse({ role: 'admin' }).success).toBe(false);
  });
});
