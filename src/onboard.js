/* Redline Tarmac — Rally Onboard archive, explorer and comparison tools. */
(() => {
  if (window.__tarmacOnboardInstalled) return;
  window.__tarmacOnboardInstalled = true;

  const videos = [
    { id:"X0NUtYff9Xc", title:"3 HOURS of PURE WRC Onboard Action! | 2026", event:"2026 SEASON / MULTI-RALLY", eventKey:"season", driver:"Multiple crews", driverKey:"multiple", stage:"Multiple stages", category:"highlights", type:"LONG-FORM ACTION", duration:"3 HOURS", surface:"Multiple / not individually tagged", description:"A season-spanning onboard compilation across snow, gravel and asphalt." },
    { id:"6L0KqdXPZ9s", title:"FULL ONBOARD — SS2 Solberg / Edmondson | Rallye Monte-Carlo 2026", event:"RALLYE MONTE-CARLO 2026", eventKey:"monte-carlo", driver:"Oliver Solberg / Elliott Edmondson", driverKey:"solberg", stage:"SS2", category:"onboard", type:"FULL STAGE ONBOARD", duration:"FULL STAGE", surface:"Not listed by publisher", description:"Ride along with Oliver Solberg and Elliott Edmondson on the Monte-Carlo stages." },
    { id:"3eu9GQu3jY0", title:"FULL ONBOARD — SS16 Solberg / Edmondson | Rally Chile Biobío 2026", event:"RALLY CHILE BIOBÍO 2026", eventKey:"chile", driver:"Oliver Solberg / Elliott Edmondson", driverKey:"solberg", stage:"SS16", category:"onboard", type:"FULL STAGE ONBOARD", duration:"FULL STAGE", surface:"Not listed by publisher", description:"A complete stage run from the gravel roads of Chile." },
    { id:"wFwsYA-Ccng", title:"FULL ONBOARD — SS3 Paddon / Kennard | Rally del Paraguay 2026", event:"RALLY DEL PARAGUAY 2026", eventKey:"paraguay", driver:"Hayden Paddon / John Kennard", driverKey:"paddon", stage:"SS3", category:"onboard", type:"FULL STAGE ONBOARD", duration:"FULL STAGE", surface:"Not listed by publisher", description:"Hayden Paddon and John Kennard take on the Paraguay stage." }
  ];

  const $ = id => document.getElementById(id);
  const grid = $("onboard-video-grid");
  const player = document.querySelector("#onboard-player iframe");
  const playerTitle = $("onboard-player-title");
  const playerSource = $("onboard-player-source");
  const filters = [...document.querySelectorAll("[data-filter]")];
  let activeFilter = "all";
  let activeVideoId = videos[0].id;

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[char]);

  function updateMetadata(video) {
    $("onboard-meta-crew").textContent = video.driver;
    $("onboard-meta-event").textContent = video.event;
    $("onboard-meta-stage").textContent = video.stage;
    $("onboard-meta-type").textContent = video.type;
    $("onboard-meta-surface").textContent = video.surface;
    $("onboard-condition-surface").textContent = video.surface;
  }

  function selectVideo(video, scroll = false) {
    activeVideoId = video.id;
    if (player && !player.src.includes("/embed/" + video.id)) {
      player.src = "https://www.youtube-nocookie.com/embed/" + video.id + "?rel=0&modestbranding=1";
    }
    if (player) player.title = video.title;
    if (playerTitle) playerTitle.textContent = video.title;
    if (playerSource) playerSource.href = "https://www.youtube.com/watch?v=" + video.id;
    updateMetadata(video);
    document.querySelectorAll(".onboard-video-card").forEach(card => {
      const selected = card.dataset.videoId === video.id;
      card.classList.toggle("is-selected", selected);
      card.setAttribute("aria-pressed", String(selected));
    });
    if (scroll) document.querySelector(".onboard-feature")?.scrollIntoView({ behavior:"smooth", block:"start" });
  }

  function matchesExplorer(video) {
    const query = $("onboard-search").value.trim().toLowerCase();
    const event = $("onboard-event-filter").value;
    const driver = $("onboard-driver-filter").value;
    const haystack = [video.title, video.event, video.driver, video.stage, video.type].join(" ").toLowerCase();
    return (!query || haystack.includes(query)) &&
      (event === "all" || video.eventKey === event) &&
      (driver === "all" || video.driverKey === driver);
  }

  function render() {
    const visible = videos.filter(video =>
      (activeFilter === "all" || video.category === activeFilter) && matchesExplorer(video)
    );
    $("onboard-video-count").textContent = String(visible.length).padStart(2,"0") + " VIDEOS / CURATED";
    $("onboard-explorer-count").textContent = String(visible.length).padStart(2,"0") + " MATCHING VIDEOS";
    grid.innerHTML = visible.length ? visible.map(video => `
      <button class="onboard-video-card" type="button" data-video-id="${video.id}" aria-pressed="${video.id === activeVideoId}">
        <span class="onboard-thumb"><img src="https://i.ytimg.com/vi/${video.id}/hqdefault.jpg" alt="" loading="lazy"><i aria-hidden="true">▶</i><small>${escapeHtml(video.duration)}</small></span>
        <span class="onboard-card-copy"><small>${escapeHtml(video.type)} / ${escapeHtml(video.event)} / ${escapeHtml(video.stage)}</small><strong>${escapeHtml(video.title)}</strong><span>${escapeHtml(video.description)}</span></span>
      </button>`).join("") : '<p class="onboard-empty">NO MATCHING VIDEOS — TRY ANOTHER FILTER.</p>';

    grid.querySelectorAll("[data-video-id]").forEach(card => {
      card.addEventListener("click", () => {
        const selected = videos.find(video => video.id === card.dataset.videoId);
        if (selected) selectVideo(selected, true);
      });
    });
  }

  function populateSelect(select, options) {
    select.innerHTML = options.map(([value, label]) =>
      '<option value="' + escapeHtml(value) + '">' + escapeHtml(label) + '</option>'
    ).join("");
  }

  function setupCompare() {
    const left = $("onboard-compare-left");
    const right = $("onboard-compare-right");
    const options = videos.map(video => [video.id, video.driver + " / " + video.event + " / " + video.stage]);
    populateSelect(left, options);
    populateSelect(right, options);
    left.value = videos[1].id;
    right.value = videos[2].id;
    $("onboard-compare-load").addEventListener("click", () => {
      const a = videos.find(video => video.id === left.value);
      const b = videos.find(video => video.id === right.value);
      if (!a || !b) return;
      if (a.id === b.id) {
        $("onboard-compare-note").textContent = "Choose two different videos to compare their onboard perspectives.";
        return;
      }
      $("onboard-compare-note").textContent = "Playback is independent in each window. Pause and seek manually to compare the moments you want.";
      [["left", a], ["right", b]].forEach(([side, video]) => {
        const frame = $("onboard-compare-frame-" + side);
        frame.src = "https://www.youtube-nocookie.com/embed/" + video.id + "?rel=0&modestbranding=1";
        frame.title = video.title;
        $("onboard-compare-title-" + side).textContent = video.driver + " — " + video.event + " / " + video.stage;
        $("onboard-compare-link-" + side).href = "https://www.youtube.com/watch?v=" + video.id;
      });
    });
  }

  filters.forEach(filter => filter.addEventListener("click", () => {
    activeFilter = filter.dataset.filter;
    filters.forEach(item => {
      const selected = item === filter;
      item.classList.toggle("is-active", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    render();
  }));

  $("onboard-search").addEventListener("input", render);
  $("onboard-event-filter").addEventListener("change", render);
  $("onboard-driver-filter").addEventListener("change", render);
  populateSelect($("onboard-event-filter"), [
    ["all","ALL EVENTS"],["season","2026 SEASON / MULTI-RALLY"],
    ["monte-carlo","RALLYE MONTE-CARLO"],["chile","RALLY CHILE BIOBÍO"],["paraguay","RALLY DEL PARAGUAY"]
  ]);
  populateSelect($("onboard-driver-filter"), [
    ["all","ALL CREWS"],["multiple","MULTIPLE CREWS"],
    ["solberg","SOLBERG / EDMONDSON"],["paddon","PADDON / KENNARD"]
  ]);
  setupCompare();
  window.initTarmacOnboard = render;
  updateMetadata(videos[0]);
  render();
})();