import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';

const desktopDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceDirectory = path.resolve(desktopDirectory, '../..');
const brandDirectory = path.join(desktopDirectory, 'assets/brand');
const appIcon = path.join(brandDirectory, 'testron-app-icon');
const macosSigningEnabled = process.env.MACOS_SIGNING_ENABLED === 'true';

const runtimePackages = ['@playwright/test', 'playwright', 'playwright-core'] as const;

const requiredEnvironmentVariable = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set when macOS signing is enabled.`);
  return value;
};

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: '**/node_modules/{@playwright/test,playwright,playwright-core}/**',
    },
    appBundleId: 'dev.testron.desktop',
    icon: appIcon,
    ...(macosSigningEnabled
      ? {
          // @electron/osx-sign discovers the Developer ID Application identity
          // imported into the CI runner's temporary keychain.
          osxSign: {
            keychain: requiredEnvironmentVariable('MACOS_KEYCHAIN_PATH'),
          },
          // Electron Packager submits with notarytool and staples the accepted
          // ticket to the app before Forge creates the distributable ZIP.
          osxNotarize: {
            appleId: requiredEnvironmentVariable('APPLE_ID'),
            appleIdPassword: requiredEnvironmentVariable('APPLE_APP_SPECIFIC_PASSWORD'),
            teamId: requiredEnvironmentVariable('APPLE_TEAM_ID'),
          },
        }
      : {}),
  },
  makers: [new MakerZIP({}, ['darwin', 'win32', 'linux'])],
  hooks: {
    packageAfterPrune: async (_forgeConfig, buildPath) => {
      // The Vite plugin only stages its bundles. Playwright stays external because it
      // relies on dynamic modules and filesystem assets, so copy its production
      // dependency chain from the workspace's hoisted node_modules into the app.
      await Promise.all(
        runtimePackages.map(async (packageName) => {
          const destination = path.join(buildPath, 'node_modules', packageName);
          await mkdir(path.dirname(destination), { recursive: true });
          await cp(path.join(workspaceDirectory, 'node_modules', packageName), destination, {
            recursive: true,
          });
        }),
      );

      await mkdir(path.join(buildPath, 'assets/brand'), { recursive: true });
      await cp(
        path.join(brandDirectory, 'testron-app-icon-18-glass-t-gradient.png'),
        path.join(buildPath, 'assets/brand/testron-app-icon-18-glass-t-gradient.png'),
      );
    },
  },
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main/main.ts', config: 'vite.main.config.mts', target: 'main' },
        { entry: 'src/preload/app.ts', config: 'vite.preload.config.mts', target: 'preload' },
        { entry: 'src/preload/recorder.ts', config: 'vite.preload.config.mts', target: 'preload' },
        { entry: 'src/preload/remote.ts', config: 'vite.preload.config.mts', target: 'preload' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.mts' }],
    }),
  ],
};

export default config;
