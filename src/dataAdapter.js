// ─── Mock Data ────────────────────────────────────────────────────────────────

const NOW = Date.now();
const HOUR = 3600 * 1000;

// ─── Lead Form Definitions ────────────────────────────────────────────────────
// Each form has its own field set, values live in contact.attributes (jsonb)
export const LEAD_FORMS = [
  {
    id: 'form_ca',
    name: 'CA Firm Lead Form',
    pageId: 'dfy-meta-page',
    adAccount: 'DFY Main',
    fields: [
      { key: 'firm_size',       label: 'Firm Size' },
      { key: 'monthly_revenue', label: 'Monthly Revenue' },
      { key: 'city',            label: 'City' },
    ],
    cardFields: ['firm_size', 'monthly_revenue'],
  },
  {
    id: 'form_ivf',
    name: 'IVF Clinic Lead Form',
    pageId: 'dfy-meta-page',
    adAccount: 'DFY Main',
    fields: [
      { key: 'city',               label: 'City' },
      { key: 'treatment_interest', label: 'Treatment Interest' },
      { key: 'age',                label: 'Age' },
    ],
    cardFields: ['treatment_interest', 'city'],
  },
  {
    id: 'form_edtech',
    name: 'EdTech Demo Form',
    pageId: 'dfy-meta-page',
    adAccount: 'DFY Main',
    fields: [
      { key: 'course_interest', label: 'Course Interest' },
      { key: 'budget',          label: 'Budget' },
      { key: 'timeline',        label: 'Timeline' },
    ],
    cardFields: ['course_interest', 'budget'],
  },
];

// ─── Contacts ─────────────────────────────────────────────────────────────────
// lead_status: New | Cool | Warm | Hot | Won | Lost
// attributes: form-specific field values (keyed by field.key)

