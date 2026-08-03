// Demo dataset for LOCAL DEMO MODE (no backend). Shapes match the mapped output
// of liveData.js exactly, so screens render as if the data were live. Enabled by
// the "View demo" button on the login screen (sets localStorage demo_mode=1).
// None of this ships to a real client — it only appears in demo mode.

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const hm  = (min) => {
  const d = new Date(Date.now() - min * 60000);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
};
const C = ['#356E63', '#2E7BA8', '#7A5BB9', '#B6743A', '#C7503B', '#2E9E4F', '#15514B', '#4A6EA8'];

function contact(o) {
  const name = o.profile_name;
  const parts = name.trim().split(' ');
  return {
    id: o.id, wa_id: o.wa_id, profile_name: name,
    firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '',
    company: o.company || '—', jobTitle: o.jobTitle || '—', email: o.email || '',
    phone: o.wa_id, lead_score: o.lead_score ?? 0, lead_status: o.lead_status || 'New',
    source: o.source || '—', attributes: o.attributes || {}, color: o.color,
  };
}

const CONTACTS = [
  contact({ id: 'ct1', wa_id: '+919821045512', profile_name: 'Rohan Mehta', company: 'Weavers D2C', jobTitle: 'Founder', email: 'rohan@weavers.in', lead_score: 82, lead_status: 'Hot', source: 'Click to WhatsApp', color: C[0], attributes: { tags: ['qualified'] } }),
  contact({ id: 'ct2', wa_id: '+919833271900', profile_name: 'Priya Nair', company: 'GreenLeaf Clinics', jobTitle: 'Marketing Head', email: 'priya@greenleaf.in', lead_score: 74, lead_status: 'Warm', source: 'Click to WhatsApp', color: C[2] }),
  contact({ id: 'ct3', wa_id: '+919812554478', profile_name: 'Arjun Sethi', company: 'FitZone Gyms', jobTitle: 'Owner', email: '', lead_score: 60, lead_status: 'Warm', source: 'Meta Lead Ads', color: C[3] }),
  contact({ id: 'ct4', wa_id: '+919845120033', profile_name: 'Neha Kulkarni', company: 'TravelCrest', jobTitle: 'Director', email: 'neha@travelcrest.com', lead_score: 45, lead_status: 'New', source: 'Click to WhatsApp', color: C[1] }),
  contact({ id: 'ct5', wa_id: '+919911002233', profile_name: 'Sameer Khan', company: '—', jobTitle: '—', email: '', lead_score: 20, lead_status: 'New', source: 'Click to WhatsApp', color: C[4] }),
];
const byId = Object.fromEntries(CONTACTS.map(c => [c.id, c]));

// Conversations — shape of getConversationsLive() output.
export const conversations = [
  { id: 'cv1', contact_id: 'ct1', contact: byId.ct1, last_message_at: ago(4),   windowExpiresAt: ago(-1400), windowOpen: true,  unread_count: 2, status: 'open', preview: 'Great, what is your monthly ad spend roughly?', relativeTime: '4 minutes ago',  lastSeen: ago(4) },
  { id: 'cv2', contact_id: 'ct2', contact: byId.ct2, last_message_at: ago(38),  windowExpiresAt: ago(-1360), windowOpen: true,  unread_count: 0, status: 'open', preview: 'We run and manage the ads so the leads are worth your time.', relativeTime: '38 minutes ago', lastSeen: ago(30) },
  { id: 'cv3', contact_id: 'ct3', contact: byId.ct3, last_message_at: ago(95),  windowExpiresAt: ago(-1300), windowOpen: true,  unread_count: 1, status: 'open', preview: 'Do you have a website you can share?', relativeTime: '2 hours ago', lastSeen: ago(90) },
  { id: 'cv4', contact_id: 'ct4', contact: byId.ct4, last_message_at: ago(300), windowExpiresAt: ago(-1100), windowOpen: true,  unread_count: 0, status: 'open', preview: 'Are you running ads at the moment?', relativeTime: '5 hours ago', lastSeen: ago(280) },
  { id: 'cv5', contact_id: 'ct5', contact: byId.ct5, last_message_at: ago(1600),windowExpiresAt: ago(160),   windowOpen: false, unread_count: 0, status: 'open', preview: 'Hi Sameer, this is Saloni from Done For You.', relativeTime: 'a day ago', lastSeen: ago(1590) },
];

