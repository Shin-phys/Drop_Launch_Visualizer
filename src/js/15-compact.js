/* =========================================================
   狭い画面（生徒のスマホ）用の外枠
     ・画面を縦に固定し、映像と操作バーを上に据える
     ・タブ帯のかわりに、下部で1ステップずつ進める
     ・読み込みカードは、動画が入ったら1行に畳む
   中身のロジックはPCと同じものをそのまま使います。
   ========================================================= */
(function(A){
'use strict';
var $=A.$;
var BP='(max-width: 760px)';
var mq=window.matchMedia(BP);
var manual=null;              /* null＝画面幅にまかせる、true/false＝手動で固定 */

function isCompact(){return document.body.classList.contains('compact');}
function apply(){
  var on=(manual===null)?mq.matches:manual;
  document.body.classList.toggle('compact',on);
  $('#btnCompact').textContent=on?'PC表示':'スマホ表示';
  render();
}
if(mq.addEventListener)mq.addEventListener('change',function(){if(manual===null)apply();});
else if(mq.addListener)mq.addListener(function(){if(manual===null)apply();});
$('#btnCompact').addEventListener('click',function(){manual=!isCompact();apply();});

/* ---------- 読み込みカードの折りたたみ ---------- */
var expanded=false;
$('#loadBarChange').addEventListener('click',function(){expanded=true;render();});

/* ---------- ステップ ---------- */
function tabs(){return A.mode().tabs||[];}
function idx(){
  var t=tabs();
  for(var i=0;i<t.length;i++)if(t[i].id===A.S.tab)return i;
  return 0;
}
function go(d){
  var t=tabs(), i=idx()+d;
  if(i<0||i>=t.length)return;
  var m=A.mode();
  if(m.canOpenTab&&!m.canOpenTab(t[i].id))return;
  A.setTab(t[i].id);
  toTop();
}
/* ブラウザのスクロール位置合わせ（scroll anchoring）が、差し替えた直後に
   前のステップの位置へ戻してしまうことがある。次の描画でもう一度上に戻す。 */
function toTop(){
  var run=function(){
    var pane=document.querySelector('#panes .tabpane:not(.hidden)');
    if(pane)pane.scrollTop=0;
    var ps=$('#panes'); if(ps)ps.scrollTop=0;
    if(document.scrollingElement)document.scrollingElement.scrollTop=0;
  };
  run();
  requestAnimationFrame(function(){run();requestAnimationFrame(run);});
}
A.toTop=toTop;
$('#stepPrev').addEventListener('click',function(){go(-1);});
$('#stepNext').addEventListener('click',function(){go(1);});

function render(){
  var stageOn=!$('#secStage').classList.contains('hidden');
  var compact=isCompact();

  A.show('#stepbar',compact&&stageOn);
  A.show('#tabs',!compact);

  var collapse=compact&&stageOn&&!expanded;
  A.show('#loadFull',!collapse);
  A.show('#loadBar',collapse);
  $('#secLoad').classList.toggle('collapsed',collapse);
  if(collapse){
    var seen={},names=[];
    (A.mode().players||[]).forEach(function(id){
      var n=A.P(id).name; if(n&&!seen[n]){seen[n]=1;names.push(n);}
    });
    $('#loadBarName').textContent=names.length?('✓ '+names.join(' ／ ')):'—';
  }

  var t=tabs(), i=idx();
  if(t.length){
    $('#stepTitle').textContent=t[i].label;
    $('#stepCount').textContent=(i+1)+' / '+t.length;
    $('#stepPrev').disabled=(i===0);
    $('#stepNext').disabled=(i===t.length-1);
    $('#stepNext').textContent=(i===t.length-1)?'おわり':'次へ →';
  }
}
A.on('tab',render);
A.on('mode',function(){expanded=false;render();});
A.on('stage',function(){expanded=false;render();});
A.compactRender=render;
apply();
})(App);
