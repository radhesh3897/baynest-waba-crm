// ai-qualify — the AI lead-qualification brain. Given the conversation so far,
// returns the next message to send (or the closing line once the script ends).
// Backed by Claude Haiku 4.5. The web playground, the WhatsApp webhook and the
// catch-up job all share this one brain, so the script lives here only.
//
// POST { messages: [{role:"user"|"assistant", content}], name?: string }
//   → { reply: string, done: boolean, outcome: "qualified" | "buy_leads" | "affiliate" | null }
// `done` is true once the script has ended. `outcome` says HOW it ended, and the
// caller must respect the difference: "qualified" is a real prospect (fire the
// Meta conversion event); the optional early-stops hand off WITHOUT firing.
//
// Auth: the project anon key (public) as a bearer — gates casual abuse of the
// paid model without needing a login. Deploy verify_jwt = false.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │  TEMPLATE NOTE                                                            │
// │  Everything a client needs to change lives in the CLIENT block below.    │
// │  The conversation rules, style rules, retry logic and token handling     │
// │  underneath it are the shared base — identical for every client. Do not  │
// │  edit below the "SHARED BASE" line unless you are changing the tool for   │
// │  everyone.                                                                │
// └──────────────────────────────────────────────────────────────────────────┘

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// ============================================================================
//  CLIENT CONFIG  —  EDIT THIS BLOCK PER CLIENT.  Nothing below it should change.
// ============================================================================
// Use {name} anywhere in a message string and it is replaced with the lead's
// first name at runtime.
const CLIENT = {
  // Who the assistant is, and who they work for. Change `persona` freely.
  persona:      "Aditi",
  company:      "Baynest Realty",
  companyShort: "",
  companyType:  "property advisory",
  adChannel:    "property ads",

  // The ONLY facts the assistant may state about the business.
  doesFacts: [
    "We are a property advisory. We help buyers and investors shortlist the right project and we arrange site visits.",
    "We work across South and Central Mumbai micro-markets, including Worli, Mahalaxmi, Prabhadevi, Marine Drive, Sewri, Wadala, Matunga and Mahim.",
    "The projects we represent are from established developers, and cover both ready to move in and under construction options.",
    "An advisor handles pricing, availability, payment plans and recommendations on a call.",
  ],

  // What the assistant must never do. This is the guardrail that matters most.
  doesNotFacts: [
    "NEVER suggest, recommend or volunteer a project. Recommending is the advisor's job, not yours. You may only describe a project the lead names themselves, and only from the project list given to you.",
    "NEVER quote a price, a per square foot rate, an EMI, a payment plan or a discount. If asked, say it depends on the floor, the view and the configuration, and the advisor will share exact pricing on a quick call.",
    "NEVER share brochures, PDFs, floor plans, pricing sheets or RERA numbers.",
    "NEVER compare developers or mention a competing project.",
    "NEVER ask for Aadhaar, PAN, bank details or any financial document.",
    "NEVER promise that a specific unit, floor or view is available. Availability changes daily.",
    "Never invent a project, a figure, an amenity or a possession date. If you do not hold it, say the advisor will cover it on the call.",
    "Never push for a sale. You qualify and book the call; the advisor recommends and closes.",
  ],

  // Manish's spec: pair related questions, never more than two per message.
  openingQuestion: "Is this for you to live in or as an investment, and do you have a project in mind?",
  questionPairs: [
    "Which configuration are you looking for, and what budget range are you working with?",
    "Which location are you looking at, and how soon are you planning to buy: immediately, within a month, or after three months?",
    "Are you leaning towards ready to move in, or under construction?",
  ],

  // Asked only when the lead is clearly not in India.
  nriExtra: "If the lead is an NRI or is clearly based outside India, also ask which country they are in, and offer them a phone call or a video call, whichever suits them better.",

  // Hard limits on every reply. Manish: max 2 short sentences, under 200 chars.
  maxSentences: 2,
  maxChars: 200,

  // Anything off topic gets one polite redirect, not a discussion.
  offTopicRedirect: "I can only help with your property requirement here. Shall we continue?",

  // The close. Always propose a specific time, never an open question.
  handoffMessage: "Based on what you've shared, I'd like to connect you with our advisor who can walk you through the right options, pricing, and availability on a quick call.",
  timeProposal:   "Are you free today evening or tomorrow morning?",

  handoffTerm: "our advisor",

  // Abuse stops the script immediately and hands to a human for review. The
  // token maps to outcome "abusive": the chat is tagged and assigned, and NO
  // conversion event fires, because this is not a prospect signal for Meta.
  earlyStops: [
    {
      token: "ABUSE",
      when: "the lead uses cuss words or abusive language towards you or anyone else",
      message: "I'd like to keep this conversation respectful, so I'll pause here. If you'd like to continue, a Baynest advisor will be happy to assist.",
    },
  ],
};
// ============================================================================
//  END CLIENT CONFIG. ─────────────  SHARED BASE  ────────────────────────────
//  Do not edit below this line unless you are changing the tool for EVERY client.
// ============================================================================

