// Responsive scale must match the first paint and preserve stored player preferences.
import fs from 'node:fs/promises';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=await fs.readFile(new URL('../js/settings.js',import.meta.url),'utf8'),html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
let compact=true,layouts=0;const props=new Map(),events=new Map(),memory=new Map([['cm1.settings','{"uiScale":1.15,"theme":"light"}']]);
const c={CM:{ui:{layoutHud:()=>layouts++,renderToolbar:()=>layouts++}},console,localStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)},document:{documentElement:{dataset:{},style:{setProperty:(k,v)=>props.set(k,v)},setAttribute(){}}}};c.window=c;
c.matchMedia=q=>({get matches(){return q.includes('max-width')?compact:false;},addEventListener:(type,fn)=>events.set(q,fn)});vm.createContext(c);
const boot=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];vm.runInContext(boot,c);assert.ok(Math.abs(+props.get('--uiz')-1.035)<1e-12);
vm.runInContext(source,c);const S=c.CM.Settings;S.apply('uiScale');assert.equal(S.get('uiScale'),1.15);assert.ok(Math.abs(S.scale()-1.035)<1e-12);
const original=memory.get('cm1.settings'),change=[...events].find(([q])=>q.includes('max-width'))[1];compact=false;change();assert.equal(S.scale(),1.15);assert.equal(+props.get('--uiz'),1.15);compact=true;change();assert.equal(memory.get('cm1.settings'),original);assert.equal(layouts,4);
S.set('uiScale',1);assert.equal(S.scale(),.9);S.set('uiScale',.9);assert.equal(S.scale(),.85);assert.equal(JSON.parse(memory.get('cm1.settings')).uiScale,.9);compact=false;change();assert.equal(S.scale(),.9);
console.log('PASS compact first paint, 10% smaller mobile default, readable small-size floor, viewport transitions and unchanged saved preferences');
