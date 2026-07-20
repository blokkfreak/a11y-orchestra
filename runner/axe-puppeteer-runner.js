// Axe-core runner mit Puppeteer
const puppeteer = require('puppeteer-core');
const { execSync } = require('child_process');

function parseArgs(argv) {
  const result = { url: null, rules: [], ctx: {} };
  const args = argv.slice(2);
  if (!args.length) return result;
  
  result.url = args[0];
  
  if (args.length >= 2) {
    try {
      const parsed = JSON.parse(args[1]);
      if (Array.isArray(parsed)) {
        result.rules = parsed;
      } else if (parsed && typeof parsed === 'object') {
        result.ctx = parsed;
        result.rules = parsed.rules || [];
      }
    } catch (e) {
      process.stderr.write('Failed to parse second argument: ' + String(e));
    }
  }
  
  if (args.length >= 3) {
    try {
      result.ctx = JSON.parse(args[2]);
    } catch (e) {
      process.stderr.write('Failed to parse context: ' + String(e));
    }
  }
  
  return result;
}

const parsed = parseArgs(process.argv);
const url = parsed.url;
const rules = parsed.rules;
const ctx = parsed.ctx;

if (!url) {
  process.stderr.write('Missing URL');
  process.exit(2);
}

const VIEWPORT = ctx.viewport || { width: 1280, height: 800 };
const UA = ctx.ua || 'Mozilla/5.0';

(async () => {
  let chromiumPath;
  try {
    chromiumPath = execSync('which chromium || which chromium-browser || which google-chrome', {
      encoding: 'utf8'
    }).trim();
  } catch (e) {
    chromiumPath = '/usr/bin/chromium';
  }

  const browser = await puppeteer.launch({
    executablePath: chromiumPath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: true
  });

  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.setUserAgent(UA);

  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 90000
  });

  await page.waitForTimeout(2000);

  // Axe-core injizieren
  let axeSource;
  try {
    const axeCorePath = require.resolve('axe-core');
    axeSource = require('fs').readFileSync(axeCorePath, 'utf8');
  } catch (e) {
    // Fallback: axe-core von CDN laden
    const https = require('https');
    axeSource = await new Promise((resolve, reject) => {
      https.get('https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }

  await page.evaluate(axeSource);

  // Axe-Optionen vorbereiten
  const axeOptions = {};
  if (rules && rules.length > 0) {
    axeOptions.runOnly = { type: 'rule', values: rules };
  }

  // Axe ausführen
  const results = await page.evaluate((opts) => {
    return window.axe.run(document, opts);
  }, axeOptions);

  await browser.close();

  const output = {
    url,
    timestamp: new Date().toISOString(),
    tool: 'axe-core',
    viewport: VIEWPORT,
    result: results
  };

  const outStr = JSON.stringify(output);
  
  // Bei großen Ergebnissen in Datei schreiben
  if (Buffer.byteLength(outStr, 'utf8') > 300 * 1024) {
    const outputDir = process.env.OUTPUT_DIR || '/app/results';
    if (!require('fs').existsSync(outputDir)) {
      require('fs').mkdirSync(outputDir, { recursive: true });
    }
    const tmp = require('path').join(outputDir, `axe-result-${Date.now()}.json`);
    try {
      require('fs').writeFileSync(tmp, outStr, 'utf8');
      const stats = require('fs').statSync(tmp);
      console.log(JSON.stringify({ path: tmp, size: stats.size, source: 'axe-core' }));
      process.exit(0);
    } catch (e) {
      console.error('Failed to write temp output file: ' + String(e));
    }
  }

  process.stdout.write(outStr);
  process.exit(0);
})().catch(e => {
  process.stderr.write(String(e.stack || e));
  process.exit(1);
});