const CLAUDE_KEY  = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MODEL      = Deno.env.get("QUALIFY_MODEL") ?? "claude-haiku-4-5";
// Public project keys accepted as a bearer — gates casual abuse of the paid
// model without a login. The env anon key covers the browser playground; the
// service-role key lets our own edge functions (whatsapp-webhook, catch-up)
// call this brain server-to-server for real leads. If your frontend ships a
// `sb_publishable_...` key instead of a JWT anon key, add it to this set.
const ALLOWED = new Set([
  Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  Deno.env.get("PLAYGROUND_PUBLISHABLE_KEY") ?? "", // optional extra public key
].filter(Boolean));

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

// WhatsApp gives us the full profile name ("Vuranduru Hemanth"). Greeting someone
// by their full name is the fastest way to sound like a bot, so only ever use the
// first name. When WhatsApp sends no profile name the caller falls back to the
// wa_id, and "Hey +918686102075" is worse than not naming them at all.
function firstNameOf(name: string): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first || /^[+\d]/.test(first)) return "there";
  return first;
}

// The qualifier persona + script, assembled from the CLIENT block above and the
// shared rules below. The rules encode months of live-lead fixes; they are the
// same for every client, only the CLIENT variables differ.
// The project list the assistant is allowed to describe. Manish's rule: never
// volunteer a project, but if the lead names one we hold, share its basic
// details from here and nothing else. Fetched once per isolate; a slightly
// stale entry beats adding a DB round trip to every reply.
let _kb: string | null = null;
let _kbAt = 0;
async function projectKnowledge(): Promise<string> {
  if (_kb !== null && Date.now() - _kbAt < 10 * 60_000) return _kb;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/properties?active=eq.true&select=name,developer,area,status,configuration,carpet_size,possession,view&order=name`,
      { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } });
    const rows = await res.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) { _kb = ""; _kbAt = Date.now(); return _kb; }
    const statusWord = (s: string) =>
      s === "RTMI" ? "ready to move in" : s === "UC" ? "under construction" : s === "Launch" ? "new launch" : (s || "");
    _kb = rows.map((r: Record<string, unknown>) => {
      const bits = [
        r.developer ? `by ${r.developer}` : "",
        r.area ? `in ${r.area}` : "",
        statusWord(String(r.status ?? "")),
        r.configuration ? String(r.configuration) : "",
        r.carpet_size ? `${r.carpet_size} sq ft` : "",
        r.possession && r.possession !== "TBD" ? `possession ${r.possession}` : "",
        r.view ? `view: ${r.view}` : "",
      ].filter(Boolean).join(", ");
      return `- ${r.name}: ${bits}`;
    }).join("\n");
    _kbAt = Date.now();
    return _kb;
  } catch (e) {
    console.error("project knowledge fetch failed", e);
    return "";
  }
}

async function systemPrompt(name: string, known: Record<string, unknown> = {}): Promise<string> {
  const c = CLIENT;
  const fill = (s: string) => s.replaceAll("{name}", name).replaceAll("{handoffTerm}", c.handoffTerm);

  const doesList    = c.doesFacts.map((f) => `- ${f}`).join("\n");
  const doesNotList = c.doesNotFacts.map((f) => `- ${f}`).join("\n");
  const pairLines   = c.questionPairs.map((q, i) => `${i + 1}. ${q}`).join("\n");

  const kb = await projectKnowledge();
  const kbBlock = kb
    ? "\n\nPROJECTS YOU MAY DESCRIBE. Only if the lead names one of these first. Share configuration, size, location, status and possession from this list and nothing more. If they name a project that is not on this list, say the advisor will cover it on the call:\n" + kb
    : "";

  // Answers the lead already gave on the ad form. Re-asking these is the
  // fastest way to look like a bot to someone who just filled in a form.
  const knownPairs = Object.entries(known)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(([k, v]) => `- ${k.replace(/[_*]/g, " ").replace(/\?+$/, "").trim()}: ${String(v).replace(/_/g, " ")}`);
  const knownBlock = knownPairs.length === 0 ? ""
    : "\n\nWHAT THEY ALREADY TOLD US on the ad form. Treat every one of these as answered and NEVER ask about any of them again. Use them to skip to what is still missing:\n" + knownPairs.join("\n");

  const earlyStopBlock = c.earlyStops.length === 0 ? "" : `

STOP THE SCRIPT IMMEDIATELY if one of these becomes true, at any point:
${c.earlyStops.map((e, i) =>
  `${i + 1}) ${e.when}. Send exactly this and nothing else: "${fill(e.message)}" On a new line right after it, add the token [[${e.token}]]. Do not continue the conversation after that.`
).join("\n")}`;

  return `You are ${c.persona}, and you work at ${c.company}, a ${c.companyType}. You are chatting on WhatsApp with a lead who came in through our ${c.adChannel}. Your job is to qualify them with a few short paired questions and then book a phone call with ${c.handoffTerm}. You do not sell and you do not recommend.

WHAT ${c.company.toUpperCase()} DOES. These are the only facts you may state about us:
${doesList}

WHAT YOU NEVER DO. This matters more than anything else here:
${doesNotList}${kbBlock}${knownBlock}

LENGTH. Non-negotiable, on every single message:
- Maximum ${c.maxSentences} short sentences, and under ${c.maxChars} characters in total.
- Never send a paragraph. Never use bullet points in a reply.
- If the lead seems confused or says they do not understand, reply with ONE short plain sentence and ONE simple yes or no question. Do not re-explain at length.

Style rules, follow these strictly:
- English only. Warm, professional and calm. You sound like a knowledgeable advisor at a premium firm, never a pushy broker.
- Never use pressure tactics, false urgency or hype. Stay composed and courteous even if the lead is difficult.
- Never use em dashes. Use short sentences and ordinary punctuation.
- Do not sound like AI. Never use phrases like "I would be happy to", "Great question", "Certainly", "As an AI", "Feel free" or "Let me". No emojis unless the lead uses them first.
- Use their first name only, never their full name, and do not overuse it.
- Do not open message after message with a canned filler like "Got it", "Thanks", "Sure" or "Great" and then the question. That repeated shape is the biggest giveaway that you are a bot.
- Never refer to a colleague as "someone". Always say "${c.handoffTerm}".

Always open the same way. Your very first message introduces you before anything else. Send this, and nothing else:
"Hi ${name}, this is ${c.persona} from ${c.company}."
Then, in that same message and on a new line, ask: "${c.openingQuestion}"
Only introduce yourself once. Never reintroduce yourself later.

Then work through these, in order. Each line is ONE message that pairs two related questions. Never ask more than two questions in a message, and always wait for the answer before moving on:
${pairLines}

${fill(c.nriExtra)}

How to run the conversation:
- Stay on the script. If they ask you something, answer in one short sentence using ONLY the facts above, then continue with what is still unanswered.
- NEVER re-ask something they have already answered, even loosely or partially. If their reply covers one half of a pair, ask only the half that is still missing.
- If they name a project, describe it from the project list only. If it is not on the list, say ${c.handoffTerm} will cover it on the call. Never volunteer a project they did not mention.
- If they ask about price, do not give a number. Say it depends on the floor, the view and the configuration, and that ${c.handoffTerm} will share exact pricing on the call.
- If they raise anything unrelated to their property requirement, reply exactly: "${fill(c.offTopicRedirect)}"
- If the lead asks to be called, that is a strong signal. Stop asking the remaining questions, confirm warmly, propose a specific time, and close.
- If an answer is unclear or skipped, ask once more in a friendly way, then move on.
- If the lead sincerely asks whether they are talking to a bot, an AI or a real person, do not claim to be human. Say briefly that you are an assistant on the ${c.company} team and that ${c.handoffTerm} will call them, then carry on. Only when they genuinely ask. Never volunteer it.
- You cannot hear voice notes and you cannot see images or files. If one arrives, never guess what was in it. Say plainly that you cannot open it here and ask them to type the answer instead.

HOW TO CLOSE. Once you have what you need, send this and nothing else:
"${fill(c.handoffMessage)}"
Then on a new line in the same message, propose a specific time exactly like this: "${fill(c.timeProposal)}"
Never ask an open question like "would you like to schedule a call". Always propose a time.
On a new line right after that, add the token [[QUALIFIED]].${earlyStopBlock}

The lead's name is: ${name}.`;
}
// Claude blips occasionally: a 429 when we burst, a 529 when it is overloaded, a
// stray 5xx. Without a retry, one blip means the lead gets NO reply at all. That
// is not hypothetical: a live lead typed "Yes", Claude returned 502, and nothing
// was sent until the catch-up cron rescued them almost three minutes later.
// Two quick retries turn that three minute silence into a two second pause.
// Only transient statuses are retried; a 400 or a 401 is our bug or our key, and
// retrying it just burns time and money.
const TRANSIENT = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);
const BACKOFF_MS = [600, 1600];

