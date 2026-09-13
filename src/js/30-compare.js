/* =========================================================
   ② 自由落下とくらべる
     左＝自由落下（落下開始）、右＝斜方投射（最高点）をそろえて同期再生。
   ========================================================= */
(function(A){
'use strict';
var $=A.$, $$=A.$$, clamp=A.clamp, f3=A.f3;
var SIDES=['L','R'];

var C={cmode:'A',layout:'side',ovop:0.5,fit:'full',ar:16/9,
  showGuides:false,showRuler:false,showMarks:false,
  guides:[],gid:0,ruler:{y0:0.20,u:0.045},marks:{L:0.40,R:0.40},
  dragMove:false,activeSide:null,alignDone:false};
A.C=C;
function PL(s){return A.P(s);}
function startTime(p){return A.FT(p.startFrame);}
function maxT(){
  var m=Infinity;
  SIDES.forEach(function(s){var p=PL(s);
    if(p.ready&&isFinite(p.video.duration))m=Math.min(m,Math.max(0,p.video.duration-startTime(p)));});
  return isFinite(m)?m:0;
}
function bothReady(){return PL('L').ready&&PL('R').ready;}
function clearPreview(){SIDES.forEach(function(s){PL(s).previewing=false;});}

/* ---------- モードA / B ---------- */
$('#cmpModeSeg').addEventListener('click',function(e){
  var b=e.target.closest('button'); if(!b)return;
  C.cmode=b.getAttribute('data-cmode');
  $$('#cmpModeSeg button').forEach(function(x){x.classList.toggle('on',x===b);});
  $('#cmpModeHint').textContent=(C.cmode==='A')
    ?'同じ動画を左右に読み込み、別々の開始フレームを指定します（スケールのずれが起きません）'
    :'別々に撮影した2本の動画を左右に読み込みます';
  A.refreshZones();
});

/* ---------- 開始点をさがす ---------- */
function previewSeek(p,time){
  if(!p.ready)return;
  A.setPlaying(false); p.previewing=true;
  p.video.currentTime=clamp(time,0,Math.max(0,p.video.duration-1e-3));
}
function setActive(s){
  C.activeSide=s;
  $$('.panel').forEach(function(el){el.classList.toggle('active',el.getAttribute('data-side')===s);});
}
$$('[data-cmstep]').forEach(function(b){
  A.attachRepeat(b,function(){
    var a=b.getAttribute('data-cmstep').split(','), p=PL(a[0]);
    if(!p.ready)return; setActive(a[0]);
    var base=p.previewing?p.video.currentTime:startTime(p)+A.S.s;
    previewSeek(p,A.FT(A.TF(base)+parseInt(a[1],10)));
  });
});
$$('[data-cmscrub]').forEach(function(r){
  r.addEventListener('input',function(){
    var s=r.getAttribute('data-cmscrub'), p=PL(s); if(!p.ready)return;
    setActive(s); previewSeek(p,A.FT(A.TF(parseFloat(r.value)||0)));
  });
});
$$('[data-cmset]').forEach(function(b){
  b.addEventListener('click',function(){
    var s=b.getAttribute('data-cmset'), p=PL(s); if(!p.ready)return;
    p.startFrame=A.TF(p.previewing?p.video.currentTime:startTime(p)+A.S.s);
    p.previewing=false; A.S.s=0; clearPreview(); A.setPlaying(false); A.vib(20);
    b.textContent='設定しました ✓';
    setTimeout(function(){b.textContent='ここを開始点に設定';},1200);
  });
});
$$('[data-cmadj]').forEach(function(b){
  A.attachRepeat(b,function(){
    var a=b.getAttribute('data-cmadj').split(','), p=PL(a[0]); if(!p.ready)return;
    p.startFrame=Math.max(0,p.startFrame+parseInt(a[1],10));
    p.previewing=false; A.setPlaying(false);
  });
});

/* ---------- そろえる（上下） ---------- */
function nudgeY(s,d){
  var p=PL(s);
  p.offsetY=clamp(p.offsetY+d,-100,100);
  C.marks[s]=clamp(C.marks[s]+d/100,0,1);
  syncAdjust(); applyFit(); place();
}
$$('[data-cmny]').forEach(function(b){
  A.attachRepeat(b,function(){
    var a=b.getAttribute('data-cmny').split(','); nudgeY(a[0],parseFloat(a[1]));
  });
});
$('#cmMarkToggle').addEventListener('click',function(){
  C.showMarks=!C.showMarks;
  this.textContent=C.showMarks?'開始位置マーカーを隠す':'開始位置マーカーを出す';
  this.classList.toggle('ok',C.showMarks);
  paint();
});
$('#cmAlignY').addEventListener('click',function(){
  if(!C.showMarks){
    C.showMarks=true;$('#cmMarkToggle').textContent='開始位置マーカーを隠す';
    $('#cmMarkToggle').classList.add('ok');paint();
    $('#cmAlignMsg').textContent='ピンクの線を物体の高さに合わせてから、もう一度押してください。';
    return;
  }
  var d=(C.marks.L-C.marks.R)*100;
  PL('R').offsetY=clamp(PL('R').offsetY+d,-100,100);
  C.marks.R=C.marks.L;
  syncAdjust(); applyFit(); place();
  $('#cmAlignMsg').textContent='右の映像を '+(d>=0?'下':'上')+'に '+Math.abs(d).toFixed(1)+'% 動かしてそろえました。';
});
$('#cmMarkRuler').addEventListener('click',function(){
  C.ruler.y0=C.marks.L;
  C.ruler.u=Math.max(0.003,Math.min(C.ruler.u,(0.97-C.ruler.y0)/16));
  if(!C.showRuler){C.showRuler=true;syncRulerBtns();}
  paint();
  $('#cmAlignMsg').textContent='この高さを目盛りの 0 にしました。';
});
$('#cmResetY').addEventListener('click',function(){
  SIDES.forEach(function(s){PL(s).offsetY=0;});
  syncAdjust(); applyFit(); $('#cmAlignMsg').textContent='上下位置を戻しました。';
});
$('#cmDragMove').addEventListener('change',function(){
  C.dragMove=this.checked;
  SIDES.forEach(function(s){PL(s).vp.classList.toggle('movable',C.dragMove);});
});

/* ---------- 表示 ---------- */
$('#cmLayoutSeg').addEventListener('click',function(e){
  var b=e.target.closest('button'); if(!b)return;
  C.layout=b.getAttribute('data-layout'); applyLayout();
});
$('#cmOvop').addEventListener('input',function(){
  C.ovop=parseFloat(this.value);$('#cmOvopV').textContent=Math.round(C.ovop*100)+'%';applyLayout();
});
$('#cmFitSel').addEventListener('change',function(){C.fit=this.value;applyFit();});
/* ガイド線のボタンは「表示」と「開始点」の2か所にある。見た目は必ずそろえる。 */
function syncGuideBtns(){
  ['#cmGuideToggle','#cmGuideToggle2'].forEach(function(sel){
    var b=$(sel); if(!b)return;
    b.textContent=C.showGuides?'ガイド線を隠す':'ガイド線を表示';
    b.classList.toggle('ok',C.showGuides);
  });
}
function toggleGuides(){
  C.showGuides=!C.showGuides;
  if(C.showGuides&&C.guides.length===0)C.guides.push({id:++C.gid,y:0.35});
  syncGuideBtns(); paint();
}
$('#cmGuideToggle').addEventListener('click',toggleGuides);
$('#cmGuideToggle2').addEventListener('click',toggleGuides);
$('#cmGuideAdd').addEventListener('click',function(){
  if(C.guides.length>=3){A.toast('ガイド線は3本までです。');return;}
  C.guides.push({id:++C.gid,y:clamp(0.3+C.guides.length*0.18,0,0.95)});
  C.showGuides=true; syncGuideBtns(); paint();
});
$('#cmGuideClear').addEventListener('click',function(){
  C.guides=[];C.showGuides=false;
  syncGuideBtns(); paint();
});
/* 目盛りのボタンは「表示」と「ストロボ」の2か所にある。見た目は必ずそろえる。 */
function syncRulerBtns(){
  ['#cmRulerToggle','#cmRulerToggle2'].forEach(function(sel){
    var b=$(sel); if(!b)return;
    b.textContent=C.showRuler?'目盛りを隠す':'目盛りを表示';
    b.classList.toggle('ok',C.showRuler);
  });
}
function toggleRuler(){C.showRuler=!C.showRuler;syncRulerBtns();paint();}
$('#cmRulerToggle').addEventListener('click',toggleRuler);
$('#cmRulerToggle2').addEventListener('click',toggleRuler);
function applyLayout(){
  var st=$('#stage');
  st.className='stage '+C.layout;
  st.style.setProperty('--ovop',String(C.ovop));
  document.querySelector('.panel[data-side="R"]').classList.toggle('dim',C.layout==='over');
  A.show('#cmOvopRow',C.layout==='over');
  $$('#cmLayoutSeg button').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-layout')===C.layout);});
  A.refit();
}
function applyFit(){
  var ar=(C.fit==='full')?C.ar:(C.fit==='3:4'?0.75:9/16);
  SIDES.forEach(function(s){
    var p=PL(s);
    p.vp.style.aspectRatio=String(ar);
    p.video.style.objectFit=(C.fit==='full')?'contain':'cover';
    A.applyTransform(p,0);
  });
  A.refit();
}

/* ---------- 調整 ---------- */
$$('[data-cmsc]').forEach(function(r){r.addEventListener('input',function(){
  var s=r.getAttribute('data-cmsc');PL(s).scale=parseFloat(r.value);
  document.querySelector('[data-cmscv="'+s+'"]').textContent=PL(s).scale.toFixed(3);applyFit();});});
$$('[data-cmoy]').forEach(function(r){r.addEventListener('input',function(){
  var s=r.getAttribute('data-cmoy'),p=PL(s),nv=parseFloat(r.value);
  C.marks[s]=clamp(C.marks[s]+(nv-p.offsetY)/100,0,1); p.offsetY=nv;
  document.querySelector('[data-cmoyv="'+s+'"]').textContent=nv.toFixed(1)+'%';
  document.querySelector('[data-cmnyv="'+s+'"]').textContent=nv.toFixed(1);
  applyFit();place();});});
$$('[data-cmpx]').forEach(function(r){r.addEventListener('input',function(){
  var s=r.getAttribute('data-cmpx');PL(s).panX=parseFloat(r.value);
  document.querySelector('[data-cmpxv="'+s+'"]').textContent=Math.round(PL(s).panX*100)+'%';applyFit();});});
$('#cmResetAdjust').addEventListener('click',function(){
  SIDES.forEach(function(s){var p=PL(s);p.scale=1;p.offsetY=0;p.panX=0.5;});
  syncAdjust();applyFit();
});
$('#cmEngineSel').addEventListener('change',function(){
  var was=A.S.playing; A.setPlaying(false); A.S.engine=this.value; if(was)A.setPlaying(true);
});
function syncAdjust(){
  SIDES.forEach(function(s){
    var p=PL(s);
    document.querySelector('[data-cmsc="'+s+'"]').value=String(p.scale);
    document.querySelector('[data-cmscv="'+s+'"]').textContent=p.scale.toFixed(3);
    document.querySelector('[data-cmoy="'+s+'"]').value=String(p.offsetY);
    document.querySelector('[data-cmoyv="'+s+'"]').textContent=p.offsetY.toFixed(1)+'%';
    document.querySelector('[data-cmnyv="'+s+'"]').textContent=p.offsetY.toFixed(1);
    document.querySelector('[data-cmpx="'+s+'"]').value=String(p.panX);
    document.querySelector('[data-cmpxv="'+s+'"]').textContent=Math.round(p.panX*100)+'%';
  });
}

/* ---------- 重ねて確認 ---------- */
$('#cmAlignCheck').addEventListener('click',function(){
  C.layout='over';C.ovop=0.5;$('#cmOvop').value='0.5';$('#cmOvopV').textContent='50%';applyLayout();
});
$('#cmAlignAdjust').addEventListener('click',function(){C.layout='over';applyLayout();A.setTab('adjust');});
$('#cmAlignOk').addEventListener('click',function(){
  C.alignDone=true;C.layout='side';applyLayout();A.show('#cmAlignBanner',false);
});
function banner(){
  var on=bothReady()&&!C.alignDone;
  A.show('#cmAlignBanner',on);
  $('#cmAlignMsgTop').textContent=(C.cmode==='A')
    ?'左右が同じ動画なので背景は必ず一致します。このステップは飛ばしてかまいません。'
    :'2つの映像を半透明で重ねて、机の縁など背景の目印が一致しているか確かめてください。';
}

/* ---------- 描画 ---------- */
function paint(){
  SIDES.forEach(function(s){
    var p=PL(s); A.ov.clear(p);
    if(C.showGuides){
      C.guides.forEach(function(g,i){
        var d=A.ov.el(p,'hline guide','ガイド'+(i+1));
        d.setAttribute('data-g',g.id);
        d.addEventListener('pointerdown',function(ev){A.dragY(ev,p.vp,function(y){g.y=y;place();});});
      });
    }
    if(C.showMarks){
      var mk=A.ov.el(p,'hline mark',s==='L'?'左：落下開始の高さ':'右：最高点の高さ');
      mk.addEventListener('pointerdown',function(ev){A.dragY(ev,p.vp,function(y){C.marks[s]=y;place();});});
    }
    if(C.showRuler){
      [0,1,4,9,16].forEach(function(k){
        var d=A.ov.el(p,'hline rule'+(k===0?' o':''),k===0?'0（開始点）':String(k));
        d.setAttribute('data-k',String(k));
        d.addEventListener('pointerdown',function(ev){
          A.dragY(ev,p.vp,function(y){
            if(k===0)C.ruler.y0=y; else C.ruler.u=Math.max(0.003,(y-C.ruler.y0)/k);
            place();
          });
        });
      });
    }
  });
  place();
}
function place(){
  SIDES.forEach(function(s){
    var o=PL(s).ovl;
    C.guides.forEach(function(g){
      var el=o.querySelector('.guide[data-g="'+g.id+'"]'); if(el)el.style.top=(g.y*100)+'%';
    });
    var mk=o.querySelector('.mark'); if(mk)mk.style.top=(C.marks[s]*100)+'%';
    Array.prototype.forEach.call(o.querySelectorAll('.rule'),function(el){
      el.style.top=((C.ruler.y0+parseFloat(el.getAttribute('data-k'))*C.ruler.u)*100)+'%';
    });
  });
}

/* =========================================================
   ストロボ（左右そろえて蓄積）
     ①と同じ考え方。蓄積するのは「もう通り過ぎた位置」だけで、
     いまの位置は生の映像がそのまま受け持つ。
     合成は素の画素どうしの明暗くらべ（lighten / darken）だけ。
     球の位置を推定して貼ることは絶対にしない。
     左右は同じ時計（A.S.s）で進むので、Δt を1回押すと両方に1つずつ増える。
   ========================================================= */
var SB={on:false,mode:'light',dtF:2,dtTouched:false,
        shots:{L:[],R:[]},trail:{L:null,R:null},busy:false};
C.sb=SB;
var DT_OPTS=[1,2,3,4,5,6,8,10,12,15,20,24,30,40,60];
function dtSec(){return SB.dtF/A.S.fps;}
function sbOp(){return (SB.mode==='dark')?'darken':'lighten';}

function trailCv(s){
  var v=PL(s).video;
  if(!SB.trail[s])SB.trail[s]=document.createElement('canvas');
  var c=SB.trail[s], w=v.videoWidth||16, h=v.videoHeight||9;
  if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
  return c;
}
/* いま映っているコマを、素のまま1枚取る */
function snap(s){
  var v=PL(s).video;
  if(!v.videoWidth||v.readyState<2)return null;
  var c=document.createElement('canvas');
  c.width=v.videoWidth; c.height=v.videoHeight;
  try{c.getContext('2d').drawImage(v,0,0,c.width,c.height);}catch(e){return null;}
  return c;
}
function rebuildTrail(s){
  var c=trailCv(s), g=c.getContext('2d'), sh=SB.shots[s];
  g.globalCompositeOperation='source-over';
  g.clearRect(0,0,c.width,c.height);
  for(var i=0;i<sh.length;i++){
    g.globalCompositeOperation=(i===0)?'source-over':sbOp();
    g.drawImage(sh[i],0,0,c.width,c.height);
  }
  g.globalCompositeOperation='source-over';
}
function addShot(s,cv){
  if(!cv)return;
  SB.shots[s].push(cv);
  var c=trailCv(s), g=c.getContext('2d');
  g.globalCompositeOperation=(SB.shots[s].length===1)?'source-over':sbOp();
  g.drawImage(cv,0,0,c.width,c.height);
  g.globalCompositeOperation='source-over';
}
function clearShots(){SIDES.forEach(function(s){SB.shots[s].length=0;rebuildTrail(s);});syncSbCount();}
function popShots(){
  var did=false;
  SIDES.forEach(function(s){if(SB.shots[s].length){SB.shots[s].pop();rebuildTrail(s);did=true;}});
  syncSbCount(); return did;
}
function syncSbCount(){
  var e=$('#cmSbCount'); if(e)e.textContent=SB.shots.L.length+' 個';
}
/* 目当てのコマが左右そろって出てから撮る。すでに出ていればその場で撮る。 */
function snapBoth(cb){
  var want={}, n=0;
  SIDES.forEach(function(s){want[s]=A.TF(startTime(PL(s))+A.S.s);});
  (function poll(){
    var ok=SIDES.every(function(s){
      var v=PL(s).video;
      return v.readyState>=2&&!v.seeking&&A.TF(v.currentTime)===want[s];
    });
    if(ok||++n>60){cb({L:snap('L'),R:snap('R')});return;}  /* 1.5 秒で見切る */
    setTimeout(poll,25);
  })();
}
/* 毎コマ描く。生の映像を下地に、過去ぶんの板を明暗くらべで載せるだけ。 */
function drawStrobe(){
  SIDES.forEach(function(s){
    var p=PL(s), v=p.video;
    var on=SB.on&&p.ready&&v.videoWidth>0;
    if(!on){ if(p.sc)A.show(p.sc,false); return; }
    var c=A.strobeCv(p), g=c.getContext('2d');
    g.globalCompositeOperation='source-over';
    g.drawImage(v,0,0,c.width,c.height);
    if(SB.shots[s].length){
      g.globalCompositeOperation=sbOp();
      g.drawImage(trailCv(s),0,0,c.width,c.height);
      g.globalCompositeOperation='source-over';
    }
    A.show(p.sc,true);
  });
}
function hideStrobe(){SIDES.forEach(function(s){var p=PL(s);if(p.sc)A.show(p.sc,false);});}

/* ---------- Δt ---------- */
function fillDt(){
  var sel=$('#cmDtSel'); if(!sel)return;
  sel.innerHTML='';
  DT_OPTS.concat(DT_OPTS.indexOf(SB.dtF)<0?[SB.dtF]:[]).forEach(function(n){
    var o=document.createElement('option');o.value=String(n);o.textContent=n+' コマ';sel.appendChild(o);
  });
  sel.value=String(SB.dtF);
  $('#cmDtRead').textContent=SB.dtF+' コマ ＝ '+f3(dtSec())+' 秒';
  syncSbRead();
}
function syncSbRead(){
  var e=$('#cmSbRead'); if(!e)return;
  e.innerHTML='右の数字は<b>開始点からの落下距離</b>で <b>0, 1, 4, 9, 16</b>。'+
    'Δt ＝ '+f3(dtSec())+' 秒 ＝ '+SB.dtF+' コマ。'+
    '左右の球が<b>同じ線の上に並ぶか</b>を見てください。';
}
$('#cmDtSel').addEventListener('change',function(e){
  SB.dtF=parseInt(e.target.value,10); SB.dtTouched=true;
  /* 刻みが変われば、溜めてある位置は別の Δt の絵になる。混ぜずに捨てる。 */
  if(SB.shots.L.length||SB.shots.R.length)clearShots();
  fillDt(); place();
});
A.on('fps',function(){if($('#cmDtSel'))fillDt();});

/* ---------- ① から引き継ぐ ---------- */
function takeFromObserve(quiet){
  var O=A.O;
  if(!O){if(!quiet)A.toast('①の設定が見つかりません。');return false;}
  SB.dtF=O.dtF; SB.dtTouched=true;
  if(O.sbMode==='light'||O.sbMode==='dark')SB.mode=O.sbMode;
  if(typeof O.hlY0==='number'&&typeof O.hlU==='number'){
    C.ruler={y0:clamp(O.hlY0,0,1),u:Math.max(0.003,O.hlU)};
    /* 引き継ぎ（quiet）のときは、①で横線を出していた場合だけ出す。
       まだ左の動画も入っていない段階で線だけ出ると、何の線か分からないため。 */
    if(!quiet||O.showHL)C.showRuler=true;
  }
  if(SB.shots.L.length||SB.shots.R.length)clearShots();
  fillDt(); syncSbBtns(); syncRulerBtns(); paint();
  if(!quiet){
    var m=$('#cmFromObMsg'); if(m)m.textContent='Δt '+SB.dtF+' コマ・横線の高さを引き継ぎました。';
    A.toast('①の設定を引き継ぎました（Δt ＝ '+SB.dtF+' コマ、横線の 0 と間隔も同じ）。',4000);
  }
  return true;
}
A.compareTakeFromObserve=takeFromObserve;
$('#cmFromOb').addEventListener('click',function(){takeFromObserve(false);});

/* ---------- ボタン ---------- */
function syncSbBtns(){
  var b=$('#cmStrobe'); if(!b)return;
  b.classList.toggle('ok',SB.on);
  b.textContent=SB.on?'ストロボをやめる':'ストロボにする';
  A.show('#cmSbSeg',SB.on);
  A.show('#cmSbRow',SB.on);
  $$('#cmSbSeg button').forEach(function(x){
    x.classList.toggle('on',x.getAttribute('data-cmsb')===SB.mode);
  });
  syncSbCount();
}
function setStrobe(on){
  if(SB.on===on)return;
  SB.on=on; clearShots();
  if(!on)hideStrobe();
  syncSbBtns();
}
$('#cmStrobe').addEventListener('click',function(){setStrobe(!SB.on);});
$('#cmSbSeg').addEventListener('click',function(e){
  var b=e.target.closest('button'); if(!b)return;
  SB.mode=b.getAttribute('data-cmsb');
  SIDES.forEach(rebuildTrail);
  syncSbBtns(); place();
});
$('#cmSbAdd').addEventListener('click',function(){
  if(!SB.on){A.toast('先に「ストロボにする」を押してください。');return;}
  if(SB.busy)return; SB.busy=true;
  snapBoth(function(m){
    SB.busy=false;
    SIDES.forEach(function(s){addShot(s,m[s]);});
    syncSbCount(); A.vib(6); place();
  });
});
$('#cmSbUndo').addEventListener('click',function(){popShots();place();});
$('#cmSbClear').addEventListener('click',function(){clearShots();place();});
$('#cmSbPng').addEventListener('click',function(){exportPng();});

/* ---------- Δt ずつ進める ---------- */
function stepDt(n){
  A.setPlaying(false); setActive(null); clearPreview();
  var mx=maxT(), nx=A.S.s+n*dtSec();
  /* ストロボ中は半端な Δt で止めない。端で切り詰められると、最後の1つだけが
     Δt の格子から外れた位置に出てしまい、「そろっているか」を見る絵が壊れる。 */
  if(SB.on){
    if(nx>mx+1e-9){A.toast('この先は動画のおわりを越えます。Δt を小さくするか、ここまでで見てください。');return;}
    if(nx<-1e-9){A.toast('この手前は開始点より前です。');return;}
  }
  if(SB.on&&n>0){
    if(SB.busy)return;
    SB.busy=true;
    snapBoth(function(m){
      SB.busy=false;
      SIDES.forEach(function(s){addShot(s,m[s]);});
      syncSbCount(); A.vib(6);
      A.S.s=clamp(A.S.s+n*dtSec(),0,maxT());
      place();
    });
    return;
  }
  var s0=A.S.s;
  A.S.s=clamp(nx,0,mx);
  if(SB.on&&n<0&&A.S.s!==s0)popShots();
  place();
}
A.attachRepeat($('#cmDtNext'),function(){stepDt(1);});
A.attachRepeat($('#cmDtPrev'),function(){stepDt(-1);});

/* ---------- 画像で保存 ----------
   画面と同じ切り取り・同じ上下位置で左右を並べ、横線も焼き込む。
   ワークシートに貼ったときに、何を見た絵なのかが残るように。 */
/* 書き出しの枠は、画面に出ている枠の実寸から取る。
   2カラム表示では枠の高さが先に決まるので、設定値から計算すると画面と形が変わってしまう。 */
function panelAR(){
  var el=PL('L').vp;
  if(el&&el.clientWidth>0&&el.clientHeight>0)return el.clientWidth/el.clientHeight;
  return (C.fit==='full')?C.ar:(C.fit==='3:4'?0.75:9/16);
}
function drawPanel(g,s,ox,oy,PW,PH){
  var p=PL(s), v=p.video, cv=A.strobeCv(p);
  var vw=v.videoWidth, vh=v.videoHeight;
  g.save();
  g.beginPath(); g.rect(ox,oy,PW,PH); g.clip();
  g.fillStyle='#000'; g.fillRect(ox,oy,PW,PH);
  if(vw&&vh){
    /* 画面での見え方（object-fit / object-position / transform）をそのまま再現する */
    var cover=(C.fit!=='full');
    var k=cover?Math.max(PW/vw,PH/vh):Math.min(PW/vw,PH/vh);
    var dw=vw*k, dh=vh*k;
    g.translate(ox,oy);
    g.translate(0,p.offsetY/100*PH);
    g.translate(PW/2,PH/2); g.scale(p.scale,p.scale); g.translate(-PW/2,-PH/2);
    g.translate((PW-dw)*p.panX,(PH-dh)*0.5);
    g.scale(k,k);
    g.drawImage(cv,0,0,vw,vh);
  }
  g.restore();
}
var RULE_K=[0,1,4,9,16];
function drawLines(g,ox,oy,PW,PH,u){
  function tag(t,x,y,col,right){
    g.font='700 '+(u*13)+'px system-ui,-apple-system,sans-serif';
    var w=g.measureText(t).width+u*8, h=u*19;
    var bx=right?(x-w):x;
    g.fillStyle='rgba(0,0,0,.62)'; g.fillRect(bx,y,w,h);
    g.fillStyle=col; g.textBaseline='top'; g.fillText(t,bx+u*4,y+u*3);
  }
  g.save();
  g.beginPath(); g.rect(ox,oy,PW,PH); g.clip();
  if(C.showGuides){
    C.guides.forEach(function(gl){
      var y=oy+gl.y*PH;
      g.strokeStyle='rgba(45,212,124,.95)'; g.lineWidth=u*2;
      g.beginPath(); g.moveTo(ox,y); g.lineTo(ox+PW,y); g.stroke();
    });
  }
  if(C.showRuler){
    var rx=ox+PW-u*34, ry0=oy+C.ruler.y0*PH, up=C.ruler.u*PH, KMAX=RULE_K[RULE_K.length-1];
    g.strokeStyle='rgba(255,204,77,.92)'; g.lineWidth=u*1.6;
    g.beginPath(); g.moveTo(rx,ry0); g.lineTo(rx,ry0+KMAX*up); g.stroke();
    for(var j=0;j<=KMAX;j++){
      var maj=(j%5===0), yy=ry0+j*up;
      if(!maj&&up<u*5)continue;
      g.lineWidth=maj?u*2:u*1.5;
      g.beginPath(); g.moveTo(rx,yy); g.lineTo(rx-(maj?u*17:u*8),yy); g.stroke();
    }
    RULE_K.forEach(function(kk){
      var y=oy+(C.ruler.y0+kk*C.ruler.u)*PH;
      g.strokeStyle=(kk===0)?'rgba(255,159,67,.95)':'rgba(255,204,77,.9)';
      g.lineWidth=(kk===0)?u*2:u*1.5;
      g.setLineDash(kk===0?[]:[u*6,u*5]);
      g.beginPath(); g.moveTo(ox,y); g.lineTo(ox+PW,y); g.stroke();
      g.setLineDash([]);
      tag((kk===0)?'0（開始点）':String(kk),ox+PW-u*6,y+(kk===0?-u*22:u*3),
          (kk===0)?'#ff9f43':'#ffcc4d',true);
    });
  }
  g.restore();
}
function exportPng(){
  if(!SB.on){A.toast('先に「ストロボにする」を押してください。');return;}
  if(!bothReady()){A.toast('映像がまだ読み込まれていません。');return;}
  drawStrobe();
  var PH=Math.round(clamp(PL('L').video.videoHeight||720,480,1080));
  var PW=Math.max(120,Math.round(PH*panelAR()));
  var gap=Math.round(PH*0.02), over=(C.layout==='over'), stack=(C.layout==='stack');
  var W=over?PW:(stack?PW:PW*2+gap);
  var H=over?PH:(stack?PH*2+gap:PH);
  var pad=Math.round(PH*0.05);                 /* 上に見出しの帯を置く */
  var c=document.createElement('canvas'); c.width=W; c.height=H+pad;
  var g=c.getContext('2d');
  g.fillStyle='#0d1219'; g.fillRect(0,0,W,H+pad);
  var u=Math.max(1,Math.round(PH/540));
  if(over){
    drawPanel(g,'L',0,pad,PW,PH);
    g.save(); g.globalAlpha=C.ovop; drawPanel(g,'R',0,pad,PW,PH); g.restore();
    drawLines(g,0,pad,PW,PH,u);
  }else if(stack){
    drawPanel(g,'L',0,pad,PW,PH);         drawLines(g,0,pad,PW,PH,u);
    drawPanel(g,'R',0,pad+PH+gap,PW,PH);  drawLines(g,0,pad+PH+gap,PW,PH,u);
  }else{
    drawPanel(g,'L',0,pad,PW,PH);         drawLines(g,0,pad,PW,PH,u);
    drawPanel(g,'R',PW+gap,pad,PW,PH);    drawLines(g,PW+gap,pad,PW,PH,u);
  }
  var cap='左：自由落下　／　右：斜方投射（最高点から）　Δt ＝ '+SB.dtF+' コマ ＝ '
          +f3(dtSec())+' 秒　／　'+SB.shots.L.length+'＋1 コマ重ね';
  /* 重ねて1枚にすると横が狭い。はみ出すぶんだけ字を小さくする（切れると何の絵か分からなくなる）。 */
  var fs=u*15;
  g.font='700 '+fs+'px system-ui,-apple-system,sans-serif';
  var wmax=W-u*16, wt=g.measureText(cap).width;
  if(wt>wmax){fs=Math.max(u*8,Math.floor(fs*wmax/wt));g.font='700 '+fs+'px system-ui,-apple-system,sans-serif';}
  g.fillStyle='#eef2f8'; g.textBaseline='middle';
  g.fillText(cap, u*8, pad/2);
  c.toBlob(function(bl){
    if(!bl){A.toast('画像を作れませんでした。');return;}
    var a=document.createElement('a');
    a.href=URL.createObjectURL(bl);
    a.download='kurabe-strobe-'+SB.dtF+'koma.png';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){URL.revokeObjectURL(a.href);},2000);
    A.toast('画像を保存しました。');
  },'image/png');
}

