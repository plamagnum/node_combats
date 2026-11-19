const required = ['JWT_SECRET'];
const WEAK = [
  'super_secret_combats_jwt_key_change_me',
  'change_me_to_a_long_random_string_min_32_chars',
];

function validateEnv() {
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Не задано обов'язкові змінні оточення: ${missing.join(', ')}`);
  }
  if (process.env.JWT_SECRET.length < 32 || WEAK.includes(process.env.JWT_SECRET)) {
    throw new Error('JWT_SECRET занадто слабкий: потрібно щонайменше 32 випадкових символи');
  }
  if (!process.env.MONGO_URI) {
    throw new Error('Не задано MONGO_URI');
  }
}

module.exports = { validateEnv };