async function callClaude(payload: unknown): Promise<Response> {
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    const isLast = attempt === BACKOFF_MS.length;
    if (attempt > 0) await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1]));
    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": CLAUDE_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      // A network-level failure is transient too. Out of attempts, let it throw.
      console.warn(`claude fetch threw on attempt ${attempt + 1}`, e);
      if (isLast) throw e;
      continue;
    }
    // Hand back anything we are done with, INCLUDING a final failure: the caller
    // reads the body to surface Claude's own error message.
    if (res.ok || !TRANSIENT.has(res.status) || isLast) return res;
    console.warn(`claude ${res.status} on attempt ${attempt + 1}/${BACKOFF_MS.length + 1}, retrying`);
    // Only discard a response we are actually retrying past.
    await res.body?.cancel().catch(() => {});
  }
  // Unreachable: the loop always returns or throws on its last pass.
  throw new Error("claude retry loop fell through");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!ALLOWED.has(token)) return json({ error: "Unauthorized" }, 401);
  if (!CLAUDE_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

  const body = await req.json().catch(() => ({}));
  const name = firstNameOf(String(body.name ?? "there")).slice(0, 60);
  // Answers already captured on the ad form, so the script never re-asks them.
  const known = (body.known && typeof body.known === "object") ? body.known as Record<string, unknown> : {};
  let msgs = Array.isArray(body.messages) ? body.messages : [];
  // Bound the input to keep model spend predictable.
  msgs = msgs.slice(-30)
    .filter((m: Record<string, unknown>) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string")
    .map((m: Record<string, unknown>) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
  // The lead always speaks first (they messaged the ad). If the caller sent no
  // messages, seed the arrival so the model opens with the greeting + Q1.
  if (msgs.length === 0) msgs = [{ role: "user", content: "Hi" }];

  const res = await callClaude({ model: MODEL, max_tokens: 300, system: await systemPrompt(name, known), messages: msgs });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("claude error", res.status, data);
    return json({ error: (data?.error?.message as string) || `Claude API ${res.status}` }, 502);
  }

  let reply = ((data?.content as Record<string, unknown>[]) ?? [])
    .filter((b) => b?.type === "text").map((b) => String(b.text ?? "")).join("").trim();

  // Three ways the script can end, and they are NOT the same to us:
  //   qualified - a real prospect. Caller fires the Meta conversion event.
  //   buy_leads - wants to buy leads, not run ads. Caller hands off, no event.
  //   affiliate - an affiliate/MLM/reseller we decline. Caller tags + stops, no
  //               event and no expert hand-off.
  // The early-stop tokens only ever appear if the CLIENT block enabled them.
  const affiliate = /\[\[\s*AFFILIATE\s*\]\]/i.test(reply);
  const qualified = /\[\[\s*QUALIFIED\s*\]\]/i.test(reply);
  const buyLeads  = /\[\[\s*LEADS\s*\]\]/i.test(reply);
  // Abuse: stop, tag, hand to a human. Never a conversion signal for Meta.
  const abusive   = /\[\[\s*ABUSE\s*\]\]/i.test(reply);
  reply = reply.replace(/\[\[\s*(QUALIFIED|LEADS|AFFILIATE|ABUSE)\s*\]\]/gi, "").trim();

  const outcome = abusive ? "abusive" : affiliate ? "affiliate" : buyLeads ? "buy_leads" : qualified ? "qualified" : null;
  return json({ reply, done: qualified || buyLeads || affiliate || abusive, outcome });
});
