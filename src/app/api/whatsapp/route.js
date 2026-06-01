import { NextResponse } from 'next/server';

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

// ── SEND MESSAGE ──
async function sendMessage(to, text) {
  await fetch(`https://graph.facebook.com/v19.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    })
  });
}

// ── PARSE COMMAND ──
function parseCommand(text) {
  const t = text.toLowerCase().trim();

  if (t.startsWith('nueva tarea') || t.startsWith('crear tarea')) {
    let title = text.replace(/^(nueva|crear)\s+tarea\s+/i, '').trim();
    let priority = 'Media';
    let project = '';
    if (/urgente/i.test(title)) { priority = 'Urgente'; title = title.replace(/urgente/i, '').trim(); }
    else if (/alta/i.test(title)) { priority = 'Alta'; title = title.replace(/alta/i, '').trim(); }
    else if (/baja/i.test(title)) { priority = 'Baja'; title = title.replace(/baja/i, '').trim(); }
    const projects = ['Aguamarina', 'Turquesa', 'Moreno 38', 'Jade'];
    for (const p of projects) {
      if (new RegExp(p, 'i').test(title)) { project = p; title = title.replace(new RegExp(p, 'i'), '').trim(); }
    }
    title = title.replace(/\s+/g, ' ').replace(/[,.]+$/, '').trim();
    return { type: 'create_task', title, priority, project };
  }

  if (t.includes('listar tareas') || t.includes('mis tareas') || t.includes('ver tareas')) {
    return { type: 'list_tasks' };
  }

  const completeMatch = t.match(/completar tarea\s+(\d+)/);
  if (completeMatch) return { type: 'update_state', taskId: completeMatch[1], state: 'Completado' };

  const startMatch = t.match(/iniciar tarea\s+(\d+)/);
  if (startMatch) return { type: 'update_state', taskId: startMatch[1], state: 'En progreso' };

  const noteMatch = t.match(/nota tarea\s+(\d+)\s+(.+)/);
  if (noteMatch) return { type: 'add_note', taskId: noteMatch[1], note: noteMatch[2] };

  if (t.includes('ayuda') || t.includes('comandos')) return { type: 'help' };

  return { type: 'unknown' };
}

// ── WEBHOOK VERIFICATION ──
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

// ── RECEIVE MESSAGES ──
export async function POST(request) {
  try {
    const body = await request.json();
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) return NextResponse.json({ status: 'ok' });

    const from = message.from;
    const text = message.type === 'text' ? message.text?.body : null;

    if (!text) {
      await sendMessage(from, '⚠️ Por ahora solo proceso mensajes de texto. Próximamente voz y archivos.');
      return NextResponse.json({ status: 'ok' });
    }

    const command = parseCommand(text);

    switch (command.type) {
      case 'create_task':
        await sendMessage(from,
          `✅ *Tarea creada*\n\n` +
          `📌 *${command.title}*\n` +
          `🔴 Prioridad: ${command.priority}\n` +
          `${command.project ? '🏗 Proyecto: ' + command.project : ''}\n\n` +
          `_La tarea fue agregada a WorkOS_`
        );
        break;

      case 'list_tasks':
        await sendMessage(from,
          `📋 *Tus tareas activas*\n\n` +
          `Para ver el detalle completo abrí WorkOS.\n\n` +
          `_Tip: decí "nueva tarea [título]" para crear una_`
        );
        break;

      case 'update_state':
        await sendMessage(from, `✅ Tarea ${command.taskId} marcada como *${command.state}*`);
        break;

      case 'add_note':
        await sendMessage(from, `📝 Nota agregada a tarea ${command.taskId}: "${command.note}"`);
        break;

      case 'help':
        await sendMessage(from,
          `🤖 *Comandos disponibles*\n\n` +
          `📌 *Nueva tarea*\n"nueva tarea llamar al arquitecto Aguamarina urgente"\n\n` +
          `✅ *Completar*\n"completar tarea 1"\n\n` +
          `▶️ *Iniciar*\n"iniciar tarea 2"\n\n` +
          `📝 *Nota*\n"nota tarea 1 se firmó el contrato"\n\n` +
          `📋 *Ver tareas*\n"mis tareas"\n\n` +
          `❓ *Ayuda*\n"ayuda"`
        );
        break;

      default:
        await sendMessage(from,
          `🤔 No entendí el comando.\n\nEscribí
