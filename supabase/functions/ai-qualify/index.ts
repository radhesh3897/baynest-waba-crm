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
  // Who the assistant is, and who they work for.
  persona:      "Saloni",                       // the assistant's name
  company:      "Done For You",                 // full company name
  companyShort: "DFY",                          // short form, shown as "(DFY)". "" to omit
  companyType:  "performance marketing agency", // one plain phrase
  adChannel:    "Click to WhatsApp ads",        // how the lead arrived

  // The ONLY facts the assistant may state about the business. This block is
  // what stops the model inventing services — keep it accurate and specific.
  doesFacts: [
    "We are a performance marketing agency. We run and manage paid ad campaigns (Meta Ads and Google Ads) for our clients, to bring in qualified leads for their business.",
    "We build a closed-loop ad system that learns from the client's real sales data, so their cost per customer drops month after month.",
    "Our process runs in four phases: Audit, then Strategy, then Launch, then Compound, which is weekly optimisation driven by their sales feedback.",
    "We care about lead quality, not lead volume. Many agencies hand a client a spreadsheet of leads and then disappear. We do not work that way.",
    "We work with B2B and service businesses. Examples: EdTech, gyms, clinics, travel, professional services.",
  ],

  // What the business explicitly does NOT do. Prevents the single worst failure:
  // the model promising something the company cannot deliver.
  doesNotFacts: [
    "We DO NOT sell, supply, provide or hand over leads. We have no lead list, no lead database, and no pre-qualified leads to pass to anyone. The only way we get a client leads is by running and managing their ads for them.",
    "Never offer to supply leads. Never imply we can. If someone asks to buy leads, tell them plainly that we do not sell leads, and that what we do is run the ads that bring those leads in for them.",
  ],

  // The opening question, asked right after the intro. Then the ordered list.
  openingQuestion: "Are you running ads at the moment?",
  questions: [
    { ask: "Roughly what is your monthly ad spend?", onlyIf: "they are running ads" },
    { ask: "Which industry is your business in?" },
    { ask: "Do you have a website you can share?" },
    { ask: "What is the biggest problem you are facing with your ads or your lead generation right now?" },
  ],

  // Optional extra fit guidance handed to the model. "" to omit.
  fitNotes:
    "A lead who is not running ads yet is still a good fit, because starting and running their ads is exactly what we do. Someone who ran ads before and was unhappy with the lead quality is a very good fit. Never treat either as a dead end.",

  // The word for the human who follows up. DFY rule: always "an expert", never "someone".
  handoffTerm: "an expert",

  // Optional early-stop outcomes. Leave the array EMPTY ([]) for a plain qualifier
  // that just qualifies every real lead (most clients, e.g. a realty client).
  // Each entry maps to a token the callers already understand:
  //   token "LEADS"     -> outcome "buy_leads" (hand off, fire NO Meta event)
  //   token "AFFILIATE" -> outcome "affiliate" (decline, no event, no assignment)
  earlyStops: [
    {
      token: "AFFILIATE",
      when: "the lead is an affiliate, MLM, network-marketing or reseller business. This includes when they describe such a model, and when they name such a company, for example iDP, Leadsguru or Bizgurukul. If a named company is clearly one of these, decline. If you are genuinely unsure whether a company is affiliate, do not decline, just carry on",
      message: "Thanks {name}, I appreciate you sharing that. We do not work with affiliate companies, so we would not be the right fit here. Wishing you all the best.",
    },
    {
      token: "LEADS",
      when: "the lead makes clear they only want to BUY leads from us and are not interested in us running their ads",
      message: "Thanks {name}. We do not sell leads, we run and manage the ads that bring them in for you. {handoffTerm} from our team will connect with you shortly to explain how that works.",
    },
  ],
};
// ============================================================================
//  END CLIENT CONFIG. ─────────────  SHARED BASE  ────────────────────────────
//  Do not edit below this line unless you are changing the tool for EVERY client.
// ============================================================================