/* ---------- 保存 ---------- */
function pick(p){return {name:p.name,startFrame:p.startFrame,scale:p.scale,offsetY:p.offsetY,panX:p.panX};}
$('#cmSaveJson').addEventListener('click',function(){
  A.download('rakka-settei.json',{app:'projectile-lab',part:'compare',version:2,
    cmode:C.cmode,fps:A.S.fps,layout:C.layout,rate:A.S.rate,engine:A.S.engine,ovop:C.ovop,fit:C.fit,dtF:SB.dtF,sbMode:SB.mode,
    showGuides:C.showGuides,showRuler:C.showRuler,showMarks:C.showMarks,
    guides:C.guides,ruler:C.ruler,marks:C.marks,L:pick(PL('L')),R:pick(PL('R'))});
  $('#cmSaveMsg').textContent='書き出しました。';
});
$('#cmLoadJson').addEventListener('click',function(){A.pendingJson='compare';$('#jsonIn').click();});
A.compareLoadJson=function(d){
  if(d.fps){A.S.fps=d.fps;$('#fpsSel').value=String(d.fps);A.fpsHint();}
  if(d.layout)C.layout=d.layout;
  if(d.fit){C.fit=d.fit;$('#cmFitSel').value=d.fit;}
  if(typeof d.ovop==='number'){C.ovop=d.ovop;$('#cmOvop').value=String(d.ovop);$('#cmOvopV').textContent=Math.round(d.ovop*100)+'%';}
  if(d.engine){A.S.engine=d.engine;$('#cmEngineSel').value=d.engine;}
  if(d.dtF){SB.dtF=d.dtF;SB.dtTouched=true;}
  if(d.sbMode==='light'||d.sbMode==='dark')SB.mode=d.sbMode;
  if(typeof d.rate==='number')A.setRate(d.rate);
  C.guides=Array.isArray(d.guides)?d.guides.map(function(g){return {id:++C.gid,y:clamp(g.y,0,1)};}):[];
  if(d.ruler)C.ruler={y0:clamp(d.ruler.y0,0,1),u:Math.max(0.003,d.ruler.u)};
  if(d.marks)C.marks={L:clamp(d.marks.L,0,1),R:clamp(d.marks.R,0,1)};
  C.showGuides=!!d.showGuides;C.showRuler=!!d.showRuler;C.showMarks=!!d.showMarks;
  SIDES.forEach(function(s){
    var src=d[s]; if(!src)return; var p=PL(s);
    p.startFrame=Math.max(0,src.startFrame|0);
    p.scale=src.scale||1;p.offsetY=src.offsetY||0;
    p.panX=(typeof src.panX==='number')?src.panX:0.5;
  });
  syncGuideBtns(); syncRulerBtns(); fillDt(); syncSbBtns();
  $('#cmMarkToggle').textContent=C.showMarks?'開始位置マーカーを隠す':'開始位置マーカーを出す';
  $('#cmMarkToggle').classList.toggle('ok',C.showMarks);
  A.setPlaying(false);clearPreview();A.S.s=0;
  applyLayout();applyFit();syncAdjust();paint();
  $('#cmSaveMsg').textContent='読み込みました。動画は別途読み込んでください。';
};