const M = (id, direction, body, min, extra = {}) => ({
  id, wa_message_id: 'demo-' + id, direction, type: 'text', body,
  template_name: null, payload: null, media_url: null, media_filename: null,
  status: direction === 'out' ? 'read' : 'received', error: null,
  sent_by: direction === 'out' ? 'Saloni (AI)' : null, created_at: ago(min), timeStr: hm(min), ...extra,
});

// Messages keyed by conversation id — shape of getMessagesLive() output.
export const messages = {
  cv1: [
    M('m1', 'in',  'Hi, saw your ad', 22),
    M('m2', 'out', 'Hi Rohan, this is Saloni from Done For You.\nAre you running ads at the moment?', 21),
    M('m3', 'in',  'Yes, running Meta ads for a few months', 14),
    M('m4', 'out', 'Great, what is your monthly ad spend roughly?', 4),
  ],
  cv2: [
    M('m5', 'in',  'What exactly do you guys do?', 52),
    M('m6', 'out', 'Hi Priya, this is Saloni from Done For You.\nAre you running ads at the moment?', 51),
    M('m7', 'in',  'Not yet, thinking about starting', 44),
    M('m8', 'out', 'That is completely fine, starting and running your ads is exactly what we do. We run and manage the ads so the leads are worth your time.', 38),
  ],
  cv3: [
    M('m9',  'in',  'Interested', 130),
    M('m10', 'out', 'Hi Arjun, this is Saloni from Done For You.\nAre you running ads at the moment?', 129),
    M('m11', 'in',  'yes for my gym', 100),
    M('m12', 'out', 'Do you have a website you can share?', 95),
  ],
  cv4: [
    M('m13', 'in',  'Hello', 305),
    M('m14', 'out', 'Hi Neha, this is Saloni from Done For You.\nAre you running ads at the moment?', 300),
  ],
  cv5: [
    M('m15', 'in',  'hi', 1601),
    M('m16', 'out', 'Hi Sameer, this is Saloni from Done For You.\nAre you running ads at the moment?', 1600),
  ],
};

// People — shape of getPeopleLive() output.
export const people = CONTACTS.map((c, i) => ({
  id: c.id, profile_name: c.profile_name, firstName: c.firstName, lastName: c.lastName,
  phone: c.wa_id, email: c.email, company: c.company, jobTitle: c.jobTitle,
  lead_status: c.lead_status, lead_score: c.lead_score, source: c.source,
  attributes: c.attributes, color: c.color,
  lastContacted: ['4 minutes ago', '38 minutes ago', '2 hours ago', '5 hours ago', 'a day ago'][i] || 'a day ago',
  received: new Date(Date.now() - (i + 1) * 3600000).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }),
  form_uuid: null, formName: null,
}));

// Home stats — shape of getHomeStatsLive() output.
export const homeStats = {
  leadsIn: 128, leadsMonth: 34, conversations: 44, qualified: 19, won: 6,
  sent: 512, received: 337, flowRuns: 61, activeFlows: 3, completedRuns: 47,
  recent: CONTACTS.slice(0, 5).map((c, i) => ({
    id: c.id, name: c.profile_name, source: c.source, status: c.lead_status,
    received: new Date(Date.now() - (i + 1) * 3600000).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }),
  })),
  flows: [
    { id: 'f1', name: 'New lead welcome', status: 'active' },
    { id: 'f2', name: 'No-reply nudge', status: 'active' },
    { id: 'f3', name: 'Re-engagement (30d)', status: 'paused' },
  ],
};

export const settings = {
  id: 1, business_name: 'Done For You', business_number: '+91 88080 80834',
  ai_qualify_enabled: true, notify_new_lead: true, notify_inbound: false,
  pipeline_stages: ['New', 'Cool', 'Warm', 'Hot', 'Won', 'Lost'],
};

