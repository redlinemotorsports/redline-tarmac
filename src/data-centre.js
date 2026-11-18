const CACHE_DB = "redline-tarmac-telemetry";
const CACHE_STORE = "snapshots";
const CACHE_VERSION = 1;
const DATASETS = { events: "./data/rally-control.json", standings: "./data/standings.json" };
let eventSnapshot = null;
let initPromise = null;
const $ = selector => document.querySelector(selector);
const formatDate = value => {
  if (!value) return "DATES TO BE CONFIRMED";
  const date = new Date(value + (String(value).length === 10 ? "T00:00:00Z" : ""));
  return Number.isNaN(date.getTime()) ? "DATES TO BE CONFIRMED" : new Intl.DateTimeFormat("en-GB", {day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(date).toUpperCase();
};
const formatUpdated = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "TIME UNAVAILABLE" : new Intl.DateTimeFormat("en-MY",{timeZone:"Asia/Kuala_Lumpur",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(date)+" MYT";
};
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const eventPhase = event => {
  const now = new Date(), start = event.dateStart ? new Date(event.dateStart) : null, end = event.dateEnd ? new Date(event.dateEnd) : start;
  if (start && !Number.isNaN(start.getTime()) && start > now) return "UPCOMING";
  if (end && !Number.isNaN(end.getTime()) && end < now) return "COMPLETED";
  return start && !Number.isNaN(start.getTime()) ? "IN PROGRESS" : "SCHEDULED";
};
function openCache() {
  return new Promise((resolve,reject) => {
    if (!("indexedDB" in window)) return reject(new Error("IndexedDB unavailable"));
    const request=indexedDB.open(CACHE_DB,CACHE_VERSION);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(CACHE_STORE))request.result.createObjectStore(CACHE_STORE,{keyPath:"key"});};
    request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
  });
}
async function cacheSnapshot(key,payload) {
  const db=await openCache();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(CACHE_STORE,"readwrite");
    tx.objectStore(CACHE_STORE).put({key,payload,fetchedAt:payload.fetchedAt||new Date().toISOString(),savedAt:new Date().toISOString(),version:CACHE_VERSION});
    tx.oncomplete=()=>{db.close();resolve();}; tx.onerror=()=>{db.close();reject(tx.error);};
  });
}
async function readSnapshot(key) {
  const db=await openCache();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(CACHE_STORE,"readonly"),request=tx.objectStore(CACHE_STORE).get(key);
    request.onsuccess=()=>{const value=request.result;db.close();resolve(value||null);};
    request.onerror=()=>{db.close();reject(request.error);};
  });
}
function isValidSnapshot(key,payload) {
  if(!payload||typeof payload!=="object")return false;
  if(key==="events")return payload.championship==="WRC"&&Array.isArray(payload.events);
  const categories=payload.categories||payload;
  return Boolean(categories&&typeof categories==="object"&&["drivers","coDrivers","manufacturers"].some(name=>name in categories));
}
async function getDataset(key,path) {
  try {
    const response=await fetch(new URL(path,document.baseURI),{cache:"no-store",signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error("Request returned "+response.status);
    const payload=await response.json();
    if(!isValidSnapshot(key,payload))throw new Error("Snapshot validation failed");
    try{await cacheSnapshot(key,payload);}catch(error){console.warn("Telemetry cache write failed:",error);}
    return {payload,source:response.headers.get("X-Redline-Cache")==="hit"?"cache":"network",fetchedAt:payload.fetchedAt};
  } catch(error) {
    console.warn("Telemetry refresh failed for "+key+":",error);
    try{const cached=await readSnapshot(key);if(cached&&isValidSnapshot(key,cached.payload))return {payload:cached.payload,source:"cache",fetchedAt:cached.fetchedAt||cached.payload.fetchedAt};}
    catch(cacheError){console.warn("Telemetry cache read failed:",cacheError);}
    return {payload:null,source:"unavailable",fetchedAt:null};
  }
}
function setText(selector,value){const node=$(selector);if(node)node.textContent=value;}
function setFeed(state,message,updated,mode="online"){
  setText("#tt-feed-state",state);setText("#tt-feed-message",message);setText("#tt-feed-updated","UPDATED / "+(updated?formatUpdated(updated):"—"));
  const bar=$(".tt-feedbar");if(bar){bar.dataset.connection=mode;bar.classList.toggle("is-offline",mode==="offline");bar.classList.toggle("is-cached",mode==="cached");}
}
function renderSelectedEvent(){
  const event=eventSnapshot?.events?.[Number($("#tt-event-select")?.value)];if(!event)return;
  setText("#tt-event-round","ROUND / "+String(event.round??"—").padStart(2,"0"));
  setText("#tt-event-name",event.name||"Unnamed rally");
  setText("#tt-event-location",[event.location,event.country].filter(Boolean).join(" / ").toUpperCase()||"EVENT LOCATION / NOT SUPPLIED");
  setText("#tt-event-timing","NOT CONNECTED");
}
function renderEvents(snapshot){
  const select=$("#tt-event-select");if(!select)return;
  const events=Array.isArray(snapshot.events)?snapshot.events:[];
  if(!events.length){select.innerHTML='<option value="">No events in the verified snapshot</option>';setText("#tt-event-name","No events available");return;}
  select.innerHTML=events.map((event,index)=>'<option value="'+index+'">'+escapeHtml("R"+String(event.round??"—").padStart(2,"0")+" / "+(event.name||"Unnamed rally")+" / "+formatDate(event.dateStart))+"</option>").join("");
  const next=events.findIndex(event=>eventPhase(event)==="UPCOMING"||eventPhase(event)==="IN PROGRESS");
  select.value=String(next>=0?next:0);select.onchange=renderSelectedEvent;renderSelectedEvent();
}
function extractRows(value,depth=0){
  if(!value||typeof value!=="object"||depth>6)return [];
  if(Array.isArray(value)){
    const objectRows=value.filter(item=>item&&typeof item==="object"&&!Array.isArray(item));
    if(objectRows.length)return objectRows;
    return value.flatMap(item=>extractRows(item,depth+1));
  }
  const preferred=["standings","classification","results","entries","competitors","drivers","coDrivers","manufacturers","data"];
  for(const key of preferred){if(value[key]){const rows=extractRows(value[key],depth+1);if(rows.length)return rows;}}
  for(const child of Object.values(value)){const rows=extractRows(child,depth+1);if(rows.length)return rows;}
  return [];
}
const firstValue=(row,keys)=>{for(const key of keys)if(row?.[key]!==undefined&&row?.[key]!==null&&row[key]!=="")return row[key];return null;};
const crewName=row=>firstValue(row,["name","driverName","fullName","competitorName","crewName","manufacturer","teamName","title"])||[row.firstName,row.lastName].filter(Boolean).join(" ")||"Name not supplied";
const pointsValue=row=>firstValue(row,["points","totalPoints","score","championshipPoints","pointsTotal"]);
function renderTable(target,rows,kind){
  const node=$(target);if(!node)return;
  if(!rows.length){node.innerHTML='<div class="tt-data-empty">No verified '+escapeHtml(kind)+' rows were supplied in this snapshot.</div>';return;}
  node.innerHTML='<div class="tt-data-table" role="table" aria-label="'+escapeHtml(kind)+' standings"><div class="tt-data-row tt-data-header" role="row"><span>POS</span><span>'+(kind==="manufacturers"?"MANUFACTURER":"CREW")+'</span><span>POINTS</span></div>'+
    rows.slice(0,6).map((row,index)=>{
      const country=firstValue(row,["country","nationality","countryName"]),rank=firstValue(row,["position","rank","place"])??index+1,points=pointsValue(row);
      return '<div class="tt-data-row" role="row"><span>'+escapeHtml(rank)+'</span><strong>'+escapeHtml(crewName(row))+(country?'<small>'+escapeHtml(country)+'</small>':"")+'</strong><b>'+escapeHtml(points===null?"—":points)+'</b></div>';
    }).join("")+'</div>';
}
function renderStandings(snapshot){
  const categories=snapshot.categories||snapshot;
  const byRank=rows=>extractRows(rows).sort((a,b)=>Number(a.position??a.rank??999)-Number(b.position??b.rank??999));
  const drivers=byRank(categories.drivers),coDrivers=byRank(categories.coDrivers??categories.codrivers),manufacturers=byRank(categories.manufacturers);
  const metric=(id,label,value,note)=>{const item=$(id);if(!item)return;item.querySelector("span").textContent=label;item.querySelector("strong").textContent=value;item.querySelector("small").textContent=note;};
  const leader=(rows)=>rows[0],pointsNote=row=>row&&pointsValue(row)!==null?pointsValue(row)+" POINTS":"VERIFIED POINTS NOT SUPPLIED";
  metric("#tt-metric-driver","01 / DRIVERS’ LEADER",leader(drivers)?crewName(leader(drivers)):"—",pointsNote(leader(drivers)));
  metric("#tt-metric-codriver","02 / CO-DRIVERS’ LEADER",leader(coDrivers)?crewName(leader(coDrivers)):"—",pointsNote(leader(coDrivers)));
  metric("#tt-metric-manufacturer","03 / MANUFACTURERS’ LEADER",leader(manufacturers)?crewName(leader(manufacturers)):"—",pointsNote(leader(manufacturers)));
  metric("#tt-metric-events","04 / EVENTS SCHEDULED",eventSnapshot?.events?.length??"—","2026 WRC CALENDAR");
  renderTable("#tt-driver-standings",drivers,"drivers");renderTable("#tt-codriver-standings",coDrivers,"co-drivers");renderTable("#tt-manufacturer-standings",manufacturers,"manufacturers");
  setText("#tt-standings-source","CHAMPIONSHIP SNAPSHOT · "+(snapshot.season||"WRC")+" · STAGE TIMING NOT INCLUDED");
}
async function refreshTelemetry(){
  const [events,standings]=await Promise.all([getDataset("events",DATASETS.events),getDataset("standings",DATASETS.standings)]);
  eventSnapshot=events.payload;
  if(eventSnapshot)renderEvents(eventSnapshot);else{const select=$("#tt-event-select");if(select)select.innerHTML='<option value="">Event schedule unavailable</option>';setText("#tt-event-name","Event schedule unavailable");}
  if(standings.payload)renderStandings(standings.payload);
  const sources=[events,standings].filter(item=>item.payload),hasCache=sources.some(item=>item.source==="cache"),hasNetwork=sources.some(item=>item.source==="network");
  const timestamps=sources.map(item=>item.fetchedAt).filter(Boolean).sort(),updated=timestamps[timestamps.length-1]||null;
  if(!sources.length)setFeed("DATA UNAVAILABLE","No network connection or saved snapshot. Reconnect to load verified WRC data.",null,"offline");
  else if(hasCache&&!hasNetwork)setFeed("OFFLINE · CACHED DATA","Showing the last saved event and championship snapshots. Values may be out of date.",updated,"cached");
  else if(hasCache)setFeed("PARTIAL · CACHED DATA","One or more feeds are using the last saved snapshot.",updated,"cached");
  else setFeed("VERIFIED DATA AVAILABLE","WRC event calendar and championship standings connected · stage timing not yet verified.",updated,"online");
}
async function registerOfflineSupport(){
  if(!("serviceWorker" in navigator))return;
  try{await navigator.serviceWorker.register(new URL("./sw.js",document.baseURI),{scope:new URL("./",document.baseURI).pathname});}
  catch(error){console.warn("Tarmac offline app-shell registration failed:",error);}
}
async function loadDataCentre(){
  if(!$(".telemetry-page"))return;if(initPromise)return initPromise;
  initPromise=(async()=>{
    setFeed("CONNECTING TO DATA FEED","Loading verified WRC calendar and championship standings…",null);
    await registerOfflineSupport();await refreshTelemetry();
    if(!window.__tarmacTelemetryOnlineListener){
      window.__tarmacTelemetryOnlineListener=true;window.addEventListener("online",refreshTelemetry);
      window.addEventListener("offline",()=>{const state=$("#tt-feed-state")?.textContent||"";if(state&&!state.includes("CACHED"))setFeed("OFFLINE","Connection lost · showing saved data where available.",null,"offline");});
    }
  })().finally(()=>{initPromise=null;});
  return initPromise;
}
window.initTarmacDataCentre=loadDataCentre;
if(document.body.dataset.page==="data-centre")loadDataCentre();
