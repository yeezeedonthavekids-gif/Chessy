// Chessy's only background job: open the app in its own tab.
// The extension deliberately has no permissions, host permissions or content
// scripts, so it cannot read or modify Chess.com, Lichess or any other page.
const APP_URL = chrome.runtime.getURL('index.html');

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: APP_URL });
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: APP_URL });
});