const CONTACTS_RAW = [
  // ── CA Firm leads ──────────────────────────────────────────────────────────
  {
    id: 'rohan', wa_id: '+919820011234', profile_name: 'Rohan Mehta',
    firstName: 'Rohan', lastName: 'Mehta', company: 'Weavers & Artisans',
    jobTitle: 'Founder', email: 'rohan@weaversartisans.in', phone: '+91 98200 11234',
    lead_score: 72, lead_status: 'Follow Up', source: 'Meta Ads', color: '#356E63',
    form_id: 'form_ca', last_inbound_at: new Date(NOW - 5 * 60000).toISOString(),
    attributes: { firm_size: '28 employees', monthly_revenue: '₹18L/mo', city: 'Mumbai' },
  },
  {
    id: 'priya', wa_id: '+919930055890', profile_name: 'Priya Nair',
    firstName: 'Priya', lastName: 'Nair', company: 'TalentZ',
    jobTitle: 'Head of Growth', email: 'priya.nair@talentz.io', phone: '+91 99300 55890',
    lead_score: 58, lead_status: 'Attempted', source: 'LinkedIn Ads', color: '#B6743A',
    form_id: 'form_ca', last_inbound_at: new Date(NOW - 2 * 24 * HOUR).toISOString(),
    attributes: { firm_size: '5 employees', monthly_revenue: '₹3L/mo', city: 'Pune' },
  },
  {
    id: 'arjun', wa_id: '+919876533210', profile_name: 'Arjun Shah',
    firstName: 'Arjun', lastName: 'Shah', company: 'Hobfit',
    jobTitle: 'Co-founder', email: 'arjun@hobfit.fit', phone: '+91 98765 33210',
    lead_score: 81, lead_status: 'Contacted', source: 'Website Form', color: '#356E63',
    form_id: 'form_ca', last_inbound_at: new Date(NOW - 5 * HOUR).toISOString(),
    attributes: { firm_size: '8 employees', monthly_revenue: '₹6L/mo', city: 'Ahmedabad' },
  },
  {
    id: 'aisha', wa_id: '+919740088123', profile_name: 'Aisha Khan',
    firstName: 'Aisha', lastName: 'Khan', company: 'Cloud9 Interiors',
    jobTitle: 'Director', email: 'aisha@cloud9interiors.in', phone: '+91 97400 88123',
    lead_score: 69, lead_status: 'New', source: 'Meta Ads', color: '#B6743A',
    form_id: 'form_ca', last_inbound_at: new Date(NOW - 6 * HOUR).toISOString(),
    attributes: { firm_size: '15 employees', monthly_revenue: '₹12L/mo', city: 'Bangalore' },
  },
  {
    id: 'karan', wa_id: '+919811009988', profile_name: 'Karan Joshi',
    firstName: 'Karan', lastName: 'Joshi', company: 'Joshi & Co.',
    jobTitle: 'Managing Partner', email: 'karan@joshico.in', phone: '+91 98110 09988',
    lead_score: 41, lead_status: 'New', source: 'Meta Ads', color: '#7A5BB9',
    form_id: 'form_ca', last_inbound_at: new Date(NOW - 20 * 60000).toISOString(),
    attributes: { firm_size: '6 employees', monthly_revenue: '₹2.5L/mo', city: 'Delhi' },
  },
  {
    id: 'divya', wa_id: '+917778889991', profile_name: 'Divya Patel',
    firstName: 'Divya', lastName: 'Patel', company: 'Patel Associates',
    jobTitle: 'Senior CA', email: 'divya@patelassociates.in', phone: '+91 77788 89991',
    lead_score: 90, lead_status: 'Booked', source: 'Meta Ads', color: '#2E7BA8',
    form_id: 'form_ca', last_inbound_at: new Date(NOW - 5 * 24 * HOUR).toISOString(),
    attributes: { firm_size: '22 employees', monthly_revenue: '₹15L/mo', city: 'Ahmedabad' },
  },

  // ── IVF Clinic leads ───────────────────────────────────────────────────────
  {
    id: 'vikram', wa_id: '+919811123456', profile_name: 'Vikram Rao',
    firstName: 'Vikram', lastName: 'Rao', company: 'NorthStar Retail',
    jobTitle: 'Owner', email: 'vikram@northstarretail.in', phone: '+91 98111 23456',
    lead_score: 45, lead_status: 'Lost', source: 'Referral', color: '#356E63',
    form_id: 'form_ivf', last_inbound_at: new Date(NOW - 3 * 24 * HOUR).toISOString(),
    attributes: { city: 'Delhi', treatment_interest: 'IUI', age: '31' },
  },
  {
    id: 'sunita', wa_id: '+919988776655', profile_name: 'Sunita Kapoor',
    firstName: 'Sunita', lastName: 'Kapoor', company: '-',
    jobTitle: '-', email: 'sunita.kapoor@gmail.com', phone: '+91 99887 76655',
    lead_score: 78, lead_status: 'Follow Up', source: 'Meta Ads', color: '#C7503B',
    form_id: 'form_ivf', last_inbound_at: new Date(NOW - 40 * 60000).toISOString(),
    attributes: { city: 'Mumbai', treatment_interest: 'IVF', age: '36' },
  },
  {
    id: 'anjali', wa_id: '+919977112233', profile_name: 'Anjali Singh',
    firstName: 'Anjali', lastName: 'Singh', company: '-',
    jobTitle: '-', email: 'anjali.singh@gmail.com', phone: '+91 99771 12233',
    lead_score: 63, lead_status: 'Contacted', source: 'Meta Ads', color: '#7A5BB9',
    form_id: 'form_ivf', last_inbound_at: new Date(NOW - 3 * HOUR).toISOString(),
    attributes: { city: 'Delhi', treatment_interest: 'IVF', age: '33' },
  },
  {
    id: 'ramesh', wa_id: '+919855443322', profile_name: 'Ramesh Kulkarni',
    firstName: 'Ramesh', lastName: 'Kulkarni', company: '-',
    jobTitle: '-', email: 'ramesh.k@gmail.com', phone: '+91 98554 43322',
    lead_score: 50, lead_status: 'Attempted', source: 'Meta Ads', color: '#356E63',
    form_id: 'form_ivf', last_inbound_at: new Date(NOW - 8 * HOUR).toISOString(),
    attributes: { city: 'Bangalore', treatment_interest: 'ICSI', age: '38' },
  },
  {
    id: 'kavita', wa_id: '+919666554433', profile_name: 'Kavita Mehta',
    firstName: 'Kavita', lastName: 'Mehta', company: '-',
    jobTitle: '-', email: 'kavita.m@gmail.com', phone: '+91 96665 54433',
    lead_score: 55, lead_status: 'New', source: 'Meta Ads', color: '#2E7BA8',
    form_id: 'form_ivf', last_inbound_at: new Date(NOW - 90 * 60000).toISOString(),
    attributes: { city: 'Pune', treatment_interest: 'IVF', age: '35' },
  },
  {
    id: 'prerna', wa_id: '+919432198765', profile_name: 'Prerna Shah',
    firstName: 'Prerna', lastName: 'Shah', company: '-',
    jobTitle: '-', email: 'prerna.shah@gmail.com', phone: '+91 94321 98765',
    lead_score: 85, lead_status: 'Booked', source: 'Meta Ads', color: '#2E9E4F',
    form_id: 'form_ivf', last_inbound_at: new Date(NOW - 6 * 24 * HOUR).toISOString(),
    attributes: { city: 'Mumbai', treatment_interest: 'IUI', age: '31' },
  },

  // ── EdTech leads ───────────────────────────────────────────────────────────
  {
    id: 'sneha', wa_id: '+919004077612', profile_name: 'Sneha Kulkarni',
    firstName: 'Sneha', lastName: 'Kulkarni', company: 'GrowthLabs',
    jobTitle: 'Marketing Lead', email: 'sneha@growthlabs.co', phone: '+91 90040 77612',
    lead_score: 64, lead_status: 'Contacted', source: 'Google Ads', color: '#7A5BB9',
    form_id: 'form_edtech', last_inbound_at: new Date(NOW - 24 * HOUR).toISOString(),
    attributes: { course_interest: 'Digital Marketing', budget: '₹40,000', timeline: '6 months' },
  },
  {
    id: 'amit', wa_id: '+919123456780', profile_name: 'Amit Verma',
    firstName: 'Amit', lastName: 'Verma', company: 'Freelancer',
    jobTitle: '-', email: 'amit.verma@gmail.com', phone: '+91 91234 56780',
    lead_score: 82, lead_status: 'Follow Up', source: 'Meta Ads', color: '#C7503B',
    form_id: 'form_edtech', last_inbound_at: new Date(NOW - 2 * HOUR).toISOString(),
    attributes: { course_interest: 'Data Science', budget: '₹75,000', timeline: '1 month' },
  },
  {
    id: 'tarun', wa_id: '+919988001122', profile_name: 'Tarun Gupta',
    firstName: 'Tarun', lastName: 'Gupta', company: '-',
    jobTitle: '-', email: 'tarun.g@gmail.com', phone: '+91 99880 01122',
    lead_score: 37, lead_status: 'New', source: 'Meta Ads', color: '#356E63',
    form_id: 'form_edtech', last_inbound_at: new Date(NOW - 30 * 60000).toISOString(),
    attributes: { course_interest: 'Full Stack Dev', budget: '₹60,000', timeline: 'ASAP' },
  },
  {
    id: 'priyanka', wa_id: '+919800112233', profile_name: 'Priyanka Singh',
    firstName: 'Priyanka', lastName: 'Singh', company: '-',
    jobTitle: '-', email: 'priyanka.s@gmail.com', phone: '+91 98001 12233',
    lead_score: 53, lead_status: 'Attempted', source: 'Meta Ads', color: '#7A5BB9',
    form_id: 'form_edtech', last_inbound_at: new Date(NOW - 12 * HOUR).toISOString(),
    attributes: { course_interest: 'Python', budget: '₹35,000', timeline: '6 months' },
  },
];

