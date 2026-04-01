require('dotenv').config();

const { app, BrowserWindow, Tray, nativeImage, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const https = require('https');
const fs = require('fs');
const zlib = require('zlib');

let win = null;
let tray = null;

// ---------------------------------------------------------------------------
// PNG helper: build a valid PNG buffer from scratch using only Node builtins
// ---------------------------------------------------------------------------
function crc32(buf) {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      t[i] = c;
    }
    return t;
  })();

  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}

function createTrayIcon() {
  const width = 22;
  const height = 22;

  // Build RGBA pixel array (22x22, 4 bytes per pixel)
  const pixels = new Uint8Array(width * height * 4); // all transparent by default

  // Bar chart: 3 bars with heights 40%, 70%, 100% of 22px
  // Bar widths and x positions (1px gap between bars)
  // Total bar area: 3 bars * 4px wide + 2 gaps * 2px = 16px, centered in 22px → offset 3
  const bars = [
    { x: 3, w: 5, heightPct: 0.40 },
    { x: 10, w: 5, heightPct: 0.70 },
    { x: 17, w: 5, heightPct: 1.00 },
  ];

  for (const bar of bars) {
    const barHeight = Math.round(bar.heightPct * (height - 2)); // leave 1px top/bottom margin
    const yStart = height - 1 - barHeight; // bars grow from bottom
    for (let y = yStart; y < height - 1; y++) {
      for (let x = bar.x; x < bar.x + bar.w && x < width; x++) {
        const idx = (y * width + x) * 4;
        pixels[idx] = 0;       // R
        pixels[idx + 1] = 0;   // G
        pixels[idx + 2] = 0;   // B
        pixels[idx + 3] = 255; // A (opaque)
      }
    }
  }

  // Build PNG raw image data: each row is prefixed with a filter byte (0 = None)
  const rowSize = width * 4;
  const rawRows = Buffer.alloc(height * (1 + rowSize));
  for (let y = 0; y < height; y++) {
    const offset = y * (1 + rowSize);
    rawRows[offset] = 0; // filter type None
    for (let x = 0; x < rowSize; x++) {
      rawRows[offset + 1 + x] = pixels[y * rowSize + x];
    }
  }

  // Compress with zlib
  const compressedData = zlib.deflateSync(rawRows, { level: 9 });

  // IHDR: width(4), height(4), bitDepth(1), colorType(1=6=RGBA), compression(1), filter(1), interlace(1)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type: RGBA
  ihdrData[10] = 0; // compression method
  ihdrData[11] = 0; // filter method
  ihdrData[12] = 0; // interlace method

  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = makeChunk('IHDR', ihdrData);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  const pngBuffer = Buffer.concat([pngSignature, ihdrChunk, idatChunk, iendChunk]);

  const img = nativeImage.createFromBuffer(pngBuffer);
  img.setTemplateImage(true);
  return img;
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  win = new BrowserWindow({
    width: 420,
    height: 620,
    frame: false,
    resizable: false,
    backgroundColor: '#0d0f12',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.on('blur', () => {
    win.hide();
  });
}

function showWindow() {
  if (!tray || !win) return;

  const trayBounds = tray.getBounds();
  const windowBounds = win.getBounds();

  // Center window horizontally under tray icon
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
  // Position window just below the tray icon with 4px offset
  const y = Math.round(trayBounds.y + trayBounds.height + 4);

  win.setPosition(x, y, false);
  win.show();
  win.focus();
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...headers,
      },
    };

    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse JSON: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

function httpsPost(hostname, reqPath, headers = {}, body = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname,
      path: reqPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse JSON: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.write(bodyStr);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------
ipcMain.handle('fetch-news', async () => {
  try {
    const url = `https://newsapi.org/v2/everything?q=stocks+investing+markets&language=en&sortBy=publishedAt&pageSize=25&apiKey=${process.env.NEWS_API_KEY}`;
    const data = await httpsGet(url);
    return data;
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('fetch-quote', async (_event, symbol) => {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const data = await httpsGet(url, {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    return data;
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('get-portfolio', async () => {
  try {
    const portfolioPath = path.join(app.getPath('userData'), 'portfolio.json');
    if (!fs.existsSync(portfolioPath)) {
      return { positions: [] };
    }
    const raw = fs.readFileSync(portfolioPath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { positions: [] };
  }
});

ipcMain.handle('save-portfolio', async (_event, data) => {
  try {
    const portfolioPath = path.join(app.getPath('userData'), 'portfolio.json');
    fs.writeFileSync(portfolioPath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('chat', async (_event, messagesArg) => {
  try {
    const response = await httpsPost(
      'api.anthropic.com',
      '/v1/messages',
      {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: "You are Benner Terminal's AI investment advisor. Provide concise, insightful analysis. Use clear structure with brief bullet points when helpful.",
        messages: messagesArg,
      }
    );
    return response;
  } catch (e) {
    return { error: e.message };
  }
});

// ---------------------------------------------------------------------------
// IPC Listeners
// ---------------------------------------------------------------------------
ipcMain.on('close-window', () => {
  if (win) win.hide();
});

ipcMain.on('open-external', (_event, url) => {
  shell.openExternal(url);
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  app.dock.hide();

  createWindow();

  const trayIcon = createTrayIcon();
  tray = new Tray(trayIcon);
  tray.setToolTip('Benner Terminal');

  tray.on('click', () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      showWindow();
    }
  });

  tray.on('right-click', () => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open Benner Terminal',
        click: () => { showWindow(); },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => { app.exit(0); },
      },
    ]);
    tray.popUpContextMenu(contextMenu);
  });
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});
