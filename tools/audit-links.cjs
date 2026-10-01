const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const refs = new Map();
const add = (file, url, kind) => {
    if (!refs.has(url)) refs.set(url, new Set());
    refs.get(url).add(file + ' (' + kind + ')');
};

function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(html|js|css|json)$/.test(e.name)) {
            const src = fs.readFileSync(p, 'utf8');
            const rel = path.relative(root, p).replace(/\\/g, '/');
            for (const m of src.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) add(rel, m[1], 'attr');
            for (const m of src.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) add(rel, m[1].trim(), 'css url');
            for (const m of src.matchAll(/["'`](\/(?:assets|pages)\/[^"'`]+)["'`]/g)) add(rel, m[1], 'literal');
            for (const m of src.matchAll(/imageUrl\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) add(rel, '/assets/images/' + m[1], 'imageUrl');
        }
    }
}
walk(path.join(root, 'src'));
walk(path.join(root, 'public'));

// bo qua cac trang html duoc "require"/fetch dong
const PAGE_ALIAS = {};
for (const m of fs.readFileSync(path.join(root, 'tools/mini-dom.cjs'), 'utf8').matchAll(/'([^']*\.html)'/g)) PAGE_ALIAS[m[1].replace(/^\//, '')] = true;

let missing = [], okC = 0;
const PUBLIC = path.join(root, 'public');
const cleanFile = (s) => String(s).replace(/\s*\((attr|css url|literal|imageUrl)\)\s*$/, '');
// {{BASE}} la placeholder cua partial -> thay bang duong dan goc
const stripBase = (s) => String(s).replace(/^\{\{BASE\}\}/, '/');
const exists = (rel, fromFile) => {
    const cands = rel.startsWith('/')
        ? [path.join(PUBLIC, rel), path.join(root, rel)]                                    // duong dan goc -> public/ truoc
        : [path.join(root, rel), ...(fromFile ? [path.join(path.dirname(fromFile), rel)] : [])]; // duong dan tuong doi
    return cands.some((c) => fs.existsSync(c) || fs.existsSync(c + '.html') || fs.existsSync(path.join(c, 'index.html')));
};

for (const [url, files] of refs) {
    if (/^(https?:)?\/\//.test(url) || url.startsWith('data:') || url.startsWith('#')) continue;
    // bo qua URL chua duoc interpolate (template literal) - se kiem o phan rieng
    if (url.includes('${') || url.includes('`')) continue;
    const clean = stripBase(url.split('?')[0].split('#')[0]);
    if (!clean) continue;
    if (exists(clean, cleanFile([...files][0]))) okC++;
    else missing.push([url, [...files].slice(0, 3)]);
}

console.log('=== TONG SO DUONG DAN NOI BO (da resolve) ===');
console.log('uniq:', refs.size, '| ton tai:', okC, '| thieu:', missing.length);
console.log('\n=== THIEU FILE ===');
const byPrefix = new Map();
for (const [url, files] of missing) {
    const key = url.replace(/\d+\.png$/, '<alias>.png');
    if (!byPrefix.has(key)) byPrefix.set(key, { n: 0, files });
    byPrefix.get(key).n++;
}
for (const [key, v] of [...byPrefix].sort((a, b) => b[1].n - a[1].n)) {
    console.log('  ' + v.n + 'x ' + key);
    v.files.forEach((f) => console.log('      <- ' + f));
}

// kiem duong dan co template literal: chi lay phan tien to cuoi tinh
console.log('\n=== DUONG DAN CO TEMPLATE LITERAL (kiem tien to) ===');
const tmpl = new Map();
for (const [url, files] of refs) {
    const prefix = url.split('${')[0].split('`')[0];
    if (!prefix) continue;
    if (!tmpl.has(prefix)) tmpl.set(prefix, new Set());
    tmpl.get(prefix).add([...files][0]);
}
for (const [prefix, files] of tmpl) {
    const clean = stripBase(prefix.split('?')[0].split('#')[0]);
    console.log('  ' + (exists(clean, cleanFile([...files][0])) ? 'OK  ' : 'THIEU ') + prefix + '   <- ' + [...files][0]);
}