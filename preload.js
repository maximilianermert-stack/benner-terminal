const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  fetchNews: () => ipcRenderer.invoke('fetch-news'),
  fetchQuote: (symbol) => ipcRenderer.invoke('fetch-quote', symbol),
  getPortfolio: () => ipcRenderer.invoke('get-portfolio'),
  savePortfolio: (data) => ipcRenderer.invoke('save-portfolio', data),
  chat: (messages) => ipcRenderer.invoke('chat', messages),
  closeWindow: () => ipcRenderer.send('close-window'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
});