// mutable copy for lead_status drag-and-drop updates
let _contacts = CONTACTS_RAW.map(c => ({ ...c }));

const CONVERSATIONS = [
  { id: 'conv-rohan',  contact_id: 'rohan',  last_message_at: new Date(NOW - 2 * 60000).toISOString(),        window_expires_at: new Date(NOW + 23 * HOUR + 59 * 60000 + 12000).toISOString(), unread_count: 2, status: 'open',   preview: 'Sounds good, can you share the pricing for the Scale plan?' },
  { id: 'conv-priya',  contact_id: 'priya',  last_message_at: new Date(NOW - 2 * 24 * HOUR).toISOString(),    window_expires_at: new Date(NOW - 2 * HOUR).toISOString(),                         unread_count: 0, status: 'open',   preview: 'Thanks, will review the proposal and revert.' },
  { id: 'conv-arjun',  contact_id: 'arjun',  last_message_at: new Date(NOW - 5 * HOUR).toISOString(),         window_expires_at: new Date(NOW + 19 * HOUR).toISOString(),                        unread_count: 0, status: 'open',   preview: 'Great, let us book a call for Thursday.' },
  { id: 'conv-sneha',  contact_id: 'sneha',  last_message_at: new Date(NOW - 24 * HOUR).toISOString(),        window_expires_at: new Date(NOW + 1 * HOUR).toISOString(),                         unread_count: 1, status: 'open',   preview: 'What is the minimum ad spend you work with?' },
  { id: 'conv-vikram', contact_id: 'vikram', last_message_at: new Date(NOW - 3 * 24 * HOUR).toISOString(),    window_expires_at: new Date(NOW - 51 * HOUR).toISOString(),                        unread_count: 0, status: 'closed', preview: 'Okay noted, talk next week.' },
  { id: 'conv-aisha',  contact_id: 'aisha',  last_message_at: new Date(NOW - 6 * HOUR).toISOString(),         window_expires_at: new Date(NOW + 18 * HOUR).toISOString(),                        unread_count: 0, status: 'open',   preview: 'Can you also run our Google Ads?' },
];

