// Axe + Playwright runner
// require playwright lazily after adjusting env to avoid built-in browser checks
const fs = require('fs');
const path = require('path');

const url = process.argv[2];
const arg = process.argv[3];
if (!url) { console.error('Missing URL'); process.exit(2); }

// optional rules: comma-separated or JSON array string
let rules = null;
if (arg) {
  try { rules = JSON.parse(arg); } catch (e) {
    rules = String(arg).split(',').map(s=>s.trim()).filter(Boolean);
  }
}

// try to locate axe-core source from installed modules
function loadAxeSource(){
  const candidates = [
    'axe-core',
    '/usr/local/lib/node_modules/axe-core',
    '/usr/local/lib/node_modules/@axe-core/cli/node_modules/axe-core',
    '/usr/local/lib/node_modules/@axe-core/axe-core',
  ];
  for (const c of candidates){
    try {
      const mod = require(c);
      if (mod && mod.source) return mod.source;
      if (typeof mod === 'string') return mod;
    } catch(e){}
  }
  return null;
}

(async()=>{
  const axeSource = loadAxeSource();
  if (!axeSource) {
    console.error('axe-core module not found');
    process.exit(3);
  }

  // try to find a chrome binary under PLAYWRIGHT_BROWSERS_PATH or use env overrides
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/ms-playwright';
  let chromeBin = process.env.CHROME_BIN || process.env.PUPPETEER_EXECUTABLE_PATH || null;
  if (!chromeBin) {
    try {
      const items = fs.readdirSync(base).filter(d => d.toLowerCase().includes('chromium') || d.toLowerCase().includes('chrome'));
      if (items.length) {
        // pick latest
        const dir = items.sort().pop();
        const candidate = path.join(base, dir, 'chrome-linux', 'chrome');
        if (fs.existsSync(candidate)) chromeBin = candidate;
      }
    } catch(e){}
  }

  const launchOptions = { args: ['--no-sandbox','--disable-dev-shm-usage'] };
  if (chromeBin) launchOptions.executablePath = chromeBin;
  // avoid Playwright trying to validate PLAYWRIGHT_BROWSERS_PATH from env
  const prevPW = process.env.PLAYWRIGHT_BROWSERS_PATH;
  try { delete process.env.PLAYWRIGHT_BROWSERS_PATH; } catch(e){}
  // require playwright lazily AFTER we changed env
  const { chromium } = require('playwright');
  const browser = await chromium.launch(launchOptions);
  if (prevPW) process.env.PLAYWRIGHT_BROWSERS_PATH = prevPW;
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  // Use 'domcontentloaded' instead of 'networkidle' for faster/more reliable loading
  // Increase timeout to 60s for slow pages
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Wait a bit for critical resources to load
  await page.waitForTimeout(2000);
  // inject axe
  await page.addScriptTag({ content: axeSource });

  const opts = {};
  if (rules && Array.isArray(rules) && rules.length) opts.runOnly = { type: 'rule', values: rules };

  const result = await page.evaluate(async (opts) => {
    // axe is available in page scope
    return await window.axe.run(document, opts);
  }, opts);
  const outObj = { url, ts: new Date().toISOString(), result };
  const outStr = JSON.stringify(outObj);
  const outFile = process.env.OUTPUT_FILE || process.argv[3];
  if (outFile) {
    try {
      require('fs').writeFileSync(outFile, outStr, 'utf8');
      const stats = require('fs').statSync(outFile);
      console.log(JSON.stringify({ path: outFile, size: stats.size }));
      await browser.close();
      process.exit(0);
    } catch (e) {
      console.error('Failed to write output file: ' + String(e));
      // fall through to attempt other outputs
    }
  }

  if (Buffer.byteLength(outStr, 'utf8') > 300 * 1024) {
    const outputDir = process.env.OUTPUT_DIR || '/app/results';
    if (!require('fs').existsSync(outputDir)) {
      require('fs').mkdirSync(outputDir, { recursive: true });
    }
    const tmp = require('path').join(outputDir, `axe-playwright-${Date.now()}.json`);
    try {
      require('fs').writeFileSync(tmp, outStr, 'utf8');
      const stats = require('fs').statSync(tmp);
      console.log(JSON.stringify({ path: tmp, size: stats.size }));
      await browser.close();
      process.exit(0);
    } catch (e) {
      console.error('Failed to write temp output file: ' + String(e));
    }
  }

  console.log(outStr);
  await browser.close();
  process.exit(0);
})().catch(e=>{ console.error(e && e.stack ? e.stack : String(e)); process.exit(1); });
