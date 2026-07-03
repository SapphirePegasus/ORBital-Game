module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Path aliases (must match tsconfig paths)
      [
        'module-resolver',
        {
          root: ['./src'],
          alias: {
            '@': './src',
            '@engine': './src/engine',
            '@store': './src/store',
            '@screens': './src/screens',
            '@game': './src/game',
            '@audio': './src/audio',
            '@constants': './src/constants/index.ts',
            '@utils': './src/utils',
          },
        },
      ],
      // Reanimated MUST be last
      'react-native-reanimated/plugin',
    ],
  };
};
