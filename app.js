/* ============================================================
   app.js — QR Code Generator Application Logic
   ============================================================ */

// ── CONSTANTS ──────────────────────────────────────────────
const ADMIN_PIN = '872008';
const ADMIN_PATH = 'huuhieu';
const STORAGE_KEY = 'qr_collection_v2';

// Resolve view.html path relative to index.html
function getViewerURL(params) {
  const base = window.location.href.replace(/\/[^/]*$/, '') + '/view.html';
  return base + '?' + new URLSearchParams(params).toString();
}

// ── STATE ──────────────────────────────────────────────────
let currentMode = 'link';    // 'link' | 'image'
let uploadedImageData = null;      // base64 of uploaded content image
let uploadedLogoData = null;      // base64 of logo
let logoEnabled = false;
let isAdminLoggedIn = false;
let lastGeneratedData = null;      // { canvas, name, type, data, color, bg, logo }
let qrCollection = [];        // array of QR records
let qrSize = 256;       // QR code size in pixels
let logoSize = 22;        // Logo size as % of QR
let borderEnabled = true;      // Add white border on download
let borderSize = 20;        // Border size in pixels
let artworkTitle = '';       // Title displayed below QR

// ── INIT ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadCollection();
  setupNavigation();
  setupModeTabs();
  setupDropzone();
  setupLogoToggle();
  setupColorPickers();
  setupGenerate();
  setupAdminLogin();
  checkURLPath();
});

// ── NAVIGATION ─────────────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const page = link.dataset.page;
      if (page === 'gallery') {
        showPage('gallery');
        renderGallery();
      } else {
        showPage('home');
      }
    });
  });
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const pg = document.getElementById('page-' + name);
  if (pg) pg.classList.add('active');

  const navEl = document.getElementById('nav-' + name);
  if (navEl) navEl.classList.add('active');

  window.scrollTo(0, 0);
}

// ── URL PATH CHECK ─────────────────────────────────────────
function checkURLPath() {
  const path = window.location.pathname;
  // support both /huuhieu and ?admin=huuhieu for file:// protocol
  const hash = window.location.hash;
  const search = window.location.search;

  if (path.includes(ADMIN_PATH) || hash.includes(ADMIN_PATH) || search.includes(ADMIN_PATH)) {
    showAdminLogin();
  }

  // Listen for hash changes
  window.addEventListener('hashchange', () => {
    if (window.location.hash.includes(ADMIN_PATH)) {
      showAdminLogin();
    }
  });
}

// ── MODE TABS ──────────────────────────────────────────────
function setupModeTabs() {
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentMode = tab.dataset.mode;

      document.querySelectorAll('.input-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('input-' + currentMode).classList.add('active');
    });
  });
}

