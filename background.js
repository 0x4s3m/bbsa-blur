chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-blur") return;
  const { enabled } = await chrome.storage.sync.get({ enabled: true });
  await chrome.storage.sync.set({ enabled: !enabled });
});