const MESSAGES = {
  'conv-rohan': [
    { id: 'm1', wa_message_id: 'wamid-r1', direction: 'out', type: 'template', template_name: 'opt_in_message', body: 'Hi Rohan 👋 Thanks for your interest in Done For You. We build fully-automated lead engines that pipe qualified leads straight into your CRM. Want to see how we got Weavers-style D2C brands to 4x ROAS?', status: 'read', sent_by: 'Aarti (DFY)', created_at: new Date(NOW - 24 * HOUR - 58 * 60000).toISOString() },
    { id: 'm2', wa_message_id: 'wamid-r2', direction: 'in',  type: 'text', body: 'Yes, interested. We are spending on Meta but leads are mostly junk.', status: 'received', sent_by: null, created_at: new Date(NOW - 24 * HOUR - 46 * 60000).toISOString() },
    { id: 'm3', wa_message_id: 'wamid-r3', direction: 'out', type: 'text', body: 'That is exactly what we fix, qualified leads only, auto-scored and delivered instantly. Not general timepass leads.', status: 'read', sent_by: 'Aarti (DFY)', created_at: new Date(NOW - 24 * HOUR - 40 * 60000).toISOString() },
    { id: 'm4', wa_message_id: 'wamid-r4', direction: 'in',  type: 'text', body: 'Sounds good, can you share the pricing for the Scale plan?', status: 'received', sent_by: null, created_at: new Date(NOW - 2 * 60000).toISOString() },
  ],
  'conv-priya': [
    { id: 'm5', wa_message_id: 'wamid-p1', direction: 'in',  type: 'text', body: 'Hi, saw your case study on TalentZ-style hiring brands. Curious about CPL improvements.', status: 'received', sent_by: null, created_at: new Date(NOW - 2 * 24 * HOUR - 90 * 60000).toISOString() },
    { id: 'm6', wa_message_id: 'wamid-p2', direction: 'out', type: 'text', body: 'We typically bring CPLs down ~40% in the first 60 days while keeping lead quality high. Happy to share a proposal.', status: 'read', sent_by: 'Aarti (DFY)', created_at: new Date(NOW - 2 * 24 * HOUR - 79 * 60000).toISOString() },
    { id: 'm7', wa_message_id: 'wamid-p3', direction: 'in',  type: 'text', body: 'Thanks, will review the proposal and revert.', status: 'received', sent_by: null, created_at: new Date(NOW - 2 * 24 * HOUR - 58 * 60000).toISOString() },
  ],
  'conv-arjun': [
    { id: 'm8',  wa_message_id: 'wamid-a1', direction: 'in',  type: 'text', body: 'Your Hobfit results slide was wild, 5x constant ROI. Is that repeatable for a fitness D2C?', status: 'received', sent_by: null, created_at: new Date(NOW - 5 * HOUR + 10 * 60000).toISOString() },
    { id: 'm9',  wa_message_id: 'wamid-a2', direction: 'out', type: 'text', body: 'Repeatable when the offer + follow-up loop are tight. We handle both. Real revenue, not vanity metrics.', status: 'read', sent_by: 'Aarti (DFY)', created_at: new Date(NOW - 5 * HOUR + 18 * 60000).toISOString() },
    { id: 'm10', wa_message_id: 'wamid-a3', direction: 'in',  type: 'text', body: 'Great, let us book a call for Thursday.', status: 'received', sent_by: null, created_at: new Date(NOW - 5 * HOUR + 25 * 60000).toISOString() },
  ],
  'conv-sneha': [
    { id: 'm11', wa_message_id: 'wamid-s1', direction: 'in',  type: 'text', body: 'Hi! We are a B2B SaaS doing LinkedIn ads. Do you handle that channel too?', status: 'received', sent_by: null, created_at: new Date(NOW - 24 * HOUR - 20 * 60000).toISOString() },
    { id: 'm12', wa_message_id: 'wamid-s2', direction: 'out', type: 'text', body: 'Yes, Meta, Google and LinkedIn. We pick the channel where your buyers actually are.', status: 'delivered', sent_by: 'Aarti (DFY)', created_at: new Date(NOW - 24 * HOUR - 8 * 60000).toISOString() },
    { id: 'm13', wa_message_id: 'wamid-s3', direction: 'in',  type: 'text', body: 'What is the minimum ad spend you work with?', status: 'received', sent_by: null, created_at: new Date(NOW - 24 * HOUR + 1 * 60000).toISOString() },
  ],
  'conv-vikram': [
    { id: 'm14', wa_message_id: 'wamid-v1', direction: 'in',  type: 'text', body: 'Interested but tight on budget this quarter.', status: 'received', sent_by: null, created_at: new Date(NOW - 3 * 24 * HOUR + 10 * 60000).toISOString() },
    { id: 'm15', wa_message_id: 'wamid-v2', direction: 'out', type: 'text', body: 'Understood. We have a Launch tier built for exactly that. Reach out when ready.', status: 'read', sent_by: 'Aarti (DFY)', created_at: new Date(NOW - 3 * 24 * HOUR + 25 * 60000).toISOString() },
    { id: 'm16', wa_message_id: 'wamid-v3', direction: 'in',  type: 'text', body: 'Okay noted, talk next week.', status: 'received', sent_by: null, created_at: new Date(NOW - 3 * 24 * HOUR + 30 * 60000).toISOString() },
  ],
  'conv-aisha': [
    { id: 'm17', wa_message_id: 'wamid-ai1', direction: 'in',  type: 'text', body: 'Loved the automated follow-up idea. We lose leads because we reply late.', status: 'received', sent_by: null, created_at: new Date(NOW - 6 * HOUR + 10 * 60000).toISOString() },
    { id: 'm18', wa_message_id: 'wamid-ai2', direction: 'out', type: 'text', body: 'Instant CRM delivery + instant sales notification fixes exactly that. Fast follow-up wins.', status: 'read', sent_by: 'Aarti (DFY)', created_at: new Date(NOW - 6 * HOUR + 24 * 60000).toISOString() },
    { id: 'm19', wa_message_id: 'wamid-ai3', direction: 'in',  type: 'text', body: 'Can you also run our Google Ads?', status: 'received', sent_by: null, created_at: new Date(NOW - 6 * HOUR + 31 * 60000).toISOString() },
  ],
};

