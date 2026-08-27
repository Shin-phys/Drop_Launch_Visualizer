/* =========================================================
   ① 斜方投射を観る
     水平：Δt ごとの等間隔の縦線／追いかけカメラ
     鉛直：最高点を軸にしたミラー再生（下り +t と 上りの逆再生 −t）
   ========================================================= */
(function(A){
'use strict';
var $=A.$, $$=A.$$, clamp=A.clamp, f3=A.f3;

var O={dtF:2,dtTouched:false,fStart:null,fApex:null,fEnd:null,sMark:0,arm:0,
  showGrid:false,showPred:false,camOn:false,vx:0,
  maskOn:false,maskW:0.06,maskOp:0.75,bandOp:0,lineOp:0.5,sbs:false,camX:0.5,
  mir:'side',flip:true,ovop:0.55,apexX:0.5,showHG:false,hgY:0.4,mirAdj:0,
  /* ストロボ：shots は「もう通り過ぎた位置」の素のコマ。いまの位置は生の映像が受け持つ */
  strobeOn:false,sbMode:'light',shots:[],
  /* 横線（最高点からの落下距離 1,4,9,16… ＝ 間隔が 1:3:5:7…） */
  showHL:false,hlY0:0.18,hlU:0.035};
A.O=O;
var P1=function(){return A.P('O1');}, P2=function(){return A.P('O2');};

function ready3(){return O.fStart!=null&&O.fApex!=null&&O.fEnd!=null&&O.fStart<O.fApex&&O.fApex<O.fEnd;}
function dtSec(){return O.dtF/A.S.fps;}

/* ---------- Δt（時間のものさし） ---------- */
var DT_OPTS=[1,2,3,4,5,6,8,10,12,15,20,24,30,40,60];
function nearestDt(n){var b=DT_OPTS[0];DT_OPTS.forEach(function(o){if(Math.abs(o-n)<Math.abs(b-n))b=o;});return b;}
function defaultDt(){return Math.max(1,Math.round(A.S.fps/30));}
/* 飛んでいる時間を10等分するあたりが、縦線がいちばん読みやすい */
function suggestDt(){
  if(!ready3())return defaultDt();
  return nearestDt(Math.max(1,Math.round((A.FT(O.fEnd)-A.FT(O.fStart))/10*A.S.fps)));
}
function fillDt(){
  var sel=$('#obDtSel'); if(!sel)return;
  sel.innerHTML='';
  DT_OPTS.concat(DT_OPTS.indexOf(O.dtF)<0?[O.dtF]:[]).forEach(function(n){
    var o=document.createElement('option');o.value=String(n);o.textContent=n+' コマ';sel.appendChild(o);
  });
  sel.value=String(O.dtF);
  $('#obDtRead').textContent=O.dtF+' コマ ＝ '+f3(dtSec())+' 秒';
  syncHL();
}
$('#obDtSel').addEventListener('change',function(e){
  O.dtF=parseInt(e.target.value,10);O.dtTouched=true;
  /* 刻みが変われば、溜めてある位置は別の Δt の絵になってしまう。混ぜずに捨てる。 */
  if(O.shots.length)clearShots();
  fillDt();syncGridButtons();paint();
});

/* ---------- 区間 ---------- */
$$('[data-mark]').forEach(function(b){
  b.addEventListener('click',function(){
    if(A.S.mode!=='observe')return;
    O[b.getAttribute('data-mark')]=A.TF(P1().ready?P1().video.currentTime:0);
    refreshRange();
  });
});
function refreshRange(){
  [['fStart','#obVStart','#obN1'],['fApex','#obVApex','#obN2'],['fEnd','#obVEnd','#obN3']].forEach(function(a){
    var v=O[a[0]];
    $(a[1]).textContent=(v==null)?'—':(v+' コマ / '+f3(A.FT(v))+' s');
    $(a[2]).classList.toggle('done',v!=null);
  });
  var ok=ready3();
  $('#obRangeDone').disabled=!ok;
  $('#obRangeDone').textContent=ok?'決まった → 水平を見る':'3つとも決めてください';
}
$('#obRangeDone').addEventListener('click',function(){
  if(!ready3()){A.toast('開始 → 最高点 → おわり の順（コマ番号が増える順）になるように選んでください。');return;}
  A.setTab('h');
});
$('#obRangeReset').addEventListener('click',function(){O.fStart=O.fApex=O.fEnd=null;refreshRange();});

/* ---------- 位置をタップして取る（帯の位置・最高点の軸） ---------- */
function armUI(){
  A.ov.arm(O.arm>0);
  var hb=$('#hintbar');
  if(hb){hb.textContent='タップするあいだ、カメラは止めています';A.show('#hintbar',O.arm>0);}
  $('#obApexPick').classList.toggle('warn',O.arm===3);
  $('#obCamPick').classList.toggle('warn',O.arm===4);
  paint();
}
$('#obApexPick').addEventListener('click',function(){A.setPlaying(false);A.S.s=0;O.arm=3;armUI();});

/* 押した位置と離した位置がほぼ同じ（＝タップ）のときだけ点を取る。
   こうしておくと、拡大中に指でなぞって移動しても誤って点が入らない。 */
function pickDown(pid){
  return function(e){
    if(A.S.mode!=='observe'||!O.arm)return;
    O._px=e.clientX; O._py=e.clientY;
  };
}
function pick(pid){
  return function(e){
    if(A.S.mode!=='observe'||!O.arm)return;
    if(pid==='O2'&&O.arm!==3)return;
    if(A.isOverlayEl(e.target))return;
    if(O._px==null)return;
    if(Math.abs(e.clientX-O._px)>8||Math.abs(e.clientY-O._py)>8){O._px=null;return;}
    O._px=null;
    var vp=A.P(pid).vp, r=vp.getBoundingClientRect();
    var x=clamp((e.clientX-r.left)/r.width,0,1), y=clamp((e.clientY-r.top)/r.height,0,1);
    if(O.arm===3){
      O.apexX=x;O.arm=0;armUI();
      $('#obApexV').textContent='横 '+(x*100).toFixed(1)+'%';
    }else if(O.arm===4){
      /* 「このコマで、ボールはここ」を基準にする。以後のカメラの位置はここから計算する */
      O.arm=0; O.sMark=A.S.s; armUI(); setCamX(x);
    }
    paint();
  };
}
['O1','O2'].forEach(function(id){
  A.P(id).vp.addEventListener('pointerdown',pickDown(id));
  A.P(id).vp.addEventListener('pointerup',pick(id));
});

/* 縦線の間隔のもと。測った値があればそれを、無ければ自分で合わせたカメラの速さを使う */
function gridBase(){
  return {x0:O.camX, d:O.vx*dtSec(), v:O.vx};
}
function syncGridButtons(){
  var g=gridBase(), okg=Math.abs(g.d)>0.004;
  $('#obGrid').disabled=!okg; $('#obPred').disabled=!okg;
  $('#obGridSrc').textContent=okg
    ? ('この速さなら Δt のあいだに 画面幅の '+(Math.abs(g.d)*100).toFixed(1)+'%（＝ Δt × '+Math.abs(g.v).toFixed(3)+'）')
    : 'まず 2 でカメラの速さを決めてください。';
  if(!okg){O.showGrid=false;O.showPred=false;}
}
A.observeSyncGrid=syncGridButtons;
$('#obGrid').addEventListener('click',function(){
  O.showGrid=!O.showGrid; if(O.showGrid)O.camOn=false; syncHButtons(); A.syncPanels(); setStage();
});
$('#obPred').addEventListener('click',function(){O.showPred=!O.showPred;syncHButtons();paint();});
$('#obCam').addEventListener('click',function(){
  O.camOn=!O.camOn;
  /* 追いかけカメラは水平の動きを打ち消す機能なので、
     水平の動きを見るための縦線・ストロボとは同時に使えない。 */
  if(O.camOn){O.showGrid=false; if(O.strobeOn){O.strobeOn=false;clearShots();}}
  syncHButtons(); A.syncPanels(); setStage();
});
function setCamX(x,fromSlider){
  O.camX=clamp(x,0,1);
  if(!fromSlider)$('#obCamX').value=String(O.camX);
  $('#obCamXv').textContent=Math.round(O.camX*100)+'%';
  place();
}
A.observeSetCamX=setCamX;
$('#obCamX').addEventListener('input',function(){setCamX(parseFloat(this.value),true);});
$('#obCamPick').addEventListener('click',function(){O.arm=4;armUI();});
/* =========================================================
   ストロボ
     考え方：蓄積するのは「もう通り過ぎた位置」だけにする。
     いまの位置は生の映像がそのまま受け持つので、コマ送りしても画が動く。
     合成は素の画素どうしの明暗くらべ（lighten / darken）だけで行う。
     球の位置を推定して貼るようなことは絶対にしない。
     それをやると「等間隔に見えた」のがアプリの仮定のせいになってしまい、
     いま確かめようとしていることの証拠にならなくなる。
   ========================================================= */
var trail=null;          /* 過去の位置ぶんを焼き付けておく板（毎コマ作り直さないため） */
function trailCv(){
  var v=P1().video;
  if(!trail)trail=document.createElement('canvas');
  var w=v.videoWidth||16, h=v.videoHeight||9;
  if(trail.width!==w||trail.height!==h){trail.width=w;trail.height=h;}
  return trail;
}
function sbOp(){return (O.sbMode==='dark')?'darken':'lighten';}
/* いま映っているコマを、素のまま1枚取る */
function snap(){
  var v=P1().video;
  if(!v.videoWidth||v.readyState<2)return null;
  var c=document.createElement('canvas');
  c.width=v.videoWidth; c.height=v.videoHeight;
  try{c.getContext('2d').drawImage(v,0,0,c.width,c.height);}catch(e){return null;}
  return c;
}
function curF(){return A.TF(A.FT(O.fStart)+A.S.s);}
/* 目当てのコマが出てから撮る。すでに出ていればその場で撮る（待ち時間なし）。 */
var sbBusy=false;
function snapWhen(cb){
  var v=P1().video, want=curF(), n=0;
  (function poll(){
    if(v.readyState>=2&&!v.seeking&&A.TF(v.currentTime)===want){cb(snap());return;}
    if(++n>60){cb(snap());return;}   /* 1.5 秒で見切りをつけて、いまの画で撮る */
    setTimeout(poll,25);
  })();
}
function rebuildTrail(){
  var c=trailCv(), g=c.getContext('2d');
  g.globalCompositeOperation='source-over';
  g.clearRect(0,0,c.width,c.height);
  for(var i=0;i<O.shots.length;i++){
    g.globalCompositeOperation=(i===0)?'source-over':sbOp();
    g.drawImage(O.shots[i],0,0,c.width,c.height);
  }
  g.globalCompositeOperation='source-over';
  syncSbCount();
}
function addShot(cv){
  if(!cv)return;
  O.shots.push(cv);
  var c=trailCv(), g=c.getContext('2d');
  g.globalCompositeOperation=(O.shots.length===1)?'source-over':sbOp();
  g.drawImage(cv,0,0,c.width,c.height);
  g.globalCompositeOperation='source-over';
  syncSbCount(); A.vib(6);
}
function popShot(){
  if(!O.shots.length)return false;
  O.shots.pop(); rebuildTrail(); return true;
}
function clearShots(){O.shots.length=0;rebuildTrail();}
function syncSbCount(){
  var e=$('#obSbCount'); if(e)e.textContent=O.shots.length+' 個';
}
/* 毎コマ描く。生の映像を下地にして、過去ぶんの板を明暗くらべで載せるだけ。 */
function drawStrobe(){
  var p=P1(), v=p.video;
  var on=O.strobeOn&&A.S.tab==='h'&&v.videoWidth>0;
  if(!on){ if(p.sc)A.show(p.sc,false); return; }
  var c=A.strobeCv(p), g=c.getContext('2d');
  g.globalCompositeOperation='source-over';
  g.drawImage(v,0,0,c.width,c.height);
  if(O.shots.length){
    g.globalCompositeOperation=sbOp();
    g.drawImage(trailCv(),0,0,c.width,c.height);
    g.globalCompositeOperation='source-over';
  }
  A.show(p.sc,true);
}
function setStrobe(on){
  if(O.strobeOn===on)return;
  O.strobeOn=on;
  clearShots();
  if(on&&O.camOn){O.camOn=false;O.sbs=false;}   /* 追いかけカメラとは同時に使えない */
  if(!on&&P1().sc)A.show(P1().sc,false);
  syncHButtons(); A.syncPanels(); setStage();
}
$('#obStrobe').addEventListener('click',function(){setStrobe(!O.strobeOn);});
$('#obSbSeg').addEventListener('click',function(e){
  var b=e.target.closest('button'); if(!b)return;
  O.sbMode=b.getAttribute('data-sb');
  $$('#obSbSeg button').forEach(function(x){x.classList.toggle('on',x===b);});
  rebuildTrail(); place();
});
$('#obSbAdd').addEventListener('click',function(){
  if(!O.strobeOn){A.toast('先に「ストロボにする」を押してください。');return;}
  if(sbBusy)return; sbBusy=true;
  snapWhen(function(cv){sbBusy=false;addShot(cv);place();});
});
$('#obSbUndo').addEventListener('click',function(){popShot();place();});
$('#obSbClear').addEventListener('click',function(){clearShots();place();});
$('#obSbPng').addEventListener('click',exportPng);

/* Δt ずつ進める。ふつうに再生しただけでは Δt ごとの位置は追えないので。
   ストロボ中は、進むときに「いま居る位置」を置いていき、戻るときに最後の1つを消す。 */
function stepDt(n){
  A.setPlaying(false);
  /* ストロボ中は半端な Δt で止めない。端で切り詰められると、最後の1つだけが
     Δt の格子から外れた位置に出てしまい、「等間隔か」を見る絵が壊れる。 */
  if(O.strobeOn){
    var nx=A.S.s+n*dtSec();
    if(nx>mode.sMax()+1e-9){A.toast('この先は「おわり」を越えます。Δt を小さくするか、ここまでで見てください。');return;}
    if(nx<-1e-9){A.toast('この手前は「開始」より前です。');return;}
  }
  if(O.strobeOn&&n>0){
    if(sbBusy)return;
    sbBusy=true;
    snapWhen(function(cv){
      sbBusy=false; addShot(cv);
      A.S.s=clamp(A.S.s+n*dtSec(),0,mode.sMax());
      place();
    });
    return;
  }
  var s0=A.S.s;
  A.S.s=clamp(A.S.s+n*dtSec(),0,mode.sMax());
  if(O.strobeOn&&n<0&&A.S.s!==s0)popShot();
}
A.attachRepeat($('#obDtNext'),function(){stepDt(1);});
A.attachRepeat($('#obDtPrev'),function(){stepDt(-1);});

/* ---------- 横線（最高点からの落下距離） ----------
   k = 0,1,4,9,16,25 の位置に引くと、となりあう間隔が 1,3,5,7,9 の奇数列になる。
   動かせるのは 0 と 1 の2本だけ。その先は「等加速度ならここ」という予測なので、
   手で動かせてしまうと確かめる意味がなくなる。 */
var HL_K=[0,1,4,9,16,25];
var HL_MAX=HL_K[HL_K.length-1];   /* 目盛りはここまで通す */
/* 線そのものは「最高点からの落下距離」＝ 0,1,4,9,16,25（右側の札）。
   1,3,5,7,9 はそれとは別物で、線と線の「あいだの距離」（左側の札）。
   同じ数字の並びに見えて意味が違うので、置く場所と向きを分けている。 */
function hlPos(kk){return (kk===0)?'0（最高点）':String(kk);}
function syncHL(){
  var e=$('#obHLRead'); if(!e)return;
  e.innerHTML=O.showHL
    ? ('右の数字は線の位置で <b>0, 1, 4, 9, 16, 25</b>（＝ k²）。'+
       '目盛りを線と線のあいだで数えると <b>1 : 3 : 5 : 7 : 9</b>。Δt ＝ '+f3(dtSec())+' 秒 ＝ '+O.dtF+' コマ。')
    : '最高点を 0 として、Δt ごとの落下距離が 1, 4, 9, 16 … になるかを見ます。';
}
$('#obHL').addEventListener('click',function(){
  O.showHL=!O.showHL; syncHButtons(); syncHL(); paint();
});
/* 最高点のコマへ移動して、ストロボを引き直す。
   1:3:5:7 は「最高点から Δt ごと」に数えたときの並びなので、
   途中の適当なコマから始めると当然合わない。 */
$('#obHLApex').addEventListener('click',function(){
  if(O.fApex==null||O.fStart==null){A.toast('先に「区間を決める」で最高点を決めてください。');return;}
  A.setPlaying(false);
  A.S.s=clamp(A.FT(O.fApex)-A.FT(O.fStart),0,mode.sMax());
  clearShots();
  A.toast('最高点のコマにそろえました。ここから「Δt すすむ」を押していきます。');
  place();
});

/* ---------- 画像で保存 ----------
   線も一緒に焼き込む。ワークシートに貼ったときに、何を見た絵なのかが残るように。 */
function exportPng(){
  var p=P1(), v=p.video;
  if(!O.strobeOn){A.toast('先に「ストロボにする」を押してください。');return;}
  if(!v.videoWidth){A.toast('映像がまだ読み込まれていません。');return;}
  drawStrobe();
  var W=v.videoWidth, H=v.videoHeight;
  var c=document.createElement('canvas'); c.width=W; c.height=H;
  var g=c.getContext('2d');
  g.drawImage(A.strobeCv(p),0,0,W,H);
  var u=Math.max(1,Math.round(H/540));
  function tag(t,x,y,col,right){
    g.font='700 '+(u*13)+'px system-ui,-apple-system,sans-serif';
    var w=g.measureText(t).width+u*8, h=u*19;
    var bx=right?(x-w):x;
    g.fillStyle='rgba(0,0,0,.62)'; g.fillRect(bx,y,w,h);
    g.fillStyle=col; g.textBaseline='top'; g.fillText(t,bx+u*4,y+u*3);
  }
  if(O.showGrid){
    var gb=gridBase(), d=gb.d;
    if(Math.abs(d)>0.004){
      var a=Math.ceil((0-gb.x0)/d), b=Math.floor((1-gb.x0)/d), t;
      if(a>b){t=a;a=b;b=t;}
      a=Math.max(a,-60); b=Math.min(b,60);
      for(var k=a;k<=b;k++){
        var x=gb.x0+k*d; if(x<0||x>1)continue;
        g.strokeStyle=(k===0)?'rgba(77,163,255,.95)':'rgba(255,255,255,.5)';
        g.lineWidth=(k===0)?u*2:u;
        g.beginPath(); g.moveTo(x*W,0); g.lineTo(x*W,H); g.stroke();
      }
    }
  }
  if(O.showHL){
    /* 右：線の位置（0,1,4,9,16,25）と、そのすぐ左の通し目盛り。
       あいだの距離（1,3,5,7,9）は札を置かず、この目盛りを数えて読む。
       目盛りは札より先に描く（札の背景で刻みが切れないように）。 */
    var rx=W-u*34, ry0=O.hlY0*H, upx2=O.hlU*H;
    g.strokeStyle='rgba(255,204,77,.92)'; g.lineWidth=u*1.6;
    g.beginPath();
    g.moveTo(rx,Math.max(0,ry0)); g.lineTo(rx,Math.min(H,ry0+HL_MAX*upx2)); g.stroke();
    for(var j=0;j<=HL_MAX;j++){
      var maj=(j%5===0), yy=ry0+j*upx2;
      if(yy<0||yy>H)continue;
      if(!maj&&upx2<u*5)continue;
      g.lineWidth=maj?u*2:u*1.5;
      g.beginPath(); g.moveTo(rx,yy); g.lineTo(rx-(maj?u*17:u*8),yy); g.stroke();
    }
    HL_K.forEach(function(kk){
      var y=O.hlY0+kk*O.hlU; if(y<0||y>1)return;
      g.strokeStyle=(kk===0)?'rgba(255,159,67,.95)':'rgba(255,204,77,.9)';
      g.lineWidth=(kk===0)?u*2:u*1.5;
      g.setLineDash(kk===0?[]:[u*6,u*5]);
      g.beginPath(); g.moveTo(0,y*H); g.lineTo(W,y*H); g.stroke();
      g.setLineDash([]);
      tag(hlPos(kk),W-u*6,y*H+(kk===0?-u*22:u*3),(kk===0)?'#ff9f43':'#ffcc4d',true);
    });
  }
  tag('Δt ＝ '+O.dtF+' コマ ＝ '+f3(dtSec())+' 秒　／　'+O.shots.length+'＋1 コマ重ね',u*6,u*6,'#eef2f8',false);
  c.toBlob(function(bl){
    if(!bl){A.toast('画像を作れませんでした。');return;}
    var a=document.createElement('a');
    a.href=URL.createObjectURL(bl);
    a.download='strobe-'+O.dtF+'koma.png';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){URL.revokeObjectURL(a.href);},2000);
    A.toast('画像を保存しました。');
  },'image/png');
}
$('#obLineOp').addEventListener('input',function(){
  O.lineOp=parseFloat(this.value);$('#obLineOpv').textContent=Math.round(O.lineOp*100)+'%';place();
});
$('#obBandOp').addEventListener('input',function(){
  O.bandOp=parseFloat(this.value);$('#obBandOpv').textContent=Math.round(O.bandOp*100)+'%';place();
});
$('#obMask').addEventListener('click',function(){
  O.maskOn=!O.maskOn; A.show('#obMaskRow',O.maskOn); syncHButtons(); paint();
});
$('#obMaskW').addEventListener('input',function(){
  O.maskW=parseFloat(this.value);$('#obMaskWv').textContent=Math.round(O.maskW*100)+'%';place();
});
$('#obMaskOp').addEventListener('input',function(){
  O.maskOp=parseFloat(this.value);$('#obMaskOpv').textContent=Math.round(O.maskOp*100)+'%';place();
});
$('#obSbs').addEventListener('click',function(){
  O.sbs=!O.sbs; syncHButtons(); A.syncPanels(); setStage();
});
function syncHButtons(){
  $('#obGrid').classList.toggle('ok',O.showGrid);
  $('#obGrid').textContent=O.showGrid?'縦線を消す':'縦線を出す';
  $('#obPred').classList.toggle('ok',O.showPred);
  $('#obPred').textContent=O.showPred?'しるしを消す':'等速ならここ';
  $('#obCam').classList.toggle('ok',O.camOn);
  $('#obCam').textContent=O.camOn?'カメラを止める':'カメラを動かす';
  $('#obMask').classList.toggle('ok',O.maskOn);
  $('#obMask').textContent=O.maskOn?'背景を出す':'背景を隠す';
  $('#obSbs').classList.toggle('ok',O.sbs);
  $('#obSbs').textContent=O.sbs?'並べるのをやめる':'もとの映像と並べる';
  $('#obStrobe').classList.toggle('ok',O.strobeOn);
  $('#obStrobe').textContent=O.strobeOn?'ストロボをやめる':'ストロボにする';
  A.show('#obSbSeg',O.strobeOn);
  A.show('#obSbRow',O.strobeOn);
  $('#obHL').classList.toggle('ok',O.showHL);
  $('#obHL').textContent=O.showHL?'横線を消す':'横線を出す';
  A.show('#obBandRow',O.camOn);
  if(!O.camOn)A.show('#obMaskRow',false);
  syncSbCount();
}
/* 速さの指定は3通り（スライダー・数値・ボタン）。どれで変えても表示をそろえる。
   スライダーだけだと、スマホの幅では 0.02 きざみ程度にしかならないため。 */
