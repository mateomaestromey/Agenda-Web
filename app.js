
// ===== Util =====
const $ = (id) => document.getElementById(id);
const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

const fmtDate = (d) => d.toISOString().slice(0,10);
const parseDate = (s) => {
  const [y,m,dd] = s.split("-").map(Number);
  return new Date(y, m-1, dd);
};
const startOfWeek = (date) => {
  const d = new Date(date);
  const day = (d.getDay()+6)%7; // Monday=0
  d.setDate(d.getDate()-day);
  d.setHours(0,0,0,0);
  return d;
};
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const sameDay = (a,b) => fmtDate(a) === fmtDate(b);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ===== Storage =====
const KEY = "agendaPro_v1";
const defaultData = () => ({
  theme: "dark",
  view: "today", // today|week|month|list
  anchor: fmtDate(new Date()),
  projects: ["General","Facu","Laburo","Salud"],
  habits: [
    { id: uid(), name: "Tomar agua", days: {} },
    { id: uid(), name: "Estudiar 30m", days: {} },
  ],
  tasks: [],
  top3: {} // date -> [taskId, taskId, taskId]
});

function load(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return defaultData();
    const data = JSON.parse(raw);
    return { ...defaultData(), ...data };
  }catch{
    return defaultData();
  }
}
function save(){ localStorage.setItem(KEY, JSON.stringify(state)); }

let state = load();

// ===== Elements =====
const viewEl = $("view");
const viewTitleEl = $("viewTitle");
const modalEl = $("modal");

// Modal fields
const fTitle = $("tTitle");
const fProject = $("tProject");
const fDate = $("tDate");
const fTime = $("tTime");
const fDuration = $("tDuration");
const fPriority = $("tPriority");
const fTags = $("tTags");
const fNotes = $("tNotes");

let editingId = null;

// ===== Theme =====
function applyTheme(){
  document.body.classList.toggle("light", state.theme === "light");
  $("btnTheme").textContent = state.theme === "light" ? "🌙" : "☀️";
}
function toggleTheme(){
  state.theme = state.theme === "light" ? "dark" : "light";
  save(); applyTheme();
}

// ===== Filters UI =====
function fillSelects(){
  // Projects in filters and modal
  const opts = (arr, withAll) => (withAll ? [`<option value="">Todos</option>`] : [])
    .concat(arr.map(p => `<option value="${p}">${p}</option>`)).join("");

  $("filterProject").innerHTML = opts(state.projects, true);
  fProject.innerHTML = state.projects.map(p => `<option>${p}</option>`).join("");

  // Tags derived from tasks
  const tagSet = new Set();
  state.tasks.forEach(t => (t.tags||[]).forEach(x => tagSet.add(x)));
  const tags = Array.from(tagSet).sort();
  $("filterTag").innerHTML = [`<option value="">Todos</option>`]
    .concat(tags.map(t => `<option value="${t}">${t}</option>`)).join("");
}
function getFilters(){
  return {
    q: $("q").value.trim().toLowerCase(),
    project: $("filterProject").value,
    priority: $("filterPriority").value,
    tag: $("filterTag").value
  };
}
function filteredTasks(){
  const f = getFilters();
  return state.tasks.filter(t => {
    if(f.project && t.project !== f.project) return false;
    if(f.priority && t.priority !== f.priority) return false;
    if(f.tag && !(t.tags||[]).includes(f.tag)) return false;
    if(f.q){
      const hay = `${t.title} ${t.project} ${(t.tags||[]).join(" ")} ${t.notes||""}`.toLowerCase();
      if(!hay.includes(f.q)) return false;
    }
    return true;
  });
}

// ===== View helpers =====
function setView(v){
  state.view = v;
  save();
  render();
}
function setAnchor(dateStr){
  state.anchor = dateStr;
  save();
  render();
}

function viewRange(){
  const anchor = parseDate(state.anchor);
  if(state.view === "today") return { start: anchor, end: anchor };
  if(state.view === "week"){
    const s = startOfWeek(anchor);
    return { start: s, end: addDays(s, 6) };
  }
  if(state.view === "month"){
    const s = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const e = new Date(anchor.getFullYear(), anchor.getMonth()+1, 0);
    return { start: s, end: e };
  }
  // list = 30 days window
  const s = startOfWeek(anchor);
  return { start: s, end: addDays(s, 29) };
}

function tasksInRange(start, end){
  const s = fmtDate(start), e = fmtDate(end);
  return filteredTasks()
    .filter(t => t.date >= s && t.date <= e)
    .sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time));
}

