const fs = require('fs');
const builds = JSON.parse(fs.readFileSync('src/data/builds.json','utf8'));
const items = JSON.parse(fs.readFileSync('src/data/items.json','utf8'));
const heroes = JSON.parse(fs.readFileSync('src/data/heroes.json','utf8'));
const imap={}; items.forEach(i=>imap[i.id]=i);
const hmap={}; heroes.forEach(h=>hmap[h.id]=h);
const boots=new Set([401,402,403,404,405]);
const support=new Set([501,502,503,504]);
const fix=[1,2,5,6,8,9,10,13];
fix.forEach(id=>{
  const b=builds.find(x=>x.id===id);
  const h=hmap[b.heroId]||{};
  console.log('===',b.id,h.name,JSON.stringify(h.role),'===');
  console.log('items:',b.items.join(','));
  console.log('situational:',JSON.stringify(b.situational));
  console.log('phases:',b.phases.map(p=>p.name+':'+(p.items||[]).join(',')).join(' | '));
});