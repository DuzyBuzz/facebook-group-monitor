const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');


const { runScraper } = require('../../dist/index.js'); 

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 1100,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: path.join(__dirname, '..', 'crawling.ico')
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);

ipcMain.handle('start-scrape', async (event, { links, inputFileName }) => {
  try {
    const result = await runScraper(links, inputFileName, (progress) => {
      event.sender.send('progress-update', progress);
    });
    event.sender.send('scrape-done', result.outputPath);
  } catch (err) {
    event.sender.send('scrape-error', err.message);
  }
});

ipcMain.handle('open-output-folder', async (event, folderPath) => {
  shell.openPath(path.resolve(folderPath));
});