const W = 370, H = 320;                 // LINEのスタンプ標準サイズ(公式の画像サイズは要確認)
const MARGIN_X = 25, MARGIN_Y = 15;     // 文字を置いてはいけない外枠(公式ガイドライン)
const EDGE = 10;                        // 画像の周囲にあける余白の目安(公式ガイドライン)
const SET_SIZES = [8, 16, 24, 32, 40];  // 販売できるセットの枚数

const FONTS = {
  gothic: 'sans-serif',
  maru: '"Hiragino Maru Gothic ProN", "Hiragino Sans", sans-serif',
  mincho: '"Hiragino Mincho ProN", serif',
  hand: 'cursive'
};

const HINTS = {
  move: '画像をドラッグで移動。文字をドラッグで位置変更。',
  pen: 'ペンで描き込みます。',
  erase: '消したい部分をなぞってください。画像も描いた線も消えます。',
  lasso: '残したい部分を囲むようになぞってください。囲んだ外側が消えます。',
  pick: '背景にしたい色の場所をタップしてください。'
};

const $ = id => document.getElementById(id);
const view = $('view');
const vctx = view.getContext('2d');

let stickers = [];
let cur = -1;
let tool = 'move';
let drag = null;
let lassoPts = null;

const rgb = c => `rgb(${c.join(',')})`;
const makeLayer = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
const textFont = s => `bold ${s.textSize}px ${FONTS[s.font] || FONTS.gothic}`;
const current = () => (cur >= 0 ? stickers[cur] : null);

function newSticker(img, url, name) {
  return {
    name, url, img, thumb: null,
    scale: 1, rot: 0, ox: 0, oy: 0,
    paint: makeLayer(),   // 描いた線
    erase: makeLayer(),   // 消した部分(不透明の部分が消える)
    removeBg: false, bgColor: [255, 255, 255], tol: 30,
    text: '', font: 'gothic', textSize: 36, textColor: '#000000',
    tx: W / 2, ty: H - 40,
    main: false
  };
}

// 画像を拡大・回転・移動して描く
function drawImageInto(s, g) {
  if (!s.img) return;
  const base = Math.max(W / s.img.width, H / s.img.height) * s.scale;
  const w = s.img.width * base;
  const h = s.img.height * base;
  g.save();
  g.translate(W / 2 + s.ox, H / 2 + s.oy);
  g.rotate(s.rot * Math.PI / 180);
  g.drawImage(s.img, -w / 2, -h / 2, w, h);
  g.restore();
}

// 指定色に近いピクセルを透明にする
function removeColor(data, [r, g, b], tol) {
  const a = data.data;
  const t2 = tol * tol;
  for (let i = 0; i < a.length; i += 4) {
    const dr = a[i] - r, dg = a[i + 1] - g, db = a[i + 2] - b;
    if (dr * dr + dg * dg + db * db <= t2) a[i + 3] = 0;
  }
}

// 写真の部分(背景透過・消しゴム・なぞり切り抜きを反映)
function imageLayer(s) {
  const c = makeLayer();
  const g = c.getContext('2d');
  drawImageInto(s, g);
  if (s.removeBg) {
    const d = g.getImageData(0, 0, W, H);
    removeColor(d, s.bgColor, s.tol);
    g.putImageData(d, 0, 0);
  }
  g.globalCompositeOperation = 'destination-out';
  g.drawImage(s.erase, 0, 0);
  return c;
}

function renderSticker(s, c) {
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.drawImage(imageLayer(s), 0, 0);
  g.drawImage(s.paint, 0, 0);
  if (s.text) {
    g.font = textFont(s);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = Math.max(4, s.textSize / 5);
    g.strokeStyle = '#fff';
    g.strokeText(s.text, s.tx, s.ty);
    g.fillStyle = s.textColor;
    g.fillText(s.text, s.tx, s.ty);
  }
}

function makeThumb(s) {
  const c = makeLayer();
  renderSticker(s, c);
  return c.toDataURL('image/png');
}

