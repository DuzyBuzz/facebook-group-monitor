const { ipcRenderer } = require('electron');
const path = require('path');
const { start } = require('repl');

const linksBox = document.getElementById('links');
const fileNameBox = document.getElementById('InputFileName');
const startBtn = document.getElementById('startBtn');
const progressDiv = document.getElementById('progress');
const lineNumbers = document.getElementById('lineNumbers');
const showOutputBtn = document.getElementById('showOutputBtn');
const spinner = document.getElementById('spinner');
const progressBar = document.getElementById('progressBar');
const showScreenshotsBtn = document.getElementById('showScreenshotsBtn');


function updateLineNumbers() {
  const lines = linksBox.value.split('\n').length;
  lineNumbers.textContent = Array.from({length: lines}, (_, i) => i + 1).join('\n');
}
linksBox.addEventListener('input', updateLineNumbers);
updateLineNumbers();

startBtn.onclick = () => {
  const links = linksBox.value
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const inputFileName = fileNameBox.value.trim();
  if (!links.length || !inputFileName) {
    alert('Please enter links and a file name.');
    return;
  }
  linksBox.disabled = true;
  fileNameBox.disabled = true;
  startBtn.disabled = true;
  startBtn.textContent = 'Scraping...';
  spinner.style.display = 'flex'; 

  progressDiv.textContent = 'Starting...\n';
  ipcRenderer.invoke('start-scrape', { links, inputFileName });
};

ipcRenderer.on('progress-update', (event, msg) => {
  appendProgress(msg, msg.startsWith('✅') ? 'success' :
                      msg.startsWith('⚠️') ? 'warn' :
                      msg.startsWith('❌') ? 'error' :
                      msg.startsWith('Done') ? 'done' : 'info');


  const match = msg.match(/Processing (\d+)\/(\d+)/);
  if (match) {
    const current = parseInt(match[1], 10);
    const total = parseInt(match[2], 10);
    const percent = Math.round((current / total) * 100);
    progressBar.style.width = percent + '%';
  }
  // If done, fill the bar
  if (/Done\./i.test(msg) || /All pages processed successfully/i.test(msg)) {
    progressBar.style.width = '100%';
  }
});

function appendProgress(msg, type = 'info') {
  const span = document.createElement('span');
  span.className = type;
  span.innerText = msg + '\n'; 
  progressDiv.appendChild(span);
  progressDiv.scrollTop = progressDiv.scrollHeight;
}

let beeping = false;
let beepInterval = null;

ipcRenderer.on('scrape-done', (event, outputPath) => {
  spinner.style.display = 'none'; 

  appendProgress('All pages processed successfully.', 'success');
  appendProgress(`Output file: ${outputPath}`, 'success');
  progressBar.style.width = '100%';

  alert('All pages processed successfully!\n\nOutput file:\n' + outputPath);

  ipcRenderer.invoke('open-output-folder', outputPath);

  linksBox.disabled = false;
  fileNameBox.disabled = false;
  startBtn.textContent = 'Start';
  startBtn.disabled = false;
});

ipcRenderer.on('scrape-error', (event, err) => {
  spinner.style.display = 'none'; 
  alert('Error: ' + err);
  linksBox.disabled = false;
  fileNameBox.disabled = false;
  startBtn.textContent = 'Start';
  startBtn.disabled = false;
});

showOutputBtn.onclick = () => {
  const outputFolder = require('path').join(require('os').homedir(), 'Downloads', 'output');
  ipcRenderer.invoke('open-output-folder', outputFolder);
};

showScreenshotsBtn.onclick = () => {
  const screenshotsFolder = require('path').join(require('os').homedir(), 'Downloads', 'screenshots');
  ipcRenderer.invoke('open-output-folder', screenshotsFolder);
};