// ── DROPZONE ───────────────────────────────────────────────
function setupDropzone() {
  // Main image dropzone
  const dz = document.getElementById('dropzone');
  const fileIn = document.getElementById('imageFile');
  const inner = document.getElementById('dropzoneInner');
  const preview = document.getElementById('dropzonePreview');
  const preImg = document.getElementById('previewImg');
  const dzClick = document.getElementById('dropzoneClick');
  const rmvBtn = document.getElementById('removeImage');

  dzClick.addEventListener('click', () => fileIn.click());
  dz.addEventListener('click', e => { if (!e.target.closest('.remove-btn') && !e.target.closest('.dropzone-link')) fileIn.click(); });
  fileIn.addEventListener('change', () => handleImageFile(fileIn.files[0], preImg, inner, preview, 'main'));

  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleImageFile(file, preImg, inner, preview, 'main');
  });

  rmvBtn.addEventListener('click', e => {
    e.stopPropagation();
    uploadedImageData = null;
    inner.classList.remove('hidden');
    preview.classList.add('hidden');
    fileIn.value = '';
  });

  // Logo dropzone
  const logoDZ = document.getElementById('logoDropzone');
  const logoIn = document.getElementById('logoFile');
  const logoInner = document.getElementById('logoDropzoneInner');
  const logoPrev = document.getElementById('logoPreview');
  const logoPImg = document.getElementById('logoPreviewImg');
  const logoClk = document.getElementById('logoClick');
  const logoRmv = document.getElementById('removeLogo');

  logoClk.addEventListener('click', () => logoIn.click());
  logoDZ.addEventListener('click', e => { if (!e.target.closest('.remove-btn') && !e.target.closest('.dropzone-link')) logoIn.click(); });
  logoIn.addEventListener('change', () => handleImageFile(logoIn.files[0], logoPImg, logoInner, logoPrev, 'logo'));

  logoDZ.addEventListener('dragover', e => { e.preventDefault(); logoDZ.classList.add('drag-over'); });
  logoDZ.addEventListener('dragleave', () => logoDZ.classList.remove('drag-over'));
  logoDZ.addEventListener('drop', e => {
    e.preventDefault();
    logoDZ.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleImageFile(file, logoPImg, logoInner, logoPrev, 'logo');
  });

  logoRmv.addEventListener('click', e => {
    e.stopPropagation();
    uploadedLogoData = null;
    logoInner.classList.remove('hidden');
    logoPrev.classList.add('hidden');
    logoIn.value = '';
  });
}

function handleImageFile(file, imgEl, innerEl, previewEl, target) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { showToast('⚠️ File quá lớn (tối đa 10MB)'); return; }
  if (!file.type.startsWith('image/')) { showToast('⚠️ Vui lòng chọn file hình ảnh'); return; }

  const reader = new FileReader();
  reader.onload = e => {
    const data = e.target.result;
    imgEl.src = data;
    innerEl.classList.add('hidden');
    previewEl.classList.remove('hidden');
    if (target === 'main') uploadedImageData = data;
    else uploadedLogoData = data;
  };
  reader.readAsDataURL(file);
}

// ── LOGO TOGGLE ────────────────────────────────────────────
function setupLogoToggle() {
  const chk = document.getElementById('logoEnabled');
  const area = document.getElementById('logoUploadArea');
  chk.addEventListener('change', () => {
    logoEnabled = chk.checked;
    area.classList.toggle('hidden', !logoEnabled);
  });
}

// ── COLOR PICKERS ──────────────────────────────────────────
function setupColorPickers() {
  const qrC = document.getElementById('qrColor');
  const bgC = document.getElementById('bgColor');
  const qrV = document.getElementById('qrColorVal');
  const bgV = document.getElementById('bgColorVal');

  qrC.addEventListener('input', () => { qrV.textContent = qrC.value; });
  bgC.addEventListener('input', () => { bgV.textContent = bgC.value; });
}

// ── GENERATE QR ────────────────────────────────────────────
function setupGenerate() {
  document.getElementById('btnGenerate').addEventListener('click', generateQR);
  document.getElementById('btnDownload').addEventListener('click', downloadQR);
  document.getElementById('btnSave').addEventListener('click', saveToCollection);

  // Size controls
  const qrSizeInput = document.getElementById('qrSize');
  const logoSizeInput = document.getElementById('logoSize');
  const borderCheckbox = document.getElementById('borderEnabled');
  const borderSizeInput = document.getElementById('borderSize');

  qrSizeInput.addEventListener('input', () => {
    qrSize = parseInt(qrSizeInput.value);
    document.getElementById('qrSizeVal').textContent = qrSize + 'px';
  });

  logoSizeInput.addEventListener('input', () => {
    logoSize = parseInt(logoSizeInput.value);
    document.getElementById('logoSizeVal').textContent = logoSize + '%';
  });

  borderCheckbox.addEventListener('change', () => {
    borderEnabled = borderCheckbox.checked;
    document.getElementById('borderSettings').style.display = borderEnabled ? 'block' : 'none';
  });

  borderSizeInput.addEventListener('input', () => {
    borderSize = parseInt(borderSizeInput.value);
    document.getElementById('borderSizeVal').textContent = borderSize + 'px';
  });
}

