/* =========================================================
   起動 — 最後に読み込まれます
   ========================================================= */
(function(A){
'use strict';
var $=A.$;

/* 設定ファイルの読み込みは、押されたボタンに応じて振り分ける */
$('#jsonIn').addEventListener('change',function(e){
  var f=e.target.files&&e.target.files[0]; e.target.value=''; if(!f)return;
  var fr=new FileReader();
  fr.onload=function(){
    var d;
    try{d=JSON.parse(fr.result);}catch(err){A.toast('設定ファイルを読み込めませんでした。');return;}
    var want=A.pendingJson||d.part;
    if(want==='observe'&&A.observeLoadJson)A.observeLoadJson(d);
    else if(want==='compare'&&A.compareLoadJson)A.compareLoadJson(d);
    else A.toast('この設定ファイルの種類がわかりませんでした。');
    A.pendingJson=null;
  };
  fr.readAsText(f);
});

/* iOS で2本指の拡大を止める（線のドラッグを邪魔しないように） */
document.addEventListener('gesturestart',function(e){e.preventDefault();});

A.fpsHint();
A.setMode('observe');
A.startClock();
})(App);