const TEMPLATES = [
  { id: 't1', name: 'opt_in_message',                  language: 'en', category: 'Marketing',  status: 'Approved', body: 'Hi 👋 Thanks for your interest in Done For You. Reply YES to get growth tips, case studies and offers built for brands like yours.' },
  { id: 't2', name: 'opt_out_message',                 language: 'en', category: 'Utility',    status: 'Approved', body: 'You have been unsubscribed. You will no longer receive marketing messages from Done For You. Reply START to opt back in anytime.' },
  { id: 't3', name: 'utility_approved_message',        language: 'en', category: 'Utility',    status: 'Approved', body: 'Your request has been received. Our team will reach out within 24 hours with the next steps for your campaign.' },
  { id: 't4', name: '1st_msg_cheap_leads_nurturing',   language: 'en', category: 'Marketing',  status: 'Approved', body: 'Spending on ads but getting junk leads? We build automated lead engines that deliver qualified leads straight to your CRM. Want a quick teardown?' },
  { id: 't5', name: 'cheap_leads_nurturing_message_1', language: 'en', category: 'Marketing',  status: 'Approved', body: 'Quick follow-up, most brands we work with see 40% lower CPLs in 60 days. Want me to share how that maps to your numbers?' },
  { id: 't6', name: 'utility_2',                       language: 'en', category: 'Utility',    status: 'Approved', body: 'Your demo is confirmed. We have sent a calendar invite to your email. Reply RESCHEDULE if the time does not work.' },
  { id: 't7', name: 'festive_offer_oct',               language: 'en', category: 'Marketing',  status: 'Pending',  body: 'Festive season is peak buying time. Lock in your ad budget now and we will have your lead engine live before the rush. Limited slots.' },
];