function setVx(v,from){
  if(!isFinite(v))return;
  var cv=$('#obCamV'), lim=parseFloat(cv.max);
  O.vx=clamp(Math.round(v*1000)/1000,-lim,lim);
  if(from!=='slider')cv.value=String(O.vx);
  if(from!=='num')$('#obCamVnum').value=O.vx.toFixed(3);
  syncGridButtons();
  place();
}
A.observeSetVx=setVx;
$('#obCamV').addEventListener('input',function(){setVx(parseFloat(this.value),'slider');});
$('#obCamVnum').addEventListener('input',function(){setVx(parseFloat(this.value),'num');});
$('#obCamVnum').addEventListener('change',function(){setVx(parseFloat(this.value));});
$$('[data-camv]').forEach(function(b){
  A.attachRepeat(b,function(){setVx(O.vx+parseFloat(b.getAttribute('data-camv')));});
});

/* ---------- ミラー再生 ---------- */
$('#obMirSeg').addEventListener('click',function(e){
  var b=e.target.closest('button'); if(!b)return;
  O.mir=b.getAttribute('data-m');
  $$('#obMirSeg button').forEach(function(x){x.classList.toggle('on',x===b);});
  setStage();
});
$('#obFlip').addEventListener('change',function(){O.flip=this.checked;paint();});
/* 逆再生側だけを1コマ動かす。コマ送りは両方が同時に動くので、ふたつのずれは2コマ単位でしか変わらない。 */
function syncMirAdj(){
  var e=$('#obMirAdjV'); if(!e)return;
  e.textContent=(O.mirAdj>0?'＋':O.mirAdj<0?'−':'±')+Math.abs(O.mirAdj)+' コマ';
}
A.observeSyncMirAdj=syncMirAdj;
$$('[data-miradj]').forEach(function(b){
  var d=parseInt(b.getAttribute('data-miradj'),10);
  A.attachRepeat(b,function(){
    O.mirAdj=d?clamp(O.mirAdj+d,-60,60):0;
    syncMirAdj(); A.vib(4); paint();
  });
});
$('#obOvop').addEventListener('input',function(){
  O.ovop=parseFloat(this.value);$('#obOvopV').textContent=Math.round(O.ovop*100)+'%';setStage();
});
$('#obHG').addEventListener('click',function(){
  O.showHG=!O.showHG;
  this.classList.toggle('ok',O.showHG);
  this.textContent=O.showHG?'高さの線を消す':'高さの線を出す';
  paint();
});

