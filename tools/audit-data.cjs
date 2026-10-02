const fs = require('fs');
const items = require('../src/data/items.json');
const builds = require('../src/data/builds.json');
const heroes = require('../src/data/heroes.json');
const posts = require('../src/data/posts.json');

const line = (s) => console.log('\n===== ' + s + ' =====');

// ---------- REQUIREMENT 1 ----------
line('REQUIREMENT 1 - items.json');
console.log('so item              :', items.length, items.length >= 40 ? 'PASS' : 'FAIL');
const idList = items.map((i) => i.id);
const dupIds = idList.filter((v, i) => idList.indexOf(v) !== i);
console.log('ID trung             :', dupIds.length ? 'FAIL ' + dupIds : 'PASS (0)');
const badId = items.filter((i) => !Number.isInteger(i.id));
console.log('ID khong phai int    :', badId.length ? 'FAIL ' + badId.map((i) => i.id) : 'PASS (0)');
const req = ['id','name','alias','image','type','price','stats','passive','description','related'];
const missing = [];
items.forEach((i) => req.forEach((k) => { if (!(k in i)) missing.push(i.id + '.' + k); }));
console.log('truong thieu hoan toan:', missing.length ? 'FAIL ' + missing.join(', ') : 'PASS (0)');
const empty = [];
items.forEach((i) => req.forEach((k) => {
    const v = i[k];
    if (v === null || v === undefined) return empty.push(i.id + '.' + k);
    if (typeof v === 'string' && !v.trim()) return empty.push(i.id + '.' + k);
    if (k === 'stats' && (!v || typeof v !== 'object' || !Object.keys(v).length)) return empty.push(i.id + '.stats');
    if (k === 'related' && (!Array.isArray(v) || !v.length)) return empty.push(i.id + '.related');
    if (k === 'price' && !(typeof v === 'number' && v > 0)) return empty.push(i.id + '.price');
}));
console.log('truong rong/khong hop le:', empty.length ? 'FAIL ' + empty.join(', ') : 'PASS (0)');
console.log('stats khong phai object :', items.filter((i) => typeof i.stats !== 'object' || i.stats === null || Array.isArray(i.stats)).map((i) => i.id).join(',') || 'PASS (0)');
const nonNumStat = [];
items.forEach((i) => Object.entries(i.stats || {}).forEach(([k, v]) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) nonNumStat.push(i.id + '.' + k + '=' + v);
}));
console.log('gia tri stats khong so   :', nonNumStat.length ? 'FAIL ' + nonNumStat.join(', ') : 'PASS (0)');
const aliasDup = items.map((i) => i.alias);
console.log('alias trung             :', aliasDup.filter((v,i)=>aliasDup.indexOf(v)!==i).join(',') || 'PASS (0)');
const nameDup = items.map((i) => i.name);
console.log('name trung              :', nameDup.filter((v,i)=>nameDup.indexOf(v)!==i).join(',') || 'PASS (0)');
// anh
const IMG_DIR = 'public/assets/images/items/';
const files = fs.existsSync(IMG_DIR) ? new Set(fs.readdirSync(IMG_DIR)) : new Set();
const badFmt = items.filter((i) => !/^items\/[a-z0-9-]+\.png$/.test(i.image));
console.log('image sai format        :', badFmt.length ? 'FAIL ' + badFmt.map((i) => i.id + ':' + i.image).join(', ') : 'PASS (0)');
const imgOk = items.filter((i) => files.has(i.image.replace('items/', '')));
console.log('image file TON TAI       :', imgOk.length + '/' + items.length, imgOk.length === items.length ? 'PASS' : 'FAIL');
const imgAliasMatch = items.filter((i) => i.image.replace('items/', '').replace('.png', '') !== i.alias);
console.log('image khong khop alias  :', imgAliasMatch.length ? 'FAIL ' + imgAliasMatch.map((i)=>i.id).join(',') : 'PASS (0)');
// related
const idSet = new Set(idList);
const badRel = [];
items.forEach((i) => (i.related || []).forEach((r) => { if (!idSet.has(r)) badRel.push(i.id + '->' + r); }));
console.log('related tro ID sai      :', badRel.length ? 'FAIL ' + badRel.join(', ') : 'PASS (0)');
console.log('related tu tham chieu    :', items.filter((i) => (i.related||[]).includes(i.id)).map((i)=>i.id).join(',') || 'PASS (0)');
const dupRel = items.filter((i) => new Set(i.related).size !== i.related.length);
console.log('related lap trong       :', dupRel.length ? 'FAIL ' + dupRel.map((i)=>i.id).join(',') : 'PASS (0)');
// stat keys vs label
const label = fs.readFileSync('src/js/item.js', 'utf8');
const statKeys = new Set();
items.forEach((i) => Object.keys(i.stats || {}).forEach((k) => statKeys.add(k)));
console.log('stat keys dung         :', [...statKeys].sort().join(', '));
[...statKeys].forEach((k) => { if (!label.includes(k + ':')) console.log('  ! item.js THIEU nhan cho stat:', k); });