const SEQUENCES = [
  { id: 'seq1', name: 'Lead Comes: First Message', status: 'active', exit_on_reply: true,  trigger_type: 'on_new_contact', enrollments: 1284 },
  { id: 'seq2', name: 'Cheap-Leads Nurture',        status: 'active', exit_on_reply: true,  trigger_type: 'manual',         enrollments: 689 },
  { id: 'seq3', name: 'Re-engage Cold',             status: 'draft',  exit_on_reply: true,  trigger_type: 'manual',         enrollments: 0 },
  { id: 'seq4', name: 'Demo Booked: Reminder',     status: 'paused', exit_on_reply: false, trigger_type: 'manual',         enrollments: 322 },
  { id: 'seq5', name: 'Post-Call Follow-up',        status: 'active', exit_on_reply: true,  trigger_type: 'manual',         enrollments: 460 },
];

// ─── Lead Sources ─────────────────────────────────────────────────────────────
export const LEAD_SOURCES = [
  { key: 'Meta Ads',    label: 'Meta Ads',    icon: '📣' },
  { key: 'Google Ads',  label: 'Google Ads',  icon: '🔍' },
  { key: 'Referral',    label: 'Referral',    icon: '🤝' },
  { key: 'A2A',         label: 'A2A',         icon: '🔗' },
  { key: 'WhatsApp',    label: 'WhatsApp',    icon: '💬' },
  { key: 'Organic',     label: 'Organic',     icon: '🌱' },
  { key: 'Direct',      label: 'Direct',      icon: '🎯' },
  { key: 'Other',       label: 'Other',       icon: '📌' },
];

const AVATAR_COLORS = ['#356E63','#2E7BA8','#7A5BB9','#B6743A','#C7503B','#2E9E4F','#15514B','#4A6EA8'];
let _leadIdCounter = 1000;

// ─── In-memory state for mutations ────────────────────────────────────────────
let _messages = { ...MESSAGES };
let _conversations = [...CONVERSATIONS];
let _msgIdCounter = 100;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function relativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'a few seconds ago';
  const m = Math.floor(s / 60);
  if (m < 60) return m === 1 ? '1 minute ago' : `${m} minutes ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? '1 hour ago' : `${h} hours ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'a day ago';
  if (d < 7) return `${d} days ago`;
  return new Date(isoString).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function msgTime(isoString) {
  const d = new Date(isoString);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const isYesterday = new Date(now - 86400000).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (isToday) return time;
  if (isYesterday) return `Yesterday ${time}`;
  return d.toLocaleDateString('en-IN', { weekday: 'short' }) + ' ' + time;
}

