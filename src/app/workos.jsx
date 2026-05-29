"use client";
import { useState, useEffect, useRef, useCallback } from "react";

const APP_NAME = "WorkOS";
const APP_SUBTITLE = "Inmobiliaria · Construcción · Servicios";

const DEFAULT_AREAS = ["Desarrollo de Proyectos","Construcción","Ventas y Comercial","Legal y Notaría","Finanzas","Marketing","Postventa","Permisos","Operaciones","Otro"];
const DEFAULT_PRIORITIES = ["Urgente","Alta","Media","Baja"];
const DEFAULT_STATES = ["Pendiente","En progreso","En revisión","Bloqueado","Completado"];
const DEFAULT_TEAM = ["Yo","Sin asignar"];
const DEFAULT_PROJECTS = ["Aguamarina","Turquesa","Moreno 38","Jade"];

const STATE_COLORS = {
  "Pendiente":   { bg:"#fef3c7", color:"#92400e" },
  "En progreso": { bg:"#dbeafe", color:"#1e40af" },
  "En revisión": { bg:"#ede9fe", color:"#5b21b6" },
  "Bloqueado":   { bg:"#fee2e2", color:"#991b1b" },
  "Completado":  { bg:"#d1fae5", color:"#065f46" },
};
const PRIORITY_COLORS = { "Urgente":"#dc2626","Alta":"#ea580c","Media":"#ca8a04","Baja":"#6b7280" };
const AREA_BG = {
  "Desarrollo de Proyectos":"#e0f2fe","Construcción":"#fefce8","Ventas y Comercial":"#fce7f3",
  "Legal y Notaría":"#ede9fe","Finanzas":"#d1fae5","Marketing":"#fff7ed","Postventa":"#f0f9ff",
  "Permisos":"#fdf4ff","Operaciones":"#f0fdf4","Otro":"#f8fafc",
};

const store = {
  get: (key, fallback) => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set: (key, val) => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }
};

const SAMPLE_TASKS = [
  { id:1, title:"Tramitar licencia de construcción Arboleda", area:"Permisos", priority:"Urgente", state:"En progreso", assignee:"Yo", deadline:"2026-06-15", project:"Aguamarina", description:"Gestión ante el municipio.", notes:[{id:1,date:"2026-05-10",author:"Yo",text:"Solicitud entregada con planos firmados."},{id:2,date:"2026-05-22",author:"Yo",text:"En revisión técnica, 2 semanas más."}], created:"2026-05-01" },
  { id:2, title:"Revisión contrato de obra Torre Sur", area:"Legal y Notaría", priority:"Alta", state:"Pendiente", assignee:"Yo", deadline:"2026-06-01", project:"Turquesa", description:"Revisión con contratista principal.", notes:[], created:"2026-05-15" },
  { id:3, title:"Campaña de lanzamiento Residencial Cumbres", area:"Marketing", priority:"Media", state:"En progreso", assignee:"Sin asignar", deadline:"2026-06-10", project:"Jade", description:"Campaña digital de lanzamiento.", notes:[{id:1,date:"2026-05-15",author:"Yo",text:"Brief enviado a agencia."}], created:"2026-05-10" },
];

const fmtDate = d => { if (!d) return ""; const [y,m,day]=d.split("-"); return day+"/"+m+"/"+y; };
const nowStr = () => new Date().toISOString().split("T")[0];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

// ── VOICE COMMAND PARSER (100% local, no API needed) ──────────────────────
function parseCommand(text, tasks, settings) {
  const t = text.toLowerCase().trim();

  // NAVIGATE
  if (t.includes("ir a agenda") || t.includes("abrir agenda")) return { type:"navigate", view:"agenda" };
  if (t.includes("ir a tareas") || t.includes("abrir tareas")) return { type:"navigate", view:"tasks" };
  if (t.includes("ir a inicio") || t.includes("dashboard")) return { type:"navigate", view:"dashboard" };
  if (t.includes("ir a ajustes")) return { type:"navigate", view:"settings" };

  // CLEAR FILTERS
  if (t.includes("limpiar filtro") || t.includes("quitar filtro") || t.includes("mostrar todas")) return { type:"clear_filters" };

  // FILTER BY PROJECT
  const allProjects = settings.projects || DEFAULT_PROJECTS;
  for (const p of allProjects) {
    if (t.includes(p.toLowerCase())) {
      if (t.includes("mostrar") || t.includes("filtrar") || t.includes("ver tareas")) {
        return { type:"filter_project", project:p };
      }
    }
  }

  // COMPLETE TASK
  const completeMatch = t.match(/completar tarea\s+(\d+)/);
  if (completeMatch) return { type:"update_state", taskId: parseInt(completeMatch[1]), state:"Completado" };

  // START TASK
  const startMatch = t.match(/iniciar tarea\s+(\d+)/);
  if (startMatch) return { type:"update_state", taskId: parseInt(startMatch[1]), state:"En progreso" };

  // BLOCK TASK
  const blockMatch = t.match(/bloquear tarea\s+(\d+)/);
  if (blockMatch) return { type:"update_state", taskId: parseInt(blockMatch[1]), state:"Bloqueado" };

  // ADD NOTE
  const noteMatch = t.match(/nota tarea\s+(\d+)\s+(.+)/);
  if (noteMatch) return { type:"add_note", taskId: parseInt(noteMatch[1]), note: noteMatch[2] };

  // NEW TASK
  if (t.startsWith("nueva tarea") || t.startsWith("crear tarea") || t.startsWith("agregar tarea")) {
    let title = text.replace(/^(nueva|crear|agregar)\s+tarea\s+/i, "").trim();
    let priority = "Media";
    let project = "";
    let area = "";

    // Detect priority
    if (/urgente/i.test(title)) { priority = "Urgente"; title = title.replace(/urgente/i,"").trim(); }
    else if (/alta/i.test(title)) { priority = "Alta"; title = title.replace(/alta/i,"").trim(); }
    else if (/baja/i.test(title)) { priority = "Baja"; title = title.replace(/baja/i,"").trim(); }

    // Detect project
    for (const p of allProjects) {
      const re = new RegExp(p, "i");
      if (re.test(title)) { project = p; title = title.replace(re,"").trim(); }
    }

    // Detect area
    const allAreas = settings.areas || DEFAULT_AREAS;
    for (const a of allAreas) {
      const re = new RegExp(a, "i");
      if (re.test(title)) { area = a; title = title.replace(re,"").trim(); }
    }

    // Clean extra spaces and punctuation
    title = title.replace(/\s+/g," ").replace(/[,.]+$/,"").trim();
    if (!title) return { type:"error", msg:"No entendí el título de la tarea. Decí: nueva tarea [título]" };
    return { type:"create_task", title, priority, project, area };
  }

  return { type:"unknown", msg:'No entendí el comando. Tocá "? ayuda" para ver los comandos disponibles.' };
}