/* ---------- 描画 ---------- */
function setStage(){
  var st=$('#stage'), tab=A.S.tab;
  var two=(tab==='v')||(tab==='h'&&O.camOn&&O.sbs);
  st.className='stage '+(tab==='v'?(O.mir==='over'?'over':'side'):(two?'side':'one'));
  st.style.setProperty('--ovop',String(O.ovop));
  A.syncPanels();
  document.querySelector('.panel[data-side="O2"]').classList.toggle('dim',tab==='v'&&O.mir==='over');
  document.querySelector('[data-chip="O1"]').textContent=
    (tab==='v')?'下り（+t）':(two?'追いかけカメラ':'映像');
  document.querySelector('[data-chip="O2"]').textContent=
    (tab==='v')?'逆再生（上り）':'もとの映像';
  paint();
}
function paint(){
  ['O1','O2'].forEach(function(id){A.ov.clear(A.P(id));});
  var tab=A.S.tab, p1=P1();
  if(tab==='h'){
    if(O.showGrid){
      var gb=gridBase(), d=gb.d;
      if(Math.abs(d)>0.004){
        var a=Math.ceil((0-gb.x0)/d), b=Math.floor((1-gb.x0)/d);
        if(a>b){var t=a;a=b;b=t;}
        a=Math.max(a,-60); b=Math.min(b,60);
        for(var k=a;k<=b;k++){
          var x=gb.x0+k*d; if(x<0||x>1)continue;
          var el=A.ov.el(p1,'vline'+(k===0?' k0':''),k===0?'①':(k===1?'Δt':null));
          el.style.left=(x*100)+'%';
        }
      }
    }
    if(O.camOn){
      /* 基準の縦線。測定前でも出し、ドラッグしてボールに合わせられるようにする */
      var cl=A.ov.el(p1,'vline cam');
      cl.addEventListener('pointerdown',function(ev){
        A.dragX(ev,p1.vp,function(x){setCamX(x);});
      });
      /* 帯そのもの（半透明の青）。濃さ 0 なら線だけになる */
      A.ov.el(p1,'band');
      /* 背景を隠す縦帯。動く背景が視界から外れると、ボールの動きが鉛直だけに見える */
      if(O.maskOn&&!paused()){A.ov.el(p1,'mask ml');A.ov.el(p1,'mask mr');}
    }
    if(O.showPred)A.ov.el(p1,'tri');
    if(O.showHL){
      /* 右の数字のすぐ左に、最高点から下へ1本だけ通した目盛り。
         数字だけでは根拠が見えないので、1単位ずつ刻んで数えられるようにする。 */
      var pr=A.ov.el(p1,'posruler');
      var psp=document.createElement('div'); psp.className='psp'; pr.appendChild(psp);
      for(var j=0;j<=HL_MAX;j++){
        var tk=document.createElement('div');
        tk.className='pt'+((j%5===0)?' maj':'');
        tk.setAttribute('data-j',String(j));
        pr.appendChild(tk);
      }
      HL_K.forEach(function(kk,i){
        var d=A.ov.el(p1,'hline rule'+(kk===0?' o':''),hlPos(kk));
        d.setAttribute('data-k',String(kk));
        if(kk===0||kk===1){
          d.addEventListener('pointerdown',function(ev){
            A.dragY(ev,p1.vp,function(y){
              if(kk===0)O.hlY0=y; else O.hlU=Math.max(0.004,y-O.hlY0);
              place();
            });
          });
        }else{
          /* 予測の線は動かせない。動かせてしまうと、確かめる意味がなくなる。 */
          d.style.pointerEvents='none'; d.style.cursor='default';
        }
      });
    }
  }
  if(tab==='v'){
    ['O1','O2'].forEach(function(id){
      var p=A.P(id);
      var ax=A.ov.el(p,'vline axis','最高点');
      /* 反転の軸は画面上の位置なので、どちらの映像で動かしても同じ値でよい */
      ax.addEventListener('pointerdown',function(ev){
        A.dragX(ev,p.vp,function(x){O.apexX=x;place();});
      });
      if(O.showHG){
        var hg=A.ov.el(p,'hline guide');
        hg.addEventListener('pointerdown',function(ev){A.dragY(ev,p.vp,function(y){O.hgY=y;place();});});
      }
    });
  }
  place();
}
/* 位置をタップしてもらうあいだは、カメラのパンとマスクを止める。
   止めないとボールが帯の外に隠れて選べない／2点が同じ位置になる。 */