// ===== Top3 =====
function renderTop3(){
  const today = fmtDate(new Date());
  const ids = state.top3[today] || [];
  const tasks = ids.map(id => state.tasks.find(t => t.id===id)).filter(Boolean);

  const html = [0,1,2].map(i => {
    const t = tasks[i];
    const val = t ? t.id : "";
    const label = t ? t.title : "Elegí una tarea para tu Top 3";
    return `
      <div class="check">
        <input type="checkbox" ${t?.done ? "checked":""} ${t ? "" : "disabled"} data-top3="${val}" />
        <div>
          <div>${label}</div>
          <div class="smallmuted">${t ? (t.project + " • " + (t.priority||"")) : ""}</div>
        </div>
      </div>
    `;
  }).join("");

  $("top3").innerHTML = html;

  // Toggle done from top3
  $("top3").querySelectorAll("input[type=checkbox][data-top3]").forEach(cb=>{
    cb.addEventListener("change", ()=>{
      const id = cb.dataset.top3;
      const t = state.tasks.find(x=>x.id===id);
      if(!t) return;
      t.done = cb.checked;
      save(); render();
    });
  });
}

// ===== Modal =====
function openModal(task=null){
  editingId = task?.id || null;
  $("modalTitle").textContent = task ? "Editar tarea" : "Nueva tarea";
  $("btnDelete").style.display = task ? "inline-flex" : "none";

  fTitle.value = task?.title || "";
  fProject.value = task?.project || state.projects[0];
  fDate.value = task?.date || fmtDate(new Date());
  fTime.value = task?.time || "";
  fDuration.value = task?.duration ?? 30;
  fPriority.value = task?.priority || "Media";
  fTags.value = (task?.tags || []).join(", ");
  fNotes.value = task?.notes || "";

  modalEl.classList.add("open");
}
function closeModal(){ modalEl.classList.remove("open"); }

function upsertTask(){
  const title = fTitle.value.trim();
  if(!title) return alert("Poné un título.");

  const task = {
    id: editingId || uid(),
    title,
    project: fProject.value,
    date: fDate.value,
    time: fTime.value,
    duration: clamp(parseInt(fDuration.value||"30",10), 5, 600),
    priority: fPriority.value,
    tags: fTags.value.split(",").map(x=>x.trim()).filter(Boolean),
    notes: fNotes.value.trim(),
    done: editingId ? (state.tasks.find(t=>t.id===editingId)?.done || false) : false
  };

  if(editingId){
    const idx = state.tasks.findIndex(t=>t.id===editingId);
    state.tasks[idx] = task;
  }else{
    state.tasks.push(task);
  }

  save();
  fillSelects();
  closeModal();
  render();
}

function deleteTask(){
  if(!editingId) return;
  state.tasks = state.tasks.filter(t=>t.id!==editingId);

  // Remove from top3
  Object.keys(state.top3).forEach(k=>{
    state.top3[k] = (state.top3[k]||[]).filter(id=>id!==editingId);
  });

  save();
  fillSelects();
  closeModal();
  render();
}

// ===== Habits =====
function renderHabits(){
  const today = fmtDate(new Date());
  const html = state.habits.map(h=>{
    const checked = !!h.days[today];
    return `
      <div class="check">
        <input type="checkbox" data-habit="${h.id}" ${checked?"checked":""}/>
        <div>
          <div>${h.name}</div>
          <div class="smallmuted">Hoy: ${checked ? "hecho" : "pendiente"}</div>
        </div>
      </div>
    `;
  }).join("");
  $("habits").innerHTML = html;

  $("habits").querySelectorAll("input[data-habit]").forEach(cb=>{
    cb.addEventListener("change", ()=>{
      const id = cb.dataset.habit;
      const h = state.habits.find(x=>x.id===id);
      if(!h) return;
      if(cb.checked) h.days[today] = true;
      else delete h.days[today];
      save();
      renderHabits();
    });
  });
}
function newHabit(){
  const name = prompt("Nombre del hábito (ej: Gym, leer 10m)");
  if(!name) return;
  state.habits.unshift({ id: uid(), name: name.trim(), days: {} });
  save(); renderHabits();
}

// ===== Rendering =====
function renderKPIs(tasks){
  const total = tasks.length;
  const done = tasks.filter(t=>t.done).length;
  const left = total - done;
  const mins = tasks.filter(t=>!t.done).reduce((a,t)=>a+(t.duration||0),0);

  return `
    <div class="kpi">
      <div class="pill">Tareas: ${total}</div>
      <div class="pill">Hechas: ${done}</div>
      <div class="pill">Pendientes: ${left}</div>
      <div class="pill">Min pendientes: ${mins}</div>
    </div>
  `;
}