// ── MAIN APP ──────────────────────────────────────────────────────────────
export default function WorkOS() {
  const [view, setView] = useState("dashboard");
  const [tasks, setTasks] = useState([]);
  const [settings, setSettings] = useState({ areas:DEFAULT_AREAS, priorities:DEFAULT_PRIORITIES, states:DEFAULT_STATES, team:DEFAULT_TEAM, projects:DEFAULT_PROJECTS, darkMode:false });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [filters, setFilters] = useState({ area:"", priority:"", state:"", assignee:"", project:"", search:"" });
  const [newTask, setNewTask] = useState({ title:"", area:"", priority:"Media", state:"Pendiente", assignee:"Yo", deadline:"", description:"", project:"" });
  const [noteInput, setNoteInput] = useState("");
  const [gcalEvents, setGcalEvents] = useState([]);
  const [gcalLoading, setGcalLoading] = useState(false);
  const [gcalToken, setGcalToken] = useState(null);
  const [gcalConnected, setGcalConnected] = useState(false);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({ title:"", date:"", time:"", duration:60, desc:"" });
  const [settingsTab, setSettingsTab] = useState("areas");
  const [newSettingItem, setNewSettingItem] = useState("");
  const [toast, setToast] = useState(null);
  const [listening, setListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [showVoiceHelp, setShowVoiceHelp] = useState(false);
  const [lastVoiceResult, setLastVoiceResult] = useState("");
  const recRef = useRef(null);
  const dark = settings.darkMode;

  // ── LOAD ──
  useEffect(() => {
    const t = store.get("wos_tasks", SAMPLE_TASKS);
    const s = store.get("wos_settings", { areas:DEFAULT_AREAS, priorities:DEFAULT_PRIORITIES, states:DEFAULT_STATES, team:DEFAULT_TEAM, projects:DEFAULT_PROJECTS, darkMode:false });
    if (!s.projects) s.projects = DEFAULT_PROJECTS;
    setTasks(t); setSettings(s); setLoaded(true);
  }, []);

  // ── GCAL TOKEN ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("access_token");
    if (token) {
      setGcalToken(token); setGcalConnected(true);
      localStorage.setItem("gcal_token", token);
      window.history.replaceState({}, document.title, window.location.pathname);
      showToast("Google Calendar conectado ✓");
    } else {
      const saved = localStorage.getItem("gcal_token");
      if (saved) { setGcalToken(saved); setGcalConnected(true); }
    }
  }, []);

  useEffect(() => { if (loaded) { setSaving(true); store.set("wos_tasks", tasks); setTimeout(()=>setSaving(false), 700); }}, [tasks, loaded]);
  useEffect(() => { if (loaded) store.set("wos_settings", settings); }, [settings, loaded]);

  const showToast = (msg, type="success") => { setToast({ msg, type }); setTimeout(()=>setToast(null), 3500); };

  // ── VOICE (100% LOCAL — NO API) ──
  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showToast("Tu navegador no soporta voz. Usá Chrome.","error"); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = "es-AR";
    rec.continuous = false;
    rec.interimResults = false; // only final result
    rec.onstart = () => { setListening(true); setVoiceTranscript(""); setLastVoiceResult(""); };
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setVoiceTranscript(transcript);
      // Process command immediately on final result
      const result = parseCommand(transcript, tasks, settings);
      handleVoiceResult(result, transcript);
    };
    rec.onerror = (e) => { setListening(false); showToast("Error al escuchar: " + e.error, "error"); };
    rec.onend = () => { setListening(false); };
    recRef.current = rec;
    rec.start();
  };

  const handleVoiceResult = (result, transcript) => {
    setLastVoiceResult(transcript);
    switch(result.type) {
      case "navigate":
        setView(result.view);
        showToast("📍 " + result.view);
        break;
      case "clear_filters":
        setFilters({ area:"", priority:"", state:"", assignee:"", project:"", search:"" });
        showToast("✓ Filtros limpiados");
        break;
      case "filter_project":
        setFilters(f=>({...f, project:result.project}));
        setView("tasks");
        showToast("🔍 Mostrando: " + result.project);
        break;
      case "update_state": {
        const task = tasks.find(t => t.id === result.taskId);
        if (task) {
          setTasks(prev => prev.map(t => t.id===result.taskId ? {...t, state:result.state} : t));
          showToast("✓ Tarea " + result.taskId + ": " + result.state);
        } else {
          showToast("No encontré la tarea " + result.taskId, "error");
        }
        break;
      }
      case "add_note": {
        const task = tasks.find(t => t.id === result.taskId);
        if (task) {
          const note = { id:uid(), date:nowStr(), author:"Yo", text:result.note };
          setTasks(prev => prev.map(t => t.id===result.taskId ? {...t, notes:[...(t.notes||[]), note]} : t));
          showToast("✓ Nota agregada a tarea " + result.taskId);
        } else {
          showToast("No encontré la tarea " + result.taskId, "error");
        }
        break;
      }
      case "create_task": {
        const newT = { id:uid(), title:result.title, area:result.area||"", project:result.project||"", priority:result.priority||"Media", state:"Pendiente", assignee:"Yo", deadline:"", description:"", notes:[], created:nowStr() };
        setTasks(prev => [newT, ...prev]);
        setView("tasks");
        showToast("✓ Tarea creada: " + result.title);
        break;
      }
      case "error":
      case "unknown":
        showToast(result.msg, "error");
        break;
    }
  };

  // ── GCAL ──
  const connectGcal = () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const redirectUri = encodeURIComponent(appUrl + "/api/auth/callback");
    const scope = encodeURIComponent("https://www.googleapis.com/auth/calendar");
    window.location.href = "https://accounts.google.com/o/oauth2/v2/auth?client_id=" + clientId + "&redirect_uri=" + redirectUri + "&response_type=code&scope=" + scope + "&access_type=offline&prompt=consent";
  };

  const disconnectGcal = () => {
    localStorage.removeItem("gcal_token");
    setGcalToken(null); setGcalConnected(false); setGcalEvents([]);
    showToast("Google Calendar desconectado");
  };

  const loadGcalEvents = useCallback(async () => {
    if (!gcalToken) return;
    setGcalLoading(true);
    try {
      const res = await fetch("/api/calendar?token=" + gcalToken);
      const data = await res.json();
      if (data.items) {
        setGcalEvents(data.items.map(e => ({ id:e.id, title:e.summary||"Sin título", start:e.start, end:e.end, location:e.location||"", description:e.description||"" })));
      } else if (data.error?.code === 401) {
        setGcalConnected(false); localStorage.removeItem("gcal_token");
        showToast("Sesión expirada. Reconectá Google Calendar.", "error");
      }
    } catch(e) { showToast("Error cargando eventos","error"); }
    setGcalLoading(false);
  }, [gcalToken]);

  useEffect(() => { if (view==="agenda" && gcalConnected) loadGcalEvents(); }, [view, gcalConnected]);

  const createGcalEvent = async () => {
    if (!newEvent.title || !newEvent.date || !gcalToken) return;
    try {
      const startDT = newEvent.time ? newEvent.date+"T"+newEvent.time+":00" : newEvent.date;
      const endDT = newEvent.time ? new Date(new Date(startDT).getTime()+newEvent.duration*60000).toISOString() : newEvent.date;
      const event = {
        summary: newEvent.title, description: newEvent.desc||"",
        start: newEvent.time ? { dateTime:startDT, timeZone:"America/Argentina/Buenos_Aires" } : { date:newEvent.date },
        end: newEvent.time ? { dateTime:endDT, timeZone:"America/Argentina/Buenos_Aires" } : { date:newEvent.date },
      };
      const res = await fetch("/api/calendar", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ token:gcalToken, event }) });
      const data = await res.json();
      if (data.id) { showToast("Evento creado ✓"); setShowNewEvent(false); setNewEvent({ title:"", date:"", time:"", duration:60, desc:"" }); setTimeout(loadGcalEvents, 1000); }
      else showToast("Error al crear evento","error");
    } catch { showToast("Error al crear evento","error"); }
  };

  // ── TASKS ──
  const filteredTasks = tasks.filter(t => {
    if (filters.area && t.area!==filters.area) return false;
    if (filters.priority && t.priority!==filters.priority) return false;
    if (filters.state && t.state!==filters.state) return false;
    if (filters.assignee && t.assignee!==filters.assignee) return false;
    if (filters.project && t.project!==filters.project) return false;
    if (filters.search && !t.title.toLowerCase().includes(filters.search.toLowerCase())) return false;
    return true;
  });

  const addTask = () => {
    if (!newTask.title) return;
    setTasks([{ ...newTask, id:uid(), notes:[], created:nowStr() }, ...tasks]);
    setNewTask({ title:"", area:"", priority:"Media", state:"Pendiente", assignee:"Yo", deadline:"", description:"", project:"" });
    setShowTaskForm(false); showToast("Tarea creada ✓");
  };

  const updateTask = (id, updates) => {
    setTasks(prev => prev.map(t => t.id===id ? {...t,...updates} : t));
    setSelectedTask(prev => prev?.id===id ? {...prev,...updates} : prev);
  };

  const addNote = (taskId) => {
    if (!noteInput.trim()) return;
    const note = { id:uid(), date:nowStr(), author:"Yo", text:noteInput.trim() };
    setTasks(prev => prev.map(t => t.id===taskId ? {...t, notes:[...(t.notes||[]), note]} : t));
    setSelectedTask(prev => prev ? {...prev, notes:[...(prev.notes||[]), note]} : prev);
    setNoteInput(""); showToast("Nota agregada ✓");
  };

  const deleteTask = (id) => { setTasks(prev=>prev.filter(t=>t.id!==id)); setSelectedTask(null); showToast("Tarea eliminada"); };
  const clearFilters = () => setFilters({ area:"", priority:"", state:"", assignee:"", project:"", search:"" });
  const activeFilters = Object.values(filters).filter(Boolean).length;

  const addSettingItem = (key) => {
    if (!newSettingItem.trim()) return;
    setSettings(s=>({...s,[key]:[...s[key],newSettingItem.trim()]}));
    setNewSettingItem("");
  };
  const removeSettingItem = (key,i) => setSettings(s=>({...s,[key]:s[key].filter((_,idx)=>idx!==i)}));

  const urgentCount = tasks.filter(t=>t.priority==="Urgente"&&t.state!=="Completado").length;
  const inProgressCount = tasks.filter(t=>t.state==="En progreso").length;
  const completedCount = tasks.filter(t=>t.state==="Completado").length;
  const blockedCount = tasks.filter(t=>t.state==="Bloqueado").length;

  // ── THEME ──
  const c = {
    bg: dark?"#0f172a":"#f1f5f4", surface: dark?"#1e293b":"#ffffff",
    surface2: dark?"#334155":"#f8faf9", border: dark?"#334155":"#e2e8e4",
    text: dark?"#f1f5f9":"#0f1c14", text2: dark?"#94a3b8":"#4b6357",
    accent:"#1a6b3c", accentLight: dark?"#166534":"#dcfce7",
    gold:"#b8862a", header: dark?"#0f172a":"#0f1c14",
  };

  const S = {
    app: { fontFamily:"'Segoe UI',system-ui,sans-serif", background:c.bg, minHeight:"100vh", color:c.text, fontSize:14 },
    header: { background:c.header, height:56, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 16px", position:"sticky", top:0, zIndex:50, boxShadow:"0 2px 8px rgba(0,0,0,0.3)" },
    logo: { color:"#4ade80", fontWeight:800, fontSize:18 },
    logoSub: { color:"#4b6357", fontSize:9, letterSpacing:2, textTransform:"uppercase" },
    nav: { display:"flex", gap:2 },
    navBtn: (a) => ({ background:a?"rgba(74,222,128,0.15)":"transparent", color:a?"#4ade80":"#64748b", border:"none", padding:"7px 11px", borderRadius:6, cursor:"pointer", fontSize:11, fontWeight:700 }),
    main: { maxWidth:1100, margin:"0 auto", padding:"16px 12px 100px" },
    card: { background:c.surface, borderRadius:12, padding:16, border:"1px solid "+c.border, marginBottom:12 },
    sTitle: { fontSize:11, fontWeight:700, color:c.text2, letterSpacing:1.5, textTransform:"uppercase", marginBottom:12, paddingBottom:8, borderBottom:"1px solid "+c.border },
    badge: (s) => { const x=STATE_COLORS[s]||{bg:"#f3f4f6",color:"#374151"}; return { background:x.bg, color:x.color, borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:700, display:"inline-block" }; },
    priBadge: (p) => ({ width:8, height:8, borderRadius:"50%", background:PRIORITY_COLORS[p]||"#9ca3af", display:"inline-block", marginRight:5, flexShrink:0 }),
    areaBadge: (a) => ({ background:AREA_BG[a]||"#f3f4f6", color:"#374151", borderRadius:4, padding:"2px 7px", fontSize:10, fontWeight:600, display:"inline-block" }),
    projBadge: { background:"#e0f2fe", color:"#0369a1", borderRadius:4, padding:"2px 7px", fontSize:10, fontWeight:700, display:"inline-block" },
    btn: (v) => ({ background:v==="primary"?c.accent:v==="gold"?c.gold:v==="danger"?"#dc2626":v==="green"?"#16a34a":c.surface2, color:["primary","gold","danger","green"].includes(v)?"#fff":c.text, border:"none", borderRadius:8, padding:"8px 16px", cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit" }),
    input: { width:"100%", background:c.surface2, border:"1px solid "+c.border, borderRadius:8, padding:"9px 12px", fontSize:13, fontFamily:"inherit", color:c.text, outline:"none", boxSizing:"border-box" },
    select: { width:"100%", background:c.surface2, border:"1px solid "+c.border, borderRadius:8, padding:"9px 12px", fontSize:13, fontFamily:"inherit", color:c.text, boxSizing:"border-box" },
    label: { fontSize:10, fontWeight:700, color:c.text2, display:"block", marginBottom:4, letterSpacing:1, textTransform:"uppercase" },
    modal: { position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", display:"flex", alignItems:"flex-start", justifyContent:"center", zIndex:100, paddingTop:20, overflowY:"auto" },
    modalBox: { background:c.surface, borderRadius:16, padding:20, width:"95%", maxWidth:560, border:"1px solid "+c.border, margin:"0 auto 40px" },
    bottomNav: { position:"fixed", bottom:0, left:0, right:0, background:c.header, borderTop:"1px solid "+c.border, display:"flex", zIndex:50 },
    bottomBtn: (a) => ({ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"8px 4px", background:"transparent", border:"none", cursor:"pointer", color:a?"#4ade80":"#64748b", fontSize:9, fontWeight:700, gap:3 }),
    chip: (a) => ({ background:a?c.accent:"transparent", color:a?"#fff":c.text2, border:"1px solid "+(a?c.accent:c.border), borderRadius:20, padding:"4px 10px", fontSize:11, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }),
    grid2: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 },
    statsRow: { display:"flex", gap:10, marginBottom:16, overflowX:"auto" },
    statCard: (col) => ({ background:c.surface, borderRadius:12, padding:"14px 16px", border:"2px solid "+col, flex:1, minWidth:0 }),
  };

  if (!loaded) return (
    <div style={{...S.app,display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh"}}>
      <div style={{textAlign:"center"}}><div style={{fontSize:40,marginBottom:8}}>🏗</div><div style={{color:"#4ade80",fontWeight:800,fontSize:20}}>WorkOS</div><div style={{color:"#64748b",fontSize:12,marginTop:4}}>Cargando...</div></div>
    </div>
  );

  return (
    <div style={S.app}>
      {/* HEADER */}
      <div style={S.header}>
        <div><div style={S.logo}>⬡ {APP_NAME}</div><div style={S.logoSub}>{APP_SUBTITLE}</div></div>
        <nav style={S.nav}>
          {[["dashboard","Dashboard"],["tasks","Tareas"],["agenda","Agenda"],["settings","Ajustes"]].map(([v,l])=>(
            <button key={v} style={S.navBtn(view===v)} onClick={()=>setView(v)}>{l}</button>
          ))}
        </nav>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:10,color:saving?"#ca8a04":"#4ade80"}}>{saving?"● Guardando":"● Guardado"}</span>
          <button onClick={()=>setSettings(s=>({...s,darkMode:!s.darkMode}))} style={{background:"transparent",border:"none",cursor:"pointer",fontSize:16}}>{dark?"☀️":"🌙"}</button>
        </div>
      </div>

      <div style={S.main}>

        {/* ── DASHBOARD ── */}
        {view==="dashboard" && (<>
          <div style={{marginBottom:16}}>
            <h2 style={{fontSize:20,fontWeight:800,marginBottom:2}}>Buenos días 👋</h2>
            <p style={{color:c.text2,fontSize:13}}>Resumen de tu trabajo</p>
          </div>
          <div style={S.statsRow}>
            {[{label:"Urgentes",val:urgentCount,col:"#dc2626"},{label:"En progreso",val:inProgressCount,col:"#3b82f6"},{label:"Bloqueados",val:blockedCount,col:"#f59e0b"},{label:"Completados",val:completedCount,col:"#16a34a"}].map(s=>(
              <div key={s.label} style={S.statCard(s.col)}>
                <div style={{fontSize:28,fontWeight:900,color:s.col,lineHeight:1}}>{s.val}</div>
                <div style={{fontSize:10,color:c.text2,marginTop:3}}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={S.card}>
            <div style={S.sTitle}>🔴 Urgentes y alta prioridad</div>
            {tasks.filter(t=>["Urgente","Alta"].includes(t.priority)&&t.state!=="Completado").slice(0,5).map(t=>(
              <div key={t.id} onClick={()=>{setSelectedTask(t);setView("tasks");}} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"10px 0",borderBottom:"1px solid "+c.border,cursor:"pointer"}}>
                <span style={S.priBadge(t.priority)}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:13,marginBottom:3}}>{t.title}</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {t.area&&<span style={S.areaBadge(t.area)}>{t.area}</span>}
                    {t.project&&<span style={S.projBadge}>🏗 {t.project}</span>}
                    <span style={S.badge(t.state)}>{t.state}</span>
                    {t.deadline&&<span style={{fontSize:10,color:c.text2}}>📅 {fmtDate(t.deadline)}</span>}
                  </div>
                </div>
              </div>
            ))}
            {tasks.filter(t=>["Urgente","Alta"].includes(t.priority)&&t.state!=="Completado").length===0&&<p style={{color:c.text2,fontSize:13}}>✅ Sin urgentes pendientes</p>}
          </div>
          <div style={S.card}>
            <div style={S.sTitle}>🏗 Por proyecto</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {(settings.projects||DEFAULT_PROJECTS).map(proj=>{
                const count=tasks.filter(t=>t.project===proj&&t.state!=="Completado").length;
                return (<div key={proj} onClick={()=>{setFilters(f=>({...f,project:proj}));setView("tasks");}} style={{background:"#e0f2fe",border:"1px solid #bae6fd",borderRadius:10,padding:"10px 14px",textAlign:"center",cursor:"pointer",minWidth:90}}>
                  <div style={{fontSize:22,fontWeight:900,color:"#0369a1"}}>{count}</div>
                  <div style={{fontSize:10,color:"#0369a1",marginTop:2}}>{proj}</div>
                </div>);
              })}
            </div>
          </div>
          <div style={S.card}>
            <div style={S.sTitle}>📊 Por área</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {settings.areas.map(area=>{
                const count=tasks.filter(t=>t.area===area&&t.state!=="Completado").length;
                if(!count) return null;
                return (<div key={area} onClick={()=>{setFilters(f=>({...f,area}));setView("tasks");}} style={{background:AREA_BG[area]||"#f3f4f6",border:"1px solid "+c.border,borderRadius:10,padding:"10px 14px",textAlign:"center",cursor:"pointer",minWidth:90}}>
                  <div style={{fontSize:22,fontWeight:900,color:c.text}}>{count}</div>
                  <div style={{fontSize:10,color:c.text2,marginTop:2}}>{area}</div>
                </div>);
              })}
            </div>
          </div>
          <div style={S.card}>
            <div style={S.sTitle}>⚡ Acceso rápido</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button style={S.btn("primary")} onClick={()=>{setView("tasks");setShowTaskForm(true);}}>+ Nueva tarea</button>
              <button style={S.btn("gold")} onClick={()=>setView("agenda")}>📅 Agenda</button>
              <button style={S.btn("green")} onClick={startVoice}>🎙 Comando de voz</button>
            </div>
          </div>
        </>)}

        {/* ── TASKS ── */}
        {view==="tasks" && (<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <h2 style={{fontSize:18,fontWeight:800}}>Tareas</h2>
            <button style={S.btn("primary")} onClick={()=>setShowTaskForm(true)}>+ Nueva</button>
          </div>
          <input style={{...S.input,marginBottom:10}} placeholder="🔍 Buscar tareas..." value={filters.search} onChange={e=>setFilters(f=>({...f,search:e.target.value}))}/>
          <div style={{overflowX:"auto",marginBottom:14}}>
            <div style={{display:"flex",gap:6,paddingBottom:6,minWidth:"max-content"}}>
              <button style={S.chip(activeFilters>0)} onClick={clearFilters}>{activeFilters>0?"✕ Limpiar ("+activeFilters+")":"Filtros"}</button>
              {settings.areas.map(a=><button key={a} style={S.chip(filters.area===a)} onClick={()=>setFilters(f=>({...f,area:f.area===a?"":a}))}>{a}</button>)}
            </div>
            <div style={{display:"flex",gap:6,paddingBottom:4,minWidth:"max-content",marginTop:4}}>
              {settings.priorities.map(p=><button key={p} style={S.chip(filters.priority===p)} onClick={()=>setFilters(f=>({...f,priority:f.priority===p?"":p}))}><span style={{...S.priBadge(p),marginBottom:-1}}/>{p}</button>)}
              {settings.states.map(s=><button key={s} style={S.chip(filters.state===s)} onClick={()=>setFilters(f=>({...f,state:f.state===s?"":s}))}>{s}</button>)}
            </div>
            <div style={{display:"flex",gap:6,paddingBottom:4,minWidth:"max-content",marginTop:4,alignItems:"center"}}>
              <span style={{fontSize:10,color:c.text2,fontWeight:700,letterSpacing:1,textTransform:"uppercase",whiteSpace:"nowrap"}}>🏗 Proyecto:</span>
              {(settings.projects||DEFAULT_PROJECTS).map(p=><button key={p} style={S.chip(filters.project===p)} onClick={()=>setFilters(f=>({...f,project:f.project===p?"":p}))}>{p}</button>)}
            </div>
          </div>
          <div style={{fontSize:11,color:c.text2,marginBottom:10}}>{filteredTasks.length} tarea{filteredTasks.length!==1?"s":""}</div>
          {showTaskForm && (
            <div style={{...S.card,border:"2px solid "+c.accent,marginBottom:14}}>
              <div style={S.sTitle}>Nueva tarea</div>
              <div style={{marginBottom:10}}><label style={S.label}>Título *</label><input style={S.input} value={newTask.title} onChange={e=>setNewTask(t=>({...t,title:e.target.value}))} placeholder="¿Qué hay que hacer?"/></div>
              <div style={{...S.grid2,marginBottom:10}}>
                <div><label style={S.label}>Área</label><select style={S.select} value={newTask.area} onChange={e=>setNewTask(t=>({...t,area:e.target.value}))}><option value="">Sin área</option>{settings.areas.map(a=><option key={a}>{a}</option>)}</select></div>
                <div><label style={S.label}>Proyecto</label><select style={S.select} value={newTask.project} onChange={e=>setNewTask(t=>({...t,project:e.target.value}))}><option value="">Sin proyecto</option>{(settings.projects||DEFAULT_PROJECTS).map(p=><option key={p}>{p}</option>)}</select></div>
                <div><label style={S.label}>Prioridad</label><select style={S.select} value={newTask.priority} onChange={e=>setNewTask(t=>({...t,priority:e.target.value}))}>{settings.priorities.map(p=><option key={p}>{p}</option>)}</select></div>
                <div><label style={S.label}>Estado</label><select style={S.select} value={newTask.state} onChange={e=>setNewTask(t=>({...t,state:e.target.value}))}>{settings.states.map(s=><option key={s}>{s}</option>)}</select></div>
                <div><label style={S.label}>Asignado a</label><select style={S.select} value={newTask.assignee} onChange={e=>setNewTask(t=>({...t,assignee:e.target.value}))}>{settings.team.map(m=><option key={m}>{m}</option>)}</select></div>
                <div><label style={S.label}>Fecha límite</label><input type="date" style={S.input} value={newTask.deadline} onChange={e=>setNewTask(t=>({...t,deadline:e.target.value}))}/></div>
              </div>
              <div style={{marginBottom:12}}><label style={S.label}>Descripción</label><textarea style={{...S.input,resize:"vertical",minHeight:60}} value={newTask.description} onChange={e=>setNewTask(t=>({...t,description:e.target.value}))} placeholder="Detalles..."/></div>
              <div style={{display:"flex",gap:8}}>
                <button style={S.btn("primary")} onClick={addTask}>Guardar</button>
                <button style={S.btn(null)} onClick={()=>setShowTaskForm(false)}>Cancelar</button>
              </div>
            </div>
          )}
          {filteredTasks.length===0&&<div style={{...S.card,textAlign:"center",color:c.text2,padding:32}}>Sin tareas con estos filtros</div>}
          {filteredTasks.map(t=>(
            <div key={t.id} style={{...S.card,borderLeft:"3px solid "+(PRIORITY_COLORS[t.priority]||"#ccc"),cursor:"pointer"}} onClick={()=>setSelectedTask(t)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:13,marginBottom:5,textDecoration:t.state==="Completado"?"line-through":"none",color:t.state==="Completado"?c.text2:c.text}}>{t.title}</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {t.area&&<span style={S.areaBadge(t.area)}>{t.area}</span>}
                    {t.project&&<span style={S.projBadge}>🏗 {t.project}</span>}
                    <span style={S.badge(t.state)}>{t.state}</span>
                    {t.assignee&&t.assignee!=="Sin asignar"&&<span style={{fontSize:10,color:c.text2}}>👤 {t.assignee}</span>}
                    {t.deadline&&<span style={{fontSize:10,color:c.text2}}>📅 {fmtDate(t.deadline)}</span>}
                    {t.notes?.length>0&&<span style={{fontSize:10,color:c.text2}}>💬 {t.notes.length}</span>}
                  </div>
                </div>
                <span style={{color:c.text2,fontSize:16,marginLeft:8}}>›</span>
              </div>
            </div>
          ))}
        </>)}

        {/* ── AGENDA ── */}
        {view==="agenda" && (<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <h2 style={{fontSize:18,fontWeight:800}}>Agenda</h2>
            <div style={{display:"flex",gap:8}}>
              {gcalConnected&&<button style={S.btn(null)} onClick={loadGcalEvents}>{gcalLoading?"...":"🔄"}</button>}
              {gcalConnected&&<button style={S.btn("primary")} onClick={()=>setShowNewEvent(true)}>+ Evento</button>}
            </div>
          </div>
          {!gcalConnected ? (
            <div style={{...S.card,textAlign:"center",padding:32}}>
              <div style={{fontSize:40,marginBottom:12}}>📅</div>
              <div style={{fontWeight:700,fontSize:16,marginBottom:8}}>Conectar Google Calendar</div>
              <div style={{color:c.text2,fontSize:13,marginBottom:20}}>Vinculá tu cuenta para ver y crear eventos desde WorkOS.</div>
              <button style={{...S.btn("primary"),padding:"12px 28px",fontSize:14}} onClick={connectGcal}>Conectar con Google</button>
            </div>
          ) : (<>
            <div style={{...S.card,background:c.accentLight,border:"1px solid "+c.accent,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:13,color:c.accent,fontWeight:700}}>✅ Google Calendar conectado</span>
              <button style={{...S.btn("danger"),fontSize:11,padding:"5px 10px"}} onClick={disconnectGcal}>Desconectar</button>
            </div>
            {gcalLoading&&<div style={{...S.card,textAlign:"center",color:c.text2}}>Cargando eventos...</div>}
            {!gcalLoading&&gcalEvents.length===0&&<div style={{...S.card,textAlign:"center",color:c.text2,padding:24}}>No hay eventos en los próximos 14 días</div>}
            {gcalEvents.map((ev,i)=>(
              <div key={i} style={{...S.card,borderLeft:"3px solid "+c.accent}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>{ev.title}</div>
                <div style={{fontSize:12,color:c.text2,display:"flex",gap:10,flexWrap:"wrap"}}>
                  {ev.start&&<span>📅 {ev.start.dateTime?new Date(ev.start.dateTime).toLocaleString("es-AR",{dateStyle:"short",timeStyle:"short"}):ev.start.date}</span>}
                  {ev.location&&<span>📍 {ev.location}</span>}
                </div>
                {ev.description&&<div style={{fontSize:12,color:c.text2,marginTop:4}}>{ev.description}</div>}
              </div>
            ))}
          </>)}
          {showNewEvent&&(
            <div style={S.modal} onClick={()=>setShowNewEvent(false)}>
              <div style={S.modalBox} onClick={e=>e.stopPropagation()}>
                <div style={{fontWeight:800,fontSize:16,marginBottom:14}}>Nuevo evento en Google Calendar</div>
                <div style={{marginBottom:10}}><label style={S.label}>Título *</label><input style={S.input} value={newEvent.title} onChange={e=>setNewEvent(v=>({...v,title:e.target.value}))}/></div>
                <div style={{...S.grid2,marginBottom:10}}>
                  <div><label style={S.label}>Fecha *</label><input type="date" style={S.input} value={newEvent.date} onChange={e=>setNewEvent(v=>({...v,date:e.target.value}))}/></div>
                  <div><label style={S.label}>Hora</label><input type="time" style={S.input} value={newEvent.time} onChange={e=>setNewEvent(v=>({...v,time:e.target.value}))}/></div>
                </div>
                <div style={{marginBottom:14}}><label style={S.label}>Descripción</label><input style={S.input} value={newEvent.desc} onChange={e=>setNewEvent(v=>({...v,desc:e.target.value}))}/></div>
                <div style={{display:"flex",gap:8}}>
                  <button style={S.btn("primary")} onClick={createGcalEvent}>Crear evento</button>
                  <button style={S.btn(null)} onClick={()=>setShowNewEvent(false)}>Cancelar</button>
                </div>
              </div>
            </div>
          )}
        </>)}

        {/* ── SETTINGS ── */}
        {view==="settings" && (
          <div style={{maxWidth:600,margin:"0 auto"}}>
            <h2 style={{fontSize:18,fontWeight:800,marginBottom:14}}>Ajustes</h2>
            <div style={{display:"flex",gap:6,marginBottom:16,overflowX:"auto"}}>
              {[["areas","Áreas"],["priorities","Prioridades"],["states","Estados"],["team","Equipo"],["projects","Proyectos"],["app","App"]].map(([k,l])=>(
                <button key={k} style={S.chip(settingsTab===k)} onClick={()=>setSettingsTab(k)}>{l}</button>
              ))}
            </div>
            {settingsTab!=="app"&&(
              <div style={S.card}>
                <div style={S.sTitle}>{{"areas":"Áreas","priorities":"Prioridades","states":"Estados","team":"Equipo","projects":"Proyectos"}[settingsTab]}</div>
                {(settings[settingsTab]||[]).map((item,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid "+c.border}}>
                    <span style={{fontSize:13}}>{item}</span>
                    <button onClick={()=>removeSettingItem(settingsTab,i)} style={{background:"transparent",border:"none",color:"#dc2626",cursor:"pointer",fontSize:16}}>×</button>
                  </div>
                ))}
                <div style={{display:"flex",gap:8,marginTop:12}}>
                  <input style={{...S.input,flex:1}} value={newSettingItem} onChange={e=>setNewSettingItem(e.target.value)} placeholder="Agregar nuevo..." onKeyDown={e=>e.key==="Enter"&&addSettingItem(settingsTab)}/>
                  <button style={S.btn("primary")} onClick={()=>addSettingItem(settingsTab)}>+</button>
                </div>
              </div>
            )}
            {settingsTab==="app"&&(
              <div style={S.card}>
                <div style={S.sTitle}>Preferencias</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid "+c.border}}>
                  <span style={{fontSize:13}}>Modo oscuro</span>
                  <button onClick={()=>setSettings(s=>({...s,darkMode:!s.darkMode}))} style={{...S.btn(settings.darkMode?"primary":null),fontSize:12,padding:"6px 14px"}}>{settings.darkMode?"Activo":"Inactivo"}</button>
                </div>
                <div style={{padding:"12px 0"}}>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>Google Calendar</div>
                  <div style={{fontSize:12,color:c.text2,marginBottom:8}}>{gcalConnected?"✅ Conectado":"No conectado"}</div>
                  {!gcalConnected&&<button style={S.btn("primary")} onClick={connectGcal}>Conectar Google Calendar</button>}
                  {gcalConnected&&<button style={S.btn("danger")} onClick={disconnectGcal}>Desconectar</button>}
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── TASK DETAIL MODAL ── */}
      {selectedTask&&(
        <div style={S.modal} onClick={()=>setSelectedTask(null)}>
          <div style={S.modalBox} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
              <h3 style={{fontSize:15,fontWeight:800,flex:1,paddingRight:12,lineHeight:1.3}}>{selectedTask.title}</h3>
              <button onClick={()=>setSelectedTask(null)} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:c.text2}}>✕</button>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
              {selectedTask.area&&<span style={S.areaBadge(selectedTask.area)}>{selectedTask.area}</span>}
              {selectedTask.project&&<span style={S.projBadge}>🏗 {selectedTask.project}</span>}
              <span style={S.badge(selectedTask.state)}>{selectedTask.state}</span>
              <span style={{fontSize:11,color:PRIORITY_COLORS[selectedTask.priority],fontWeight:700}}>▲ {selectedTask.priority}</span>
              {selectedTask.assignee&&<span style={{fontSize:11,color:c.text2}}>👤 {selectedTask.assignee}</span>}
              {selectedTask.deadline&&<span style={{fontSize:11,color:c.text2}}>📅 {fmtDate(selectedTask.deadline)}</span>}
            </div>
            {selectedTask.description&&<p style={{fontSize:13,color:c.text2,marginBottom:14,lineHeight:1.6,background:c.surface2,padding:"10px 12px",borderRadius:8}}>{selectedTask.description}</p>}
            <div style={{marginBottom:14}}>
              <label style={S.label}>Proyecto</label>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                <button onClick={()=>updateTask(selectedTask.id,{project:""})} style={{background:!selectedTask.project?"#0369a1":c.surface2,color:!selectedTask.project?"#fff":c.text2,border:"none",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>Sin proyecto</button>
                {(settings.projects||DEFAULT_PROJECTS).map(p=>(
                  <button key={p} onClick={()=>updateTask(selectedTask.id,{project:p})} style={{background:selectedTask.project===p?"#0369a1":c.surface2,color:selectedTask.project===p?"#fff":c.text2,border:"none",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>{p}</button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:14}}>
              <label style={S.label}>Estado</label>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {settings.states.map(s=>(
                  <button key={s} onClick={()=>updateTask(selectedTask.id,{state:s})} style={{background:selectedTask.state===s?(STATE_COLORS[s]?.bg||c.accentLight):c.surface2,color:selectedTask.state===s?(STATE_COLORS[s]?.color||c.accent):c.text2,border:"1.5px solid "+(selectedTask.state===s?(STATE_COLORS[s]?.color||c.accent):c.border),borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>{s}</button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:16}}>
              <label style={S.label}>Prioridad</label>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {settings.priorities.map(p=>(
                  <button key={p} onClick={()=>updateTask(selectedTask.id,{priority:p})} style={{background:selectedTask.priority===p?(PRIORITY_COLORS[p]||c.accent):c.surface2,color:selectedTask.priority===p?"#fff":c.text2,border:"none",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>{p}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={S.label}>Notas de avance ({selectedTask.notes?.length||0})</label>
              <div style={{maxHeight:200,overflowY:"auto",marginBottom:10}}>
                {(!selectedTask.notes||selectedTask.notes.length===0)&&<p style={{color:c.text2,fontSize:12,marginBottom:8}}>Sin notas aún</p>}
                {selectedTask.notes?.map((n,i)=>(
                  <div key={i} style={{background:c.surface2,borderLeft:"3px solid "+c.accent,padding:"8px 12px",borderRadius:"0 8px 8px 0",marginBottom:8}}>
                    <div style={{fontSize:10,color:c.text2,marginBottom:3,fontWeight:700}}>📅 {fmtDate(n.date)} · {n.author}</div>
                    <div style={{fontSize:13,lineHeight:1.5}}>{n.text}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:8}}>
                <input style={{...S.input,flex:1}} value={noteInput} onChange={e=>setNoteInput(e.target.value)} placeholder="Agregar nota de avance..." onKeyDown={e=>e.key==="Enter"&&addNote(selectedTask.id)}/>
                <button style={S.btn("primary")} onClick={()=>addNote(selectedTask.id)}>+</button>
              </div>
            </div>
            <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid "+c.border,display:"flex",justifyContent:"flex-end"}}>
              <button style={S.btn("danger")} onClick={()=>deleteTask(selectedTask.id)}>🗑 Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── VOICE HELP PANEL ── */}
      {showVoiceHelp&&(
        <div style={{position:"fixed",bottom:148,right:16,background:c.surface,border:"1px solid "+c.border,borderRadius:14,padding:16,width:290,zIndex:45,boxShadow:"0 8px 24px rgba(0,0,0,0.2)"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
            <span style={{fontWeight:800,fontSize:13}}>🎙 Comandos de voz</span>
            <button onClick={()=>setShowVoiceHelp(false)} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:c.text2}}>✕</button>
          </div>
          {[
            ["Nueva tarea","«nueva tarea llamar al arquitecto Aguamarina urgente»"],
            ["Completar","«completar tarea 1»"],
            ["Iniciar","«iniciar tarea 2»"],
            ["Bloquear","«bloquear tarea 3»"],
            ["Agregar nota","«nota tarea 1 se firmó el contrato hoy»"],
            ["Filtrar proyecto","«mostrar tareas de Turquesa»"],
            ["Navegar","«ir a agenda» / «ir a tareas»"],
            ["Limpiar filtros","«limpiar filtros»"],
          ].map(([label,example])=>(
            <div key={label} style={{marginBottom:9}}>
              <div style={{fontSize:10,fontWeight:700,color:c.accent,textTransform:"uppercase",letterSpacing:0.5}}>{label}</div>
              <div style={{fontSize:11,color:c.text2,fontStyle:"italic",marginTop:1}}>{example}</div>
            </div>
          ))}
          {lastVoiceResult&&(
            <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid "+c.border}}>
              <div style={{fontSize:10,fontWeight:700,color:c.text2}}>ÚLTIMO COMANDO:</div>
              <div style={{fontSize:12,color:c.text,marginTop:2,fontStyle:"italic"}}>"{lastVoiceResult}"</div>
            </div>
          )}
        </div>
      )}

      {/* ── FLOATING VOICE BUTTON ── */}
      <div style={{position:"fixed",bottom:80,right:16,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8,zIndex:40}}>
        <button onClick={()=>setShowVoiceHelp(v=>!v)} style={{background:c.surface,border:"1px solid "+c.border,borderRadius:20,padding:"4px 12px",fontSize:11,cursor:"pointer",color:c.text2,fontFamily:"inherit",boxShadow:"0 2px 8px rgba(0,0,0,0.15)"}}>
          {showVoiceHelp?"✕ cerrar":"? ayuda"}
        </button>
        <button onClick={startVoice} style={{width:56,height:56,borderRadius:"50%",background:listening?"#dc2626":c.accent,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 16px rgba(0,0,0,0.3)",transition:"all 0.2s"}}>
          <span style={{fontSize:22}}>{listening?"⏹":"🎙"}</span>
        </button>
      </div>

      {/* ── BOTTOM NAV ── */}
      <div style={S.bottomNav}>
        {[["dashboard","📊","Inicio"],["tasks","✅","Tareas"],["agenda","📅","Agenda"],["settings","⚙️","Ajustes"]].map(([v,icon,label])=>(
          <button key={v} style={S.bottomBtn(view===v)} onClick={()=>setView(v)}>
            <span style={{fontSize:18}}>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* ── VOICE INDICATOR ── */}
      {listening&&(
        <div style={{position:"fixed",top:64,left:0,right:0,background:"#dc2626",color:"#fff",padding:"10px 16px",textAlign:"center",fontSize:13,fontWeight:700,zIndex:60}}>
          🎙 Escuchando... {voiceTranscript&&"\""+voiceTranscript+"\""}
        </div>
      )}

      {/* ── TOAST ── */}
      {toast&&(
        <div style={{position:"fixed",bottom:90,left:"50%",transform:"translateX(-50%)",background:toast.type==="error"?"#dc2626":c.accent,color:"#fff",padding:"10px 20px",borderRadius:20,fontSize:13,fontWeight:700,zIndex:200,boxShadow:"0 4px 16px rgba(0,0,0,0.2)",whiteSpace:"nowrap",maxWidth:"90vw",textAlign:"center"}}>
          {toast.msg}
        </div>
      )}

      <style>{"*{box-sizing:border-box;}body{margin:0;}"}</style>
    </div>
  );
}
