const { z } = require('zod');

// Єдине джерело правди для варіантів аватара (бекенд валідує, фронтенд малює)
const AVATAR_OPTIONS = {
  gender: ['male', 'female'],
  skin: ['light', 'tan', 'brown', 'dark'],
  hairStyle: ['none', 'short', 'long', 'ponytail'],
  hairColor: ['black', 'brown', 'blond', 'red', 'white'],
  hat: ['none', 'cap', 'helmet', 'wizard', 'crown'],
  top: ['none', 'tunic', 'armor', 'dress'],
  pants: ['none', 'pants', 'skirt'],
  shoes: ['none', 'boots', 'sandals'],
  accessory: ['none', 'glasses', 'scarf', 'cape'],
};

const DEFAULT_AVATAR = {
  skin: 'light',
  hairStyle: 'short',
  hairColor: 'brown',
  hat: 'none',
  top: 'tunic',
  pants: 'pants',
  shoes: 'boots',
  accessory: 'none',
};

const avatarShape = Object.fromEntries(
  Object.entries(AVATAR_OPTIONS)
    .filter(([k]) => k !== 'gender')
    .map(([k, v]) => [k, z.enum(v)]),
);

// Часткове оновлення: можна передати лише змінені поля
const avatarUpdateSchema = z
  .object({ gender: z.enum(AVATAR_OPTIONS.gender), ...avatarShape })
  .partial()
  .strict();

module.exports = { AVATAR_OPTIONS, DEFAULT_AVATAR, avatarUpdateSchema };