function paused(){return O.arm>0;}
function camActive(){return A.S.tab==='h'&&O.camOn&&!paused();}
function place(){
  /* カメラのパンとミラーの反転 */
  var cam=camActive();
  A.applyTransform(P1(),cam?(-(O.vx*(A.S.s-O.sMark))*100):0);
  A.applyTransform(P2(),0,(A.S.tab==='v'&&O.flip)?O.apexX:null);
  /* カメラが動いていることを画面に明示する（背景を隠すときこそ必要） */
  var badge=document.querySelector('[data-cam="O1"]');
  if(badge){
    badge.classList.toggle('hidden',!cam);
    if(cam)badge.textContent=(O.vx>=0?'カメラ →':'← カメラ')+' '+Math.abs(O.vx).toFixed(3)+' 画面幅/秒';
  }
  var c=O.camX, w=O.maskW;
  var cline=P1().ovl.querySelector('.cam');
  if(cline){cline.style.left=(c*100)+'%';cline.style.opacity=String(O.lineOp);}
  var band=P1().ovl.querySelector('.band');
  if(band){
    band.style.left=(Math.max(0,c-w/2)*100)+'%';
    band.style.width=(Math.min(1,c+w/2)-Math.max(0,c-w/2))*100+'%';
    band.style.background='rgba(77,163,255,'+O.bandOp+')';
  }
  if(cam&&O.maskOn){
    var o=String(O.maskOp);
    var l=P1().ovl.querySelector('.ml'), r=P1().ovl.querySelector('.mr');
    if(l){l.style.left='0';l.style.width=(Math.max(0,c-w/2)*100)+'%';l.style.background='rgba(0,0,0,'+o+')';}
    if(r){r.style.left=(Math.min(1,c+w/2)*100)+'%';r.style.right='0';r.style.background='rgba(0,0,0,'+o+')';}
  }
  if(A.S.tab==='h'){
    var tri=P1().ovl.querySelector('.tri');
    if(tri){
      var gp=gridBase(), xp=gp.x0+gp.v*(A.S.s-O.sMark);
      tri.style.left=clamp(xp,0,1)*100+'%';
      tri.style.opacity=(xp<-0.02||xp>1.02)?'0':'1';
    }
  }
  if(A.S.tab==='h'&&O.showHL){
    Array.prototype.forEach.call(P1().ovl.querySelectorAll('.rule'),function(el){
      var y=O.hlY0+parseFloat(el.getAttribute('data-k'))*O.hlU;
      el.style.top=(y*100)+'%';
      el.style.display=(y<-0.01||y>1.01)?'none':'';
    });
    /* 1単位が何ピクセルになるかで、細かい刻みを出すかどうかを決める。
       つぶれた目盛りは数えられないので、そのときは5つおきだけ残す。 */
    var hpx=P1().vp.clientHeight||360, upx=O.hlU*hpx;
    var pr=P1().ovl.querySelector('.posruler');
    if(pr){
      var ry0=O.hlY0, ry1=O.hlY0+HL_MAX*O.hlU;
      pr.style.top=(ry0*100)+'%';
      pr.style.height=((ry1-ry0)*100)+'%';
      var pts=pr.querySelectorAll('.pt');
      for(var j=0;j<pts.length;j++){
        var jj=parseInt(pts[j].getAttribute('data-j'),10), yy=ry0+jj*O.hlU, maj=(jj%5===0);
        pts[j].style.top=(jj/HL_MAX*100)+'%';
        pts[j].style.display=((maj||upx>=5)&&yy>=-0.005&&yy<=1.005)?'':'none';
      }
    }
  }
  if(A.S.tab==='v'){
    ['O1','O2'].forEach(function(id){
      var o=A.P(id).ovl;
      var ax=o.querySelector('.axis'); if(ax)ax.style.left=(O.apexX*100)+'%';
      var hg=o.querySelector('.hline.guide'); if(hg)hg.style.top=(O.hgY*100)+'%';
    });
  }
  drawStrobe();
}