async function generateQR() {
  const btn = document.getElementById('btnGenerate');
  btn.disabled = true;
  btn.querySelector('.btn-text').textContent = 'Đang tạo...';

  try {
    let qrData = '';

    if (currentMode === 'link') {
      const url = document.getElementById('urlInput').value.trim();
      if (!url) { showToast('⚠️ Vui lòng nhập đường dẫn URL'); return; }
      if (!isValidURL(url)) { showToast('⚠️ URL không hợp lệ'); return; }
      // Encode the raw URL directly — quét là vào thẳng link (Drive, YouTube...)
      qrData = url;
    } else {
      if (!uploadedImageData) { showToast('⚠️ Vui lòng tải lên hình ảnh'); return; }
      // Placeholder — real view.html URL will be set after saving
      qrData = 'PENDING:IMAGE:' + Date.now();
    }

    const qrColor = document.getElementById('qrColor').value;
    const bgColor = document.getElementById('bgColor').value;
    const name = document.getElementById('qrName').value.trim() || (currentMode === 'link' ? qrData : 'Hình ảnh QR');

    // Render QR with custom sizes
    const canvas = await renderQRCanvas(qrData, qrColor, bgColor, logoEnabled ? uploadedLogoData : null, qrSize, logoSize);

    // Show output
    const wrap = document.getElementById('qrCanvasWrap');
    wrap.innerHTML = '';
    wrap.appendChild(canvas);

    // Label: show the URL for link mode, name for image mode
    const labelText = currentMode === 'link' ? qrData : (name || 'Hình ảnh QR');
    const qrLabel = document.getElementById('qrLabel');
    qrLabel.textContent = labelText;
    qrLabel.title = '';

    // Artwork title display
    const titleVal = document.getElementById('artworkTitle').value.trim();
    artworkTitle = titleVal;
    const titleDisplay = document.getElementById('artworkTitleDisplay');
    titleDisplay.textContent = titleVal;
    titleDisplay.style.display = titleVal ? 'block' : 'none';

    document.getElementById('previewPlaceholder').classList.add('hidden');
    document.getElementById('qrOutput').classList.remove('hidden');

    lastGeneratedData = {
      rawData: qrData,    // original URL or placeholder
      data: qrData,    // actual QR-encoded string (updated on save)
      type: currentMode,
      name: name,
      color: qrColor,
      bg: bgColor,
      logo: logoEnabled ? uploadedLogoData : null,
      imageData: currentMode === 'image' ? uploadedImageData : null,
      canvas: canvas,
      qrSize: qrSize,
      logoSize: logoSize,
      borderSize: borderSize,
      artworkTitle: artworkTitle,
    };

    showToast('✅ Tạo mã QR thành công!');
  } finally {
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Tạo Mã QR';
  }
}

function renderQRCanvas(data, fgColor, bgColor, logoDataURL, size = 256, lSize = 22) {
  return new Promise(resolve => {
    const qrSize = size;
    const tmp = document.createElement('div');
    tmp.style.position = 'absolute';
    tmp.style.left = '-9999px';
    document.body.appendChild(tmp);

    // eslint-disable-next-line no-undef
    const qr = new QRCode(tmp, {
      text: data,
      width: qrSize,
      height: qrSize,
      colorDark: fgColor,
      colorLight: bgColor,
      correctLevel: QRCode.CorrectLevel.H,
    });

    setTimeout(() => {
      const qrImg = tmp.querySelector('img') || tmp.querySelector('canvas');
      const canvas = document.createElement('canvas');
      canvas.width = qrSize;
      canvas.height = qrSize;
      const ctx = canvas.getContext('2d');

      const drawBase = () => {
        if (qrImg.tagName === 'IMG') {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, 0, 0, qrSize, qrSize);
            if (logoDataURL) overlayLogo(ctx, canvas, logoDataURL, lSize, () => { document.body.removeChild(tmp); resolve(canvas); });
            else { document.body.removeChild(tmp); resolve(canvas); }
          };
          img.src = qrImg.src;
        } else {
          ctx.drawImage(qrImg, 0, 0, size, size);
          if (logoDataURL) overlayLogo(ctx, canvas, logoDataURL, () => { document.body.removeChild(tmp); resolve(canvas); });
          else { document.body.removeChild(tmp); resolve(canvas); }
        }
      };

      drawBase();
    }, 150);
  });
}

