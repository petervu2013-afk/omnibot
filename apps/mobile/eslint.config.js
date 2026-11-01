// ESLint flat config for the Expo app (the root config covers web + ai-server only).
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([expoConfig, { ignores: ['dist/*', '.expo/*'] }]);