/* ---------- 保存・引き継ぎ ---------- */
$('#obSave').addEventListener('click',function(){
  A.download('shaho-kansatsu.json',{app:'projectile-lab',part:'observe',version:2,
    fps:A.S.fps,dtF:O.dtF,fStart:O.fStart,fApex:O.fApex,fEnd:O.fEnd,
    sMark:O.sMark,vx:O.vx,
    apexX:O.apexX,hgY:O.hgY,mir:O.mir,flip:O.flip,ovop:O.ovop,mirAdj:O.mirAdj,
    camX:O.camX,maskW:O.maskW,maskOp:O.maskOp,bandOp:O.bandOp,lineOp:O.lineOp,
    sbMode:O.sbMode,showHL:O.showHL,hlY0:O.hlY0,hlU:O.hlU,name:P1().name});
  $('#obSaveMsg').textContent='書き出しました（動画そのものは含まれません）。';
});
$('#obLoad').addEventListener('click',function(){A.pendingJson='observe';$('#jsonIn').click();});
A.observeLoadJson=function(d){
  if(d.fps){A.S.fps=d.fps;$('#fpsSel').value=String(d.fps);A.fpsHint();}
  if(d.dtF){O.dtF=d.dtF;O.dtTouched=true;}
  ['fStart','fApex','fEnd','sMark','vx','apexX','hgY','mirAdj',
   'camX','maskW','maskOp','bandOp','lineOp','hlY0','hlU'].forEach(function(k){
    if(d[k]!=null)O[k]=d[k];});
  if(d.sbMode==='light'||d.sbMode==='dark'){
    O.sbMode=d.sbMode;
    $$('#obSbSeg button').forEach(function(x){x.classList.toggle('on',x.getAttribute('data-sb')===O.sbMode);});
  }
  if(typeof d.showHL==='boolean')O.showHL=d.showHL;
  syncMirAdj();
  if(d.mir)O.mir=d.mir;
  if(typeof d.flip==='boolean'){O.flip=d.flip;$('#obFlip').checked=d.flip;}
  if(typeof d.ovop==='number'){O.ovop=d.ovop;$('#obOvop').value=String(d.ovop);$('#obOvopV').textContent=Math.round(d.ovop*100)+'%';}
  $('#obCamX').value=String(O.camX);$('#obCamXv').textContent=Math.round(O.camX*100)+'%';
  $('#obMaskW').value=String(O.maskW);$('#obMaskWv').textContent=Math.round(O.maskW*100)+'%';
  $('#obMaskOp').value=String(O.maskOp);$('#obMaskOpv').textContent=Math.round(O.maskOp*100)+'%';
  $('#obBandOp').value=String(O.bandOp);$('#obBandOpv').textContent=Math.round(O.bandOp*100)+'%';
  $('#obLineOp').value=String(O.lineOp);$('#obLineOpv').textContent=Math.round(O.lineOp*100)+'%';
  $('#obCamV').value=String(O.vx);$('#obCamVnum').value=O.vx.toFixed(3);
  fillDt(); refreshRange(); syncHL();
  syncHButtons(); setStage();
  $('#obSaveMsg').textContent='読み込みました。動画は別途読み込んでください。';
};
$('#obHandoff').addEventListener('click',function(){
  if(!P1().file){A.toast('先に動画を読み込んでください。');return;}
  if(O.fApex==null){A.toast('先に「区間を決める」で最高点を決めてください。');return;}
  A.handoffToCompare(P1().file,O.fApex);
});

