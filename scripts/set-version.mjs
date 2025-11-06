#!/usr/bin/env node

/**
 * Syncs version strings across the project.
 *
 * Usage:
 *   node scripts/set-version.mjs 1.0.2
 */

import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const newVersion = process.argv[2];

if (!newVersion) {
  console.error('Usage: node scripts/set-version.mjs <new-version>');
  process.exit(1);
}

const semverPattern = /^\d+\.\d+\.\d+$/;
if (!semverPattern.test(newVersion)) {
  console.error(`Invalid version "${newVersion}". Use semantic versioning (e.g., 1.2.3).`);
  process.exit(1);
}

const pkgPath = path.join(projectRoot, 'package.json');
const pkgJson = JSON.parse(await readFile(pkgPath, 'utf8'));
const previousVersion = pkgJson.version;

if (previousVersion === newVersion) {
  console.log(`Version is already ${newVersion}. No changes made.`);
  process.exit(0);
}

pkgJson.version = newVersion;
await writeFile(pkgPath, JSON.stringify(pkgJson, null, 2) + '\n');

async function updatePackageLock() {
  const lockPath = path.join(projectRoot, 'package-lock.json');
  try {
    const lockJson = JSON.parse(await readFile(lockPath, 'utf8'));
    lockJson.version = newVersion;
    if (lockJson.packages && lockJson.packages['']) {
      lockJson.packages[''].version = newVersion;
    }
    await writeFile(lockPath, JSON.stringify(lockJson, null, 2) + '\n');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

async function updateReadme() {
  const readmePath = path.join(projectRoot, 'README.md');
  const original = await readFile(readmePath, 'utf8');
  const updated = original.replace(/version-\d+\.\d+\.\d+-blue/, `version-${newVersion}-blue`);
  if (updated === original) {
    throw new Error('Failed to update version badge in README.md');
  }
  await writeFile(readmePath, updated);
}

async function updateTauriConfig() {
  const configPath = path.join(projectRoot, 'src-tauri', 'tauri.conf.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.version = newVersion;
  if (Array.isArray(config.app?.windows)) {
    config.app.windows = config.app.windows.map(window => {
      if (typeof window.title === 'string') {
        window.title = window.title.replace(/v\d+\.\d+\.\d+/, `v${newVersion}`);
      }
      return window;
    });
  }
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
}

async function updateCargoToml() {
  const cargoPath = path.join(projectRoot, 'src-tauri', 'Cargo.toml');
  const original = await readFile(cargoPath, 'utf8');
  const updated = original.replace(/^version\s*=\s*".*"/m, `version = "${newVersion}"`);
  if (updated === original) {
    throw new Error('Failed to update version in src-tauri/Cargo.toml');
  }
  await writeFile(cargoPath, updated);
}

await Promise.all([
  updatePackageLock(),
  updateReadme(),
  updateTauriConfig(),
  updateCargoToml()
]);

console.log(`Version updated: ${previousVersion} → ${newVersion}`);