function render() {
  const s = current();
  if (!s) {
    vctx.clearRect(0, 0, W, H);
    return;
  }
  renderSticker(s, view);
  if (lassoPts && lassoPts.length > 1) {
    vctx.save();
    vctx.setLineDash([6, 4]);
    vctx.strokeStyle = '#06C755';
    vctx.lineWidth = 2;
    vctx.beginPath();
    lassoPts.forEach((p, i) => (i ? vctx.lineTo(p.x, p.y) : vctx.moveTo(p.x, p.y)));
    vctx.stroke();
    vctx.restore();
  }
}

// 文字の占める範囲(縁取り込み)
function textBox(s) {
  vctx.font = textFont(s);
  const w = vctx.measureText(s.text).width;
  const pad = Math.max(4, s.textSize / 5) / 2;
  const h = s.textSize;
  return { l: s.tx - w / 2 - pad, r: s.tx + w / 2 + pad, t: s.ty - h / 2 - pad, b: s.ty + h / 2 + pad };
}

function inMargin(b) {
  return b.l >= MARGIN_X && b.r <= W - MARGIN_X && b.t >= MARGIN_Y && b.b <= H - MARGIN_Y;
}

// 周囲EDGEピクセルの内側に絵があるか
function touchesEdge(s) {
  const c = makeLayer();
  renderSticker(s, c);
  const d = c.getContext('2d').getImageData(0, 0, W, H).data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x >= EDGE && x < W - EDGE && y >= EDGE && y < H - EDGE) continue;
      if (d[(y * W + x) * 4 + 3] > 0) return true;
    }
  }
  return false;
}

function renderList() {
  const ul = $('list');
  ul.innerHTML = '';
  stickers.forEach((s, i) => {
    const li = document.createElement('li');
    if (i === cur) li.className = 'sel';
    li.innerHTML = `<img src="${s.thumb}" alt=""><span>${i + 1}</span>${s.main ? '<b class="star">★</b>' : ''}`;
    li.onclick = () => selectSticker(i);
    ul.appendChild(li);
  });
}

function selectSticker(i) {
  cur = i;
  const s = stickers[i];
  $('scale').value = s.scale;
  $('rot').value = s.rot;
  $('removeBg').checked = s.removeBg;
  $('tol').value = s.tol;
  $('swatch').style.background = rgb(s.bgColor);
  $('text').value = s.text;
  $('font').value = s.font;
  $('textSize').value = s.textSize;
  $('textColor').value = s.textColor;
  $('mainBtn').textContent = s.main ? '★ メイン画像(解除)' : 'メイン画像にする';
  renderList();
  render();
}

function setProp(k, v) {
  const s = current();
  if (!s) return;
  s[k] = v;
  render();
}

// 変更を確定してサムネイルを更新する
function commitCur() {
  const s = current();
  if (!s) return;
  s.thumb = makeThumb(s);
  renderList();
}

function addStickers(list) {
  if (!list.length) return;
  const start = stickers.length;
  list.forEach(s => { s.thumb = makeThumb(s); stickers.push(s); });
  selectSticker(start);
}

function addFiles(files) {
  return Promise.all([...files].map(f => new Promise(resolve => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => resolve(newSticker(img, url, f.name));
    img.src = url;
  }))).then(addStickers);
}

function setTool(t) {
  tool = t;
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  $('hint').textContent = HINTS[t];
}