export const unreadCount = conversations.reduce((n, c) => n + (c.unread_count || 0), 0);

// Property master (subset of the seeded catalog) for demo mode.
const P = (id, name, area, status, configuration, carpet_size, starting_price, price_min_cr, view, positioning, possession) =>
  ({ id, name, area, status, configuration, carpet_size, starting_price, price_min_cr, view, positioning, possession, active: true });
export const properties = [
  P('p1','Lodha Park Adrina','Worli','RTMI','2, 2.5, 3 BHK','944-1334','8 Cr+',8,'Sea Link / ESB','Premium family luxury','Ready'),
  P('p2','Lodha Bellevue T1','Mahalaxmi','UC','2-5 BHK','877-2960','5 Cr+',5,'Greens + ESB','Value luxury','Jun 2026'),
  P('p3','Lodha Bellevue T3','Mahalaxmi','UC','3-5 BHK','1162-4000','6.9 Cr+',6.9,'Sea + Racecourse','Low-density luxury','Dec 2026'),
  P('p4','L&T Island Cove','Mahim','UC','2-4 BHK','767-2800','3.7 Cr+',3.7,'Sea View','Coastal luxury','2029'),
  P('p5','Lodha Aureus','Sewri','UC','3-4 BHK','1148-2343','4.6 Cr+',4.6,'Waterfront','Investment + luxury','TBD'),
  P('p6','Kalpataru Oceana','Prabhadevi','UC','4 & 5 BHK','2307-3909','22 Cr+',22,'Full Sea','Ultra luxury boutique','Jun 2026'),
  P('p7','Kalpataru Code One','Worli','UC','4 & 5 BHK','3562-4749','30 Cr+',30,'City + Sea','Private mansion living','TBD'),
  P('p8','Runwal 7','Mahalaxmi','UC','2-4 BHK','814-2079','5.6 Cr+',5.6,'Skyline','Luxury high-rise','TBD'),
  P('p9','Runwal Raya','Worli','Launch','3-5 BHK','1700-4500','On Request',null,'Racecourse + Sea','Landmark launch','TBD'),
  P('p10','Lodha Lumis','Wadala','UC','3-4 BHK','952-1768','3.7 Cr+',3.7,'City','Smart luxury','Dec 2028'),
  P('p11','Shapoorji Minerva','Mahalaxmi','RTMI','3.5 & 4 BHK','2019-2136','13 Cr+',13,'Racecourse + Sea','Iconic tower','Ready'),
  P('p12','SP Odyssey','Marine Drive','UC','3 BHK','1533-1797','15 Cr+',15,'Arabian Sea','Boutique elite','TBD'),
  P('p13','Lodha Divino','Matunga','UC','2-4 BHK','820-1680','4 Cr+',4,'City','Family luxury','TBD'),
  P('p14','Embassy Citadel','Worli','UC','3-5 BHK','1840-5560','14 Cr+',14,'Sea + Racecourse','Trophy ultra luxury','2032+'),
];
const byPid = Object.fromEntries(properties.map(p => [p.id, p]));

// Rohan (ct1) was pitched 5, likes 1, is negotiating 1, rejected 3 — the exact
// scenario in the brief, showing statuses kept as history.
export const leadProperties = {
  ct1: [
    { id: 'lp1', property_id: 'p1',  status: 'negotiating', rejection_reason: null,        note: '', property: byPid.p1 },
    { id: 'lp2', property_id: 'p3',  status: 'interested',  rejection_reason: null,        note: '', property: byPid.p3 },
    { id: 'lp3', property_id: 'p6',  status: 'rejected',    rejection_reason: 'budget',    note: '', property: byPid.p6 },
    { id: 'lp4', property_id: 'p7',  status: 'rejected',    rejection_reason: 'budget',    note: '', property: byPid.p7 },
    { id: 'lp5', property_id: 'p12', status: 'rejected',    rejection_reason: 'location',  note: '', property: byPid.p12 },
  ],
};