function overlayLogo(ctx, canvas, logoDataURL, logoSizePercent, done) {
  const logoSize = Math.round(canvas.width * (logoSizePercent / 100));
  const x = (canvas.width - logoSize) / 2;
  const y = (canvas.height - logoSize) / 2;
  const pad = 8;
  const radius = 10;

  // White rounded background for logo
  ctx.save();
  roundRect(ctx, x - pad, y - pad, logoSize + pad * 2, logoSize + pad * 2, radius);
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.restore();

  const img = new Image();
  img.onload = () => {
    ctx.save();
    roundRect(ctx, x, y, logoSize, logoSize, 6);
    ctx.clip();
    ctx.drawImage(img, x, y, logoSize, logoSize);
    ctx.restore();
    done();
  };
  img.src = logoDataURL;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function isValidURL(str) {
  try { new URL(str); return true; } catch (_) { return false; }
}

// Helper to add border and artwork title to a canvas
function addBorderAndTitleToCanvas(canvas, title, borderEnabledOpt, borderSizeOpt) {
  const bSize = borderEnabledOpt ? borderSizeOpt : 0;
  const hasTitle = title && title.trim().length > 0;
  
  if (bSize === 0 && !hasTitle) {
    return canvas;
  }

  const finalCanvas = document.createElement('canvas');
  
  // Spacing configurations
  const textGap = hasTitle ? (Math.round(canvas.width * 0.07) + 6) : 0;     // Gap from QR to text (7% of QR width + 6px)
  const fontSize = hasTitle ? Math.round(canvas.width * 0.06) : 0;          // Font size proportional to QR size (6% of QR width)
  const bottomPadding = hasTitle ? 6 : bSize;                              // 6px bottom padding if there is text, else standard border size
  
  // Height = QR height + top border + gap + text height + bottom padding
  finalCanvas.width = canvas.width + (bSize * 2);
  finalCanvas.height = canvas.height + bSize + textGap + fontSize + bottomPadding;
  
  const ctx = finalCanvas.getContext('2d');

  // Fill white background
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

  // Draw QR code centered horizontally
  ctx.drawImage(canvas, bSize, bSize);

  // Draw artwork title centered under the QR code
  if (hasTitle) {
    ctx.font = `bold ${fontSize}px Inter, Arial, sans-serif`;
    ctx.fillStyle = '#1e1b4b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    // Draw text with spacing (bSize + canvas.height + textGap)
    const textY = canvas.height + bSize + textGap;
    ctx.fillText(title, finalCanvas.width / 2, textY, finalCanvas.width - bSize * 2);
  }

  return finalCanvas;
}

// ── DOWNLOAD ───────────────────────────────────────────────
function downloadQR() {
  if (!lastGeneratedData) return;
  const canvas = lastGeneratedData.canvas;
  const title = lastGeneratedData.artworkTitle || '';

  const finalCanvas = addBorderAndTitleToCanvas(canvas, title, borderEnabled, borderSize);

  const a = document.createElement('a');
  a.download = (lastGeneratedData.name || 'qrcode') + '.png';
  a.href = finalCanvas.toDataURL('image/png');
  a.click();
  showToast('📥 Đang tải xuống...');
}

// ── SAVE TO COLLECTION ─────────────────────────────────────
async function saveToCollection() {
  if (!lastGeneratedData) return;

  const id = Date.now().toString();

  let qrEncodedData;

  if (lastGeneratedData.type === 'link') {
    // ✅ URL mode: QR encodes the raw URL directly
    // Quét → vào thẳng Drive / YouTube / bất kỳ link nào — không qua trang trung gian
    qrEncodedData = lastGeneratedData.rawData;
  } else {
    // 🖼️ Image mode: QR encodes view.html?id=... để hiển thị ảnh
    qrEncodedData = getViewerURL({ id: id });
  }

  const record = {
    id: id,
    name: lastGeneratedData.name,
    type: lastGeneratedData.type,
    rawData: lastGeneratedData.rawData,
    data: qrEncodedData,
    color: lastGeneratedData.color,
    bg: lastGeneratedData.bg,
    logo: lastGeneratedData.logo,
    imageData: lastGeneratedData.imageData,
    qrSize: lastGeneratedData.qrSize,
    logoSize: lastGeneratedData.logoSize,
    borderSize: lastGeneratedData.borderSize,
    artworkTitle: lastGeneratedData.artworkTitle || '',
    active: true,
    createdAt: new Date().toLocaleString('vi-VN'),
  };

  qrCollection.unshift(record);
  persistCollection();

  // For image mode: re-render QR with final view.html URL
  if (lastGeneratedData.type === 'image') {
    const canvas = await renderQRCanvas(record.data, record.color, record.bg, record.logo, record.qrSize, record.logoSize);
    const wrap = document.getElementById('qrCanvasWrap');
    wrap.innerHTML = '';
    wrap.appendChild(canvas);
    lastGeneratedData.data = record.data;
    lastGeneratedData.canvas = canvas;
  }

  showToast('💾 Đã lưu vào bộ sưu tập!');
}

// ── COLLECTION PERSISTENCE ─────────────────────────────────
function loadCollection() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) qrCollection = JSON.parse(raw);
  } catch (_) { qrCollection = []; }
}