// 線を1区間描く(destOut=trueなら消す)
function stroke(layer, a, b, color, width, destOut = false) {
  const g = layer.getContext('2d');
  g.save();
  g.globalCompositeOperation = destOut ? 'destination-out' : 'source-over';
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.stroke();
  g.beginPath();
  g.arc(b.x, b.y, width / 2, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

// なぞった輪の内側を残し、外側を消す
function applyLasso(s, pts) {
  const m = makeLayer();
  const g = m.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
  g.fill();
  // m: 輪の外側が不透明、内側は透明
  s.erase.getContext('2d').drawImage(m, 0, 0);
  const pg = s.paint.getContext('2d');
  pg.globalCompositeOperation = 'destination-out';
  pg.drawImage(m, 0, 0);
  pg.globalCompositeOperation = 'source-over';
}

function pos(e) {
  const r = view.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  if (isIOS) {
    // iPhoneのSafariは直接ダウンロードできないため、画像を開いて長押し保存してもらう
    window.open(url, '_blank');
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 共有シート(iPhoneなら「画像を保存」「ファイルに保存」)を優先して開く
async function saveFile(blob, name) {
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  download(blob, name);
}

function dataURLtoBlob(url) {
  const [head, data] = url.split(',');
  const mime = head.match(/:(.*?);/)[1];
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// 審査前チェック
function runChecks() {
  const n = stickers.length;
  const mainCount = stickers.filter(s => s.main).length;
  const title = $('title').value.trim();
  const desc = $('desc').value.trim();
  const outside = [], long = [], edge = [];
  stickers.forEach((s, i) => {
    const no = i + 1;
    if (s.text) {
      if (!inMargin(textBox(s))) outside.push(no);
      if ([...s.text].length > 6) long.push(no);
    }
    if (touchesEdge(s)) edge.push(no);
  });
  return [
    { ok: SET_SIZES.includes(n), t: `枚数 ${n}枚(8・16・24・32・40枚のいずれか)` },
    { ok: mainCount === 1, t: mainCount === 1 ? 'メイン画像が1つ選ばれている' : 'メイン画像を1つ選んでください' },
    { ok: title.length > 0, t: 'タイトルが入力されている' },
    { ok: desc.length > 0, t: '説明が入力されている' },
    { ok: outside.length === 0, t: outside.length ? `文字が余白の外にあります: ${outside.join(', ')}番` : '文字が余白の内側に収まっている' },
    { warn: long.length > 0, t: long.length ? `6文字を超える文字があります(推奨4〜6文字): ${long.join(', ')}番` : '文字数は推奨範囲内' },
    { warn: edge.length > 0, t: edge.length ? `画像の周囲10pxに絵が入っています: ${edge.join(', ')}番` : '画像の周囲に余白がある' }
  ];
}

function infoText() {
  const m = stickers.findIndex(s => s.main);
  return `タイトル: ${$('title').value.trim()}\n説明: ${$('desc').value.trim()}\n枚数: ${stickers.length}枚\nメイン画像: ${m >= 0 ? (m + 1) + '番' : '未設定'}\n`;
}

// ---- 素材 ----
$('fileInput').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
$('cameraInput').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
$('blankBtn').onclick = () => addStickers([newSticker(null, null, '白紙')]);

// ---- ツール ----
document.querySelectorAll('[data-tool]').forEach(b => { b.onclick = () => setTool(b.dataset.tool); });

// ---- 画面上の操作 ----
view.addEventListener('pointerdown', e => {
  const s = current();
  if (!s) return;
  const p = pos(e);
  view.setPointerCapture(e.pointerId);
  const size = +$('penSize').value;

  if (tool === 'pick') {
    const c = makeLayer();
    drawImageInto(s, c.getContext('2d'));
    const [r, g, b, a] = c.getContext('2d').getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data;
    if (a > 0) {
      s.bgColor = [r, g, b];
      s.removeBg = true;
      $('removeBg').checked = true;
      $('swatch').style.background = rgb(s.bgColor);
      commitCur();
    }
    setTool('move');
    render();
    return;
  }

  if (tool === 'pen') {
    drag = { t: 'pen', last: p };
    stroke(s.paint, p, p, $('penColor').value, size);
  } else if (tool === 'erase') {
    drag = { t: 'erase', last: p };
    stroke(s.erase, p, p, '#000', size * 2);
    stroke(s.paint, p, p, '#000', size * 2, true);
  } else if (tool === 'lasso') {
    drag = { t: 'lasso' };
    lassoPts = [p];
  } else {
    if (s.text) {
      const b = textBox(s);
      if (p.x >= b.l && p.x <= b.r && p.y >= b.t && p.y <= b.b) {
        drag = { t: 'text' };
        render();
        return;
      }
    }
    drag = { t: 'img', sx: p.x, sy: p.y, ox: s.ox, oy: s.oy };
  }
  render();
});

view.addEventListener('pointermove', e => {
  const s = current();
  if (!s || !drag) return;
  const p = pos(e);
  const size = +$('penSize').value;
  if (drag.t === 'pen') {
    stroke(s.paint, drag.last, p, $('penColor').value, size);
    drag.last = p;
  } else if (drag.t === 'erase') {
    stroke(s.erase, drag.last, p, '#000', size * 2);
    stroke(s.paint, drag.last, p, '#000', size * 2, true);
    drag.last = p;
  } else if (drag.t === 'lasso') {
    lassoPts.push(p);
  } else if (drag.t === 'text') {
    s.tx = p.x;
    s.ty = p.y;
  } else {
    s.ox = drag.ox + p.x - drag.sx;
    s.oy = drag.oy + p.y - drag.sy;
  }
  render();
});

const endDrag = () => {
  const s = current();
  if (drag && s && drag.t === 'lasso' && lassoPts && lassoPts.length >= 3) applyLasso(s, lassoPts);
  const was = drag;
  drag = null;
  lassoPts = null;
  if (was) {
    commitCur();
    render();
  }
};
view.addEventListener('pointerup', endDrag);
view.addEventListener('pointercancel', endDrag);

$('clearPaint').onclick = () => {
  const s = current();
  if (!s) return;
  s.paint.getContext('2d').clearRect(0, 0, W, H);
  s.erase.getContext('2d').clearRect(0, 0, W, H);
  commitCur();
  render();
};

// ---- 編集パネル ----
$('scale').oninput = e => setProp('scale', +e.target.value);
$('scale').onchange = commitCur;
$('rot').oninput = e => setProp('rot', +e.target.value);
$('rot').onchange = commitCur;
$('removeBg').onchange = e => { setProp('removeBg', e.target.checked); commitCur(); };
$('tol').oninput = e => setProp('tol', +e.target.value);
$('tol').onchange = commitCur;
$('text').oninput = e => setProp('text', e.target.value);
$('text').onchange = commitCur;
$('font').onchange = e => { setProp('font', e.target.value); commitCur(); };
$('textSize').oninput = e => setProp('textSize', +e.target.value);
$('textSize').onchange = commitCur;
$('textColor').oninput = e => setProp('textColor', e.target.value);
$('textColor').onchange = commitCur;

$('mainBtn').onclick = () => {
  const s = current();
  if (!s) return;
  const was = s.main;
  stickers.forEach(x => { x.main = false; });
  s.main = !was;
  $('mainBtn').textContent = s.main ? '★ メイン画像(解除)' : 'メイン画像にする';
  renderList();
};

$('delBtn').onclick = () => {
  const s = current();
  if (!s) return;
  if (s.url) URL.revokeObjectURL(s.url);
  stickers.splice(cur, 1);
  if (!stickers.length) {
    cur = -1;
    renderList();
    render();
    return;
  }
  selectSticker(Math.min(cur, stickers.length - 1));
};

// ---- 保存 ----
$('savePng').onclick = () => {
  const s = current();
  if (!s) return;
  const c = makeLayer();
  renderSticker(s, c);
  // 共有シートをユーザーの操作の直後に開くため、同期で処理する
  saveFile(dataURLtoBlob(c.toDataURL('image/png')), `sticker_${cur + 1}.png`);
};

$('saveZip').onclick = async () => {
  if (!stickers.length) return;
  const zip = new JSZip();
  const c = makeLayer();
  const blobs = [];
  for (let i = 0; i < stickers.length; i++) {
    renderSticker(stickers[i], c);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    blobs.push(blob);
    zip.file(`${String(i + 1).padStart(2, '0')}.png`, blob);
  }
  const m = stickers.findIndex(s => s.main);
  if (m >= 0) zip.file('main.png', blobs[m]);
  zip.file('info.txt', infoText());
  await saveFile(await zip.generateAsync({ type: 'blob' }), 'stickers.zip');
};

$('previewBtn').onclick = () => {
  const grid = $('grid');
  grid.innerHTML = '';
  stickers.forEach(s => {
    const img = new Image();
    img.src = makeThumb(s);
    grid.appendChild(img);
  });
  $('checks').innerHTML = runChecks().map(c => {
    const cls = c.warn ? 'warn' : c.ok ? 'ok' : 'ng';
    const label = c.warn ? '注意' : c.ok ? 'OK' : 'NG';
    return `<li class="${cls}">${label} ${c.t}</li>`;
  }).join('');
  $('preview').hidden = false;
};
$('closePreview').onclick = () => { $('preview').hidden = true; };

// ---- 起動時 ----
setTool('move');
if (isIOS && !navigator.standalone) $('iosHint').hidden = false;
$('iosHintClose').onclick = () => { $('iosHint').hidden = true; };
