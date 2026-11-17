const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');

// 1. Ensure dist/index.html exists from dist/index.dev.html if needed
const distDevHtml = path.resolve(distDir, 'index.dev.html');
const distIndexHtml = path.resolve(distDir, 'index.html');

if (fs.existsSync(distDevHtml)) {
  fs.copyFileSync(distDevHtml, distIndexHtml);
  console.log('✓ Created dist/index.html from dist/index.dev.html');
}

// 2. Mirror compiled assets to root for direct branch root hosting (main / root)
const assetsSource = path.resolve(distDir, 'assets');
const assetsDest = path.resolve(rootDir, 'assets');

if (fs.existsSync(assetsSource)) {
  if (!fs.existsSync(assetsDest)) {
    fs.mkdirSync(assetsDest, { recursive: true });
  }
  const assetFiles = fs.readdirSync(assetsSource);
  for (const file of assetFiles) {
    fs.copyFileSync(path.resolve(assetsSource, file), path.resolve(assetsDest, file));
  }
  console.log(`✓ Mirrored ${assetFiles.length} asset(s) to ./assets/`);
}

// 3. Mirror dist/index.html to root ./index.html
if (fs.existsSync(distIndexHtml)) {
  fs.copyFileSync(distIndexHtml, path.resolve(rootDir, 'index.html'));
  console.log('✓ Mirrored dist/index.html to root ./index.html');
}

// 4. Mirror static public items to root (vite.svg, 404.html, .nojekyll)
const staticFiles = ['.nojekyll', '404.html', 'vite.svg'];
for (const file of staticFiles) {
  const src = path.resolve(distDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.resolve(rootDir, file));
    console.log(`✓ Mirrored ${file} to root ./${file}`);
  }
}

console.log('Post-build sync complete: Root is now self-hosting capable for GitHub Pages branch deployment.');
