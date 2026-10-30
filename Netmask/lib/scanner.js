// Static JAR analysis. Nothing in the uploaded file is ever executed:
// we unzip it in memory, parse every .class constant pool, recurse into
// nested jars and run the rules in rules.js over what we find.

const crypto = require('crypto');
const yauzl = require('yauzl');
const { parseClass } = require('./classfile');
const { rules, W } = require('./rules');

const LIMITS = {
  maxEntries: 200000,
  maxTotalUncompressed: 2 * 1024 * 1024 * 1024, // 2 GB across all nested jars
  maxEntrySize: 256 * 1024 * 1024,
  maxRatio: 200, // zip bomb guard
  maxDepth: 4,
  maxEvidencePerRule: 25,
};

const TEXT_EXT = /\.(json|properties|txt|yml|yaml|toml|cfg|conf|xml|mf|info|js|sh|bat|cmd|ps1|vbs|py|kts?)$/i;
const ARCHIVE_EXT = /\.(jar|zip|war|litemod)$/i;
const KNOWN_OBFUSCATORS = [
  ['Allatori', /allatori/i], ['ZKM', /zelix|zkm/i], ['Stringer', /stringer|licel/i],
  ['Branchlock', /branchlock/i], ['Skidfuscator', /skidfuscator/i], ['Paramorphism', /paramorphism/i],
  ['Radon', /\bradon\b/i], ['Caesium', /caesium/i], ['Bozar', /\bbozar\b/i], ['qProtect', /qprotect/i],
  ['Superblaubeere27', /superblaubeere/i], ['ProGuard', /proguard/i], ['Binscure', /binscure/i],
  ['Scuti', /scuti/i], ['DashO', /dasho|preemptive/i], ['Stringer', /JNIC|jnic/],
];

function openZip(buf) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true, validateEntrySizes: true, strictFileNames: false }, (err, zip) => {
      if (err) reject(err); else resolve(zip);
    });
  });
}

function readEntry(zip, entry) {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err) return reject(err);
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  });
}

function entropy(s) {
  if (!s.length) return 0;
  const freq = {};
  for (const ch of s) freq[ch] = (freq[ch] || 0) + 1;
  let h = 0;
  for (const k in freq) { const p = freq[k] / s.length; h -= p * Math.log2(p); }
  return h;
}

// Strings malware commonly hides: base64, reversed, or char-shifted.
function variants(str) {
  const out = [{ value: str, how: null }];
  if (str.length >= 16 && str.length < 20000 && /^[A-Za-z0-9+/_-]+={0,2}$/.test(str)) {
    try {
      const dec = Buffer.from(str, /[-_]/.test(str) ? 'base64url' : 'base64').toString('utf8');
      if (dec.length >= 8 && /^[\x09\x0a\x0d\x20-\x7e]+$/.test(dec)) out.push({ value: dec, how: 'base64' });
    } catch { /* not base64 */ }
  }
  if (str.length >= 10 && str.length < 2000) {
    const rev = [...str].reverse().join('');
    if (/https?:\/\/|webhooks|\.json|Local Storage/i.test(rev)) out.push({ value: rev, how: 'reversed' });
  }
  return out;
}

function isWeirdName(simple) {
  return (
    /^[Il1|]{4,}$/.test(simple) ||                 // IlIlIl-style
    /[^\x20-\x7e]/.test(simple) ||                 // unicode / invisible chars
    /^(con|aux|nul|prn|com\d|lpt\d)$/i.test(simple) // Windows-reserved names that break extraction
  );
}

class Scan {
  constructor() {
    this.hits = new Map();          // ruleId -> [{where, match, how}]
    this.urls = new Map();          // url -> where
    this.files = [];
    this.stats = { classes: 0, files: 0, nestedJars: 0, bytes: 0, parseErrors: 0, javaVersions: {} };
    this.obf = { short: 0, weird: 0, highEntropyStrings: 0, obfuscators: new Set() };
    this.meta = {};
    this.warnings = [];
    this.totalUncompressed = 0;
  }

  hit(rule, where, match, how) {
    let list = this.hits.get(rule.id);
    if (!list) this.hits.set(rule.id, (list = []));
    if (list.length < LIMITS.maxEvidencePerRule) list.push({ where, match: String(match).slice(0, 300), how });
    else list.overflow = (list.overflow || 0) + 1;
  }

