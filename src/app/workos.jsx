"use client";
import { useState, useEffect, useRef, useCallback } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const APP_NAME = "WorkOS";
const APP_SUBTITLE = "Inmobiliaria · Construcción · Servicios";

const AI_SYSTEM = `Eres WorkOS Assistant, un asistente ejecutivo experto en desarrollo inmobiliario, construcción y servicios inmobiliarios para una empresa integral.
Tienes conocimiento profundo en:
- Desarrollo y gestión de proyectos inmobiliarios (residencial, comercial, industrial)
- Procesos constructivos, presupuestación, cronogramas de obra y control de avance
- Marco legal: escrituración, permisos, factibilidades, licencias de construcción
- Valuación de propiedades, análisis de mercado, due diligence
- Financiamiento: créditos puente, hipotecas, fideicomisos inmobiliarios
- Ventas inmobiliarias, CRM, estrategias de comercialización
- Administración de condominios y propiedades
- Normativa urbanística, uso de suelo, planes de desarrollo urbano
- Contratos: compraventa, arrendamiento, obra, honorarios, asociación en participación

Cuando el usuario dicte por voz, analiza su mensaje e identifica si quiere:
1. Crear una tarea nueva → responde con JSON: {"action":"create_task","data":{...}}
2. Agregar nota a tarea → responde con JSON: {"action":"add_note","taskId":"...","note":"..."}
3. Consulta general → responde con texto normal

Responde siempre en español, de forma concisa y profesional.`;

const DEFAULT_AREAS = ["Desarrollo de Proyectos","Construcción","Ventas y Comercial","Legal y Notaría","Finanzas","Marketing","Postventa","Permisos","Operaciones","Otro"];
const DEFAULT_PRIORITIES = ["Urgente","Alta","Media","Baja"];
const DEFAULT_STATES = ["Pendiente","En progreso","En revisión","Bloqueado","Completado"];
const DEFAULT_TEAM = ["Yo","Sin asignar"];
const DEFAULT_PROJECTS = ["Aguamarina","Turquesa","Moreno 38","Jade"];

const STATE_COLORS = {
  "Pendiente":    { bg:"#fef3c7", color:"#92400e" },
  "En progreso":  { bg:"#dbeafe", color:"#1e40af" },
  "En revisión":  { bg:"#ede9fe", color:"#5b21b6" },
  "Bloqueado":    { bg:"#fee2e2", color:"#991b1b" },
  "Completado":   { bg:"#d1fae5", color:"#065f46" },
};

const PRIORITY_COLORS = {
  "Urgente": "#dc2626",
  "Alta":    "#ea580c",
  "Media":   "#ca8a04",
  "Baja":    "#6b7280",
};

const AREA_BG = {
  "Desarrollo de Proyectos":"#e0f2fe","Construcción":"#fefce8","Ventas y Comercial":"#fce7f3",
  "Legal y Notaría":"#ede9fe","Finanzas":"#d1fae5","Marketing":"#fff7ed","Postventa":"#f0f9ff",
  "Permisos":"#fdf4ff","Operaciones":"#f0fdf4","Otro":"#f8fafc",
};

// ─── STORAGE ──────────────────────────────────────────────────────────────────
const store = {
  get: async (key, fallback) => {
    try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : fallback; }
    catch { return fallback; }
  },
  set: async (key, val) => {
    try { await window.storage.set(key, JSON.stringify(val)); } catch {}
  }
};

