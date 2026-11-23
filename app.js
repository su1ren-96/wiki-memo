'use strict';
const DB='wiki-memo-db',STORE='notes',main=document.getElementById('main');let lastEditField=null;let db=null,notes=[],page='home',currentId=null,editingId=null,searchText='',categoryFilter='',historyStack=[],ready=false,loadError=false;
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const uid=()=>globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random();
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'id'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function all(){return new Promise((res,rej)=>{const r=db.transaction(STORE).objectStore(STORE).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function write(fn){return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');try{fn(tx.objectStore(STORE))}catch(e){rej(e);return}tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error)})}
async function reload(){notes=(await all()).sort((a,b)=>b.updated-a.updated)}
function toast(t){const el=$('#toast');el.textContent=t;el.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.add('hidden'),2500)}
function date(ts){return new Date(ts||Date.now()).toLocaleDateString('ja-JP',{year:'numeric',month:'long',day:'numeric'})}
function icon(name){const paths={bookmark:'<path d="M6 3h12v18l-6-4-6 4z"/>',edit:'<path d="M4 20h4l12-12-4-4L4 16zM14 6l4 4"/>',share:'<path d="M12 16V3m-5 5 5-5 5 5M5 14v6h14v-6"/>',back:'<path d="m15 18-6-6 6-6"/>',trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',plus:'<path d="M12 4v16M4 12h16"/>'};return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`}
function linkify(text){
 // Parse wiki links before HTML escaping to avoid double-encoding apostrophes.
 return String(text??'').split(/(\[\[[^\]\n]+\]\])/g).map(part=>{
  const match=part.match(/^\[\[([^\]\n]+)\]\]$/);
  if(!match)return esc(part);
  const [target,display]=match[1].split(/\|(.*)/s);
  const name=target.trim(),label=(display===undefined?name:display.trim());
  const n=notes.find(x=>x.title===name);
  return `<a href="#" class="${n?'':'missing'}" data-link="${esc(name)}">${esc(label)}</a>`;
 }).join('');
}
function inline(text){return linkify(text).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>')}
function tableCell(text){return String(text).split(/<br\s*\/?\s*>/i).map(part=>inline(part)).join('<br>')}
function richParagraph(lines){
 const source=String(lines.join('\n')).replace(/\r\n?/g,'\n');
 const out=[];let paragraph=[];let table=[];let list=[];
 const flushParagraph=()=>{if(paragraph.some(x=>x.trim()))out.push(`<p>${inline(paragraph.join('\n').trim())}</p>`);paragraph=[]};
 const flushTable=()=>{if(!table.length)return;const rows=table.map(line=>line.trim().replace(/^\|/,'').replace(/\|\s*$/,'').split('|').map(x=>x.trim()));const sep=rows.length>1&&rows[1].every(x=>/^:?-{3,}:?$/.test(x));const data=sep?rows.filter((_,i)=>i!==1):rows;const width=data[0]?.length||0;if(width){out.push('<div class="wiki-table-scroll"><table class="wiki-table"><tbody>'+data.map((row,i)=>'<tr>'+Array.from({length:width},(_,j)=>row[j]||'').map(cell=>`<${i===0?'th':'td'}>${tableCell(cell)}</${i===0?'th':'td'}>`).join('')+'</tr>').join('')+'</tbody></table></div>')}else out.push(`<p>${inline(table.join('\n'))}</p>`);table=[]};
 const flushList=()=>{
  if(!list.length)return;
  let html='<ul class="wiki-bullets">',nested=false,first=true;
  for(const item of list){
   if(item.level===2&&!nested){html+='<ul class="wiki-bullets">';nested=true;first=true}
   if(item.level===1&&nested){html+='</li></ul></li>';nested=false;first=true}
   if(!first)html+='</li>';
   html+='<li>'+inline(item.text);first=false;
  }
  html+='</li>'+(nested?'</ul></li>':'')+'</ul>';
  out.push(html);list=[];
 };
 for(const line of source.split('\n')){
  const bullet=line.match(/^(\s*)([-*])\s+(.+)$/);
  if(bullet){
   flushTable();flushParagraph();
   const level=bullet[1].length>=2?2:1;
   list.push({level,text:bullet[3]});continue;
  }
  if(list.length&&/^\s{2,}\S/.test(line)&&!line.trim().startsWith('|')){
   list[list.length-1].text+='\n'+line.trim();continue;
  }
  flushList();
  if(/^\s*\|/.test(line)){flushParagraph();table.push(line);continue}
  if(table.length&&line.trim()&&!/^\s*==/.test(line)){table[table.length-1]+='<br>'+line.trim();continue}
  flushTable();if(!line.trim()){flushParagraph()}else paragraph.push(line);
 }
 flushTable();flushList();flushParagraph();return out.join('');
}
function sections(body){const lines=String(body||'').split(/\r?\n/);let intro=[],parts=[],section=null;for(const line of lines){const m=line.match(/^\s*==\s*(.*?)\s*==\s*$/);if(m){section={title:m[1],lines:[]};parts.push(section)}else (section?section.lines:intro).push(line)}return {lead:richParagraph(intro),sections:parts.map(s=>`<details class="section" open><summary>${inline(s.title)}</summary><div class="section-content article">${richParagraph(s.lines)}</div></details>`).join('')}}
function row(n){return `<a class="list-row" href="#" data-open="${esc(n.id)}"><strong>${inline(n.title)}</strong><p>${esc((n.description||n.body||'').replace(/==/g,'').replace(/\s+/g,' ').slice(0,100))}</p><span class="meta">${esc(n.category||'未分類')} · ${date(n.updated)}</span></a>`}
function title(t,sub=''){return `<h1 class="page-title">${inline(t)}</h1>${sub?`<p class="subtitle">${inline(sub)}</p>`:''}<hr class="rule">`}
function tools(n){return `<div class="tools"><span class="meta">文<small> A</small></span><div class="tool-group"><button class="tool ${n.favorite?'selected':''}" data-action="favorite" aria-label="お気に入り">${icon('bookmark')}</button><button class="tool" data-action="edit" aria-label="編集">${icon('edit')}</button><button class="tool" data-action="share" aria-label="共有">${icon('share')}</button></div></div>`}
function info(n){
 const lines=String(n.info||'').split(/\r?\n/);const entries=[];
 for(const raw of lines){const line=raw.trim();if(!line)continue;
  const group=line.match(/^(?:【(.+?)】|\[\[(.+?)\]\]|#{2}\s+(.+))$/);
  if(group){let groupText=(group[1]||group[2]||group[3]).trim(),color=null;const custom=groupText.match(/^#([0-9a-fA-F]{6})\|([\s\S]+)$/);if(custom){color='#'+custom[1];groupText=custom[2]}entries.push({group:groupText,color});continue}
  const i=line.indexOf('：')>=0?line.indexOf('：'):line.indexOf(':');
  if(i>0){
   entries.push({label:line.slice(0,i).trim(),value:line.slice(i+1).trim()});
  }else{
   // A line without a colon continues the preceding value, until the next heading or item.
   const previous=entries[entries.length-1];
   if(previous&&!previous.group)previous.value+='\n'+line;
  }
 }
 if(!entries.length&&!n.image)return '';
 return `<aside class="infobox">${n.showInfoTitle===false?'':`<div class="infobox-title">${inline(n.title)}</div>`}${n.image?`<img src="${esc(n.image)}" alt="${esc(n.title)}の画像">`:''}${entries.length?`<table><tbody>${entries.map(e=>e.group?`<tr class="infobox-group"${e.color?` style="--group-color:${esc(e.color)}"`:""}><th colspan="2">${inline(e.group)}</th></tr>`:`<tr><th>${inline(e.label)}</th><td>${e.value.split('\n').map(part=>inline(part)).join('<br>')}</td></tr>`).join('')}</tbody></table>`:''}</aside>`
}
function splitLegacy(body){const lines=String(body||'').split(/\r?\n/),lead=[],items=[];let current=null;for(const line of lines){const m=line.match(/^\s*==\s*(.*?)\s*==\s*$/);if(m){current={heading:m[1],text:''};items.push(current)}else if(current)current.text+=(current.text?'\n':'')+line;else lead.push(line)}return {lead:lead.join('\n').trim(),items}}
function editorTools(){return `<div class="rich-toolbar global-tools"><button type="button" class="btn small" data-action="format-bold"><b>B</b> 太字</button><button type="button" class="btn small" data-action="format-link">🔗 記事リンク</button><span class="hint">文字を選択して使えます</span></div>`}
function sectionInputs(items){return items.map((item,i)=>`<div class="section-editor"><div class="section-editor-head"><strong>見出し ${i+1}</strong><button type="button" class="btn small danger" data-action="remove-section">削除</button></div><label class="field">見出し名</label><input class="input section-heading" placeholder="例：歴史" value="${esc(item.heading)}"><label class="field">この見出しの本文</label><div class="rich-toolbar"><button type="button" class="btn small" data-action="bold" aria-label="選択した文字を太字にする"><b>B</b> 太字</button><button type="button" class="btn small" data-action="bullet">● 箇条書き</button><button type="button" class="btn small" data-action="subbullet">○ 小項目</button><button type="button" class="btn small" data-action="visual-table">▦ 表を編集</button><button type="button" class="btn small" data-action="format-link">🔗 リンク</button></div><textarea class="input section-text" rows="8" placeholder="ここに内容を入力">${esc(item.text)}</textarea></div>`).join('')}

let tableEdit=null;
function tableLines(text){
 const lines=text.split('\n');let groups=[],start=-1,end=-1;
 for(let i=0;i<lines.length;i++){
  if(/^\s*\|/.test(lines[i])){if(start<0)start=i;end=i}
  else if(start>=0)break;
 }
 return start<0?null:{start,end,lines,raw:lines.slice(start,end+1)};
}
function openTableEditor(area){
 const found=tableLines(area.value);
 const rows=found?found.raw.map(line=>line.trim().replace(/^\|/,'').replace(/\|\s*$/,'').split('|').map(v=>v.trim().replace(/<br\s*\/?\s*>/gi,'\n'))):[['項目1','項目2','項目3'],['','','']];
 const separator=rows.length>1&&rows[1].every(x=>/^:?-{3,}:?$/.test(x));
 if(separator)rows.splice(1,1);
 const cols=Math.max(2,...rows.map(r=>r.length));
 rows.forEach(r=>{while(r.length<cols)r.push('')});
 tableEdit={area,found,rows};
 const modal=document.createElement('div');modal.className='table-modal';modal.id='table-modal';
 modal.innerHTML=`<div class="table-dialog" role="dialog" aria-modal="true" aria-label="表の編集"><div class="table-dialog-head"><div><strong>表を編集</strong><p>セルをタップして入力。改行キーでセル内改行できます。</p></div><button type="button" class="btn small" data-table="cancel">閉じる</button></div><div class="table-grid-wrap" id="table-grid-wrap"><div id="table-grid"></div></div><div class="table-controls"><button type="button" class="btn small" data-table="row">＋ 行</button><button type="button" class="btn small" data-table="column">＋ 列</button><button type="button" class="btn small" data-table="remove-row">－ 最終行</button><button type="button" class="btn small" data-table="remove-column">－ 最終列</button></div><p class="hint">1行目は見出し。リンクは [[記事名]]、太字は **文字** と入力できます。</p><div class="table-dialog-actions"><button type="button" class="btn" data-table="cancel">キャンセル</button><button type="button" class="btn primary" data-table="save">本文に反映</button></div></div>`;
 document.body.appendChild(modal);drawTableGrid();
}
function syncTableGrid(){
 if(!tableEdit)return;
 document.querySelectorAll('#table-grid textarea[data-r]').forEach(el=>{tableEdit.rows[+el.dataset.r][+el.dataset.c]=el.value});
}
function drawTableGrid(){
 const wrap=document.getElementById('table-grid');if(!wrap||!tableEdit)return;
 const rows=tableEdit.rows,cols=rows[0].length;
 wrap.style.setProperty('--cols',cols);
 wrap.innerHTML=rows.map((row,r)=>row.map((value,c)=>`<label class="table-cell-editor"><span>${r===0?'見出し':'行 '+r} · 列 ${c+1}</span><textarea rows="3" data-r="${r}" data-c="${c}" aria-label="${r===0?'見出し':'行'+r} 列${c+1}">${esc(value)}</textarea></label>`).join('')).join('');
}
document.addEventListener('click',e=>{
 const btn=e.target.closest('[data-table]');if(!btn)return;
 const action=btn.dataset.table;if(!tableEdit)return;
 if(action==='cancel'){document.getElementById('table-modal')?.remove();tableEdit=null;return}
 syncTableGrid();const rows=tableEdit.rows;
 if(action==='row')rows.push(Array(rows[0].length).fill(''));
 if(action==='column')rows.forEach(r=>r.push(''));
 if(action==='remove-row'&&rows.length>2)rows.pop();
 if(action==='remove-column'&&rows[0].length>2)rows.forEach(r=>r.pop());
 if(action==='save'){
  const encode=v=>String(v).replace(/\r\n?/g,'\n').replace(/\n/g,'<br>').replace(/\|/g,'｜');
  const lines=[rows[0],rows[0].map(()=>'---'),...rows.slice(1)].map(row=>'| '+row.map(encode).join(' | ')+' |');
  const newTable=lines.join('\n'),area=tableEdit.area,found=tableEdit.found;
  if(found){const all=area.value.split('\n');all.splice(found.start,found.end-found.start+1,newTable);area.value=all.join('\n')}
  else{const pos=area.selectionStart;const prefix=area.value.slice(0,pos),suffix=area.value.slice(pos);area.value=prefix+(prefix&&!prefix.endsWith('\n')?'\n':'')+newTable+'\n'+suffix}
  area.dispatchEvent(new Event('input',{bubbles:true}));
  document.getElementById('table-modal')?.remove();tableEdit=null;area.focus();toast('表を本文に反映しました');return;
 }
 drawTableGrid();
});

function collectSections(){return [...main.querySelectorAll('.section-editor')].map(el=>({heading:el.querySelector('.section-heading').value.trim(),text:el.querySelector('.section-text').value.trim()})).filter(x=>x.heading||x.text)}
function listField(value){return String(value||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean)}
function renderExtras(n){const extra=n.extras||{},groups=[['関連項目',extra.related],['脚注',extra.footnotes],['外部リンク',extra.external]];return groups.map(([heading,value])=>{const entries=listField(value);return `<details class="section"><summary>${inline(heading)}</summary><div class="section-content article">${entries.length?`<ul>${entries.map(v=>`<li>${heading==='外部リンク'&&/^https?:\/\//i.test(v)?`<a href="${esc(v)}" target="_blank" rel="noopener noreferrer">${esc(v)}</a>`:inline(v)}</li>`).join('')}</ul>`:'<p>まだ登録されていません。</p>'}</div></details>`}).join('')}
function render(){if(loadError){main.innerHTML=`${title('データを読み込めませんでした')}<p class="notice">保存データを開けませんでした。データが消えたわけではありません。</p><button class="btn" data-action="retry">再試行</button>`;return}if(!ready){main.innerHTML=`${title('ウィキメモ')}<p>読み込み中…</p>`;return}let html='';
if(page==='home'){html=title('メインページ','自分だけの百科事典を作りましょう。')+`<p class="lead">ウィキメモは、あなたが調べたことや覚えておきたいことを、Wikipediaのような記事として保存できるアプリです。</p><button class="btn primary new-cta" data-action="new">＋ 新しい記事を作成</button><h2 class="section-title">最近更新した記事</h2>${notes.length?notes.slice(0,10).map(row).join(''):'<div class="empty">まだ記事がありません。<br>「新しい記事を作成」から最初の記事を書いてみましょう。</div>'}<h2 class="section-title">カテゴリ</h2>${[...new Set(notes.map(n=>n.category).filter(Boolean))].map(c=>`<button class="category" data-category="${esc(c)}">${esc(c)}</button>`).join('')||'<p class="subtitle">記事を作るとカテゴリが表示されます。</p>'}<h2 class="section-title">すべての記事（${notes.length}）</h2>${notes.map(row).join('')}`}
else if(page==='article'){const n=notes.find(x=>x.id===currentId);if(!n){page='home';render();return}const content=sections(n.body);html=title(n.title,n.description||'')+tools(n)+`<div class="edit-entry"><button class="btn primary" data-action="edit">✎ この記事の内容を入力・編集する</button><p>本文・見出し・情報ボックスは編集画面から入力できます。</p></div>`+(n.category?`<div class="breadcrumb"><a href="#" data-category="${esc(n.category)}">${esc(n.category)}</a> › <strong>${inline(n.title)}</strong></div>`:'')+`<div class="article">${content.lead||'<p>本文はまだありません。</p>'}</div>${info(n)}${content.sections}${renderExtras(n)}<div class="updated">◷ 最終更新：${date(n.updated)}</div><h2 class="section-title">関連記事</h2>${related(n).map(row).join('')||'<p class="subtitle">関連記事はありません。</p>'}<div class="actions"><button class="btn" data-action="back">← 戻る</button><button class="btn danger" data-action="delete">記事を削除</button></div>`}
else if(page==='search'){const found=notes.filter(n=>(n.title+' '+n.body+' '+n.category+' '+(n.description||'')).toLowerCase().includes(searchText.toLowerCase()));html=title('検索','記事のタイトル・本文・カテゴリから探す')+`<div class="searchbox"><input id="search-input" aria-label="検索キーワード" placeholder="記事を検索" value="${esc(searchText)}"><button data-action="clear-search">消去</button></div><div id="search-results"><p class="meta">${found.length}件の記事</p>${found.map(row).join('')||'<div class="empty">該当する記事はありません。</div>'}</div>`}
else if(page==='categories'){const cats=[...new Set(notes.map(n=>n.category||'未分類'))];html=title('カテゴリ一覧')+(cats.map(c=>`<button class="category" data-category="${esc(c)}">${esc(c)}（${notes.filter(n=>(n.category||'未分類')===c).length}）</button>`).join('')||'<div class="empty">カテゴリはありません。</div>')}
else if(page==='favorites'){html=title('お気に入り')+(notes.filter(n=>n.favorite).map(row).join('')||'<div class="empty">お気に入りの記事はまだありません。</div>')}
else if(page==='edit'){const n=notes.find(x=>x.id===editingId),legacy=splitLegacy(n?.body),extras=n?.extras||{};html=title(n?'記事を編集':'新しい記事を作成')+`<form id="editor"><p class="notice">以下の入力欄に直接書いて保存できます。歴史・事業・役員などの見出しも個別に編集できます。</p>${editorTools()}<label class="field" for="title">記事タイトル *</label><input id="title" class="input" maxlength="150" required value="${esc(n?.title||'')}"><label class="field" for="description">短い説明</label><input id="description" class="input" maxlength="200" value="${esc(n?.description||'')}"><label class="field" for="category">カテゴリ</label><input id="category" class="input" maxlength="80" value="${esc(n?.category||'')}"><h2 class="edit-group-title">記事の紹介文</h2><textarea id="body" class="input" rows="5" placeholder="記事の最初に表示する説明文">${esc(legacy.lead)}</textarea><h2 class="edit-group-title">記事の見出しと内容</h2><p class="hint">各項目に直接入力してください。文字を選んで「太字」、表は「表を編集」でセルごとに入力できます。表のセル内で改行するには &lt;br&gt; を入力してください。不要な見出しは削除できます。</p><div id="section-editors">${sectionInputs(legacy.items.length?legacy.items:['歴史','事業','役員'].map(heading=>({heading,text:''})))}</div><button type="button" class="btn" data-action="add-section">＋ 見出しを追加</button><h2 class="edit-group-title">関連項目</h2><textarea id="related" class="input" rows="3" placeholder="1行に1記事。例：[[東京]]">${esc(extras.related||'')}</textarea><h2 class="edit-group-title">脚注</h2><textarea id="footnotes" class="input" rows="3" placeholder="1行に1件の参考資料や注釈">${esc(extras.footnotes||'')}</textarea><h2 class="edit-group-title">外部リンク</h2><textarea id="external" class="input" rows="3" placeholder="1行に1つURLを入力">${esc(extras.external||'')}</textarea><h2 class="edit-group-title">関連記事</h2><textarea id="relatedPages" class="input" rows="3" placeholder="関連記事のタイトルを1行に1件">${esc(extras.relatedPages||'')}</textarea><h2 class="edit-group-title">情報ボックス</h2><label class="info-title-toggle"><input id="show-info-title" type="checkbox" ${n?.showInfoTitle===false?'':'checked'}> 情報ボックスの上部に記事タイトルを表示する</label><p class="hint">チェックを外すと、画像の「〇〇〇〇」のようなタイトル欄を非表示にします。記事自体のタイトルは残ります。</p><label class="field" for="info">大項目と項目・内容</label><p class="hint">「＋ 黄色い大項目」で区切りを作り、各行に「項目：内容」を入力します。大項目は【プロフィール】のように記録されます。</p><div class="rich-toolbar"><button type="button" class="btn small" data-action="info-group">＋ 黄色い大項目</button><button type="button" class="btn small" data-action="info-row">＋ 項目と内容</button><button type="button" class="btn small" data-action="format-bold"><b>B</b> 太字</button><button type="button" class="btn small" data-action="format-link">🔗 リンク</button><label class="group-color-picker">大項目の色 <input id="group-color" type="color" value="#f1f43c" aria-label="大項目の背景色"></label></div><textarea id="info" class="input" rows="9" placeholder="【プロフィール】&#10;愛称：サンプル&#10;出身地：[[東京都]]&#10;【活動情報】&#10;職業：歌手">${esc(n?.info||'')}</textarea><label class="field" for="image">情報ボックスの画像</label><input id="image" class="input" type="file" accept="image/*">${n?.image?'<label><input type="checkbox" id="remove-image"> 既存の画像を削除する</label>':''}<div class="actions"><button class="btn primary" type="submit">記事を保存</button><button class="btn" type="button" data-action="cancel">キャンセル</button></div></form>`}
else if(page==='settings'){html=title('設定')+`<h2 class="section-title">バックアップ</h2><p class="subtitle">記事数：${notes.length}件。データはこの端末のブラウザ内に保存されます。</p><div class="actions"><button class="btn" data-action="export">JSONバックアップを保存</button><button class="btn" data-action="import">バックアップから復元</button></div><div class="notice">復元すると現在の記事を置き換えます。更新前にはバックアップを保存してください。</div><h2 class="section-title">アプリについて</h2><p class="subtitle">Wiki Memo Ver.18 · ライトモード専用 · PWA対応</p>`}
main.innerHTML=html;window.scrollTo(0,0)}
function related(n){const names=[...String(n.body+'\n'+(n.extras?.related||'')).matchAll(/\[\[([^\]]+)\]\]/g)].map(m=>m[1]).concat(listField(n.extras?.relatedPages));return notes.filter(x=>x.id!==n.id&&(names.includes(x.title)||(n.category&&x.category===n.category))).slice(0,4)}
// Persist scroll positions in browser history so native iOS swipe-back restores the prior article.
const navKey='wiki-memo-navigation';
function restoreScroll(y){requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:Math.max(0,y||0),behavior:'instant'})))}
function rememberPosition(){if(history.state?.app===navKey)history.replaceState({...history.state,page,currentId,scrollY:window.scrollY},'')}
function go(p,push=true,nextId=currentId){
 if(push)rememberPosition();
 page=p;currentId=nextId;render();
 const state={app:navKey,page,currentId,scrollY:0};
 if(push)history.pushState(state,'');else history.replaceState(state,'');
}
function back(){if(history.state?.app===navKey&&history.length>1){history.back();return}go('home',false,null)}
window.addEventListener('popstate',e=>{
 if(e.state?.app===navKey){page=e.state.page||'home';currentId=e.state.currentId||null;render();restoreScroll(e.state.scrollY)}
 else{page='home';currentId=null;render()}
});
window.addEventListener('pagehide',rememberPosition);
function newArticle(name=''){editingId=null;go('edit');if(name)$('#title').value=name}
function showCategory(c){categoryFilter=c;searchText=c==='未分類'?'':c;go('search')}
function openArticle(id){go('article',true,id)}
async function persist(n){await write(s=>s.put(n));await reload()}
async function imageData(file){if(!file)return null;if(file.size>12*1024*1024)throw Error('画像は12MB以下を選んでください');const img=await createImageBitmap(file);const scale=Math.min(1,1000/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);img.close();return canvas.toDataURL('image/jpeg',.78)}
main.addEventListener('focusin',e=>{if(e.target.matches('#editor input:not([type=file]):not([type=color]),#editor textarea'))lastEditField=e.target});
main.addEventListener('click',async e=>{const l=e.target.closest('[data-link]');if(l){e.preventDefault();const n=notes.find(x=>x.title===l.dataset.link);n?openArticle(n.id):newArticle(l.dataset.link);return}const r=e.target.closest('[data-open]');if(r){e.preventDefault();openArticle(r.dataset.open);return}const c=e.target.closest('[data-category]');if(c){showCategory(c.dataset.category);return}const b=e.target.closest('[data-action]');if(!b)return;try{const a=b.dataset.action;if(a==='info-group'||a==='info-row'){const area=$('#info');if(!area)return;const pos=area.selectionStart;const prefix=pos>0&&area.value[pos-1]!=='\n'?'\n':'';const insert=prefix+(a==='info-group'?'【'+$('#group-color').value+'|新しい大項目】\n':'項目名：内容\n');area.setRangeText(insert,pos,area.selectionEnd,'end');area.focus();}else if(a==='format-bold'||a==='format-link'){
 const area=(document.activeElement?.matches('#editor input:not([type=file]):not([type=color]),#editor textarea')?document.activeElement:lastEditField);
 if(!area||!area.isConnected){toast('先に編集したい入力欄をタップしてください');return}
 const st=area.selectionStart,en=area.selectionEnd,selected=area.value.slice(st,en);
 const insert=a==='format-bold'?'**'+(selected||'太字')+'**':'[['+(selected||'記事名')+']]';
 area.setRangeText(insert,st,en,'select');area.focus();
 }else if(a==='bullet'||a==='subbullet'){
 const area=b.closest('.section-editor')?.querySelector('.section-text');
 if(!area)return;
 const st=area.selectionStart,en=area.selectionEnd;
 const start=area.value.lastIndexOf('\n',Math.max(0,st-1))+1;
 const endIndex=area.value.indexOf('\n',en);
 const end=endIndex<0?area.value.length:endIndex;
 const chosen=area.value.slice(start,end);
 const prefix=a==='bullet'?'- ':'  - ';
 const updated=chosen.split('\n').map(line=>line.trim()?prefix+line.replace(/^\s*[-*]\s+/,''):prefix).join('\n');
 area.setRangeText(updated,start,end,'select');area.focus();
 }else if(a==='visual-table'){const area=b.closest('.section-editor')?.querySelector('.section-text');if(area)openTableEditor(area);
 }else if(a==='bold'||a==='table'||a==='table3'){const area=b.closest('.section-editor')?.querySelector('.section-text');if(!area)return;const st=area.selectionStart,en=area.selectionEnd;const selected=area.value.slice(st,en);const insert=a==='bold'?'**'+(selected||'太字')+'**':a==='table3'?'| 項目 | 内容1 | 内容2 |\n| --- | --- | --- |\n| 項目1 | 値1 | 値2 |\n| 項目2 | 値3 | 値4 |':'| 項目 | 内容 |\n| --- | --- |\n| 項目1 | 内容1 |\n| 項目2 | 内容2 |';area.setRangeText(insert,st,en,'end');area.focus();area.dispatchEvent(new Event('input',{bubbles:true}));}else if(a==='add-section'){const holder=$('#section-editors');holder.insertAdjacentHTML('beforeend',sectionInputs([{heading:'',text:''}]));holder.lastElementChild.querySelector('.section-heading').focus()}else if(a==='remove-section'){b.closest('.section-editor').remove()}else if(a==='new')newArticle();else if(a==='edit'){editingId=currentId;go('edit')}else if(a==='back'||a==='cancel')back();else if(a==='favorite'){const n=notes.find(x=>x.id===currentId);await persist({...n,favorite:!n.favorite});render()}else if(a==='share'){if(navigator.share)await navigator.share({title:notes.find(n=>n.id===currentId)?.title||'Wiki Memo',url:location.href});else toast('記事はこの端末内に保存されています')}else if(a==='delete'){if(!confirm('この記事を削除しますか？'))return;await write(s=>s.delete(currentId));await reload();historyStack=[];go('home',false,null);toast('記事を削除しました')}else if(a==='clear-search'){searchText='';render();$('#search-input')?.focus()}else if(a==='retry')await start();else if(a==='export'){const blob=new Blob([JSON.stringify({format:'wiki-memo',version:1,exportedAt:new Date().toISOString(),notes},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='wiki-memo-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000)}else if(a==='import')$('#import-file').click()}catch(err){console.error(err);toast(err.message||'操作に失敗しました')}});
main.addEventListener('submit',async e=>{if(e.target.id!=='editor')return;e.preventDefault();const title=$('#title').value.trim();if(!title)return toast('タイトルを入力してください');const old=notes.find(n=>n.id===editingId);try{const file=$('#image').files[0];const image=$('#remove-image')?.checked?'':file?await imageData(file):old?.image||'';const n={id:old?.id||uid(),title,description:$('#description').value.trim(),category:$('#category').value.trim(),body:[$('#body').value.trim(),...collectSections().map(x=>'== '+(x.heading||'見出し')+' ==\n'+x.text)].filter(Boolean).join('\n\n'),extras:{related:$('#related').value,footnotes:$('#footnotes').value,external:$('#external').value,relatedPages:$('#relatedPages').value},info:$('#info').value,showInfoTitle:$('#show-info-title').checked,image,favorite:old?.favorite||false,created:old?.created||Date.now(),updated:Date.now()};await persist(n);currentId=n.id;page='article';historyStack=[];history.replaceState({app:navKey,page,currentId,scrollY:0},'');render();toast('記事を保存しました')}catch(err){console.error(err);toast('保存できませんでした：'+err.message)}});
main.addEventListener('input',e=>{if(e.target.id==='search-input'){searchText=e.target.value;const found=notes.filter(n=>(n.title+' '+n.body+' '+n.category+' '+(n.description||'')).toLowerCase().includes(searchText.toLowerCase()));$('#search-results').innerHTML=`<p class="meta">${found.length}件の記事</p>${found.map(row).join('')||'<div class="empty">該当する記事はありません。</div>'}`}});
$('#menu').onclick=()=>$('#drawer').classList.remove('hidden');$('#close-menu').onclick=()=>$('#drawer').classList.add('hidden');$('#drawer').onclick=e=>{if(e.target.id==='drawer')$('#drawer').classList.add('hidden');const b=e.target.closest('[data-nav]');if(!b)return;$('#drawer').classList.add('hidden');b.dataset.nav==='new'?newArticle():go(b.dataset.nav)};$('#search-top').onclick=()=>go('search');$('#new-top').onclick=()=>newArticle();
$('#import-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{const data=JSON.parse(await file.text());if(data.format!=='wiki-memo'||data.version!==1||!Array.isArray(data.notes)||!data.notes.every(n=>n&&typeof n.id==='string'&&typeof n.title==='string'&&typeof n.body==='string'&&typeof n.updated==='number'&&typeof n.category==='string'&&typeof n.favorite==='boolean')||new Set(data.notes.map(n=>n.id)).size!==data.notes.length)throw Error('不正なバックアップ');if(!confirm(`${data.notes.length}件の記事を復元します。現在の記事は置き換わります。`))return;await write(s=>{s.clear();data.notes.forEach(n=>s.put(n))});await reload();historyStack=[];go('home',false,null);toast('復元しました')}catch(err){console.error(err);toast('バックアップから復元できませんでした')}};
async function start(){loadError=false;ready=false;render();try{db=await openDB();await reload();ready=true;render();history.replaceState({app:navKey,page,currentId,scrollY:0},'')}catch(err){console.error(err);loadError=true;render()}}
start();if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.error));
