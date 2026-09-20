(() => {
  "use strict";

  const TEXT_CLASS = "bbsa-blur";
  const TINT_CLASS = "bbsa-blur-tint";
  const MEDIA_CLASS = "bbsa-blur-media";
  const FIELD_CLASS = "bbsa-blur-field";
  const SHOWN_CLASS = "bbsa-shown";
  const MARKED = ".bbsa-blur, .bbsa-blur-tint, .bbsa-blur-media, .bbsa-blur-field";
  const BLOCKING = ".bbsa-blur, .bbsa-blur-tint";

  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD", "META", "LINK",
    "TITLE", "BR", "HR", "IFRAME", "OBJECT", "EMBED", "HTML", "BODY",
  ]);
  const MEDIA_TAGS = new Set(["IMG", "PICTURE", "VIDEO", "CANVAS", "SVG"]);
  const FIELD_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

  /* Severity is often colour-only: a pill, a bar, a dot with no text.
     Matched by name first — cheap and precise. */
  const SEVERITY_SELECTOR = [
    '[class*="severity" i]', '[class*="priority" i]', '[class*="criticality" i]',
    '[class*="vrt" i]', '[class*="cvss" i]', '[class*="risk" i]',
    '[class*="badge" i]', '[class*="chip" i]', '[class*="pill" i]',
    '[class*="tag" i]', '[class*="status" i]', '[class*="rating" i]',
    '[class*="progress" i]', '[class*="bar" i]', '[class*="level" i]',
    '[data-severity]', '[data-priority]', '[data-status]',
  ].join(",");

  const MAX_SEVERITY_DESCENDANTS = 30; // don't swallow a whole page section
  const MAX_COLOR_PROBE = 1200; // getComputedStyle budget per pass
  const QUIET_MS = 180; // DOM must be still this long before uncovering
  const SETTLE_TICK_MS = 60;
  const CURTAIN_MAX_MS = 6000; // never leave the page stuck behind it

  const DEFAULTS = {
    enabled: true,
    radius: 6,
    mode: "hover", // "hover" | "click"
    media: true,
    fields: true,
    colors: true, // grayscale on top of blur, kills severity colour
    curtain: true, // cover the whole page while the route/API loads
  };

  let settings = { ...DEFAULTS };
  let colorProbes = 0;
  let curtainUp = false;
  let settleTimer = null;
  let curtainDeadline = 0;
  let lastMutation = Date.now();
  let started = false;

  const root = document.documentElement;

  /* ---- curtain: cover everything until the data has landed ---- */

  function curtainRadius() {
    return Math.max(12, Number(settings.radius) * 2);
  }

  function raiseCurtain() {
    if (!settings.enabled || !settings.curtain) return;
    curtainUp = true;
    curtainDeadline = Date.now() + CURTAIN_MAX_MS;
    root.style.setProperty("--bbsa-curtain", curtainRadius() + "px");
    root.setAttribute("data-bbsa-boot", "1");
    if (settleTimer === null) settleTimer = setInterval(settleTick, SETTLE_TICK_MS);
  }

  function dropCurtain() {
    curtainUp = false;
    root.removeAttribute("data-bbsa-boot");
    if (settleTimer !== null) {
      clearInterval(settleTimer);
      settleTimer = null;
    }
  }

  function inflight() {
    return Number(root.getAttribute("data-bbsa-inflight") || 0);
  }

  function settleTick() {
    if (!curtainUp) {
      dropCurtain();
      return;
    }
    if (!started) return; // settings not loaded yet, stay covered

    const expired = Date.now() > curtainDeadline;
    const quiet = Date.now() - lastMutation > QUIET_MS;
    const ready = document.readyState !== "loading";

    if (expired || (ready && quiet && inflight() === 0)) {
      // Mark whatever arrived while covered, then uncover on the next frame
      // so the marking is already painted when the blur curtain lifts.
      scan(document.body || root);
      requestAnimationFrame(() => requestAnimationFrame(dropCurtain));
      if (settleTimer !== null) {
        clearInterval(settleTimer);
        settleTimer = null;
      }
      curtainUp = false;
    }
  }

  // Up before the page paints a single pixel.
  root.style.setProperty("--bbsa-radius", DEFAULTS.radius + "px");
  root.style.setProperty("--bbsa-curtain", "14px");
  root.setAttribute("data-bbsa-boot", "1");
  curtainUp = true;
  curtainDeadline = Date.now() + CURTAIN_MAX_MS;
  settleTimer = setInterval(settleTick, SETTLE_TICK_MS);

  // SPA route change: the report body is about to be swapped in — cover first.
  window.addEventListener("bbsa:nav", () => {
    lastMutation = Date.now();
    raiseCurtain();
  });

  function applySettings() {
    root.setAttribute("data-bbsa-enabled", settings.enabled ? "1" : "0");
    root.setAttribute("data-bbsa-mode", settings.mode);
    root.setAttribute("data-bbsa-media", settings.media ? "1" : "0");
    root.setAttribute("data-bbsa-fields", settings.fields ? "1" : "0");
    root.setAttribute("data-bbsa-colors", settings.colors ? "1" : "0");
    root.style.setProperty("--bbsa-radius", settings.radius + "px");
    root.style.setProperty("--bbsa-curtain", curtainRadius() + "px");
    if (!settings.enabled || !settings.curtain) dropCurtain();
  }

  /* ---- classification ---- */

  function hasOwnText(el) {
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim().length > 1) {
        return true;
      }
    }
    return false;
  }

  function isSaturated(color) {
    if (!color) return false;
    const m = color.match(/rgba?\(([^)]+)\)/);
    if (!m) return false;
    const parts = m[1].split(",").map((v) => parseFloat(v));
    const [r, g, b] = parts;
    const alpha = parts.length > 3 ? parts[3] : 1;
    if (alpha < 0.25) return false;
    return Math.max(r, g, b) - Math.min(r, g, b) > 28;
  }

  /* A leaf with a saturated background and no text is a colour-coded
     indicator: severity bar, status dot, coloured divider. */
  function isColorIndicator(el) {
    if (el.childElementCount > 0) return false;
    if (el.textContent.trim().length) return false;
    if (colorProbes >= MAX_COLOR_PROBE) return false;
    colorProbes++;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    if (cs.backgroundImage && cs.backgroundImage.includes("gradient")) return true;
    return isSaturated(cs.backgroundColor) || isSaturated(cs.borderTopColor);
  }

  function classify(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return;

    const tag = el.tagName ? el.tagName.toUpperCase() : "";
    if (SKIP_TAGS.has(tag)) return;
    if (el.classList.contains(TEXT_CLASS) || el.classList.contains(TINT_CLASS)) return;

    // Anything already under a blurred ancestor is left alone: nested filters
    // stack, and hovering a child would only half-clear the blur.
    const covered = el.parentElement && el.parentElement.closest(BLOCKING);

    if (FIELD_TAGS.has(tag)) {
      if (!covered) el.classList.add(FIELD_CLASS);
      return;
    }
    if (MEDIA_TAGS.has(tag)) {
      if (!covered) el.classList.add(MEDIA_CLASS);
      return;
    }
    if (covered) return;

    if (
      el.matches(SEVERITY_SELECTOR) &&
      el.getElementsByTagName("*").length <= MAX_SEVERITY_DESCENDANTS
    ) {
      el.classList.add(TINT_CLASS);
      return;
    }

    if (hasOwnText(el)) {
      el.classList.add(TEXT_CLASS);
      return;
    }

    if (isColorIndicator(el)) el.classList.add(TINT_CLASS);
  }

  function scan(node) {
    if (!node) return;
    colorProbes = 0;
    if (node.nodeType === Node.ELEMENT_NODE) classify(node);
    if (typeof node.querySelectorAll !== "function") return;
    const els = node.querySelectorAll("*");
    for (let i = 0; i < els.length; i++) classify(els[i]);
  }

  /* ---- mutations, handled synchronously ----
     MutationObserver callbacks run as microtasks, before paint, so nodes
     injected by the app are marked in the same frame they appear. */

  const observer = new MutationObserver((mutations) => {
    lastMutation = Date.now();
    for (const m of mutations) {
      if (m.type === "childList") {
        for (const node of m.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) scan(node);
          else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
            classify(node.parentElement);
          }
        }
      } else if (m.type === "characterData" && m.target.parentElement) {
        classify(m.target.parentElement);
      }
    }
  });

  function start() {
    started = true;
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    scan(document.body || root);
    if (!settings.enabled || !settings.curtain) dropCurtain();
  }

  /* ---- click mode ---- */

  document.addEventListener(
    "click",
    (e) => {
      if (!settings.enabled || settings.mode !== "click") return;
      const target = e.target.closest ? e.target.closest(MARKED) : null;
      if (!target) return;
      if (!target.classList.contains(SHOWN_CLASS)) {
        // First click only reveals — never follow a link you can't read.
        e.preventDefault();
        e.stopPropagation();
        target.classList.add(SHOWN_CLASS);
      } else {
        target.classList.remove(SHOWN_CLASS);
      }
    },
    true
  );

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    for (const el of document.querySelectorAll("." + SHOWN_CLASS)) {
      el.classList.remove(SHOWN_CLASS);
    }
  });

  /* ---- settings ---- */

  chrome.storage.sync.get(DEFAULTS, (stored) => {
    settings = { ...DEFAULTS, ...stored };
    applySettings();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    let touched = false;
    for (const key of Object.keys(DEFAULTS)) {
      if (key in changes) {
        settings[key] = changes[key].newValue;
        touched = true;
      }
    }
    if (!touched) return;
    applySettings();
    if (settings.enabled && started) scan(document.body || root);
  });

  applySettings();
})();