// ─── Adapter API ──────────────────────────────────────────────────────────────

export function getHomeStats() {
  return {
    funnel: {
      leadsIn: 847,
      conversationsStarted: 612,
      qualified: 284,
      booked: 89,
    },
    delivery: {
      sent: 18420,
      delivered: 17656,
      read: 14892,
      replied: 3726,
    },
    cost: {
      marketing: 28450,
      utility: 4200,
      service: 0,
    },
    failed: {
      total: 764,
      frequencyCapped: 312,
      hardFailed: 186,
      other: 266,
    },
    automation: {
      flowRuns: 2847,
      leadsEnrolled: 1284,
      activeSequences: 3,
      avgCompletion: 68,
    },
    weeklyReplyRate: [18.2, 19.5, 20.1, 18.8, 21.3, 20.2],
  };
}

export function getLeadForms() {
  return LEAD_FORMS;
}

export function getLeadsByForm(formId) {
  return _contacts
    .filter(c => c.form_id === formId)
    .map(c => ({ ...c, lastContacted: relativeTime(c.last_inbound_at) }));
}

export function updateLeadStatus(contactId, newStatus) {
  _contacts = _contacts.map(c => c.id === contactId ? { ...c, lead_status: newStatus } : c);
  return { ok: true };
}

export function addLead(leadData) {
  const id = 'lead_' + (++_leadIdCounter);
  const color = AVATAR_COLORS[_leadIdCounter % AVATAR_COLORS.length];
  const nameParts = (leadData.name || '').trim().split(' ');
  const newContact = {
    id,
    wa_id: (leadData.phone || '').replace(/\s/g, '') || '+91' + id,
    profile_name: leadData.name || 'Unknown',
    firstName: nameParts[0] || '',
    lastName: nameParts.slice(1).join(' ') || '',
    company: leadData.company || '-',
    jobTitle: leadData.jobTitle || '-',
    email: leadData.email || '',
    phone: leadData.phone || '',
    lead_score: Math.min(100, Math.max(0, parseInt(leadData.lead_score) || 50)),
    lead_status: leadData.lead_status || 'New',
    source: leadData.source || 'Other',
    color,
    form_id: leadData.form_id,
    last_inbound_at: new Date().toISOString(),
    attributes: leadData.attributes || {},
  };
  _contacts = [..._contacts, newContact];
  return { ok: true, contact: newContact };
}

export function getConversations() {
  return _conversations
    .map(conv => {
      const contact = _contacts.find(c => c.id === conv.contact_id);
      const windowOpen = new Date(conv.window_expires_at) > new Date();
      return {
        ...conv,
        contact,
        windowOpen,
        windowExpiresAt: conv.window_expires_at,
        relativeTime: relativeTime(conv.last_message_at),
      };
    })
    .sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
}

export function getMessages(convId) {
  return (_messages[convId] || []).map(m => ({
    ...m,
    timeStr: msgTime(m.created_at),
  }));
}

export function sendMessage(convId, payload) {
  const { type, body, template_name } = payload;
  const conv = _conversations.find(c => c.id === convId);
  if (!conv) return { ok: false, error: 'Conversation not found' };
  const windowOpen = new Date(conv.window_expires_at) > new Date();
  if (type === 'text' && !windowOpen) {
    return { ok: false, error: 'outside 24h window, use a template' };
  }
  const newMsg = {
    id: 'm' + (++_msgIdCounter),
    wa_message_id: 'wamid-out-' + _msgIdCounter,
    direction: 'out',
    type,
    body: body || null,
    template_name: template_name || null,
    status: 'sent',
    sent_by: 'You',
    created_at: new Date().toISOString(),
  };
  _messages = { ..._messages, [convId]: [...(_messages[convId] || []), newMsg] };
  _conversations = _conversations.map(c =>
    c.id === convId ? { ...c, last_message_at: newMsg.created_at } : c
  );
  return { ok: true, message: { ...newMsg, timeStr: msgTime(newMsg.created_at) } };
}

