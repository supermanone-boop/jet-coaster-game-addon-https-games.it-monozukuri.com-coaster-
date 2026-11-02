// Coaster Expansion v11 native-game compatibility patch
export function patchEditor(src){
  if(!src.includes("this.cvWrap = root.querySelector('.ed-canvas-wrap');"))throw new Error('editor.js のキャンバス初期化位置が見つかりません。');
  if(!src.includes('this.mapView = { cx: 0, cz: 0, zoom: 1 };')){
    const inject=`this.cvWrap = root.querySelector('.ed-canvas-wrap');\n    this.mapView = { cx: 0, cz: 0, zoom: 1 };\n    this.panning = null;\n    const viewTools = document.createElement('div');\n    viewTools.className = 'ed-exp-viewtools';\n    viewTools.innerHTML = '<button type="button" data-map="out" aria-label="縮小">−</button><button type="button" data-map="in" aria-label="拡大">＋</button><button type="button" data-map="fit">コース</button><span data-map-label>100%</span><div class="ed-exp-pan"><button type="button" data-map="up">▲</button><div><button type="button" data-map="left">◀</button><button type="button" data-map="down">▼</button><button type="button" data-map="right">▶</button></div></div>';
    this.cvWrap.appendChild(viewTools);\n    viewTools.addEventListener('click', (e) => { const b=e.target.closest('button[data-map]'); if(!b)return; const a=b.dataset.map,v=this.mapView; if(a==='in')v.zoom=clamp(v.zoom*1.25,.002,8); else if(a==='out')v.zoom=clamp(v.zoom/1.25,.002,8); else if(a==='fit')this.fitMapView(); else if(a==='up')v.cz-=45/v.zoom; else if(a==='down')v.cz+=45/v.zoom; else if(a==='left')v.cx-=45/v.zoom; else if(a==='right')v.cx+=45/v.zoom; this.draw(); const l=viewTools.querySelector('[data-map-label]'); if(l)l.textContent=String(Math.round(v.zoom*100))+'%'; });`;
    src=src.replace("this.cvWrap = root.querySelector('.ed-canvas-wrap');",inject);
  }
  if(!src.includes('this.fitMapView();\n  }') && src.includes('open(design, step = 1) {')){
    src=src.replace('  open(design, step = 1) {\n    this.design = design;', '  open(design, step = 1) {\n    this.design = design;\n    this.mapView = { cx: 0, cz: 0, zoom: 1 };\n    this.panning = null;');
    src=src.replace('    this.go(step);\n  }\n  close()', '    this.go(step);\n    if (step === 1 && this.design.pts && this.design.pts.length > 1) this.fitMapView();\n  }\n  close()');
  }
  // Map projection: zoom/pan viewport instead of forcing the full fixed field into the canvas.
  if(src.includes('mapXf() {') && !src.includes('const baseW = 140 / v.zoom;')){
    const a=src.indexOf('  mapXf() {'),b=src.indexOf('  // 2 つの角',a);
    if(a>=0&&b>a){const replacement=`  mapXf() {\n    const pad=14,v=this.mapView||{cx:0,cz:0,zoom:1};\n    const baseW=140/v.zoom,baseH=96/v.zoom;\n    const rot=this.H>this.W*1.15;\n    if(rot){const k=Math.min((this.W-pad*2)/baseH,(this.H-pad*2)/baseW),ox=this.W/2-v.cz*k,oy=this.H/2+v.cx*k;return {k,rot,toS:(x,z)=>[ox+z*k,oy-x*k],toW:(sx,sy)=>[-(sy-oy)/k,(sx-ox)/k]};}\n    const k=Math.min((this.W-pad*2)/baseW,(this.H-pad*2)/baseH),ox=this.W/2-v.cx*k,oy=this.H/2-v.cz*k;\n    return {k,rot,toS:(x,z)=>[ox+x*k,oy+z*k],toW:(sx,sy)=>[(sx-ox)/k,(sy-oy)/k]};\n  }\n  fitMapView() {\n    const pts=this.design&&Array.isArray(this.design.pts)?this.design.pts:[];\n    if(pts.length<2)this.mapView={cx:0,cz:0,zoom:1};\n    else{const xs=pts.map(p=>p[0]),zs=pts.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs),w=Math.max(140,maxX-minX+80),h=Math.max(96,maxZ-minZ+60);this.mapView={cx:(minX+maxX)/2,cz:(minZ+maxZ)/2,zoom:clamp(Math.min(140/w,96/h),.002,8)};}\n    this.draw();const label=this.cvWrap&&this.cvWrap.querySelector('[data-map-label]');if(label)label.textContent=\`${'${'}Math.round(this.mapView.zoom*100)}%\`;\n  }\n`;
      src=src.slice(0,a)+replacement+src.slice(b);
    }
  }
  // Dynamic vertical height scale for mountain heights beyond the original 60 m.
  src=src.replace('    const Hmax = H_MAX;','    const heights=this.design&&Array.isArray(this.design.hs)?this.design.hs:[];\n    const currentMax=heights.reduce((m,v)=>Number.isFinite(v)?Math.max(m,v):m,2);\n    const Hmax=Math.max(60,Math.ceil((currentMax+20)/10)*10);');
  src=src.replace('      x0: padL, y0: padT, w, h,','      x0: padL, y0: padT, w, h, Hmax,');
  src=src.replace('H_MIN, H_MAX),','H_MIN, Hmax),');
  // Show the view controls only while editing the top-down course map.
  if(!src.includes("querySelector('.ed-exp-viewtools')"))src=src.replace('  draw() {\n    const c = this.cx;', "  draw() {\n    const c = this.cx;\n    const mapTools=this.cvWrap&&this.cvWrap.querySelector('.ed-exp-viewtools');\n    if(mapTools)mapTools.hidden=this.step!==1;");
  // Add the exact city footprint overlay after land and before station markers.
  if(!src.includes('drawCityBuildings(toS, k)')){
    src=src.replace('    this.drawMapLand(toS, k);','    this.drawMapLand(toS, k);\n    this.drawCityBuildings(toS, k);');
    const method=`\n  drawCityBuildings(toS,k){\n    if(!document.body||document.body.dataset.coasterCourseMode!=='city')return;\n    const get=this.getCityBuildingFootprints;if(typeof get!=='function')return;\n    const buildings=get();if(!Array.isArray(buildings)||!buildings.length)return;\n    const c=this.cx;c.save();c.beginPath();c.rect(0,0,this.W,this.H);c.clip();let shown=0;\n    for(const b of buildings){const hw=Number(b.halfW),hd=Number(b.halfD),x=Number(b.x),z=Number(b.z),yaw=Number(b.yaw)||0;if(![hw,hd,x,z].every(Number.isFinite)||hw<=0||hd<=0)continue;\n      const co=Math.cos(yaw),si=Math.sin(yaw),corners=[[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd]].map(([lx,lz])=>toS(x+lx*co+lz*si,z-lx*si+lz*co));\n      const minX=Math.min(...corners.map(p=>p[0])),maxX=Math.max(...corners.map(p=>p[0])),minY=Math.min(...corners.map(p=>p[1])),maxY=Math.max(...corners.map(p=>p[1]));if(maxX<0||minX>this.W||maxY<0||minY>this.H)continue;\n      c.beginPath();c.moveTo(corners[0][0],corners[0][1]);for(let i=1;i<4;i++)c.lineTo(corners[i][0],corners[i][1]);c.closePath();\n      const h=Number(b.height)||0;c.fillStyle=h>=500?'rgba(105,126,139,.9)':h>=180?'rgba(143,158,164,.9)':'rgba(185,190,184,.94)';c.strokeStyle='rgba(52,66,75,.98)';c.lineWidth=Math.max(.45,Math.min(1.8,k*.55));c.fill();c.stroke();shown++;\n    }c.restore();c.save();c.font=\`700 10px \${FONT}\`;c.textAlign='right';c.textBaseline='top';const legend=\`■ 実配置の建物 \${buildings.length}棟（表示 \${shown}棟）\`;c.lineWidth=3;c.strokeStyle='rgba(251,248,239,.96)';c.strokeText(legend,this.W-8,6);c.fillStyle='#52636d';c.fillText(legend,this.W-8,6);c.restore();\n  }\n`;
    const marker='  // ① で、高さを描いたあとは';
    if(src.includes(marker))src=src.replace(marker,method+'\n'+marker);
  }
  // Panning gesture for the map.
  if(src.includes('  down(e) {')&&!src.includes('this.panning = { x: sx')){
    src=src.replace('    const [sx, sy] = this.pos(e);\n    const d = this.design;\n    this.record();\n    if (this.step === 1) {', '    const [sx, sy] = this.pos(e);\n    const d = this.design;\n    if(this.step===1&&(e.shiftKey||e.button===1)){const X=this.mapXf();this.panning={x:sx,y:sy,cx:this.mapView.cx,cz:this.mapView.cz,k:X.k,rot:X.rot};this.drawing=true;return;}\n    this.record();\n    if (this.step === 1) {');
  }
  if(src.includes('  move(e) {')&&!src.includes('if (this.panning) {')){
    src=src.replace('    const [sx, sy] = this.pos(e);\n    const d = this.design;\n    if (this.step === 1) {', '    const [sx, sy] = this.pos(e);\n    const d = this.design;\n    if(this.panning){const p=this.panning,dx=sx-p.x,dy=sy-p.y;this.mapView.cx=p.cx+(p.rot?dy/p.k:-dx/p.k);this.mapView.cz=p.cz+(p.rot?-dx/p.k:-dy/p.k);this.draw();return;}\n    if (this.step === 1) {');
  }
  if(src.includes('  up(e) {')&&!src.includes('if(this.panning){this.panning=null;return;}'))src=src.replace('    this.drawing = false;\n    // 線の途中をタップしただけ', '    this.drawing = false;\n    if(this.panning){this.panning=null;return;}\n    // 線の途中をタップしただけ');
  src=src.replace("this.hint.textContent = 'しかけを選んで、図をタップして置く（置いたものをタップで外す）。置かなくても走れます';", "this.hint.textContent = `しかけを選んで、図をタップして置く（置いたものをタップで外す）。${d.gm.length}/${MAX_GIMMICKS}個・置かなくても走れます`;");
  // Extended point count / gimmick limit uses exported values, not a hard-coded legacy list.
  src=src.replace('d.pts.length > 1400 || polyLen(d.pts) > MAX_LEN','d.pts.length > 8192 || polyLen(d.pts) > MAX_LEN');
  return src;
}
