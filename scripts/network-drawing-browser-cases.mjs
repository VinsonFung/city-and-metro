// Construction input regression, using real mouse and touch events on the Canvas.
export async function runNetworkDrawingChecks({E,send,until,close,tap,settle}) {
  await E('CM.newGame({map:"tutorial",mode:"free",seed:20000101});true');
  await until('!CM.isLoading()&&CM.game?.mapId==="tutorial"&&!CM.game.pending',120000);
  await close();
  await E('CM.game.setSpeed(0);CM.Settings.set("gridSnap",false);CM.Settings.set("language","zh-CN");true');
  const clickWorld=async (x,y,{touch=false,modifiers=0}={})=>{
    const p=await E('(()=>{const R=CM.R,p=R.P('+x+','+y+',R.trackH("underground")),r=R.cv.getBoundingClientRect();'
      +'const x=r.left+p.x,y=r.top+p.y;if(document.elementFromPoint(x,y)!==R.cv)throw Error("Map gesture is covered at "+x+","+y);return{x,y}})()');
    if(touch){
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }else{
      await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1,modifiers});
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1,modifiers});
    }
  };
  for(const [width,height,touch,language] of [[1100,800,false,'zh-CN'],[390,844,true,'zh-TW'],[568,320,true,'en']]){
    await send('Emulation.setTouchEmulationEnabled',{enabled:touch});
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:touch});
    await E('CM.Settings.set("language",'+JSON.stringify(language)+');true');
    const loc=await E('(()=>{const g=CM.game,c=g.city,M=CM.Metro;g.cancelDraft();CM.ui.closePanel(true);'
      +'for(let y=8.5;y<c.H-6;y++)for(let x=8.5;x<c.W-10;x++){'
      +'if(![x-3,x,x+3].every(u=>M.checkSite(c,u,y,"underground").ok))continue;'
      +'if(![x-3,x-2,x-1,x,x+1,x+2,x+3].every(u=>c.lu[c.cellAt(u,y)]!==CM.LU.WATER))continue;'
      +'const r=g.edit(n=>({start:M.addStation(n,x-3,y,{size:"M",type:"underground"},c)}));'
      +'CM.ui.startDraw(r.start,"new");CM.R.flyTo(x,y,24);return {x,y,start:r.start}}'
      +'throw Error("No legal construction fixture")})()');
    await until('!CM.R.cam.fly');
    await settle();
    if(touch) await tap('[data-point=bend]');
    await clickWorld(loc.x-1.5,loc.y,touch?{touch}:{modifiers:2});
    if(!await E('CM.tools.bends.length===1&&Object.values(CM.game.draft.net.stations).every(s=>!s.v)')) throw Error('Bend became a virtual node');
    if(touch){
      await tap('[data-bend-undo]');
      if(!await E('CM.tools.bends.length===0')) throw Error('Touch undo did not remove the pending bend');
      await clickWorld(loc.x-1.5,loc.y,{touch});
      await tap('[data-point=virtual]');
    }
    await clickWorld(loc.x,loc.y,touch?{touch}:{modifiers:8});
    const before=await E('(()=>{const g=CM.game,T=CM.tools,net=g.draft.net,seg=Object.values(net.segments)[0];return{line:seg?.line,id:T.chain,virtual:net.stations[T.chain]?.v,points:seg?.pts.length,can:g.canConfirm().ok,unfinished:seg&&CM.Metro.lineTopo(net,seg.line).virtualEnd}})()');
    if(!before.virtual||before.can||!before.unfinished||before.points!==1) throw Error('Unfinished line has unexpected geometry '+JSON.stringify({before,viewport:[width,height,language]}));
    if(touch){
      await tap('[data-act="build.finish"]');
      await E('CM.ui.openObj("station",'+JSON.stringify(before.id)+');true');
      await settle();
      await tap('[data-resume-drawing]');
    }else{
      await E('CM.tools.endChain();true');
      await clickWorld(loc.x,loc.y);
    }
    if(!await E('CM.tools.lineChoice==='+JSON.stringify(before.line)+'&&CM.tools.chain==='+JSON.stringify(before.id))) throw Error('Continuation did not reuse the same line');
    if(touch && height<=320){
      // On a short landscape screen the destination can sit under the tool stack.
      // Pan from an exposed part of the map while keeping the line selected.
      const p=await E('(()=>{const R=CM.R;for(const y of [178,168,155,195])for(const x of [120,145,180,430,480])'
        +'if(document.elementFromPoint(x,y)===R.cv&&!R.pickStation(x,y)&&!R.pickSegment(x,y))return{x,y};throw Error("No exposed map area")})()');
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
      await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x,y:p.y-50}]});
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await settle();
    }
    await clickWorld(loc.x+3,loc.y,{touch});
    const result=await E('(()=>{const g=CM.game,M=CM.Metro,net=g.draft.net,tp=M.lineTopo(net,'+JSON.stringify(before.line)+');return{topo:tp.topo,stations:tp.stations.length,segments:Object.keys(net.segments).length,can:g.canConfirm()}})()');
    if(result.topo!=='path'||result.stations!==2||result.segments!==2||!result.can.ok) throw Error('Line cannot be confirmed '+JSON.stringify(result));
    console.log('PASS drawing, bend undo, virtual node continuation and confirmation', width, height, language);
  }
}