// ---------- REQUIREMENT 2 ----------
line('REQUIREMENT 2 - builds.json');
console.log('builds.json ton tai     : PASS');
console.log('so build                :', builds.length);
const heroIds = new Set(heroes.map((h) => h.id));
const badHero = builds.filter((b) => !heroIds.has(b.heroId));
console.log('heroId tro ID hero sai  :', badHero.length ? 'FAIL ' + badHero.map((b) => 'build' + b.id + '->hero' + b.heroId).join(', ') : 'PASS (0)');
console.log('dung khoa hero_id       :', builds.some((b) => 'hero_id' in b) ? 'FAIL (co hero_id)' : 'PASS (chi heroId nhat quan)');
const badItem = builds.flatMap((b) => b.items).filter((id) => !idSet.has(id));
console.log('item ID trong build     :', badItem.length ? 'FAIL ' + badItem.join(', ') : 'PASS (0)');
const allSlots = builds.flatMap((b) => b.items).length;
console.log('tong so item refs       :', allSlots);
const shortBuild = builds.filter((b) => b.items.length !== 6);
console.log('build khong du 6 item   :', shortBuild.length ? 'FAIL ' + shortBuild.map((b) => b.id).join(',') : 'PASS (0)');
const buildIdDup = builds.map((b) => b.id).filter((v, i, a) => a.indexOf(v) !== i);
console.log('build ID trung          :', buildIdDup.join(',') || 'PASS (0)');
const heroDup = builds.map((b) => b.heroId).filter((v, i, a) => a.indexOf(v) !== i);
console.log('hero co nhieu build     :', heroDup.join(',') || 'PASS (0)');
const heroNoBuild = heroes.filter((h) => !builds.some((b) => b.heroId === h.id));
console.log('hero KHONG co build     :', heroNoBuild.length, 'hero:', heroNoBuild.map((h) => h.id + '(' + h.name + ')').join(', ') || '0');

// ---------- heroes.json lien quan ----------
line('HEROES - recommendedBuild');
// hero.js: recommendedBuild la danh sach ITEM ID -> tra items.json, khong phai builds.json
const itemIdSet = new Set(items.map((x) => x.id));
const heroBadRef = [];
let heroRefTotal = 0;
heroes.forEach((h) => {
    const r = h.recommendedBuild;
    if (r === undefined || r === null) return;
    const arr = Array.isArray(r) ? r : [r];
    arr.forEach((x) => {
        heroRefTotal++;
        if (!itemIdSet.has(x)) heroBadRef.push(h.id + '->' + x);
    });
});
console.log('recommendedBuild sai    :', heroBadRef.length ? 'FAIL ' + heroBadRef.length + '/' + heroRefTotal + ' ref: ' + heroBadRef.join(', ') : 'PASS (0/' + heroRefTotal + ')');
const heroZeroRec = heroes.filter((h) => (h.recommendedBuild || []).length && !(h.recommendedBuild || []).some((x) => itemIdSet.has(x)));
console.log('hero hien 0 item de xuat:', heroZeroRec.length + '/' + heroes.length, heroZeroRec.map((h) => h.id + '(' + h.name + ')').join(', ') || '0');
const heroMissingField = heroes.filter((h) => !('recommendedBuild' in h));
console.log('hero thieu field        :', heroMissingField.length, 'hero:', heroMissingField.map((h)=>h.id).join(',') || '0');
// hero image: dung dung logic imageUrl() cua components.js
const IMAGE_ROOT = 'assets/images/';
const resolveImage = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return IMAGE_ROOT + 'placeholder.svg';
    if (/^(https?:)?\/\//.test(s)) return s;
    return s.startsWith(IMAGE_ROOT) ? s : IMAGE_ROOT + s.replace(/^\/+/, '').replace(/^assets\//, '');
};
const heroImgMiss = heroes.filter((h) => h.image && !fs.existsSync('public/' + resolveImage(h.image)));
console.log('hero image thieu file   :', heroImgMiss.length, 'hero:', heroImgMiss.map((h) => h.id + ':' + h.image + ' -> ' + resolveImage(h.image)).join(', ') || '0');
const heroImgOk = heroes.filter((h) => h.image && fs.existsSync('public/' + resolveImage(h.image)));
console.log('hero image TON TAI       :', heroImgOk.length + '/' + heroes.length, heroImgOk.length === heroes.length ? 'PASS' : 'FAIL');
const itemImgMiss = items.filter((i) => !fs.existsSync('public/' + resolveImage(i.image)));
console.log('item image TON TAI       :', (items.length - itemImgMiss.length) + '/' + items.length, itemImgMiss.length === 0 ? 'PASS' : 'FAIL');

// ---------- POSTS ----------
line('POSTS - posts.json');
console.log('so post                 :', posts.length);
const pIds = posts.map((p) => p.id);
console.log('post ID trung           :', pIds.filter((v, i, a) => a.indexOf(v) !== i).join(',') || 'PASS (0)');
const pFields = ['id', 'title', 'content', 'author', 'createdAt'];
const pMiss = [];
posts.forEach((p) => pFields.forEach((f) => { if (!(f in p)) pMiss.push(p.id + '.' + f); }));
console.log('post thieu truong        :', pMiss.join(', ') || 'PASS (0)');
const pBadAuthor = posts.filter((p) => {
    const u = require('../src/data/users.json');
    return !u.some((x) => String(x.username) === String(p.author));
});
console.log('post author sai          :', pBadAuthor.length ? 'FAIL ' + pBadAuthor.map((p) => p.id + '->' + p.author).join(', ') : 'PASS (0)');
console.log('post heroId hop le       :', posts.filter((p) => !require('../src/data/heroes.json').some((h) => String(h.id) === String(p.heroId))).map((p) => p.id + '->' + p.heroId).join(', ') || 'PASS (0)');
const pImgMiss = posts.filter((p) => p.image && !fs.existsSync('public/' + String(p.image).replace(/^\//, '')));
console.log('post image thieu file   :', pImgMiss.length, 'post:', pImgMiss.map((p) => p.id + ':' + p.image).join(', ') || '0');

line('JSON PARSE');
['items','builds','heroes','posts','users'].forEach((f) => {
    try { require('../src/data/' + f + '.json'); console.log('  src/data/' + f + '.json : PASS'); }
    catch (e) { console.log('  src/data/' + f + '.json : FAIL ' + e.message); }
});