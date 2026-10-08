import { eventBody, eventId } from "./event.ts";
function equal(a: unknown,b: unknown) { if(JSON.stringify(a)!==JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`); }
Deno.test("3pm IST stays at 09:30 UTC, with lead context and duration",()=>{
 const event=eventBody({title:"Call",due_at:"2026-10-09T15:00:00+05:30",duration_min:30,remind_min_before:10,contacts:{profile_name:"Sample Buyer",wa_id:"+910000000000",lead_status:"Negotiation"}},"Asia/Kolkata");
 equal(event.start.dateTime,"2026-10-09T09:30:00.000Z");equal(event.end.dateTime,"2026-10-09T10:00:00.000Z");
 if(!event.description.includes("Sample Buyer"))throw Error("Lead context missing");
 equal(event.reminders.overrides,[{method:"popup",minutes:10},{method:"popup",minutes:0}]);
 equal("attendees" in event,false);
});
Deno.test("zero-minute alerts are unique and retries use a valid stable ID",()=>{
 equal(eventBody({due_at:"2026-10-09T23:50:00+05:30",duration_min:30,remind_min_before:0},"Asia/Kolkata").reminders.overrides.length,1);
 const id=eventId("00000000-0000-4000-8000-000000000001");
 if(!/^[0-9a-v]{5,1024}$/.test(id))throw Error("Invalid Calendar event ID");
 equal(id,eventId("00000000-0000-4000-8000-000000000001"));
});