/* ---------- ①からの引き継ぎ ---------- */
A.handoffToCompare=function(file,apexFrame){
  C.cmode='B';
  $$('#cmpModeSeg button').forEach(function(x){x.classList.toggle('on',x.getAttribute('data-cmode')==='B');});
  A.setMode('compare');
  A.refreshZones();
  takeFromObserve(true);   /* Δt・横線の 0 と間隔・明暗の別も、そのまま持ってくる */
  var once=function(p){
    if(p.id!=='R')return;
    p.startFrame=Math.max(0,apexFrame|0);
    A.toast('右（斜方投射）に引き継ぎました。開始点は最高点（'+p.startFrame+' コマ）です。<br>左に自由落下の動画を読み込んでください。',6000);
  };
  A.on('loaded',once);
  A.takeFile('R',file);
};

/* ---------- モード定義 ---------- */
var mode={
  players:['L','R'],
  allowNative:true,
  loadTitle:'自由落下と斜方投射の動画を読み込む',
  loadLead:'斜方投射の最高点と自由落下の落下開始をそろえると、以後の落下距離が一致します。',
  zones:function(){return C.cmode==='A'?['A']:['L','R'];},
  nameSlot:function(pid){return C.cmode==='A'?'A':pid;},
  onFile:function(t,file){
    if(t==='A'){A.loadInto('L',file);A.loadInto('R',file);}
    else A.loadInto(t,file);
  },
  tabs:[{id:'start',label:'開始点'},{id:'align',label:'そろえる'},
        {id:'view',label:'表示'},{id:'strobe',label:'ストロボ'},
        {id:'adjust',label:'調整'},{id:'save',label:'保存'}],
  onTab:function(id){
    if(id==='strobe'){fillDt();syncSbBtns();syncRulerBtns();}
  },
  sMax:maxT,
  timeFor:function(pid){
    if(pid!=='L'&&pid!=='R')return null;
    return startTime(PL(pid))+A.S.s;
  },
  step:function(n){
    if(C.activeSide){
      var p=PL(C.activeSide); if(!p.ready)return;
      var base=p.previewing?p.video.currentTime:startTime(p)+A.S.s;
      previewSeek(p,A.FT(A.TF(base)+n));
    }else{clearPreview();A.S.s=clamp(A.S.s+n/A.S.fps,0,maxT());}
  },
  onSeek:clearPreview,
  onHead:clearPreview,
  onEscape:function(){setActive(null);},
  readout:function(){
    return {label:'開始点から',text:'<b>'+f3(A.S.s)+'</b> s / <b>'+Math.round(A.S.s*A.S.fps)+'</b> コマ'};
  },
  onFrame:function(){
    SIDES.forEach(function(s){
      var p=PL(s); if(!p.ready)return;
      document.querySelector('[data-sf2="'+s+'"]').textContent=String(p.startFrame);
      document.querySelector('[data-st2="'+s+'"]').textContent=f3(startTime(p));
      var sc=document.querySelector('[data-cmscrub="'+s+'"]');
      sc.max=String(Math.max(0.001,p.video.duration));sc.step=String(1/A.S.fps);
      if(document.activeElement!==sc)sc.value=String(p.previewing?p.video.currentTime:startTime(p)+A.S.s);
      document.querySelector('[data-cmscrubv="'+s+'"]').textContent=A.TF(parseFloat(sc.value)||0)+'コマ';
    });
    drawStrobe();
  },
  fpsKeep:function(){return [];},
  enter:function(){
    $('#cmpModeHint').textContent=(C.cmode==='A')
      ?'同じ動画を左右に読み込み、別々の開始フレームを指定します（スケールのずれが起きません）'
      :'別々に撮影した2本の動画を左右に読み込みます';
    /* まだ自分で選んでいなければ、①で使った Δt をそのまま既定にする */
    if(!SB.dtTouched&&A.O&&A.O.dtF)SB.dtF=A.O.dtF;
    fillDt();syncSbBtns();syncRulerBtns();
    applyLayout();syncAdjust();
  },
  leave:function(){hideStrobe();},
  onReady:function(){
    var p=PL('L').ar?PL('L'):PL('R');
    if(p.ar)C.ar=p.ar;
    A.S.s=0;clearPreview();clearShots();applyLayout();applyFit();paint();banner();
  }
};
A.registerMode('compare',mode);

/* 映像の上：横になぞる＝コマ送り、縦＝（許可時）映像を上下に動かす */
SIDES.forEach(function(s){
  var p=PL(s);
  p.vp.addEventListener('pointerdown',function(){if(A.S.mode==='compare')setActive(s);});
  A.attachStageGesture(p,{
    armed:function(){return false;},
    onJog:function(d){if(A.S.mode==='compare')A.step(d);},
    onDragYStart:function(){return C.marks[s];},
    onDragY:function(newOffset,newMark){
      if(A.S.mode!=='compare'||!C.dragMove)return;
      p.offsetY=clamp(newOffset,-100,100);
      C.marks[s]=clamp(newMark,0,1);
      syncAdjust();applyFit();place();
    }
  });
});
})(App);