// ─── SAMPLE DATA ──────────────────────────────────────────────────────────────
const SAMPLE_TASKS = [
  { id:1, title:"Tramitar licencia de construcción Proyecto Arboleda", area:"Permisos", priority:"Urgente", state:"En progreso", assignee:"Yo", deadline:"2026-06-15", description:"Gestión ante el municipio para obtener la licencia de construcción del proyecto Arboleda fase 1.", notes:[{ id:1, date:"2026-05-10", author:"Yo", text:"Entregada solicitud al municipio con planos firmados." },{ id:2, date:"2026-05-22", author:"Yo", text:"En revisión técnica. Esperamos respuesta en 2 semanas." }], created:"2026-05-01" },
  { id:2, title:"Revisión contrato de obra Torre Sur", area:"Legal y Notaría", priority:"Alta", state:"Pendiente", assignee:"Yo", deadline:"2026-06-01", description:"Revisión y negociación del contrato de obra civil para Torre Sur con el contratista principal.", notes:[], created:"2026-05-15" },
  { id:3, title:"Campaña de lanzamiento Residencial Cumbres", area:"Marketing", priority:"Media", state:"En progreso", assignee:"Sin asignar", deadline:"2026-06-10", description:"Coordinación de campaña digital y presencia en medios para lanzamiento del proyecto Cumbres.", notes:[{ id:1, date:"2026-05-15", author:"Yo", text:"Brief enviado a agencia. Esperamos propuesta esta semana." }], created:"2026-05-10" },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmtDate = d => { if (!d) return ""; const [y,m,day]=d.split("-"); return `${day}/${m}/${y}`; };
const today = () => new Date().toISOString().split("T")[0];
const nowStr = () => new Date().toISOString().split("T")[0];
const uid = () => Date.now() + Math.random().toString(36).slice(2);

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function WorkOS() {
  const [view, setView] = useState("dashboard");
  const [tasks, setTasks] = useState([]);
  const [settings, setSettings] = useState({ areas: DEFAULT_AREAS, priorities: DEFAULT_PRIORITIES, states: DEFAULT_STATES, team: DEFAULT_TEAM, projects: DEFAULT_PROJECTS, darkMode: false });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [filters, setFilters] = useState({ area:"", priority:"", state:"", assignee:"", project:"", search:"" });
  const [newTask, setNewTask] = useState({ title:"", area:"", priority:"Media", state:"Pendiente", assignee:"Yo", deadline:"", description:"", project:"" });
  const [noteInput, setNoteInput] = useState("");
  const [chatMsgs, setChatMsgs] = useState([{ role:"assistant", content:"¡Hola! Soy tu asistente WorkOS. Puedes hablarme por voz, preguntarme sobre tus tareas o pedirme asesoría inmobiliaria. ¿En qué te ayudo?" }]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [gcalEvents, setGcalEvents] = useState([]);
  const [gcalLoading, setGcalLoading] = useState(false);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({ title:"", date:"", time:"", duration:60, desc:"" });
  const [settingsTab, setSettingsTab] = useState("areas");
  const [newItem, setNewItem] = useState("");
  const [toast, setToast] = useState(null);
  const recognitionRef = useRef(null);
  const chatEndRef = useRef(null);

  const dark = settings.darkMode;

  // Load
  useEffect(() => {
    (async () => {
      const [t, s] = await Promise.all([store.get("wos_tasks", SAMPLE_TASKS), store.get("wos_settings", { areas:DEFAULT_AREAS, priorities:DEFAULT_PRIORITIES, states:DEFAULT_STATES, team:DEFAULT_TEAM, projects:DEFAULT_PROJECTS, darkMode:false })]);
      setTasks(t); setSettings(s); setLoaded(true);
    })();
  }, []);

  useEffect(() => { if (loaded) { setSaving(true); store.set("wos_tasks", tasks).then(()=>setTimeout(()=>setSaving(false),700)); }}, [tasks, loaded]);
  useEffect(() => { if (loaded) store.set("wos_settings", settings); }, [settings, loaded]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [chatMsgs]);

  const showToast = (msg, type="success") => { setToast({ msg, type }); setTimeout(()=>setToast(null), 3000); };

  // ── VOICE ──
  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showToast("Tu navegador no soporta reconocimiento de voz","error"); return; }
    const rec = new SR();
    rec.lang = "es-MX"; rec.continuous = false; rec.interimResults = true;
    rec.onstart = () => { setListening(true); setVoiceTranscript(""); };
    rec.onresult = e => { const t = Array.from(e.results).map(r=>r[0].transcript).join(""); setVoiceTranscript(t); };
    rec.onend = () => { setListening(false); if (voiceTranscript||recognitionRef._last) { const txt = recognitionRef._last||voiceTranscript; if(txt.trim()) { setChatInput(txt); handleVoiceSubmit(txt); } } };
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
  };

  const handleVoiceSubmit = async (text) => {
    if (!text.trim()) return;
    setView("chat");
    await sendAIMessage(text);
  };

  useEffect(() => {
    if (voiceTranscript) recognitionRef._last = voiceTranscript;
  }, [voiceTranscript]);

  // ── AI ──
  const sendAIMessage = async (text) => {
    const userMsg = { role:"user", content: text };
    const taskSummary = tasks.filter(t=>t.state!=="Completado").slice(0,10).map(t=>`[${t.id}] ${t.title} | ${t.area} | ${t.state} | ${t.priority}`).join("\n");
    const next = [...chatMsgs, userMsg];
    setChatMsgs(next); setChatInput(""); setChatLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:1000,
          system: AI_SYSTEM + `\n\nTareas activas del usuario:\n${taskSummary}`,
          messages: next.map(m=>({ role:m.role, content:m.content }))
        })
      });
      const data = await res.json();
      const raw = data.content?.map(c=>c.text||"").join("") || "Error al procesar.";
      // Try to detect action JSON
      try {
        const jsonMatch = raw.match(/\{[\s\S]*"action"[\s\S]*\}/);
        if (jsonMatch) {
          const action = JSON.parse(jsonMatch[0]);
          if (action.action === "create_task" && action.data) {
            const t = { id:uid(), notes:[], created:nowStr(), state:"Pendiente", priority:"Media", assignee:"Yo", area:"", deadline:"", description:"", ...action.data };
            setTasks(prev => [t, ...prev]);
            setChatMsgs([...next, { role:"assistant", content:`✅ Tarea creada: **${t.title}**\n\nÁrea: ${t.area||"Sin área"} | Prioridad: ${t.priority}` }]);
            showToast("Tarea creada por voz ✓");
          } else if (action.action === "add_note" && action.taskId) {
            const note = { id:uid(), date:nowStr(), author:"Yo", text:action.note };
            setTasks(prev => prev.map(t => String(t.id)===String(action.taskId) ? {...t, notes:[...t.notes, note]} : t));
            setChatMsgs([...next, { role:"assistant", content:`✅ Nota agregada a la tarea.` }]);
            showToast("Nota agregada ✓");
          } else {
            setChatMsgs([...next, { role:"assistant", content:raw.replace(/\{[\s\S]*\}/,"").trim()||"Listo." }]);
          }
          setChatLoading(false); return;
        }
      } catch {}
      setChatMsgs([...next, { role:"assistant", content:raw }]);
    } catch { setChatMsgs([...next, { role:"assistant", content:"Error de conexión. Intenta de nuevo." }]); }
    setChatLoading(false);
  };

  // ── GCAL ──
  const loadGcalEvents = useCallback(async () => {
    setGcalLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:1000,
          system:"You help fetch Google Calendar events. Use the list_events tool to get events for the next 14 days. Return them as JSON array with fields: id, title, start, end, location.",
          messages:[{ role:"user", content:`Get my calendar events from ${today()} for the next 14 days.` }],
          mcp_servers:[{ type:"url", url:"https://calendarmcp.googleapis.com/mcp/v1", name:"gcal" }]
        })
      });
      const data = await res.json();
      const textBlocks = data.content?.filter(c=>c.type==="text").map(c=>c.text).join("\n") || "";
      const toolResults = data.content?.filter(c=>c.type==="mcp_tool_result") || [];
      let events = [];
      for (const tr of toolResults) {
        try { const parsed = JSON.parse(tr.content?.[0]?.text||"[]"); if(Array.isArray(parsed)) events = parsed; } catch {}
      }
      if (!events.length) {
        try { const m = textBlocks.match(/\[[\s\S]*\]/); if(m) events = JSON.parse(m[0]); } catch {}
      }
      setGcalEvents(events);
    } catch {}
    setGcalLoading(false);
  }, []);

  useEffect(() => { if (view === "agenda") loadGcalEvents(); }, [view]);

  const createGcalEvent = async () => {
    if (!newEvent.title || !newEvent.date) return;
    try {
      const start = newEvent.time ? `${newEvent.date}T${newEvent.time}:00` : newEvent.date;
      await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:500,
          system:"Create Google Calendar events using the create_event tool.",
          messages:[{ role:"user", content:`Create event: "${newEvent.title}" on ${start}, duration ${newEvent.duration} minutes. Description: ${newEvent.desc||""}` }],
          mcp_servers:[{ type:"url", url:"https://calendarmcp.googleapis.com/mcp/v1", name:"gcal" }]
        })
      });
      showToast("Evento creado en Google Calendar ✓");
      setShowNewEvent(false);
      setNewEvent({ title:"", date:"", time:"", duration:60, desc:"" });
      setTimeout(loadGcalEvents, 1500);
    } catch { showToast("Error al crear evento","error"); }
  };

  // ── TASKS ──
  const filteredTasks = tasks.filter(t => {
    if (filters.area && t.area !== filters.area) return false;
    if (filters.priority && t.priority !== filters.priority) return false;
    if (filters.state && t.state !== filters.state) return false;
    if (filters.assignee && t.assignee !== filters.assignee) return false;
    if (filters.project && t.project !== filters.project) return false;
    if (filters.search && !t.title.toLowerCase().includes(filters.search.toLowerCase())) return false;
    return true;
  });

  const addTask = () => {
    if (!newTask.title) return;
    setTasks([{ ...newTask, id:uid(), notes:[], created:nowStr() }, ...tasks]);
    setNewTask({ title:"", area:"", priority:"Media", state:"Pendiente", assignee:"Yo", deadline:"", description:"", project:"" });
    setShowTaskForm(false);
    showToast("Tarea creada ✓");
  };

  const updateTask = (id, updates) => {
    setTasks(tasks.map(t => t.id===id ? {...t,...updates} : t));
    if (selectedTask?.id===id) setSelectedTask(prev=>({...prev,...updates}));
  };

  const addNote = (taskId) => {
    if (!noteInput.trim()) return;
    const note = { id:uid(), date:nowStr(), author:"Yo", text:noteInput.trim() };
    updateTask(taskId, { notes:[...(tasks.find(t=>t.id===taskId)?.notes||[]), note] });
    setSelectedTask(prev => prev ? {...prev, notes:[...prev.notes, note]} : prev);
    setNoteInput("");
    showToast("Nota agregada ✓");
  };

  const deleteTask = (id) => { setTasks(tasks.filter(t=>t.id!==id)); setSelectedTask(null); showToast("Tarea eliminada"); };

  const clearFilter = () => setFilters({ area:"", priority:"", state:"", assignee:"", project:"", search:"" });
  const activeFilters = Object.values(filters).filter(Boolean).length;

  // ── SETTINGS ──
  const addSettingItem = (key) => {
    if (!newItem.trim()) return;
    setSettings(s => ({...s, [key]:[...s[key], newItem.trim()]}));
    setNewItem("");
  };
  const removeSettingItem = (key, i) => setSettings(s => ({...s, [key]:s[key].filter((_,idx)=>idx!==i)}));

  // ── STATS ──
  const urgentCount = tasks.filter(t=>t.priority==="Urgente"&&t.state!=="Completado").length;
  const inProgressCount = tasks.filter(t=>t.state==="En progreso").length;
  const completedCount = tasks.filter(t=>t.state==="Completado").length;
  const blockedCount = tasks.filter(t=>t.state==="Bloqueado").length;

  // ─── THEME ───────────────────────────────────────────────────────────────────
  const c = {
    bg: dark?"#0f172a":"#f1f5f4",
    surface: dark?"#1e293b":"#ffffff",
    surface2: dark?"#334155":"#f8faf9",
    border: dark?"#334155":"#e2e8e4",
    text: dark?"#f1f5f9":"#0f1c14",
    text2: dark?"#94a3b8":"#4b6357",
    accent: "#1a6b3c",
    accentLight: dark?"#166534":"#dcfce7",
    gold: "#b8862a",
    header: dark?"#0f172a":"#0f1c14",
  };

  const S = {
    app: { fontFamily:"'Segoe UI', system-ui, sans-serif", background:c.bg, minHeight:"100vh", color:c.text, fontSize:14 },
    header: { background:c.header, height:56, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 16px", position:"sticky", top:0, zIndex:50, boxShadow:"0 2px 8px rgba(0,0,0,0.3)" },
    logo: { color:"#4ade80", fontWeight:800, fontSize:18, letterSpacing:-0.5 },
    logoSub: { color:"#4b6357", fontSize:9, letterSpacing:2, textTransform:"uppercase", marginTop:-1 },
    nav: { display:"flex", gap:2 },
    navBtn: (a) => ({ background:a?"rgba(74,222,128,0.15)":"transparent", color:a?"#4ade80":"#64748b", border:"none", padding:"7px 11px", borderRadius:6, cursor:"pointer", fontSize:11, fontWeight:700, letterSpacing:0.5, transition:"all 0.15s" }),
    main: { maxWidth:1100, margin:"0 auto", padding:"16px 12px 100px" },
    card: { background:c.surface, borderRadius:12, padding:16, border:`1px solid ${c.border}`, marginBottom:12 },
    statCard: (col) => ({ background:c.surface, borderRadius:12, padding:"14px 16px", border:`2px solid ${col}`, flex:1, minWidth:0 }),
    sTitle: { fontSize:11, fontWeight:700, color:c.text2, letterSpacing:1.5, textTransform:"uppercase", marginBottom:12, paddingBottom:8, borderBottom:`1px solid ${c.border}` },
    badge: (s) => { const cfg=STATE_COLORS[s]||{bg:"#f3f4f6",color:"#374151"}; return { background:cfg.bg, color:cfg.color, borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:700, display:"inline-block" }; },
    priBadge: (p) => ({ width:8, height:8, borderRadius:"50%", background:PRIORITY_COLORS[p]||"#9ca3af", display:"inline-block", marginRight:5, flexShrink:0 }),
    areaBadge: (a) => ({ background:AREA_BG[a]||"#f3f4f6", color:"#374151", borderRadius:4, padding:"2px 7px", fontSize:10, fontWeight:600, display:"inline-block" }),
    btn: (v) => ({
      background: v==="primary"?c.accent:v==="gold"?c.gold:v==="danger"?"#dc2626":v==="ghost"?"transparent":c.surface2,
      color: v==="primary"||v==="gold"||v==="danger"?"#fff":c.text,
      border: v==="ghost"?`1px solid ${c.border}`:"none",
      borderRadius:8, padding:"8px 16px", cursor:"pointer", fontSize:12, fontWeight:700,
      fontFamily:"inherit", transition:"all 0.15s", letterSpacing:0.3
    }),
    input: { width:"100%", background:c.surface2, border:`1px solid ${c.border}`, borderRadius:8, padding:"9px 12px", fontSize:13, fontFamily:"inherit", color:c.text, outline:"none", boxSizing:"border-box" },
    select: { width:"100%", background:c.surface2, border:`1px solid ${c.border}`, borderRadius:8, padding:"9px 12px", fontSize:13, fontFamily:"inherit", color:c.text, boxSizing:"border-box" },
    label: { fontSize:10, fontWeight:700, color:c.text2, display:"block", marginBottom:4, letterSpacing:1, textTransform:"uppercase" },
    modal: { position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", display:"flex", alignItems:"flex-start", justifyContent:"center", zIndex:100, paddingTop:20, overflowY:"auto" },
    modalBox: { background:c.surface, borderRadius:16, padding:20, width:"95%", maxWidth:560, border:`1px solid ${c.border}`, margin:"0 auto 40px" },
    voiceBtn: { position:"fixed", bottom:80, right:16, width:56, height:56, borderRadius:"50%", background:listening?"#dc2626":c.accent, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 16px rgba(0,0,0,0.3)", zIndex:40, transition:"all 0.2s" },
    bottomNav: { position:"fixed", bottom:0, left:0, right:0, background:c.header, borderTop:`1px solid ${c.border}`, display:"flex", zIndex:50 },
    bottomBtn: (a) => ({ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"8px 4px", background:"transparent", border:"none", cursor:"pointer", color:a?"#4ade80":"#64748b", fontSize:9, fontWeight:700, letterSpacing:0.5, gap:3 }),
    fmtRow: { display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:12 },
    filterChip: (active) => ({ background:active?c.accent:"transparent", color:active?"#fff":c.text2, border:`1px solid ${active?c.accent:c.border}`, borderRadius:20, padding:"4px 10px", fontSize:11, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }),
    grid2: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 },
    statsRow: { display:"flex", gap:10, marginBottom:16, overflowX:"auto" },
  };

  if (!loaded) return (
    <div style={{...S.app, display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh"}}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:40, marginBottom:8 }}>🏗</div>
        <div style={{ color:"#4ade80", fontWeight:800, fontSize:20 }}>WorkOS</div>
        <div style={{ color:"#64748b", fontSize:12, marginTop:4 }}>Cargando...</div>
      </div>
    </div>
  );

  return (
    <div style={S.app}>
      {/* HEADER — desktop */}
      <div style={S.header}>
        <div>
          <div style={S.logo}>⬡ {APP_NAME}</div>
          <div style={S.logoSub}>{APP_SUBTITLE}</div>
        </div>
        <nav style={{ ...S.nav, display:"flex" }}>
          {[["dashboard","Dashboard"],["tasks","Tareas"],["agenda","Agenda"],["chat","IA"],["settings","Ajustes"]].map(([v,l])=>(
            <button key={v} style={S.navBtn(view===v)} onClick={()=>setView(v)}>{l}</button>
          ))}
        </nav>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:10, color:saving?"#ca8a04":"#4ade80" }}>{saving?"●  Guardando":"● Guardado"}</span>
          <button onClick={()=>setSettings(s=>({...s,darkMode:!s.darkMode}))} style={{ background:"transparent", border:"none", cursor:"pointer", fontSize:16 }}>{dark?"☀️":"🌙"}</button>
        </div>
      </div>

      <div style={S.main}>

        {/* ── DASHBOARD ── */}
        {view==="dashboard" && (
          <>
            <div style={{ marginBottom:16 }}>
              <h2 style={{ fontSize:20, fontWeight:800, color:c.text, marginBottom:2 }}>Buenos días 👋</h2>
              <p style={{ color:c.text2, fontSize:13 }}>Aquí está el resumen de tu trabajo</p>
            </div>

            <div style={S.statsRow}>
              {[
                { label:"Urgentes", val:urgentCount, col:"#dc2626" },
                { label:"En progreso", val:inProgressCount, col:"#3b82f6" },
                { label:"Bloqueados", val:blockedCount, col:"#f59e0b" },
                { label:"Completados", val:completedCount, col:"#16a34a" },
              ].map(s=>(
                <div key={s.label} style={S.statCard(s.col)}>
                  <div style={{ fontSize:28, fontWeight:900, color:s.col, lineHeight:1 }}>{s.val}</div>
                  <div style={{ fontSize:10, color:c.text2, marginTop:3, letterSpacing:0.5 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Urgent tasks */}
            <div style={S.card}>
              <div style={S.sTitle}>🔴 Urgentes y alta prioridad</div>
              {tasks.filter(t=>["Urgente","Alta"].includes(t.priority)&&t.state!=="Completado").slice(0,5).map(t=>(
                <div key={t.id} onClick={()=>{setSelectedTask(t);setView("tasks");}} style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"10px 0", borderBottom:`1px solid ${c.border}`, cursor:"pointer" }}>
                  <span style={S.priBadge(t.priority)} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:13, color:c.text, marginBottom:3 }}>{t.title}</div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      <span style={S.areaBadge(t.area)}>{t.area||"Sin área"}</span>
                      <span style={S.badge(t.state)}>{t.state}</span>
                      {t.deadline&&<span style={{ fontSize:10, color:c.text2 }}>📅 {fmtDate(t.deadline)}</span>}
                    </div>
                  </div>
                </div>
              ))}
              {tasks.filter(t=>["Urgente","Alta"].includes(t.priority)&&t.state!=="Completado").length===0&&<p style={{ color:c.text2, fontSize:13 }}>✅ Sin urgentes pendientes</p>}
            </div>

            {/* Area breakdown */}
            <div style={S.card}>
              <div style={S.sTitle}>📊 Tareas activas por área</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {settings.areas.map(area=>{
                  const count=tasks.filter(t=>t.area===area&&t.state!=="Completado").length;
                  if(!count) return null;
                  return (
                    <div key={area} onClick={()=>{setFilters({...filters,area});setView("tasks");}} style={{ background:AREA_BG[area]||"#f3f4f6", border:`1px solid ${c.border}`, borderRadius:10, padding:"10px 14px", textAlign:"center", cursor:"pointer", minWidth:90 }}>
                      <div style={{ fontSize:22, fontWeight:900, color:c.text }}>{count}</div>
                      <div style={{ fontSize:10, color:c.text2, marginTop:2 }}>{area}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick add */}
            <div style={S.card}>
              <div style={S.sTitle}>⚡ Acceso rápido</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <button style={S.btn("primary")} onClick={()=>{setView("tasks");setShowTaskForm(true);}}>+ Nueva tarea</button>
                <button style={S.btn("ghost")} onClick={()=>setView("agenda")}>📅 Ver agenda</button>
                <button style={S.btn("ghost")} onClick={()=>setView("chat")}>🤖 Consultar IA</button>
                <button style={{ ...S.voiceBtn, position:"relative", bottom:"auto", right:"auto", width:40, height:40 }} onClick={startVoice}>🎙</button>
              </div>
            </div>
          </>
        )}

        {/* ── TASKS ── */}
        {view==="tasks" && (
          <>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <h2 style={{ fontSize:18, fontWeight:800 }}>Tareas</h2>
              <button style={S.btn("primary")} onClick={()=>setShowTaskForm(true)}>+ Nueva</button>
            </div>

            {/* Search */}
            <input style={{ ...S.input, marginBottom:10 }} placeholder="🔍 Buscar tareas..." value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})} />

            {/* Filters */}
            <div style={{ overflowX:"auto", marginBottom:14 }}>
              <div style={{ display:"flex", gap:6, paddingBottom:6, minWidth:"max-content" }}>
                <button style={S.filterChip(activeFilters>0)} onClick={clearFilter}>{activeFilters>0?`✕ Limpiar (${activeFilters})`:"Filtros"}</button>
                {settings.areas.map(a=><button key={a} style={S.filterChip(filters.area===a)} onClick={()=>setFilters({...filters,area:filters.area===a?"":a})}>{a}</button>)}
              </div>
              <div style={{ display:"flex", gap:6, paddingBottom:4, minWidth:"max-content", marginTop:4 }}>
                {settings.priorities.map(p=><button key={p} style={S.filterChip(filters.priority===p)} onClick={()=>setFilters({...filters,priority:filters.priority===p?"":p})}><span style={{...S.priBadge(p),marginBottom:-1}}/>{p}</button>)}
                {settings.states.map(s=><button key={s} style={S.filterChip(filters.state===s)} onClick={()=>setFilters({...filters,state:filters.state===s?"":s})}>{s}</button>)}
              </div>
              <div style={{ display:"flex", gap:6, paddingBottom:4, minWidth:"max-content", marginTop:4, alignItems:"center" }}>
                <span style={{ fontSize:10, color:"#6b7280", fontWeight:700, letterSpacing:1, textTransform:"uppercase", whiteSpace:"nowrap" }}>🏗 Proyecto:</span>
                {(settings.projects||DEFAULT_PROJECTS).map(p=><button key={p} style={S.filterChip(filters.project===p)} onClick={()=>setFilters({...filters,project:filters.project===p?"":p})}>{p}</button>)}
              </div>
            </div>

            <div style={{ fontSize:11, color:c.text2, marginBottom:10 }}>{filteredTasks.length} tarea{filteredTasks.length!==1?"s":""}</div>

            {/* Task form */}
            {showTaskForm && (
              <div style={{ ...S.card, border:`2px solid ${c.accent}`, marginBottom:14 }}>
                <div style={S.sTitle}>Nueva tarea</div>
                <div style={{ marginBottom:10 }}>
                  <label style={S.label}>Título *</label>
                  <input style={S.input} value={newTask.title} onChange={e=>setNewTask({...newTask,title:e.target.value})} placeholder="¿Qué hay que hacer?" />
                </div>
                <div style={{ ...S.grid2, marginBottom:10 }}>
                  <div><label style={S.label}>Área</label><select style={S.select} value={newTask.area} onChange={e=>setNewTask({...newTask,area:e.target.value})}><option value="">Sin área</option>{settings.areas.map(a=><option key={a}>{a}</option>)}</select></div>
                  <div><label style={S.label}>Prioridad</label><select style={S.select} value={newTask.priority} onChange={e=>setNewTask({...newTask,priority:e.target.value})}>{settings.priorities.map(p=><option key={p}>{p}</option>)}</select></div>
                  <div><label style={S.label}>Estado</label><select style={S.select} value={newTask.state} onChange={e=>setNewTask({...newTask,state:e.target.value})}>{settings.states.map(s=><option key={s}>{s}</option>)}</select></div>
                  <div><label style={S.label}>Asignado a</label><select style={S.select} value={newTask.assignee} onChange={e=>setNewTask({...newTask,assignee:e.target.value})}>{settings.team.map(m=><option key={m}>{m}</option>)}</select></div>
                  <div><label style={S.label}>Fecha límite</label><input type="date" style={S.input} value={newTask.deadline} onChange={e=>setNewTask({...newTask,deadline:e.target.value})} /></div>
                  <div><label style={S.label}>Proyecto</label><select style={S.select} value={newTask.project} onChange={e=>setNewTask({...newTask,project:e.target.value})}><option value="">Sin proyecto</option>{(settings.projects||DEFAULT_PROJECTS).map(p=><option key={p}>{p}</option>)}</select></div>
                </div>
                <div style={{ marginBottom:12 }}><label style={S.label}>Descripción</label><textarea style={{ ...S.input, resize:"vertical", minHeight:60 }} value={newTask.description} onChange={e=>setNewTask({...newTask,description:e.target.value})} placeholder="Detalles del trabajo a realizar..." /></div>
                <div style={{ display:"flex", gap:8 }}>
                  <button style={S.btn("primary")} onClick={addTask}>Guardar</button>
                  <button style={S.btn("ghost")} onClick={()=>setShowTaskForm(false)}>Cancelar</button>
                </div>
              </div>
            )}

            {filteredTasks.length===0 && <div style={{ ...S.card, textAlign:"center", color:c.text2, padding:32 }}>Sin tareas con estos filtros</div>}

            {filteredTasks.map(t=>(
              <div key={t.id} style={{ ...S.card, borderLeft:`3px solid ${PRIORITY_COLORS[t.priority]||"#ccc"}`, cursor:"pointer" }} onClick={()=>setSelectedTask(t)}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:13, marginBottom:5, color:t.state==="Completado"?c.text2:c.text, textDecoration:t.state==="Completado"?"line-through":"none" }}>{t.title}</div>
                    <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                      {t.area&&<span style={S.areaBadge(t.area)}>{t.area}</span>}
                      {t.project&&<span style={{ background:"#e0f2fe", color:"#0369a1", borderRadius:4, padding:"2px 7px", fontSize:10, fontWeight:700 }}>🏗 {t.project}</span>}
                      <span style={S.badge(t.state)}>{t.state}</span>
                      {t.assignee&&t.assignee!=="Sin asignar"&&<span style={{ fontSize:10, color:c.text2 }}>👤 {t.assignee}</span>}
                      {t.deadline&&<span style={{ fontSize:10, color:c.text2 }}>📅 {fmtDate(t.deadline)}</span>}
                      {t.notes?.length>0&&<span style={{ fontSize:10, color:c.text2 }}>💬 {t.notes.length}</span>}
                    </div>
                  </div>
                  <span style={{ color:c.text2, fontSize:16, marginLeft:8 }}>›</span>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── AGENDA ── */}
        {view==="agenda" && (
          <>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <h2 style={{ fontSize:18, fontWeight:800 }}>Agenda</h2>
              <div style={{ display:"flex", gap:8 }}>
                <button style={S.btn("ghost")} onClick={loadGcalEvents}>{gcalLoading?"...":"🔄"}</button>
                <button style={S.btn("primary")} onClick={()=>setShowNewEvent(true)}>+ Evento</button>
              </div>
            </div>

            {gcalLoading && <div style={{ ...S.card, textAlign:"center", color:c.text2 }}>Cargando eventos de Google Calendar...</div>}

            {!gcalLoading && gcalEvents.length===0 && (
              <div style={{ ...S.card, textAlign:"center", padding:28 }}>
                <div style={{ fontSize:32, marginBottom:8 }}>📅</div>
                <div style={{ fontWeight:700, marginBottom:6 }}>Google Calendar conectado</div>
                <div style={{ color:c.text2, fontSize:13, marginBottom:14 }}>No se encontraron eventos en los próximos 14 días, o la sincronización está pendiente.</div>
                <button style={S.btn("primary")} onClick={loadGcalEvents}>Sincronizar</button>
              </div>
            )}

            {gcalEvents.map((ev,i)=>(
              <div key={i} style={{ ...S.card, borderLeft:`3px solid ${c.accent}` }}>
                <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>{ev.title||ev.summary||"Sin título"}</div>
                <div style={{ fontSize:12, color:c.text2, display:"flex", gap:10, flexWrap:"wrap" }}>
                  {ev.start&&<span>📅 {ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleString("es-MX",{dateStyle:"short",timeStyle:"short"}) : ev.start?.date||ev.start}</span>}
                  {ev.location&&<span>📍 {ev.location}</span>}
                </div>
              </div>
            ))}

            {showNewEvent && (
              <div style={S.modal} onClick={()=>setShowNewEvent(false)}>
                <div style={S.modalBox} onClick={e=>e.stopPropagation()}>
                  <div style={{ fontWeight:800, fontSize:16, marginBottom:14 }}>Nuevo evento en Google Calendar</div>
                  <div style={{ marginBottom:10 }}><label style={S.label}>Título *</label><input style={S.input} value={newEvent.title} onChange={e=>setNewEvent({...newEvent,title:e.target.value})} /></div>
                  <div style={{ ...S.grid2, marginBottom:10 }}>
                    <div><label style={S.label}>Fecha *</label><input type="date" style={S.input} value={newEvent.date} onChange={e=>setNewEvent({...newEvent,date:e.target.value})} /></div>
                    <div><label style={S.label}>Hora</label><input type="time" style={S.input} value={newEvent.time} onChange={e=>setNewEvent({...newEvent,time:e.target.value})} /></div>
                  </div>
                  <div style={{ marginBottom:10 }}><label style={S.label}>Descripción</label><input style={S.input} value={newEvent.desc} onChange={e=>setNewEvent({...newEvent,desc:e.target.value})} /></div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button style={S.btn("primary")} onClick={createGcalEvent}>Crear en Google Calendar</button>
                    <button style={S.btn("ghost")} onClick={()=>setShowNewEvent(false)}>Cancelar</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── CHAT / IA ── */}
        {view==="chat" && (
          <div style={{ maxWidth:680, margin:"0 auto" }}>
            <div style={{ marginBottom:14 }}>
              <h2 style={{ fontSize:18, fontWeight:800, marginBottom:2 }}>Asistente IA</h2>
              <p style={{ color:c.text2, fontSize:12 }}>Especializado en inmobiliaria y construcción. Habla por voz o escribe.</p>
            </div>

            <div style={{ ...S.card, minHeight:380, maxHeight:"50vh", overflowY:"auto", display:"flex", flexDirection:"column", gap:12, background:c.surface2 }}>
              {chatMsgs.map((m,i)=>(
                <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
                  <div style={{ background:m.role==="user"?c.accent:c.surface, color:m.role==="user"?"#fff":c.text, borderRadius:m.role==="user"?"14px 14px 4px 14px":"14px 14px 14px 4px", padding:"10px 14px", maxWidth:"85%", fontSize:13, lineHeight:1.6, border:m.role==="assistant"?`1px solid ${c.border}`:"none", whiteSpace:"pre-wrap" }}>
                    {m.content.replace(/\*\*(.*?)\*\*/g,"$1")}
                  </div>
                </div>
              ))}
              {chatLoading&&<div style={{ display:"flex" }}><div style={{ background:c.surface, border:`1px solid ${c.border}`, borderRadius:"14px 14px 14px 4px", padding:"10px 14px", fontSize:13, color:c.text2 }}>Pensando...</div></div>}
              <div ref={chatEndRef}/>
            </div>

            <div style={{ display:"flex", gap:8, marginTop:10 }}>
              <button onClick={startVoice} style={{ ...S.btn(listening?"danger":"ghost"), padding:"9px 14px", fontSize:18, flexShrink:0 }}>{listening?"⏹":"🎙"}</button>
              <input style={{ ...S.input, flex:1 }} value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendAIMessage(chatInput)} placeholder={listening?`Escuchando: ${voiceTranscript||"..."}`:"Escribe o usa el micrófono..."} />
              <button style={{ ...S.btn("primary"), flexShrink:0 }} onClick={()=>sendAIMessage(chatInput)} disabled={chatLoading}>Enviar</button>
            </div>

            {listening&&voiceTranscript&&<div style={{ marginTop:8, padding:"8px 12px", background:c.accentLight, borderRadius:8, fontSize:12, color:c.accent, fontStyle:"italic" }}>🎙 "{voiceTranscript}"</div>}

            <div style={{ marginTop:12, display:"flex", flexWrap:"wrap", gap:6 }}>
              {["¿Qué documentos necesito para una licencia de construcción?","¿Cómo calculo el precio por m²?","Checklist entrega de obra","Cláusulas clave en contrato de compraventa","¿Qué es un fideicomiso inmobiliario?"].map(q=>(
                <button key={q} style={{ background:c.surface2, border:`1px solid ${c.border}`, borderRadius:16, padding:"5px 11px", fontSize:11, cursor:"pointer", color:c.text2, fontFamily:"inherit" }} onClick={()=>sendAIMessage(q)}>{q}</button>
              ))}
            </div>
          </div>
        )}

        {/* ── SETTINGS ── */}
        {view==="settings" && (
          <div style={{ maxWidth:600, margin:"0 auto" }}>
            <h2 style={{ fontSize:18, fontWeight:800, marginBottom:14 }}>Ajustes</h2>

            <div style={{ display:"flex", gap:6, marginBottom:16, overflowX:"auto" }}>
              {[["areas","Áreas"],["priorities","Prioridades"],["states","Estados"],["team","Equipo"],["projects","Proyectos"],["app","App"]].map(([k,l])=>(
                <button key={k} style={S.filterChip(settingsTab===k)} onClick={()=>setSettingsTab(k)}>{l}</button>
              ))}
            </div>

            {settingsTab!=="app" && (
              <div style={S.card}>
                <div style={S.sTitle}>{settingsTab==="areas"?"Áreas de trabajo":settingsTab==="priorities"?"Prioridades":settingsTab==="states"?"Estados de tarea":"Miembros del equipo"}</div>
                {settings[settingsTab].map((item,i)=>(
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:`1px solid ${c.border}` }}>
                    <span style={{ fontSize:13 }}>{item}</span>
                    <button onClick={()=>removeSettingItem(settingsTab,i)} style={{ background:"transparent", border:"none", color:"#dc2626", cursor:"pointer", fontSize:16 }}>×</button>
                  </div>
                ))}
                <div style={{ display:"flex", gap:8, marginTop:12 }}>
                  <input style={{ ...S.input, flex:1 }} value={newItem} onChange={e=>setNewItem(e.target.value)} placeholder="Agregar nuevo..." onKeyDown={e=>e.key==="Enter"&&addSettingItem(settingsTab)} />
                  <button style={S.btn("primary")} onClick={()=>addSettingItem(settingsTab)}>+</button>
                </div>
              </div>
            )}

            {settingsTab==="app" && (
              <div style={S.card}>
                <div style={S.sTitle}>Preferencias de la app</div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 0", borderBottom:`1px solid ${c.border}` }}>
                  <span style={{ fontSize:13 }}>Modo oscuro</span>
                  <button onClick={()=>setSettings(s=>({...s,darkMode:!s.darkMode}))} style={{ background:settings.darkMode?c.accent:c.surface2, border:`1px solid ${c.border}`, borderRadius:20, padding:"4px 16px", cursor:"pointer", fontSize:12, color:settings.darkMode?"#fff":c.text, fontFamily:"inherit" }}>{settings.darkMode?"Activo":"Inactivo"}</button>
                </div>
                <div style={{ padding:"12px 0" }}>
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:6 }}>Google Calendar</div>
                  <div style={{ fontSize:12, color:c.text2 }}>Conectado y activo. Los eventos se sincronizan desde tu cuenta de Google.</div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── TASK DETAIL MODAL ── */}
      {selectedTask && (
        <div style={S.modal} onClick={()=>setSelectedTask(null)}>
          <div style={S.modalBox} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
              <h3 style={{ fontSize:15, fontWeight:800, flex:1, paddingRight:12, color:c.text, lineHeight:1.3 }}>{selectedTask.title}</h3>
              <button onClick={()=>setSelectedTask(null)} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:c.text2 }}>✕</button>
            </div>

            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
              {selectedTask.area&&<span style={S.areaBadge(selectedTask.area)}>{selectedTask.area}</span>}
              {selectedTask.project&&<span style={{ background:"#e0f2fe", color:"#0369a1", borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:700 }}>🏗 {selectedTask.project}</span>}
              <span style={S.badge(selectedTask.state)}>{selectedTask.state}</span>
              <span style={{ fontSize:11, color:PRIORITY_COLORS[selectedTask.priority], fontWeight:700 }}>▲ {selectedTask.priority}</span>
              {selectedTask.assignee&&<span style={{ fontSize:11, color:c.text2 }}>👤 {selectedTask.assignee}</span>}
              {selectedTask.deadline&&<span style={{ fontSize:11, color:c.text2 }}>📅 {fmtDate(selectedTask.deadline)}</span>}
            </div>

            {selectedTask.description&&<p style={{ fontSize:13, color:c.text2, marginBottom:14, lineHeight:1.6, background:c.surface2, padding:"10px 12px", borderRadius:8 }}>{selectedTask.description}</p>}

            {/* Change state */}
            <div style={{ marginBottom:14 }}>
              <label style={S.label}>Estado</label>
              <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                {settings.states.map(s=>(
                  <button key={s} onClick={()=>updateTask(selectedTask.id,{state:s})} style={{ background:selectedTask.state===s?(STATE_COLORS[s]?.bg||c.accentLight):c.surface2, color:selectedTask.state===s?(STATE_COLORS[s]?.color||c.accent):c.text2, border:`1.5px solid ${selectedTask.state===s?(STATE_COLORS[s]?.color||c.accent):c.border}`, borderRadius:6, padding:"5px 10px", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit" }}>{s}</button>
                ))}
              </div>
            </div>

            {/* Change project */}
            <div style={{ marginBottom:14 }}>
              <label style={S.label}>Proyecto</label>
              <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                <button onClick={()=>updateTask(selectedTask.id,{project:""})} style={{ background:!selectedTask.project?"#0369a1":c.surface2, color:!selectedTask.project?"#fff":c.text2, border:"none", borderRadius:6, padding:"5px 10px", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit" }}>Sin proyecto</button>
                {(settings.projects||DEFAULT_PROJECTS).map(p=>(
                  <button key={p} onClick={()=>updateTask(selectedTask.id,{project:p})} style={{ background:selectedTask.project===p?"#0369a1":c.surface2, color:selectedTask.project===p?"#fff":c.text2, border:"none", borderRadius:6, padding:"5px 10px", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit" }}>{p}</button>
                ))}
              </div>
            </div>

            {/* Change priority */}
            <div style={{ marginBottom:16 }}>
              <label style={S.label}>Prioridad</label>
              <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                {settings.priorities.map(p=>(
                  <button key={p} onClick={()=>updateTask(selectedTask.id,{priority:p})} style={{ background:selectedTask.priority===p?PRIORITY_COLORS[p]||c.accent:c.surface2, color:selectedTask.priority===p?"#fff":c.text2, border:"none", borderRadius:6, padding:"5px 10px", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit" }}>{p}</button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label style={S.label}>Notas de avance ({selectedTask.notes?.length||0})</label>
              <div style={{ maxHeight:200, overflowY:"auto", marginBottom:10 }}>
                {(!selectedTask.notes||selectedTask.notes.length===0)&&<p style={{ color:c.text2, fontSize:12, marginBottom:8 }}>Sin notas aún</p>}
                {selectedTask.notes?.map((n,i)=>(
                  <div key={i} style={{ background:c.surface2, borderLeft:`3px solid ${c.accent}`, padding:"8px 12px", borderRadius:"0 8px 8px 0", marginBottom:8 }}>
                    <div style={{ fontSize:10, color:c.text2, marginBottom:3, fontWeight:700 }}>📅 {fmtDate(n.date)} · {n.author}</div>
                    <div style={{ fontSize:13, color:c.text, lineHeight:1.5 }}>{n.text}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <input style={{ ...S.input, flex:1 }} value={noteInput} onChange={e=>setNoteInput(e.target.value)} placeholder="Agregar nota de avance..." onKeyDown={e=>e.key==="Enter"&&addNote(selectedTask.id)} />
                <button style={S.btn("primary")} onClick={()=>addNote(selectedTask.id)}>+</button>
              </div>
            </div>

            <div style={{ marginTop:14, paddingTop:12, borderTop:`1px solid ${c.border}`, display:"flex", justifyContent:"flex-end" }}>
              <button style={S.btn("danger")} onClick={()=>deleteTask(selectedTask.id)}>🗑 Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── FLOATING VOICE BUTTON ── */}
      <button style={S.voiceBtn} onClick={startVoice} title="Hablar con IA">
        <span style={{ fontSize:22 }}>{listening?"⏹":"🎙"}</span>
      </button>

      {/* ── BOTTOM NAV (mobile) ── */}
      <div style={S.bottomNav}>
        {[["dashboard","📊","Inicio"],["tasks","✅","Tareas"],["agenda","📅","Agenda"],["chat","🤖","IA"],["settings","⚙️","Ajustes"]].map(([v,icon,label])=>(
          <button key={v} style={S.bottomBtn(view===v)} onClick={()=>setView(v)}>
            <span style={{ fontSize:18 }}>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* ── TOAST ── */}
      {toast && (
        <div style={{ position:"fixed", bottom:90, left:"50%", transform:"translateX(-50%)", background:toast.type==="error"?"#dc2626":c.accent, color:"#fff", padding:"10px 20px", borderRadius:20, fontSize:13, fontWeight:700, zIndex:200, boxShadow:"0 4px 16px rgba(0,0,0,0.2)", whiteSpace:"nowrap" }}>
          {toast.msg}
        </div>
      )}

      <style>{`* { box-sizing: border-box; } body { margin:0; } @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
}
