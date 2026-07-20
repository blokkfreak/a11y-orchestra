const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const target = process.argv[2] || process.env.URL;
if (!target) {
  console.error('Usage: node pa11y-runner.js <url>');
  process.exit(2);
}

const OUTPUT_DIR = process.env.OUTPUT_DIR || '/app/results';
const OUTPUT_FILE = process.env.OUTPUT_FILE || null;

function writeResult(payload, exitCode = 0) {
  const out = JSON.stringify(payload, null, 2);
  let targetFile = OUTPUT_FILE;
  try {
    if (!targetFile) {
      if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      }
      targetFile = path.join(OUTPUT_DIR, `pa11y-${Date.now()}.json`);
    } else {
      const parent = path.dirname(targetFile);
      if (parent && !fs.existsSync(parent)) {
        fs.mkdirSync(parent, { recursive: true });
      }
    }
    fs.writeFileSync(targetFile, out, 'utf8');
    const stats = fs.statSync(targetFile);
    console.log(JSON.stringify({ path: targetFile, size: stats.size, source: payload.source || 'pa11y' }));
  } catch (err) {
    console.error('Failed to write output file: ' + String(err));
    process.stdout.write(out);
    process.exit(exitCode);
    return;
  }
  process.exit(exitCode);
}

function emitCrash(err) {
  writeResult({
    source: 'pa11y',
    url: target,
    timestamp: new Date().toISOString(),
    pa11yCrashed: true,
    error: err && err.stack ? err.stack : String(err)
  });
}

// Try to load pa11y programmatically (global or local)
let pa11y = null;
try { pa11y = require('/usr/local/lib/node_modules/pa11y'); } catch (e) { try { pa11y = require('pa11y'); } catch (_) { pa11y = null; } }

if (!pa11y) {
  // Fallback to CLI
  const args = [target, '--reporter', 'json'];
  const child = spawn('pa11y', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const stderrChunks = [];

  child.stdout.pipe(process.stdout);
  child.stderr.on('data', chunk => {
    stderrChunks.push(chunk);
    process.stderr.write(chunk);
  });

  child.on('close', code => {
    if (code === 0) {
      process.exit(0);
    } else {
      emitCrash(stderrChunks.length ? Buffer.concat(stderrChunks).toString('utf8') : `pa11y CLI exited with code ${code}`);
    }
  });

  child.on('error', emitCrash);
} else {
  // If pa11y module is available, run programmatically. Use default options; allow PA11Y_OPTIONS env var.
  (async () => {
    try {
      let options = {};
      if (process.env.PA11Y_OPTIONS) {
        try { options = JSON.parse(process.env.PA11Y_OPTIONS); } catch (_) {}
      }
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN;
      const requiredArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
      if (!options.chromeLaunchConfig || typeof options.chromeLaunchConfig !== 'object') {
        options.chromeLaunchConfig = {};
      }
      const chromeConfig = options.chromeLaunchConfig;
      if (executablePath && !chromeConfig.executablePath) {
        chromeConfig.executablePath = executablePath;
      }
      const existingArgs = Array.isArray(chromeConfig.args) ? chromeConfig.args.slice() : [];
      for (const arg of requiredArgs) {
        if (!existingArgs.includes(arg)) {
          existingArgs.push(arg);
        }
      }
      chromeConfig.args = existingArgs;
      if (options.timeout == null) {
        options.timeout = 120000; // allow slower pages to load inside container
      }
      if (options.wait == null) {
        options.wait = 1000; // give page a moment before audit runs
      }
      const rawResult = await pa11y(target, Object.assign({}, { reporter: 'json' }, options));
      
      // Normalize pa11y result to unified format
      const normalized = {
        source: 'pa11y',
        url: target,
        timestamp: new Date().toISOString(),
        issues: Array.isArray(rawResult.issues) ? rawResult.issues.map(issue => ({
          code: issue.code || null,
          type: issue.type || 'unknown',
          message: issue.message || '',
          context: issue.context || null,
          selector: issue.selector || null,
          runner: issue.runner || null,
          impact: issue.type === 'error' ? 'critical' : issue.type === 'warning' ? 'serious' : 'moderate'
        })) : [],
        summary: {
          total: rawResult.issues ? rawResult.issues.length : 0,
          errors: rawResult.issues ? rawResult.issues.filter(i => i.type === 'error').length : 0,
          warnings: rawResult.issues ? rawResult.issues.filter(i => i.type === 'warning').length : 0,
          notices: rawResult.issues ? rawResult.issues.filter(i => i.type === 'notice').length : 0
        },
        raw: rawResult
      };
      
      writeResult(normalized);
    } catch (err) {
      emitCrash(err);
    }
  })();
}
