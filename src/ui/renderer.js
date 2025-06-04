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
  // Do NOT skip the first line; include all lines
  const links = linksBox.value
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const inputFileName = fileNameBox.value.trim();
  if (!links.length || !inputFileName) {
    alert('Please enter links and a file name.');
    return;
  }
  // Disable inputs during scraping
  linksBox.disabled = true;
  fileNameBox.disabled = true;
  startBtn.disabled = true;
  startBtn.textContent = 'Scraping...';
  spinner.style.display = 'flex'; // Show spinner

  progressDiv.textContent = 'Starting...\n';
  ipcRenderer.invoke('start-scrape', { links, inputFileName });
};

ipcRenderer.on('progress-update', (event, msg) => {
  appendProgress(msg, msg.startsWith('✅') ? 'success' :
                      msg.startsWith('⚠️') ? 'warn' :
                      msg.startsWith('❌') ? 'error' :
                      msg.startsWith('Done') ? 'done' : 'info');

  // Progress Bar Logic
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
  span.innerText = msg + '\n'; // Use innerText for plain text, or innerHTML if you want to support HTML
  progressDiv.appendChild(span);
  progressDiv.scrollTop = progressDiv.scrollHeight;
}

let beeping = false;
let beepInterval = null;

ipcRenderer.on('scrape-done', (event, outputPath) => {
  spinner.style.display = 'none'; // Hide spinner

  // Show a modern success notification
  appendProgress('All pages processed successfully.', 'success');
  appendProgress(`Output file: ${outputPath}`, 'success');
  progressBar.style.width = '100%';

  // Optionally, show a browser alert as well
  alert('All pages processed successfully!\n\nOutput file:\n' + outputPath);

  // Open the folder containing the output file
  ipcRenderer.invoke('open-output-folder', outputPath);

  // Re-enable inputs after scraping
  linksBox.disabled = false;
  fileNameBox.disabled = false;
  startBtn.textContent = 'Start';
  startBtn.disabled = false;
});

ipcRenderer.on('scrape-error', (event, err) => {
  spinner.style.display = 'none'; // Hide spinner on error
  alert('Error: ' + err);
  // Re-enable inputs if error occurs
  linksBox.disabled = false;
  fileNameBox.disabled = false;
  startBtn.textContent = 'Start';
  startBtn.disabled = false;
});

showOutputBtn.onclick = () => {
  // Open the output folder in the Downloads directory
  const outputFolder = require('path').join(require('os').homedir(), 'Downloads', 'output');
  ipcRenderer.invoke('open-output-folder', outputFolder);
};

showScreenshotsBtn.onclick = () => {
  // Open the screenshots folder in the Downloads directory
  const screenshotsFolder = require('path').join(require('os').homedir(), 'Downloads', 'screenshots');
  ipcRenderer.invoke('open-output-folder', screenshotsFolder);
};