function persistCollection() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(qrCollection));
}

// ── RENDER GALLERY ─────────────────────────────────────────
async function renderGallery() {
  const grid = document.getElementById('galleryGrid');
  const empty = document.getElementById('galleryEmpty');
  const active = qrCollection.filter(q => q.active);

  grid.innerHTML = '';

  if (active.length === 0) {
    grid.appendChild(empty);
    empty.classList.remove('hidden');
    return;
  }

  for (const record of active) {
    const card = await buildQRCard(record, false);
    grid.appendChild(card);
  }
}

// ── RENDER ADMIN ───────────────────────────────────────────
async function renderAdmin() {
  const grid = document.getElementById('adminGrid');
  const empty = document.getElementById('adminEmpty');
  const stats = document.getElementById('adminStats');

  grid.innerHTML = '';
  stats.innerHTML = '';

  // Stats
  const total = qrCollection.length;
  const activeC = qrCollection.filter(q => q.active).length;
  const disabled = total - activeC;

  stats.innerHTML = `
    <div class="stat-card"><div class="stat-num">${total}</div><div class="stat-label">Tổng QR</div></div>
    <div class="stat-card"><div class="stat-num">${activeC}</div><div class="stat-label">Đang hoạt động</div></div>
    <div class="stat-card"><div class="stat-num">${disabled}</div><div class="stat-label">Đã tắt</div></div>
  `;

  if (total === 0) {
    grid.appendChild(empty);
    return;
  }

  for (const record of qrCollection) {
    const card = await buildQRCard(record, true);
    grid.appendChild(card);
  }
}