/* ---------- モード定義 ---------- */
var mode={
  players:['O1','O2'],
  activePanels:function(){
    if(A.S.tab==='v')return ['O1','O2'];
    if(A.S.tab==='h'&&O.camOn&&O.sbs)return ['O1','O2'];
    return ['O1'];
  },
  allowNative:false,        /* 逆再生を含むので、必ずシークで同期する */
  loadTitle:'斜方投射の動画を読み込む',
  loadLead:'投げ上げたボールの動きを、水平方向と鉛直方向に分けて見ます。',
  zones:function(){return ['O'];},
  nameSlot:function(){return 'O';},
  onFile:function(t,file){A.loadInto('O1',file);A.loadInto('O2',file);},
  tabs:[{id:'range',label:'区間を決める'},{id:'h',label:'水平：等速か？'},
        {id:'v',label:'鉛直：時間反転'},{id:'sum',label:'まとめ'}],
  canOpenTab:function(id){
    if((id==='h'||id==='v')&&!ready3()){
      A.toast('先に「区間を決める」で、開始・最高点・おわりの3つを設定してください。');return false;
    }
    return true;
  },
  onTab:function(id){
    A.setPlaying(false); A.S.s=0; O.arm=0; A.show('#hintbar',false); armUI();
    /* タブを移ると先頭に戻るので、溜めた位置は前のタブの話になってしまう。持ち越さない。 */
    if(O.shots.length)clearShots();
    if(id!=='h'&&O.strobeOn){O.strobeOn=false;if(P1().sc)A.show(P1().sc,false);}
    if(id==='h'){
      if(!O.dtTouched&&ready3()){var nd=suggestDt(); if(nd!==O.dtF){O.dtF=nd;fillDt();}}
      /* 最初からカメラと背景隠しを効かせておく（探索から始める流れなので） */
      if(!O.camOn){O.camOn=true;O.sMark=0;}
      O.maskOn=true;
      A.show('#obMaskRow',true);
      syncHButtons(); syncGridButtons(); syncHL(); A.syncPanels();
    }
    syncHButtons();
    setStage();
  },
  fpsKeep:function(){return [{obj:O,key:'fStart'},{obj:O,key:'fApex'},{obj:O,key:'fEnd'}];},
  sMax:function(){
    if(!P1().ready)return 0;
    if(A.S.tab==='range')return isFinite(P1().video.duration)?P1().video.duration:0;
    if(!ready3())return 0;
    if(A.S.tab==='v'){
      /* 逆再生側は fApex+mirAdj から手前へ戻るので、そのぶん動ける範囲が変わる */
      var a=A.FT(O.fApex), b=A.FT(O.fApex+O.mirAdj);
      return Math.max(0,Math.min(b-A.FT(O.fStart),A.FT(O.fEnd)-a));
    }
    return A.FT(O.fEnd)-A.FT(O.fStart);
  },
  timeFor:function(pid){
    if(pid==='O1'){
      /* コマの中央を狙う。境界ちょうど（f/fps）を指定すると、動画側の時刻がミリ秒に
         丸められている分だけ手前のコマに落ちて、1回押しても画が変わらないことがある。 */
      if(A.S.tab==='range')return A.FT(A.TF(A.S.s));
      if(A.S.tab==='v')return A.FT(O.fApex)+A.S.s;
      return A.FT(O.fStart)+A.S.s;
    }
    if(pid==='O2'){
      if(A.S.tab==='v')return A.FT(O.fApex+O.mirAdj)-A.S.s;
      if(A.S.tab==='h'&&O.camOn&&O.sbs)return A.FT(O.fStart)+A.S.s;
    }
    return null;
  },
  readout:function(){
    var n=Math.round(A.S.s*A.S.fps);
    if(A.S.tab==='range')return {label:'位置',text:A.TF(A.S.s)+' コマ / '+f3(A.S.s)+' s'};
    if(A.S.tab==='v')return {label:'最高点から',text:'±'+f3(A.S.s)+' s（'+n+' コマ）'};
    return {label:'開始から',text:'+'+f3(A.S.s)+' s ／ Δt×'+(A.S.s/dtSec()).toFixed(2)};
  },
  onFrame:place,
  enter:function(){fillDt();refreshRange();syncHL();syncHButtons();},
  onReady:function(){A.S.s=0;setStage();}
};
A.registerMode('observe',mode);

/* 映像の上で横になぞる＝コマ送り */
['O1','O2'].forEach(function(id){
  A.attachStageGesture(A.P(id),{
    armed:function(){return A.S.mode==='observe'&&O.arm>0;},
    onJog:function(d){if(A.S.mode==='observe')A.step(d);}
  });
});
})(App);