export function getContacts() {
  return _contacts.map(c => ({
    ...c,
    lastContacted: relativeTime(c.last_inbound_at),
  }));
}

export function getTemplates() {
  return TEMPLATES;
}

export function getSequences() {
  return SEQUENCES;
}

export function subscribe(event, callback) {
  return () => {};
}

// ─── Flow Builder (visual canvas), MOCK ONLY ──────────────────────────────────
// Templates the flow builder can send. Some have quick-reply BUTTONS, each button
// becomes its own output handle (branch) on a Send Template node.
export const FLOW_TEMPLATES = [
  { name: 'welcome',      category: 'Marketing', body: 'Hi 👋 Thanks for your interest in Done For You. We build automated lead engines. Keen to see how we hit 4x ROAS?', buttons: ['Interested', 'Not now'] },
  { name: 'book_a_call',  category: 'Utility',   body: 'Awesome! Pick a time and our strategist will call you.', buttons: ['Morning', 'Evening'] },
  { name: 'gentle_nudge', category: 'Marketing', body: 'Still on the fence? Here’s a 60-sec case study that might help.', buttons: [] },
  { name: 'opt_in',       category: 'Marketing', body: 'Reply to get growth tips, case studies and offers built for brands like yours.', buttons: ['Yes please', 'No thanks'] },
  { name: 'demo_confirmed', category: 'Utility', body: 'Your demo is confirmed, calendar invite sent.', buttons: [] },
];
export function getFlowTemplates() { return FLOW_TEMPLATES; }
export function getTemplateButtons(name) {
  return (FLOW_TEMPLATES.find(t => t.name === name)?.buttons) || [];
}

// Seed demo flow:
//   New Lead → Welcome (buttons: Interested / Not now)
//     Interested → Book a call
//     Not now    → Delay 2 days → Gentle nudge
const SEED_FLOW = {
  id: 'flow_demo',
  name: 'New Lead Welcome & Branch',
  nodes: [
    { id: 'n_trigger', type: 'trigger',      position: { x: 40,   y: 260 }, data: { trigger: 'new_lead' } },
    { id: 'n_welcome', type: 'sendTemplate', position: { x: 340,  y: 220 }, data: { templateName: 'welcome' } },
    { id: 'n_book',    type: 'sendTemplate', position: { x: 760,  y: 80  }, data: { templateName: 'book_a_call' } },
    { id: 'n_delay',   type: 'delay',        position: { x: 760,  y: 380 }, data: { amount: 2, unit: 'days' } },
    { id: 'n_nudge',   type: 'sendTemplate', position: { x: 1080, y: 380 }, data: { templateName: 'gentle_nudge' } },
  ],
  edges: [
    { id: 'e1', source: 'n_trigger', target: 'n_welcome', sourceHandle: 'out',   sourceButton: null,         label: null },
    { id: 'e2', source: 'n_welcome', target: 'n_book',    sourceHandle: 'btn-0', sourceButton: 'Interested', label: 'Interested' },
    { id: 'e3', source: 'n_welcome', target: 'n_delay',   sourceHandle: 'btn-1', sourceButton: 'Not now',    label: 'Not now' },
    { id: 'e4', source: 'n_delay',   target: 'n_nudge',   sourceHandle: 'out',   sourceButton: null,         label: null },
  ],
};

let _flow = JSON.parse(JSON.stringify(SEED_FLOW));

export function getFlowGraph() {
  return JSON.parse(JSON.stringify(_flow));
}

// Persist the canvas. Shaped so it can later map 1:1 onto Supabase
// (flows + flow_nodes + flow_edges with source_button → target).
export function saveFlowGraph(graph) {
  _flow = {
    id: _flow.id,
    name: graph.name ?? _flow.name,
    nodes: graph.nodes.map(n => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
    edges: graph.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      sourceButton: e.data?.sourceButton ?? e.sourceButton ?? null,
      label: e.label ?? null,
    })),
  };
  return { ok: true, flow: getFlowGraph() };
}
