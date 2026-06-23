const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// NOTE: do NOT set `disableHierarchicalLookup = true`. With node-linker=hoisted,
// most deps live flat at the workspace root, but pnpm still nests version-specific
// copies (e.g. whatwg-url-without-unicode needs webidl-conversions@5, while jsdom
// pulls @8 to the root). Disabling hierarchical lookup made Metro grab the wrong
// root version (@8), whose unguarded SharedArrayBuffer access crashes in Expo Go's
// Hermes. Hierarchical lookup lets Metro find the correctly-nested versions.

module.exports = withNativeWind(config, { input: './global.css' });
