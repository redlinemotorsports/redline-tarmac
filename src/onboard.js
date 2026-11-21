/* Redline Tarmac — Rally Onboard curated official video library. */
(() => {
  const videos = [
    { id:"X0NUtYff9Xc", title:"3 HOURS of PURE WRC Onboard Action! | 2026", event:"2026 SEASON / MULTI-RALLY", category:"highlights", type:"LONG-FORM ACTION", duration:"3 HOURS", description:"A season-spanning onboard compilation across snow, gravel and asphalt." },
    { id:"6L0KqdXPZ9s", title:"FULL ONBOARD — SS2 Solberg / Edmondson | Rallye Monte-Carlo 2026", event:"RALLYE MONTE-CARLO 2026", category:"onboard", type:"FULL STAGE ONBOARD", duration:"FULL STAGE", description:"Ride along with Oliver Solberg and Elliott Edmondson on the Monte-Carlo stages." },
    { id:"3eu9GQu3jY0", title:"FULL ONBOARD — SS16 Solberg / Edmondson | Rally Chile Biobío 2026", event:"RALLY CHILE BIOBÍO 2026", category:"onboard", type:"FULL STAGE ONBOARD", duration:"FULL STAGE", description:"A complete stage run from the gravel roads of Chile." },
    { id:"wFwsYA-Ccng", title:"FULL ONBOARD — SS3 Paddon / Kennard | Rally del Paraguay 2026", event:"RALLY DEL PARAGUAY 2026", category:"onboard", type:"FULL STAGE ONBOARD", duration:"FULL STAGE", description:"Hayden Paddon and John Kennard take on the Paraguay stage." }
  ];
  const grid = document.getElementById("onboard-video-grid");
  const player = document.querySelector("#onboard-player iframe");
  const playerTitle = document.getElementById("onboard-player-title");
  const playerSource = document.getElementById("onboard-player-source");
  const filters = [...document.querySelectorAll("[data-filter]")];
  let activeFilter = "all";
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[char]);
  function selectVideo(video) {
    if (player && !player.src.includes("/embed/" + video.id)) {
      player.src = "https://www.youtube-nocookie.com/embed/" + video.id + "?rel=0&modestbranding=1";
    }
    if (player) player.title = video.title;
    if (playerTitle) playerTitle.textContent = video.title;
    if (playerSource) playerSource.href = "https://www.youtube.com/watch?v=" + video.id;
    document.querySelectorAll(".onboard-video-card").forEach(card => {
      const selected = card.dataset.videoId === video.id;
      card.classList.toggle("is-selected", selected);
      card.setAttribute("aria-pressed", String(selected));
    });
  }
  function render() {
    const visible = videos.filter(video => activeFilter === "all" || video.category === activeFilter);
    document.getElementById("onboard-video-count").textContent = String(visible.length).padStart(2,"0") + " VIDEOS / CURATED";
    grid.innerHTML = visible.map(video => `
      <button class="onboard-video-card" type="button" data-video-id="${video.id}" aria-pressed="false">
        <span class="onboard-thumb"><img src="https://i.ytimg.com/vi/${video.id}/hqdefault.jpg" alt="" loading="lazy"><i aria-hidden="true">▶</i><small>${escapeHtml(video.duration)}</small></span>
        <span class="onboard-card-copy"><small>${escapeHtml(video.type)} / ${escapeHtml(video.event)}</small><strong>${escapeHtml(video.title)}</strong><span>${escapeHtml(video.description)}</span></span>
      </button>`).join("");
    grid.querySelectorAll("[data-video-id]").forEach(card => {
      card.addEventListener("click", () => {
        const selected = videos.find(video => video.id === card.dataset.videoId);
        if (selected) {
          selectVideo(selected);
          document.querySelector(".onboard-feature").scrollIntoView({ behavior:"smooth", block:"start" });
        }
      });
    });
    const currentId = playerSource?.href.match(/[?&]v=([^&]+)/)?.[1] || "X0NUtYff9Xc";
    const current = videos.find(video => video.id === currentId);
    if (current && visible.some(video => video.id === current.id)) selectVideo(current);
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
  window.initTarmacOnboard = render;
  render();
})();