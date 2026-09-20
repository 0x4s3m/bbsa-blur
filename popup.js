const DEFAULTS = {
  enabled: true,
  radius: 6,
  mode: "hover",
  media: true,
  fields: true,
  colors: true,
  curtain: true,
};

const el = {
  enabled: document.getElementById("enabled"),
  radius: document.getElementById("radius"),
  radiusValue: document.getElementById("radiusValue"),
  mode: document.getElementById("mode"),
  media: document.getElementById("media"),
  fields: document.getElementById("fields"),
  colors: document.getElementById("colors"),
  curtain: document.getElementById("curtain"),
};

function render(s) {
  el.enabled.checked = s.enabled;
  el.radius.value = s.radius;
  el.radiusValue.textContent = s.radius + "px";
  el.mode.value = s.mode;
  el.media.checked = s.media;
  el.fields.checked = s.fields;
  el.colors.checked = s.colors;
  el.curtain.checked = s.curtain;
}

function save(patch) {
  chrome.storage.sync.set(patch);
}

chrome.storage.sync.get(DEFAULTS, render);

el.enabled.addEventListener("change", () => save({ enabled: el.enabled.checked }));
el.media.addEventListener("change", () => save({ media: el.media.checked }));
el.fields.addEventListener("change", () => save({ fields: el.fields.checked }));
el.colors.addEventListener("change", () => save({ colors: el.colors.checked }));
el.curtain.addEventListener("change", () => save({ curtain: el.curtain.checked }));
el.mode.addEventListener("change", () => save({ mode: el.mode.value }));
el.radius.addEventListener("input", () => {
  const radius = Number(el.radius.value);
  el.radiusValue.textContent = radius + "px";
  save({ radius });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  chrome.storage.sync.get(DEFAULTS, render);
});
