// babel-preset-expo auto-configures the Reanimated/Worklets plugin on SDK 56.
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