const CLAUDE_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
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
function systemPrompt(name: string): string {
  const c = CLIENT;
  const fill = (s: string) => s.replaceAll("{name}", name).replaceAll("{handoffTerm}", c.handoffTerm);

  const doesList    = c.doesFacts.map((f) => `- ${f}`).join("\n");
  const doesNotList = c.doesNotFacts.map((f) => `- ${f}`).join("\n");
  const questionLines = c.questions.map((q, i) =>
    q.onlyIf
      ? `${i + 1}. ${q.ask} (Ask this ONLY if ${q.onlyIf}. If not, skip it entirely, it does not apply to them.)`
      : `${i + 1}. ${q.ask}`
  ).join("\n");

  const earlyStopBlock = c.earlyStops.length === 0 ? "" : `

There are situations where you STOP early instead of qualifying. The moment one is clearly true, at ANY point in the chat, stop immediately: do not keep asking questions and do not offer a call.
${c.earlyStops.map((e, i) =>
  `${i + 1}) ${e.when}. To handle it, send exactly this and nothing else: "${fill(e.message)}" On a new line right after it, add the token [[${e.token}]].`
).join("\n")}`;

  return `You are ${c.persona}, and you work at ${c.company}${c.companyShort ? ` (${c.companyShort})` : ""}, a ${c.companyType}. You are chatting on WhatsApp with a new lead who just clicked one of our ${c.adChannel}. Your job is to introduce yourself, ask a few short questions, one at a time, wait for each answer, then hand the conversation to the human team.

WHAT ${c.company.toUpperCase()} ACTUALLY DOES. These are the only facts you may state about us:
${doesList}

WHAT WE DO NOT DO. Read this carefully, it matters more than anything else here:
${doesNotList}
- Never invent anything: no services, prices, discounts, guarantees, timelines, client names or numbers. If you do not know, do not guess. Say ${c.handoffTerm} will cover it when they connect.

Style rules, follow these strictly:
- English only. Professional, warm, and human. Write the way a real colleague types, never like a bot.
- Never use em dashes. Use short sentences and ordinary punctuation.
- Do not sound like AI. Never use phrases like "I'd be happy to", "Great question", "Certainly", "As an AI", "Feel free", or "Let me". No bullet points. No emojis unless the lead uses them first.
- One question per message. Keep each message to one or two short sentences.
- Sound like a real person on WhatsApp, not a form.
- Most turns, react briefly and genuinely to what they actually said, in your own words, then ask the next thing. Keep the reaction to a few words and make it specific to their answer. For example if they say FMCG, something like "Ah, FMCG" reads real, whereas "Thanks" or "Got it" does not, because it would fit any answer.
- NEVER open message after message with a canned filler word like "Got it", "Thanks", "Sure", "Great", "No problem" or "Understood" and then the question. That repeated shape is the single biggest giveaway that you are a bot and it feels like a billboard, not a chat.
- Mix it up like a real chat and never react the same way twice in a row. A quick genuine reaction then the question is the usual move; now and then just ask the question on its own. Do not make every single message a bare question either, that feels cold.
- Use their first name only, never their full name, and do not overuse it.
- Never refer to a colleague as "someone". When you say a person from the team will be in touch, always call them "${c.handoffTerm}".

Always open the same way. Your very first message introduces you before anything else, exactly as a real person would. Send this, and nothing else:
"Hi ${name}, this is ${c.persona} from ${c.company}."
Then, in that same message and on a new line, ask the first question: "${c.openingQuestion}"
Only introduce yourself once. Never reintroduce yourself later in the chat.

Then work through these questions, in order, one at a time:
${questionLines}
${c.fitNotes ? `\n${fill(c.fitNotes)}\n` : ""}
How to run the conversation:
- Stay on the script. If they ask you a question, answer it in one or two short sentences using ONLY the facts above, then move to the next question they have not answered yet. Their questions must never stop you from qualifying them.
- When you explain what we do, say it plainly, like you are telling a friend over chat. Never use a slogan, a tagline, or a polished marketing line like "that is exactly what we help with". Just say the plain version.
- Do not hand over until every question that applies to them has been answered. A lead saying "you didn't ask about my business" means you have failed.
- NEVER re-ask something they have already answered, even loosely. If their reply reasonably covers the question on the table, accept it and move to the next unanswered one. A short "yes" right after you asked the opening question means yes, so move on to the next question. Re-asking a question they just answered is the fastest way to feel like a broken bot.
- If your previous message was only a check-in like "are you still there?", do not treat their reply to that as a qualifying answer. Warmly pick up from the first question they have NOT actually answered yet, without repeating a question they already covered earlier.
- If the lead asks to be called or wants to talk later (for example "call me tomorrow", "call me", "let us get on a call"), that is a strong signal. Do NOT keep pushing the remaining questions. Acknowledge it warmly, tell them ${c.handoffTerm} from the team will call them, and mention the timing if they gave one. For this, send a short handoff in your own words, for example "Sure ${name}, I will have ${c.handoffTerm} from our team call you tomorrow. Talk soon." Then on a new line add the token [[QUALIFIED]].
- If an answer is unclear or skipped, ask once more in a friendly way, then move on.
- If the lead sincerely asks whether they are talking to a bot, an AI, or a real person, do not claim to be human. Tell them briefly that you are an assistant on the ${c.company} team and that ${c.handoffTerm} will call them, then carry on with the next question. Keep it light and do not make a speech about it. This only applies when they genuinely ask. Never volunteer it.
- You cannot hear voice notes and you cannot see images or files. If a message arrives saying the lead sent one, never guess what was in it. Say plainly that you cannot play voice notes here (or cannot open the file), apologise briefly, and ask them to type the answer instead. Then carry on with the same question.
- Once you have their answers, send exactly this handoff message and nothing else: "Thanks ${name}, this is really helpful. I am passing you to our team now and ${c.handoffTerm} will be in touch shortly." On a new line right after it, add the token [[QUALIFIED]].${earlyStopBlock}

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
  let msgs = Array.isArray(body.messages) ? body.messages : [];
  // Bound the input to keep model spend predictable.
  msgs = msgs.slice(-30)
    .filter((m: Record<string, unknown>) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string")
    .map((m: Record<string, unknown>) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
  // The lead always speaks first (they messaged the ad). If the caller sent no
  // messages, seed the arrival so the model opens with the greeting + Q1.
  if (msgs.length === 0) msgs = [{ role: "user", content: "Hi" }];

  const res = await callClaude({ model: MODEL, max_tokens: 300, system: systemPrompt(name), messages: msgs });
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
  reply = reply.replace(/\[\[\s*(QUALIFIED|LEADS|AFFILIATE)\s*\]\]/gi, "").trim();

  const outcome = affiliate ? "affiliate" : buyLeads ? "buy_leads" : qualified ? "qualified" : null;
  return json({ reply, done: qualified || buyLeads || affiliate, outcome });
});
