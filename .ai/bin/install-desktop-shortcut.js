#!/usr/bin/env node
'use strict';

/**
 * 🖥️ Cross-Platform One-Click Desktop Shortcut Installer (`bin/install-desktop-shortcut.js`)
 * Zero external dependencies — Node.js built-ins only (`fs`, `path`, `os`).
 * Creates a clickable desktop shortcut pointing directly to the repository's native launcher:
 *   - Windows (`win32`) : `InnovaDigits AI OS.bat`
 *   - macOS (`darwin`)  : `InnovaDigits AI OS.command` (chmod 0o755)
 *   - Linux (`linux`)   : `InnovaDigits-AI-OS.desktop` (chmod 0o755)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const OS_ROOT = path.resolve(__dirname, '..');

function buildShortcutSpec(platform, osRoot) {
  if (platform === 'win32') {
    const launcher = path.join(osRoot, 'Start-AI-OS.bat');
    const content = [
      '@echo off',
      `call "${launcher}"`,
      ''
    ].join('\r\n');
    return {
      filename: 'InnovaDigits AI OS.bat',
      executable: false,
      launcher,
      content
    };
  }

  if (platform === 'darwin') {
    const launcher = path.join(osRoot, 'Start-AI-OS.command');
    const content = [
      '#!/usr/bin/env bash',
      `exec "${launcher}" "$@"`,
      ''
    ].join('\n');
    return {
      filename: 'InnovaDigits AI OS.command',
      executable: true,
      launcher,
      content
    };
  }

  const launcher = path.join(osRoot, 'Start-AI-OS.sh');
  const content = [
    '[Desktop Entry]',
    'Version=1.0',
    'Type=Application',
    'Name=InnovaDigits AI OS',
    'Comment=Launch Unified Dual-Core AI Engineering Control Plane',
    `Path=${osRoot}`,
    `Exec=bash "${launcher}"`,
    'Terminal=true',
    'Categories=Development;IDE;',
    ''
  ].join('\n');
  return {
    filename: 'InnovaDigits-AI-OS.desktop',
    executable: true,
    launcher,
    content
  };
}

/**
 * Installs a clickable Desktop launcher for the active or requested platform.
 * @param {{ platform?: string, desktopDir?: string, osRoot?: string, dryRun?: boolean }} [options]
 */
function installDesktopShortcut(options = {}) {
  const platform = options.platform || process.platform;
  const osRoot = path.resolve(options.osRoot || OS_ROOT);
  const desktopDir = path.resolve(options.desktopDir || path.join(os.homedir(), 'Desktop'));
  const dryRun = Boolean(options.dryRun);

  const spec = buildShortcutSpec(platform, osRoot);
  const shortcutPath = path.join(desktopDir, spec.filename);

  if (!dryRun) {
    fs.mkdirSync(desktopDir, { recursive: true });
    fs.writeFileSync(shortcutPath, spec.content, 'utf8');
    if (spec.executable && process.platform !== 'win32') {
      try {
        fs.chmodSync(shortcutPath, 0o755);
      } catch {
        // ignore chmod errors on filesystems without POSIX mode bits
      }
    }
  }

  return {
    ok: true,
    platform,
    dryRun,
    desktopDir,
    shortcutPath,
    launcherPath: spec.launcher,
    executable: spec.executable,
    content: spec.content
  };
}

function parseCliArgs(argv) {
  const opts = { dryRun: false, help: false };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--desktop=')) opts.desktopDir = arg.slice('--desktop='.length);
    else if (arg.startsWith('--platform=')) opts.platform = arg.slice('--platform='.length);
  }
  return opts;
}

if (require.main === module) {
  const cli = parseCliArgs(process.argv.slice(2));
  if (cli.help) {
    console.log('Usage: node bin/install-desktop-shortcut.js [--desktop=<dir>] [--platform=win32|darwin|linux] [--dry-run]');
    process.exit(0);
  }
  const result = installDesktopShortcut(cli);
  console.log(
    `SHORTCUT_${result.dryRun ? 'PREVIEW' : 'INSTALLED'} | platform=${result.platform} | path=${result.shortcutPath}`
  );
}

module.exports = {
  buildShortcutSpec,
  installDesktopShortcut
};

