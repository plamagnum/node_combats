module.exports = [
  {
    files: ['src/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly', module: 'writable', process: 'readonly', console: 'readonly',
        __dirname: 'readonly', setTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
        describe: 'readonly', test: 'readonly', expect: 'readonly',
      },
    },
    rules: { 'no-unused-vars': ['warn', { argsIgnorePattern: '^_|^req$|^next$' }] },
  },
  {
    files: ['src/public/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { io: 'readonly', $: 'readonly', api: 'readonly', showToast: 'readonly', state: 'readonly', avatarSvg: 'readonly', openAvatarEditor: 'readonly', window: 'readonly', document: 'readonly', fetch: 'readonly', localStorage: 'readonly', setTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', confirm: 'readonly', alert: 'readonly', prompt: 'readonly', console: 'readonly', navigator: 'readonly' } },
    rules: {},
  },
];
