module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // worklets/reanimated disabled: Reanimated 4's worklets need SharedArrayBuffer,
      // which Expo Go's Hermes doesn't enable — the auto-added worklets babel plugin
      // would load worklets at startup and crash. We use NativeWind only for static
      // styles (no animations), so we don't need it. Re-enable (and use a dev build)
      // when we want NativeWind/reanimated animations.
      ['babel-preset-expo', { jsxImportSource: 'nativewind', worklets: false, reanimated: false }],
      'nativewind/babel',
    ],
  };
};
