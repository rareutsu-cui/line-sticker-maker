const W = 370, H = 320;               // LINEのスタンプ標準サイズ
const DEFAULT_HINT = '画像をドラッグで位置調整。文字をドラッグで移動。';

const $ = id => document.getElementById(id);
const view = $('view');
const vctx = view.getContext('2d');
const raw = document.createElement('canvas');

let stickers = [];
let cur = -1;
let pickMode = false;
let drag = null;

const rgb = c => `rgb(${c.join(',')})`;
const textFont = s => `bold ${s.textSize}px sans-serif`;

// 画像を「全体を覆う」形で配置(拡大・移動込み)
function drawImageLayer(s, c) {
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  const base = Math.max(W / s.img.width, H / s.img.height) * s.scale;
  const w = s.img.width * base;
  const h = s.img.height * base;
  g.drawImage(s.img, (W - w) / 2 + s.ox, (H - h) / 2 + s.oy, w, h);
  return g;
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

function renderSticker(s, c) {
  const g = drawImageLayer(s, c);
  if (s.removeBg) {
    const d = g.getImageData(0, 0, W, H);
    removeColor(d, s.bgColor, s.tol);
    g.putImageData(d, 0, 0);
  }
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

function render() {
  if (cur < 0) {
    vctx.clearRect(0, 0, W, H);
    return;
  }
  renderSticker(stickers[cur], view);
}

function renderList() {
  const ul = $('list');
  ul.innerHTML = '';
  stickers.forEach((s, i) => {
    const li = document.createElement('li');
    if (i === cur) li.className = 'sel';
    li.innerHTML = `<img src="${s.url}" alt=""><span>${i + 1}</span>`;
    li.onclick = () => selectSticker(i);
    ul.appendChild(li);
  });
}

function selectSticker(i) {
  cur = i;
  const s = stickers[i];
  $('scale').value = s.scale;
  $('removeBg').checked = s.removeBg;
  $('tol').value = s.tol;
  $('text').value = s.text;
  $('textSize').value = s.textSize;
  $('textColor').value = s.textColor;
  $('swatch').style.background = rgb(s.bgColor);
  renderList();
  render();
}

function setProp(k, v) {
  if (cur < 0) return;
  stickers[cur][k] = v;
  render();
}

function addFiles(files) {
  return Promise.all([...files].map(f => new Promise(resolve => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => resolve({
      name: f.name, url, img,
      scale: 1, ox: 0, oy: 0,
      removeBg: false, bgColor: [255, 255, 255], tol: 30,
      text: '', textSize: 36, textColor: '#000000',
      tx: W / 2, ty: H - 40
    });
    img.src = url;
  }))).then(list => {
    stickers.push(...list);
    renderList();
    if (cur < 0 && stickers.length) selectSticker(0);
  });
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function pos(e) {
  const r = view.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}

// ---- イベント ----
$('fileInput').onchange = e => {
  addFiles(e.target.files);
  e.target.value = '';
};
$('scale').oninput = e => setProp('scale', +e.target.value);
$('removeBg').onchange = e => setProp('removeBg', e.target.checked);
$('tol').oninput = e => setProp('tol', +e.target.value);
$('text').oninput = e => setProp('text', e.target.value);
$('textSize').oninput = e => setProp('textSize', +e.target.value);
$('textColor').oninput = e => setProp('textColor', e.target.value);

$('pickBtn').onclick = () => {
  if (cur < 0) return;
  pickMode = !pickMode;
  $('pickBtn').classList.toggle('on', pickMode);
  $('hint').textContent = pickMode ? '背景にしたい色の場所をクリックしてください' : DEFAULT_HINT;
};

view.addEventListener('pointerdown', e => {
  if (cur < 0) return;
  const p = pos(e);
  const s = stickers[cur];

  if (pickMode) {
    drawImageLayer(s, raw);
    const [r, g, b] = raw.getContext('2d').getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data;
    s.bgColor = [r, g, b];
    s.removeBg = true;
    $('removeBg').checked = true;
    $('swatch').style.background = rgb(s.bgColor);
    pickMode = false;
    $('pickBtn').classList.remove('on');
    $('hint').textContent = DEFAULT_HINT;
    render();
    return;
  }

  if (s.text) {
    vctx.font = textFont(s);
    const tw = vctx.measureText(s.text).width;
    if (Math.abs(p.x - s.tx) < tw / 2 + 10 && Math.abs(p.y - s.ty) < s.textSize / 2 + 10) {
      drag = { t: 'text' };
      view.setPointerCapture(e.pointerId);
      return;
    }
  }
  drag = { t: 'img', sx: p.x, sy: p.y, ox: s.ox, oy: s.oy };
  view.setPointerCapture(e.pointerId);
});

view.addEventListener('pointermove', e => {
  if (!drag || cur < 0) return;
  const p = pos(e);
  const s = stickers[cur];
  if (drag.t === 'text') {
    s.tx = p.x;
    s.ty = p.y;
  } else {
    s.ox = drag.ox + p.x - drag.sx;
    s.oy = drag.oy + p.y - drag.sy;
  }
  render();
});

const endDrag = () => { drag = null; };
view.addEventListener('pointerup', endDrag);
view.addEventListener('pointercancel', endDrag);

$('delBtn').onclick = () => {
  if (cur < 0) return;
  URL.revokeObjectURL(stickers[cur].url);
  stickers.splice(cur, 1);
  cur = Math.min(cur, stickers.length - 1);
  if (cur >= 0) {
    selectSticker(cur);
  } else {
    renderList();
    vctx.clearRect(0, 0, W, H);
  }
};

$('savePng').onclick = () => {
  if (cur < 0) return;
  view.toBlob(b => download(b, `sticker_${cur + 1}.png`), 'image/png');
};

$('saveZip').onclick = async () => {
  if (!stickers.length) return;
  const zip = new JSZip();
  const c = document.createElement('canvas');
  for (let i = 0; i < stickers.length; i++) {
    renderSticker(stickers[i], c);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    zip.file(`${String(i + 1).padStart(2, '0')}.png`, blob);
  }
  download(await zip.generateAsync({ type: 'blob' }), 'stickers.zip');
};

$('previewBtn').onclick = () => {
  const grid = $('grid');
  grid.innerHTML = '';
  const c = document.createElement('canvas');
  stickers.forEach(s => {
    renderSticker(s, c);
    const img = new Image();
    img.src = c.toDataURL('image/png');
    grid.appendChild(img);
  });

  const n = stickers.length;
  const fits = stickers.every(s => {
    if (!s.text) return true;
    vctx.font = textFont(s);
    return vctx.measureText(s.text).width <= W - 10;
  });
  const checks = [
    [`枚数 ${n}枚（8〜40枚）`, n >= 8 && n <= 40],
    ['文字がはみ出していない', fits]
  ];
  $('checks').innerHTML = checks
    .map(([t, ok]) => `<li class="${ok ? 'ok' : 'ng'}">${ok ? 'OK' : 'NG'} ${t}</li>`)
    .join('');
  $('preview').hidden = false;
};
$('closePreview').onclick = () => { $('preview').hidden = true; };