function renderList(tasks){
  if(!tasks.length) return `<p class="muted">No hay tareas en este rango con estos filtros.</p>`;
  return `<div class="list">${
    tasks.map(t=>`
      <div class="item">
        <div>
          <div class="title">${t.done?"✅ ":""}${escapeHtml(t.title)}</div>
          <div class="meta">${t.date}${t.time?(" • "+t.time):""} • ${t.project} • ${t.duration}m</div>
          <div class="badges">
            <span class="badge prio-${t.priority}">${t.priority}</span>
            ${(t.tags||[]).map(x=>`<span class="badge">#${escapeHtml(x)}</span>`).join("")}
          </div>
        </div>
        <div class="row gap">
          <button class="btn tiny ghost" data-done="${t.id}">${t.done?"Deshacer":"Hecho"}</button>
          <button class="btn tiny" data-edit="${t.id}">Editar</button>
        </div>
      </div>
    `).join("")
  }</div>`;
}

function renderMonthCalendar(start, end){
  // Calendar grid starting Monday and filling 6 rows max
  const first = new Date(start.getFullYear(), start.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const days = Array.from({length: 42}, (_,i)=>addDays(gridStart,i));
  const tasks = tasksInRange(start, end);

  const byDate = {};
  tasks.forEach(t => {
    (byDate[t.date] ||= []).push(t);
  });

  const month = start.toLocaleString("es-AR", { month:"long", year:"numeric" });

  return `
    <div class="muted" style="margin-bottom:10px;text-transform:capitalize">${month}</div>
    <div class="calendar">
      ${days.map(d=>{
        const ds = fmtDate(d);
        const inMonth = d.getMonth() === start.getMonth();
        const list = (byDate[ds]||[]).slice(0,3);
        return `
          <div class="day" style="opacity:${inMonth?1:.45}">
            <div class="dnum">${d.getDate()}</div>
            <div class="dots">
              ${list.map(t=>`<div class="dot" title="${escapeHtml(t.title)}">${t.done?"✅ ":""}${escapeHtml(t.title)}</div>`).join("")}
              ${(byDate[ds]||[]).length>3 ? `<div class="smallmuted">+${(byDate[ds].length-3)} más</div>` : ""}
            </div>
            <div style="margin-top:10px">
              <button class="btn tiny ghost" data-newdate="${ds}">+ tarea</button>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function render(){
  applyTheme();
  fillSelects();
  renderTop3();
  renderHabits();

  const { start, end } = viewRange();
  const tasks = tasksInRange(start, end);

  // Title
  if(state.view === "today"){
    viewTitleEl.textContent = `Hoy • ${state.anchor}`;
  }else if(state.view === "week"){
    viewTitleEl.textContent = `Semana • ${fmtDate(start)} → ${fmtDate(end)}`;
  }else if(state.view === "month"){
    viewTitleEl.textContent = `Mes • ${start.toLocaleString("es-AR",{month:"long", year:"numeric"})}`;
  }else{
    viewTitleEl.textContent = `Lista • ${fmtDate(start)} → ${fmtDate(end)}`;
  }

  let html = renderKPIs(tasks);

  if(state.view === "month"){
    html += renderMonthCalendar(start, end);
  }else{
    html += renderList(tasks);
  }

  viewEl.innerHTML = html;

  // Bind action buttons
  viewEl.querySelectorAll("[data-edit]").forEach(b=>{
    b.addEventListener("click", ()=>{
      const t = state.tasks.find(x=>x.id===b.dataset.edit);
      if(t) openModal(t);
    });
  });
  viewEl.querySelectorAll("[data-done]").forEach(b=>{
    b.addEventListener("click", ()=>{
      const t = state.tasks.find(x=>x.id===b.dataset.done);
      if(!t) return;
      t.done = !t.done;
      save(); render();
    });
  });
  viewEl.querySelectorAll("[data-newdate]").forEach(b=>{
    b.addEventListener("click", ()=>{
      openModal({ date: b.dataset.newdate, project: state.projects[0], priority:"Media", duration:30, tags:[], notes:"", title:"" });
    });
  });
}

// Basic XSS safe
function escapeHtml(str=""){
  return str.replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

// ===== Auto Planner (simple) =====
// Finds free slots in the day (08:00–22:00) and assigns time to tasks without time.
function autoPlan(){
  const day = state.anchor;
  const dayTasks = state.tasks.filter(t => t.date===day).slice();

  // Build occupied intervals from tasks that have time
  const toMin = (hhmm) => {
    const [h,m] = hhmm.split(":").map(Number);
    return h*60+m;
  };

  const occupied = dayTasks
    .filter(t=>t.time)
    .map(t=>{
      const s = toMin(t.time);
      return { s, e: s + (t.duration||30) };
    })
    .sort((a,b)=>a.s-b.s);

  // Merge overlaps
  const merged=[];
  for(const it of occupied){
    if(!merged.length || it.s>merged[merged.length-1].e){
      merged.push({...it});
    }else{
      merged[merged.length-1].e = Math.max(merged[merged.length-1].e, it.e);
    }
  }

  // Free slots within 08-22
  const DAY_START=8*60, DAY_END=22*60;
  const free=[];
  let cur=DAY_START;
  for(const it of merged){
    if(it.s>cur) free.push({s:cur,e:it.s});
    cur = Math.max(cur, it.e);
  }
  if(cur<DAY_END) free.push({s:cur,e:DAY_END});

  // Place tasks missing time (by priority)
  const prioScore = (p)=> p==="Alta"?3 : p==="Media"?2 : 1;
  const toPlace = dayTasks.filter(t=>!t.time && !t.done).sort((a,b)=>prioScore(b.priority)-prioScore(a.priority));

  for(const t of toPlace){
    const dur = t.duration || 30;
    // Find first slot that fits
    const idx = free.findIndex(sl=> (sl.e-sl.s) >= dur);
    if(idx === -1) break;

    const slot = free[idx];
    const startMin = slot.s;
    const h = String(Math.floor(startMin/60)).padStart(2,"0");
    const m = String(startMin%60).padStart(2,"0");
    t.time = `${h}:${m}`;

    // Shrink slot
    slot.s += dur;
    if(slot.s>=slot.e) free.splice(idx,1);
  }

  save();
  render();
}

// ===== Events =====
$("btnTheme").addEventListener("click", toggleTheme);
$("btnNew").addEventListener("click", ()=>openModal());
$("btnClose").addEventListener("click", closeModal);
$("btnCancel").addEventListener("click", closeModal);
$("btnSave").addEventListener("click", upsertTask);
$("btnDelete").addEventListener("click", deleteTask);

$("btnToday").addEventListener("click", ()=>{ setView("today"); setAnchor(fmtDate(new Date())); });
$("btnWeek").addEventListener("click", ()=>setView("week"));
$("btnMonth").addEventListener("click", ()=>setView("month"));
$("btnList").addEventListener("click", ()=>setView("list"));

$("btnPrev").addEventListener("click", ()=>{
  const a = parseDate(state.anchor);
  if(state.view==="month") a.setMonth(a.getMonth()-1);
  else if(state.view==="week") a.setDate(a.getDate()-7);
  else a.setDate(a.getDate()-1);
  setAnchor(fmtDate(a));
});
$("btnNext").addEventListener("click", ()=>{
  const a = parseDate(state.anchor);
  if(state.view==="month") a.setMonth(a.getMonth()+1);
  else if(state.view==="week") a.setDate(a.getDate()+7);
  else a.setDate(a.getDate()+1);
  setAnchor(fmtDate(a));
});
$("btnNow").addEventListener("click", ()=>setAnchor(fmtDate(new Date())));
$("btnPlanner").addEventListener("click", autoPlan);

$("q").addEventListener("input", render);
$("filterProject").addEventListener("change", render);
$("filterPriority").addEventListener("change", render);
$("filterTag").addEventListener("change", render);

$("btnClearFilters").addEventListener("click", ()=>{
  $("q").value="";
  $("filterProject").value="";
  $("filterPriority").value="";
  $("filterTag").value="";
  render();
});

$("btnNewHabit").addEventListener("click", newHabit);

// Export / Import
$("btnExport").addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "agendaPro_backup.json";
  a.click();
  URL.revokeObjectURL(a.href);
});
$("importFile").addEventListener("change", async (e)=>{
  const file = e.target.files?.[0];
  if(!file) return;
  const text = await file.text();
  try{
    const data = JSON.parse(text);
    state = { ...defaultData(), ...data };
    save(); render();
  }catch{
    alert("JSON inválido.");
  }
});

document.addEventListener("keydown", (e)=>{
  if(e.key==="Escape") closeModal();
});

// Init
applyTheme();
fillSelects();
render();