async function buildQRCard(record, isAdmin) {
  const card = document.createElement('div');
  card.className = 'qr-card' + (record.active ? '' : ' disabled');
  card.id = 'card-' + record.id;

  // Thumb: render QR onto small canvas with stored sizes
  const defaultLogoSize = record.logoSize || 22;
  const defaultQrSize = record.qrSize || 256;
  const canvas = await renderQRCanvas(record.data, record.color, record.bg, record.logo, defaultQrSize, defaultLogoSize);
  canvas.style.width = '160px';
  canvas.style.height = '160px';

  const thumb = document.createElement('div');
  thumb.className = 'qr-card-thumb';

  if (record.type === 'image' && record.imageData) {
    const img = document.createElement('img');
    img.src = record.imageData;
    img.alt = record.name;
    thumb.appendChild(img);
  } else {
    thumb.appendChild(canvas);
  }

  const statusHtml = record.active
    ? `<span class="qr-card-status status-active">● Hoạt động</span>`
    : `<span class="qr-card-status status-disabled">● Đã tắt</span>`;

  const typeLabel = record.type === 'link' ? '🔗 URL' : '🖼️ Ảnh';

  const body = document.createElement('div');
  body.className = 'qr-card-body';

  // Download button always shown
  let actionsHTML = `
    <button class="btn-dl-card" onclick="downloadCard('${record.id}')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      PNG
    </button>
  `;

  if (isAdmin) {
    const toggleLabel = record.active ? 'Tắt QR' : 'Bật QR';
    const toggleClass = record.active ? 'btn-toggle-qr active-toggle' : 'btn-toggle-qr';
    actionsHTML += `
      <button class="${toggleClass}" id="toggle-${record.id}" onclick="adminToggleQR('${record.id}')">
        ${record.active ? '⏸' : '▶'} ${toggleLabel}
      </button>
      <button class="btn-delete-qr" onclick="adminDeleteQR('${record.id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        Xóa
      </button>
    `;
  } else {
    // Add delete button for gallery view
    actionsHTML += `
      <button class="btn-delete-qr" onclick="deleteFromGallery('${record.id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        Xóa
      </button>
    `;
  }

  body.innerHTML = `
    <div class="qr-card-name">${escHtml(record.name)}</div>
    <div class="qr-card-meta">
      <span class="qr-card-type">${typeLabel}</span>
      <span>${escHtml(record.createdAt)}</span>
    </div>
    ${statusHtml}
    <div class="qr-card-actions">${actionsHTML}</div>
  `;

  card.appendChild(thumb);
  card.appendChild(body);

  // Store canvas ref for downloads
  card._canvas = canvas;
  card._record = record;

  return card;
}

// ── ADMIN ACTIONS ──────────────────────────────────────────
window.adminToggleQR = function (id) {
  const rec = qrCollection.find(q => q.id === id);
  if (!rec) return;
  rec.active = !rec.active;
  persistCollection();
  renderAdmin();
  showToast(rec.active ? '✅ Đã bật mã QR' : '⏸ Đã tắt mã QR');
};

window.adminDeleteQR = function (id) {
  if (!confirm('Bạn có chắc muốn xóa mã QR này không? Hành động này không thể hoàn tác.')) return;
  qrCollection = qrCollection.filter(q => q.id !== id);
  persistCollection();
  renderAdmin();
  showToast('🗑️ Đã xóa mã QR');
};

window.deleteFromGallery = function (id) {
  if (!confirm('Bạn có chắc muốn xóa mã QR này khỏi bộ sưu tập không?')) return;
  qrCollection = qrCollection.filter(q => q.id !== id);
  persistCollection();
  renderGallery();
  showToast('🗑️ Đã xóa khỏi bộ sưu tập');
};

