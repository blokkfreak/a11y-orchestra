// Playwright-based runner mit Screenshot-Integration + Font-Fix
const { chromium } = require('playwright');

function parseArgs(argv) {
  const result = { url: null, ctx: {} };
  const args = argv.slice(2);
  if (!args.length) return result;
  result.url = args[0];
  let ctxRaw = null;
  if (args.length >= 2) {
    if (args[1] === '--ctx' && args[2]) {
      ctxRaw = args[2];
    } else {
      ctxRaw = args[1];
    }
  }
  if (ctxRaw) {
    try {
      result.ctx = JSON.parse(ctxRaw);
    } catch (err) {
      process.stderr.write('Failed to parse context JSON: ' + String(err));
      process.exit(2);
    }
  }
  return result;
}

const parsed = parseArgs(process.argv);
const url = parsed.url;
const ctx = parsed.ctx;
if (!url) { process.stderr.write('Missing URL'); process.exit(2); }

const VIEWPORTS = ctx.viewports || [{ width: 1280, height: 800 }];
const UA = ctx.ua || 'Mozilla/5.0';
const COOKIES = ctx.cookies || [];
const PRE = ctx.preActions || [];
const SCREENSHOT_TIMEOUT = typeof ctx.screenshotTimeout === 'number' ? ctx.screenshotTimeout : 60000;
const ALLOW_SCREENSHOT_FAILURE = ctx.allowScreenshotFailure !== false;
const FULL_PAGE = ctx.fullPage === true;

const pageExtractTargets = () => {
  function isInteractive(el){
    const name = el.tagName.toLowerCase();
    if (['a','button','input','select','textarea','summary'].includes(name)) return true;
    const role = el.getAttribute('role');
    if (role && /button|link|checkbox|switch|tab|menuitem|radio/.test(role)) return true;
    if (el.hasAttribute('onclick') || el.tabIndex >= 0) return true;
    return false;
  }
  function isInlineTextLink(el){
    try { return el.tagName.toLowerCase()==='a' && window.getComputedStyle(el).display==='inline'; }
    catch(e){ return false; }
  }
  function isVisible(el){
    try {
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      if (parseFloat(cs.opacity) === 0) return false;
      if (cs.pointerEvents === 'none') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    } catch(e){ return false; }
  }

  function isOccluded(el){
    try {
      const r = el.getBoundingClientRect();
      if (!r) return true;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      return top && top !== el && !el.contains(top);
    } catch(e){ return true; }
  }

  const all = Array.from(document.querySelectorAll('a,button,input,select,textarea,summary,[role],[tabindex]'))
     .filter(isInteractive)
     .filter(isVisible)
     .filter(el => !isInlineTextLink(el))
     .filter(el => !isOccluded(el));
  const data = [];
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (!r) continue;
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    data.push({
      selector: el.id ? `#${el.id}` :
                el.getAttribute('data-testid') ? `[data-testid="${el.getAttribute('data-testid')}"]` :
                (el.outerHTML.split('>')[0].slice(0,120)+'>'),
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      width: w, height: h,
      pass: Math.min(w,h) >= 24
    });
  }
  return data;
};

(async () => {
  const executable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({ 
    userAgent: UA, 
    viewport: VIEWPORTS[0], 
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    forcedColors: 'none'
  });
  const page = await context.newPage();

  if (COOKIES.length) {
    try { await context.addCookies(COOKIES); } catch(e){}
  }

  const out = { url, ts: new Date().toISOString(), ua: UA, results: [] };

  for (const vp of VIEWPORTS) {
    try {
      await page.setViewportSize({ width: vp.width, height: vp.height });
    } catch(e) {}
    
    await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: 90000
    });

    await page.waitForLoadState('domcontentloaded').catch(()=>{});

    for (const a of PRE) {
      if (a.type === 'click') await page.locator(a.selector).click().catch(()=>{});
      if (a.type === 'waitFor') await page.waitForSelector(a.selector).catch(()=>{});
    }

    await page.evaluate(() => {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready = Promise.resolve();
      }
      if (document.fonts) {
        document.fonts.forEach(font => {
          try {
            Object.defineProperty(font, 'status', { value: 'loaded' });
          } catch(e) {}
        });
      }
    }).catch(() => {});

    await page.waitForTimeout(2000);

    let screenshotBase64 = null;
    let screenshotError = null;
    try {
      const screenshot = await page.screenshot({
        fullPage: FULL_PAGE,
        type: 'png',
        timeout: SCREENSHOT_TIMEOUT,
        animations: 'disabled',
        scale: 'css'
      });
      screenshotBase64 = screenshot.toString('base64');
    } catch (err) {
      screenshotError = err && err.stack ? err.stack : String(err);
      if (!ALLOW_SCREENSHOT_FAILURE) {
        throw err;
      }
      process.stderr.write(`Screenshot failed for viewport ${vp.width}x${vp.height}: ${screenshotError}\n`);
    }

    const targets = await page.evaluate(pageExtractTargets);
    out.results.push({ 
      viewport: vp, 
      targets,
      screenshot: screenshotBase64,
      screenshotError
    });
  }

  const outStr = JSON.stringify(out);
  process.stdout.write(outStr);
  await browser.close();
  process.exit(0);
})().catch(e => { process.stderr.write(String(e)); process.exit(1); });
