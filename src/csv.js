// CSV handling for campaign uploads.
//
// Hand-rolled rather than pulling a parser in: the files here are contact lists
// exported from a sheet, and the only hard part is quoted fields containing
// commas — which a naive split() gets wrong and which real Indian address and
// company columns hit constantly.

export const SAMPLE_HEADERS = ['email', 'name', 'phone', 'variable_1', 'variable_2', 'variable_3', 'variable_4'];

const SAMPLE_ROWS = [
  ['priya.nair@gmail.com',      'Priya Nair',      '+919820011234', 'Kalpataru Code One', '4 BHK', '₹30 Cr', 'Worli'],
  ['a.batavia33@outlook.com',   'Ashish Batavia',  '+919820033346', 'Kalpataru Oceana',   '3 BHK', '₹22 Cr', 'Prabhadevi'],
  ['rohit.malhotra@yahoo.com',  'Rohit Malhotra',  '+919831571210', 'SP Odyssey',         '5 BHK', '₹15 Cr', 'Lower Parel'],
];

// A field needs quoting if it contains a comma, a quote or a newline; inner
// quotes double up. Without this, "₹30 Cr, negotiable" silently becomes two
// columns and every row after it is misaligned.
function csvField(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function sampleCsv() {
  return [SAMPLE_HEADERS, ...SAMPLE_ROWS].map(r => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

export function downloadSampleCsv(filename = 'baynest-campaign-sample.csv') {
  // BOM so Excel opens the ₹ sign and Devanagari names correctly instead of
  // mojibake — without it Excel assumes the system codepage, not UTF-8.
  const blob = new Blob(['﻿' + sampleCsv()], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Split one line, honouring quotes.
function splitLine(line) {
  const out = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }   // escaped quote
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

const norm = h => String(h || '').trim().toLowerCase().replace(/^﻿/, '').replace(/[\s-]+/g, '_');

// Which column holds what. Accepts the obvious synonyms so a sheet exported
// from someone else's CRM still works without being re-headed by hand.
const PHONE_KEYS = ['phone', 'phone_number', 'mobile', 'mobile_number', 'whatsapp', 'whatsapp_number', 'number', 'contact'];
const NAME_KEYS  = ['name', 'full_name', 'fullname', 'first_name', 'lead_name', 'contact_name'];
const EMAIL_KEYS = ['email', 'email_address', 'e_mail'];

export function parseCsv(text) {
  const clean = String(text || '').replace(/^﻿/, '');
  const lines = clean.split(/\r\n|\n|\r/).filter(l => l.trim() !== '');
  if (lines.length === 0) return { ok: false, error: 'That file is empty.' };
  if (lines.length === 1) return { ok: false, error: 'That file has a header row but no contacts under it.' };

  const headers = splitLine(lines[0]).map(norm);
  const idxOf = keys => headers.findIndex(h => keys.includes(h));
  const phoneIdx = idxOf(PHONE_KEYS);
  const nameIdx  = idxOf(NAME_KEYS);
  const emailIdx = idxOf(EMAIL_KEYS);

  if (phoneIdx === -1) {
    return { ok: false, error: `No phone column found. Expected one of: ${PHONE_KEYS.slice(0, 4).join(', ')}. Found: ${headers.join(', ')}` };
  }

  // Variable columns, in file order. Anything named variable_1/var 2/etc counts;
  // if the sheet uses its own names, every remaining column becomes a variable
  // so a list exported from elsewhere still works.
  const explicit = headers
    .map((h, i) => ({ h, i }))
    .filter(x => /^(variable|var)_?\d+$/.test(x.h))
    .sort((a, b) => Number(a.h.replace(/\D/g, '')) - Number(b.h.replace(/\D/g, '')));

  const varCols = explicit.length
    ? explicit
    : headers.map((h, i) => ({ h, i })).filter(x => ![phoneIdx, nameIdx, emailIdx].includes(x.i));

  const rows = [];
  const problems = [];
  const seen = new Set();

  lines.slice(1).forEach((line, n) => {
    const cells = splitLine(line);
    const rawPhone = cells[phoneIdx] ?? '';
    const digits = rawPhone.replace(/[^\d+]/g, '');
    if (!digits) { problems.push(`Row ${n + 2}: no phone number`); return; }

    // Normalise to E.164. A bare 10-digit Indian mobile is the common case in
    // sheets, so assume +91 there rather than dropping the row.
    let phone = digits.startsWith('+') ? digits : (digits.length === 10 ? '+91' + digits : '+' + digits);
    if (phone.replace(/\D/g, '').length < 10) { problems.push(`Row ${n + 2}: "${rawPhone}" is too short to be a number`); return; }
    if (seen.has(phone)) { problems.push(`Row ${n + 2}: ${phone} appears more than once`); return; }
    seen.add(phone);

    rows.push({
      phone,
      name: nameIdx >= 0 ? (cells[nameIdx] || '') : '',
      email: emailIdx >= 0 ? (cells[emailIdx] || '') : '',
      variables: varCols.map(v => cells[v.i] ?? ''),
    });
  });

  if (rows.length === 0) {
    return { ok: false, error: 'No usable rows. ' + (problems[0] || 'Every row was missing a phone number.') };
  }

  return {
    ok: true,
    headers,
    rows,
    variableColumns: varCols.map(v => v.h),
    variableCount: varCols.length,
    skipped: problems,
    mapped: {
      phone: headers[phoneIdx],
      name: nameIdx >= 0 ? headers[nameIdx] : null,
      email: emailIdx >= 0 ? headers[emailIdx] : null,
    },
  };
}