  checkString(str, where) {
    for (const { value, how } of variants(str)) {
      for (const m of value.matchAll(/https?:\/\/[^\s"'<>\\]{4,200}/gi)) {
        if (!this.urls.has(m[0])) this.urls.set(m[0], { where, how });
      }
      for (const rule of rules) {
        if (!rule.strings) continue;
        for (const re of rule.strings) {
          const m = value.match(re);
          if (m) { this.hit(rule, where, how ? `${value.slice(0, 200)}` : m[0], how); break; }
        }
      }
      for (const [name, re] of KNOWN_OBFUSCATORS) if (re.test(value) && value.length < 120) this.obf.obfuscators.add(name);
    }
    if (str.length >= 40 && entropy(str) > 5.2) this.obf.highEntropyStrings++;
  }

  checkClass(info, where) {
    this.stats.classes++;
    const v = info.major - 44;
    this.stats.javaVersions[v] = (this.stats.javaVersions[v] || 0) + 1;

    const simple = (info.thisName || where).split('/').pop().replace(/\.class$/, '');
    if (simple.length <= 2) this.obf.short++;
    if (isWeirdName(simple)) this.obf.weird++;

    for (const s of info.strings) this.checkString(s, where);
    for (const rule of rules) {
      if (rule.methods) {
        for (const m of info.methods) {
          if (rule.methods.some((re) => re.test(m))) { this.hit(rule, where, m.replace(/\//g, '.')); break; }
        }
      }
      if (rule.classes) {
        const c = info.classes.find((c) => rule.classes.includes(c));
        if (c) this.hit(rule, where, c.replace(/\//g, '.'));
      }
    }
    for (const c of info.classes) {
      for (const [name, re] of KNOWN_OBFUSCATORS) if (re.test(c)) this.obf.obfuscators.add(name);
    }
  }

  checkPath(path, prefix) {
    for (const rule of rules) {
      if (rule.files && rule.files.some((re) => re.test(path))) this.hit(rule, prefix + path, path);
    }
  }

  async walk(buf, prefix, depth) {
    const zip = await openZip(buf);
    await new Promise((resolve, reject) => {
      zip.on('error', reject);
      zip.on('end', resolve);
      zip.on('entry', async (entry) => {
        try {
          await this.visit(zip, entry, prefix, depth);
          zip.readEntry();
        } catch (e) {
          reject(e);
        }
      });
      zip.readEntry();
    });
    zip.close();
  }

  async visit(zip, entry, prefix, depth) {
    const path = entry.fileName;
    if (path.endsWith('/')) return;

    this.stats.files++;
    if (this.stats.files > LIMITS.maxEntries) throw new Error('Too many entries in archive');

    const size = entry.uncompressedSize;
    if (entry.compressedSize > 0 && size / entry.compressedSize > LIMITS.maxRatio && size > 10 * 1024 * 1024) {
      this.warnings.push(`Skipped ${prefix + path}: suspicious compression ratio (possible zip bomb).`);
      return;
    }
    if (size > LIMITS.maxEntrySize) {
      this.warnings.push(`Skipped ${prefix + path}: entry is too large (${(size / 1048576).toFixed(0)} MB).`);
      return;
    }
    this.totalUncompressed += size;
    if (this.totalUncompressed > LIMITS.maxTotalUncompressed) throw new Error('Archive expands to more than 2 GB');

    if (depth === 0 && this.files.length < 5000) this.files.push(path);
    this.checkPath(path, prefix);

    const isClass = path.endsWith('.class') || path.endsWith('.class/');
    const isArchive = ARCHIVE_EXT.test(path);
    const isText = TEXT_EXT.test(path) || /META-INF\/MANIFEST/i.test(path);
    if (!isClass && !isArchive && !(isText && size < 4 * 1024 * 1024)) return;

    let data;
    try { data = await readEntry(zip, entry); } catch (e) {
      this.warnings.push(`Could not read ${prefix + path}: ${e.message}`);
      return;
    }
    this.stats.bytes += data.length;

    if (isArchive || (data.length > 4 && data.readUInt32BE(0) === 0x504b0304 && !isClass)) {
      if (depth + 1 > LIMITS.maxDepth) { this.warnings.push(`Not descending into ${prefix + path}: nesting too deep.`); return; }
      this.stats.nestedJars++;
      try { await this.walk(data, `${prefix}${path}!/`, depth + 1); } catch (e) {
        this.warnings.push(`Nested archive ${prefix + path} could not be opened: ${e.message}`);
      }
      return;
    }

    if (isClass || (data.length > 4 && data.readUInt32BE(0) === 0xcafebabe)) {
      const info = parseClass(data);
      if (!info) { this.stats.parseErrors++; return; }
      this.checkClass(info, prefix + path);
      return;
    }

    const text = data.toString('utf8');
    if (depth === 0) this.readMeta(path, text);
    for (const line of text.split(/\r?\n/)) if (line.trim()) this.checkString(line, prefix + path);
  }

  readMeta(path, text) {
    try {
      if (path === 'fabric.mod.json' || path === 'quilt.mod.json') {
        const j = JSON.parse(text); const q = j.quilt_loader || j;
        this.meta = { loader: path.startsWith('quilt') ? 'Quilt' : 'Fabric', name: q.metadata?.name || j.name || q.id, version: q.version, authors: (j.authors || q.metadata?.contributors && Object.keys(q.metadata.contributors) || []).map((a) => a.name || a) };
      } else if (path === 'META-INF/mods.toml' || path === 'META-INF/neoforge.mods.toml') {
        const g = (k) => (text.match(new RegExp(`^\\s*${k}\\s*=\\s*["']?([^"'\\n]+)`, 'm')) || [])[1];
        this.meta = { loader: path.includes('neoforge') ? 'NeoForge' : 'Forge', name: g('displayName') || g('modId'), version: g('version'), authors: g('authors') ? [g('authors')] : [] };
      } else if (path === 'mcmod.info') {
        const j = JSON.parse(text); const m = Array.isArray(j) ? j[0] : (j.modList || [])[0];
        if (m) this.meta = { loader: 'Forge (legacy)', name: m.name, version: m.version, authors: m.authorList || m.authors || [] };
      } else if (path === 'plugin.yml' || path === 'paper-plugin.yml') {
        const g = (k) => (text.match(new RegExp(`^${k}:\\s*["']?([^"'\\n]+)`, 'm')) || [])[1];
        this.meta = { loader: 'Bukkit/Paper plugin', name: g('name'), version: g('version'), authors: g('author') ? [g('author')] : [] };
      } else if (/META-INF\/MANIFEST\.MF/i.test(path)) {
        const main = (text.match(/^Main-Class:\s*(.+)$/m) || [])[1];
        if (main) this.meta.mainClass = main.trim();
        const agent = (text.match(/^(Premain|Agent)-Class:\s*(.+)$/m) || [])[2];
        if (agent) this.meta.javaAgent = agent.trim();
      }
    } catch { /* bad metadata is not our problem */ }
  }
}

function verdictFor(score) {
  if (score >= 60) return { level: 'malicious', label: 'Likely malicious' };
  if (score >= 20) return { level: 'suspicious', label: 'Suspicious' };
  return { level: 'clean', label: 'No threats found' };
}

async function virusTotal(sha256) {
  const key = process.env.VT_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://www.virustotal.com/api/v3/files/${sha256}`, { headers: { 'x-apikey': key } });
    if (res.status === 404) return { known: false };
    if (!res.ok) return { error: `VirusTotal returned ${res.status}` };
    const a = (await res.json()).data.attributes;
    return { known: true, malicious: a.last_analysis_stats.malicious, total: Object.values(a.last_analysis_stats).reduce((x, y) => x + y, 0), link: `https://www.virustotal.com/gui/file/${sha256}` };
  } catch (e) {
    return { error: e.message };
  }
}

async function scanJar(buf, fileName) {
  const hashes = {
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    sha1: crypto.createHash('sha1').update(buf).digest('hex'),
    md5: crypto.createHash('md5').update(buf).digest('hex'),
  };

  const scan = new Scan();
  const started = Date.now();
  await scan.walk(buf, '', 0);

  const findings = [];
  let score = 0;
  for (const rule of rules) {
    const ev = scan.hits.get(rule.id);
    if (!ev) continue;
    score += W[rule.severity];
    findings.push({
      id: rule.id, title: rule.title, severity: rule.severity, category: rule.category, why: rule.why,
      evidence: ev, more: ev.overflow || 0,
    });
  }

  // Combos that matter more than the sum of their parts.
  const has = (cat) => findings.some((f) => f.category === cat);
  if (has('Account theft') && (has('Exfiltration') || scan.hits.has('http') || scan.hits.has('raw-socket'))) {
    score += W.critical;
    findings.unshift({
      id: 'stealer-chain', title: 'Steals credentials AND sends data out', severity: 'critical', category: 'Combination',
      why: 'This jar both reads account secrets and has a way to send them off your PC. That is what a rat/stealer looks like.',
      evidence: [], more: 0,
    });
  }
  if (scan.hits.has('dynamic-loading') && scan.hits.has('http')) {
    score += W.high;
    findings.unshift({
      id: 'downloader', title: 'Downloads and runs code', severity: 'high', category: 'Combination',
      why: 'Network access plus runtime class loading = the jar can pull a second-stage payload after you trust it.',
      evidence: [], more: 0,
    });
  }

  const totalClasses = Math.max(scan.stats.classes, 1);
  const shortPct = scan.obf.short / totalClasses;
  const obfuscation = {
    level: scan.obf.weird > 5 || shortPct > 0.5 || scan.obf.obfuscators.size ? 'heavy'
      : shortPct > 0.15 || scan.obf.highEntropyStrings > 20 ? 'some' : 'none',
    shortNamePercent: Math.round(shortPct * 100),
    weirdNames: scan.obf.weird,
    highEntropyStrings: scan.obf.highEntropyStrings,
    obfuscators: [...scan.obf.obfuscators],
  };
  if (obfuscation.level === 'heavy') score += W.medium;

  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    fileName,
    size: buf.length,
    hashes,
    verdict: { ...verdictFor(score), score },
    findings,
    obfuscation,
    urls: [...scan.urls].slice(0, 200).map(([url, v]) => ({ url, ...v })),
    meta: scan.meta,
    stats: { ...scan.stats, ms: Date.now() - started },
    warnings: scan.warnings,
    files: scan.files,
    virustotal: await virusTotal(hashes.sha256),
  };
}

module.exports = { scanJar };
