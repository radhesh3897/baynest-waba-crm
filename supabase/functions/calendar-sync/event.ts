export const eventId = (id: string) => `ba${id.replace(/-/g, "")}`;
export function eventBody(r: any, tz: string) {
  const start = new Date(r.due_at);
  const lead = r.contacts?.profile_name || r.contacts?.wa_id || "";
  return {
    summary: r.title,
    description: [r.notes, lead ? `Lead: ${lead}` : "", r.contacts?.wa_id ? `Phone: ${r.contacts.wa_id}` : "", r.contacts?.lead_status ? `Stage: ${r.contacts.lead_status}` : "", "Created from Baynest CRM."].filter(Boolean).join("\n"),
    start: { dateTime: start.toISOString(), timeZone: tz },
    end: { dateTime: new Date(start.getTime() + (r.duration_min ?? 30) * 60000).toISOString(), timeZone: tz },
    reminders: { useDefault: false, overrides: [...new Set([Math.max(0, r.remind_min_before ?? 10), 0])].map(minutes => ({ method: "popup", minutes })) },
  };
}
