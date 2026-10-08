const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

app.setName('HoloMapper');

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    backgroundColor: '#000000',
    title: 'HoloMapper',
    fullscreenable: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  // Minimal menu (hidden via autoHideMenuBar; Alt reveals it)
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'HoloMapper',
      submenu: [
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
  ]));

  win.loadFile(path.join(__dirname, 'app', 'index.html'));

  // Keep Web MIDI / fullscreen / pointer-lock style APIs working in kiosk-ish use
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
