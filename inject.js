/* Runs in the page's own world (MAIN) at document_start.
   Its only job is to tell the content script two things through the DOM:
   how many requests are in flight, and when the SPA changed route.
   The content script keeps the whole page covered until both settle. */
(() => {
  "use strict";

  const root = document.documentElement;
  let inflight = 0;

  function sync() {
    root.setAttribute("data-bbsa-inflight", String(inflight));
  }

  function begin() {
    inflight++;
    sync();
  }

  function end() {
    inflight = Math.max(0, inflight - 1);
    sync();
  }

  sync();

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === "function") {
    window.fetch = function (...args) {
      begin();
      let p;
      try {
        p = nativeFetch.apply(this, args);
      } catch (err) {
        end();
        throw err;
      }
      return p.then(
        (res) => {
          end();
          return res;
        },
        (err) => {
          end();
          throw err;
        }
      );
    };
  }

  const nativeSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      end();
    };
    begin();
    this.addEventListener("loadend", finish);
    try {
      return nativeSend.apply(this, args);
    } catch (err) {
      finish();
      throw err;
    }
  };

  function announceNav() {
    window.dispatchEvent(new CustomEvent("bbsa:nav"));
  }

  for (const method of ["pushState", "replaceState"]) {
    const native = history[method];
    if (typeof native !== "function") continue;
    history[method] = function (...args) {
      const result = native.apply(this, args);
      announceNav();
      return result;
    };
  }

  window.addEventListener("popstate", announceNav);
  window.addEventListener("hashchange", announceNav);
})();
