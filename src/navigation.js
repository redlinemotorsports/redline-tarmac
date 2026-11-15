/* Redline Tarmac — in-place section navigation.
   Keeps the current document URL while swapping the existing page views. */
(() => {
  if (window.__redlineTarmacNavigationInstalled) return;
  window.__redlineTarmacNavigationInstalled = true;

  const basePath = new URL("./", document.baseURI).pathname;
  const routes = new Map([
    [basePath, "home"],
    [basePath + "index.html", "home"],
    [basePath + "standings.html", "standings"],
    [basePath + "rally-control.html", "rally-control"],
    [basePath + "newsroom.html", "newsroom"]
  ]);
  let activePage = document.body.dataset.page || "home";
  let loading = false;

  const routeFor = url => routes.get(url.pathname);
  const scrollToHash = hash => {
    if (!hash) { window.scrollTo({ top: 0, behavior: "auto" }); return; }
    requestAnimationFrame(() => {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  async function activate(url, nextPage) {
    if (loading || nextPage === activePage && !url.hash) return;
    if (nextPage === activePage && url.hash) { scrollToHash(url.hash); return; }
    loading = true;
    document.body.setAttribute("aria-busy", "true");
    try {
      const response = await fetch(url.href, { headers: { "X-Redline-Navigation": "1" } });
      if (!response.ok) throw new Error("Page request failed: " + response.status);
      const html = await response.text();
      const parsed = new DOMParser().parseFromString(html, "text/html");
      const scriptSpecs = [...parsed.body.querySelectorAll("script")].map(script => ({
        src: script.getAttribute("src"),
        type: script.getAttribute("type"),
        text: script.textContent,
        attrs: [...script.attributes].filter(attr => attr.name !== "src" && attr.name !== "type")
      }));

      document.querySelectorAll("style[data-navigation-page-style]").forEach(style => style.remove());
      parsed.head.querySelectorAll("style").forEach(style => {
        const copy = document.createElement("style");
        copy.dataset.navigationPageStyle = "true";
        copy.textContent = style.textContent;
        document.head.appendChild(copy);
      });

      document.body.innerHTML = parsed.body.innerHTML;
      document.body.dataset.page = nextPage;
      document.title = "Redline Tarmac — Every Stage. Every Second. Every Surface.";
      activePage = nextPage;

      const liveScripts = [...document.body.querySelectorAll("script")];
      for (let index = 0; index < scriptSpecs.length; index++) {
        const oldScript = liveScripts[index];
        if (!oldScript) continue;
        const spec = scriptSpecs[index];
        if (spec.src && spec.src.includes("/src/navigation.js")) {
          oldScript.remove();
          continue;
        }
        const script = document.createElement("script");
        if (spec.type) script.type = spec.type;
        spec.attrs.forEach(attr => script.setAttribute(attr.name, attr.value));
        if (spec.src) {
          script.src = new URL(spec.src, url.href).href;
          await new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = reject;
            oldScript.replaceWith(script);
          });
        } else {
          script.textContent = spec.text;
          oldScript.replaceWith(script);
        }
      }
      scrollToHash(url.hash);
    } catch (error) {
      console.error("Redline Tarmac section navigation failed; using normal page navigation.", error);
      window.location.assign(url.href);
    } finally {
      loading = false;
      document.body.removeAttribute("aria-busy");
    }
  }

  document.addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest("a[href]");
    if (!link || link.target && link.target !== "_self" || link.hasAttribute("download")) return;
    const url = new URL(link.href, document.baseURI);
    if (url.origin !== location.origin) return;
    const nextPage = routeFor(url);
    if (!nextPage) return;
    if (nextPage === activePage && url.hash) return;
    event.preventDefault();
    activate(url, nextPage);
  });
})();
