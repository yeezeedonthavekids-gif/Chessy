// Renders every assets/*.svg to a 512x512 PNG next to it. Run: node tools/render_icons.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const dir = path.join(__dirname, '..', 'assets');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
    await page.goto('file://' + path.join(dir, file));
    await page.screenshot({ path: path.join(dir, file.replace('.svg', '.png')) });
    console.log('rendered', file.replace('.svg', '.png'));
  }
  await browser.close();
})();