window.downloadCard = async function (id) {
  const rec = qrCollection.find(q => q.id === id);
  if (!rec) return;

  const defaultLogoSize = rec.logoSize || 22;
  const defaultQrSize = rec.qrSize || 256;
  const defaultBorderSize = rec.borderSize || 20;
  const title = rec.artworkTitle || '';

  const qrCanvas = await renderQRCanvas(rec.data, rec.color, rec.bg, rec.logo, defaultQrSize, defaultLogoSize);
  const borderOpt = defaultBorderSize > 0;
  
  const finalCanvas = addBorderAndTitleToCanvas(qrCanvas, title, borderOpt, defaultBorderSize);

  const a = document.createElement('a');
  a.download = (rec.name || 'qrcode') + '.png';
  a.href = finalCanvas.toDataURL('image/png');
  a.click();
  showToast('📥 Đang tải xuống...');
};

window.showPage = showPage;

// ── ADMIN LOGIN ────────────────────────────────────────────
function showAdminLogin() {
  if (isAdminLoggedIn) {
    openAdminPage();
    return;
  }
  document.getElementById('adminLoginOverlay').classList.remove('hidden');
  // Reset
  document.querySelectorAll('.pin-digit').forEach(d => { d.value = ''; });
  document.getElementById('pinError').classList.add('hidden');
  setTimeout(() => document.querySelector('.pin-digit').focus(), 100);
}

function setupAdminLogin() {
  // PIN digit auto-advance
  const digits = document.querySelectorAll('.pin-digit');
  digits.forEach((d, i) => {
    d.addEventListener('input', () => {
      d.value = d.value.replace(/\D/g, '');
      if (d.value && i < digits.length - 1) digits[i + 1].focus();
    });
    d.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !d.value && i > 0) digits[i - 1].focus();
      if (e.key === 'Enter') confirmAdminLogin();
    });
    d.addEventListener('paste', e => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      [...pasted].forEach((ch, j) => { if (digits[i + j]) digits[i + j].value = ch; });
      const next = Math.min(i + pasted.length, digits.length - 1);
      digits[next].focus();
    });
  });

  document.getElementById('btnConfirmLogin').addEventListener('click', confirmAdminLogin);
  document.getElementById('btnCancelLogin').addEventListener('click', () => {
    document.getElementById('adminLoginOverlay').classList.add('hidden');
  });
  document.getElementById('adminLoginOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('adminLoginOverlay')) {
      document.getElementById('adminLoginOverlay').classList.add('hidden');
    }
  });
  document.getElementById('btnLogout').addEventListener('click', () => {
    isAdminLoggedIn = false;
    showPage('home');
    showToast('👋 Đã đăng xuất khỏi Admin');
    // Clear hash
    history.replaceState(null, '', window.location.pathname);
  });
}

function confirmAdminLogin() {
  const digits = document.querySelectorAll('.pin-digit');
  const entered = [...digits].map(d => d.value).join('');
  if (entered === ADMIN_PIN) {
    document.getElementById('adminLoginOverlay').classList.add('hidden');
    isAdminLoggedIn = true;
    openAdminPage();
    showToast('🔐 Đăng nhập Admin thành công!');
  } else {
    document.getElementById('pinError').classList.remove('hidden');
    digits.forEach(d => d.value = '');
    digits[0].focus();
    // Shake animation re-trigger
    const err = document.getElementById('pinError');
    err.style.animation = 'none';
    void err.offsetWidth;
    err.style.animation = '';
  }
}

function openAdminPage() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-admin').classList.add('active');
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  renderAdmin();
  window.scrollTo(0, 0);
}

// ── ADMIN ROUTE ────────────────────────────────────────────
// Support navigating via URL hash: index.html#huuhieu
window.addEventListener('hashchange', () => {
  if (window.location.hash === '#' + ADMIN_PATH) {
    showAdminLogin();
  }
});

// On load, also check
if (window.location.hash === '#' + ADMIN_PATH) {
  // Will be caught by DOMContentLoaded -> checkURLPath
}

// ── TOAST ──────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  void toast.offsetWidth;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 350);
  }, 2800);
}

// ── ESCAPE HTML ────────────────────────────────────────────
function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
