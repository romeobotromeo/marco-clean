#!/usr/bin/env node

const fs = require('fs/promises');
const crypto = require('crypto');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const DEFAULT_SOURCE = 'meta-lead-gen';
const DEFAULT_FROM_NUMBER = '+16452063407';
const DEFAULT_MESSAGE = [
  'Hi {{first_name}}, this is Marco. Thanks for reaching out about property help.',
  'What city/neighborhood is the property in, and what do you need handled first?',
  'You can reply here with a short note or photos.'
].join(' ');

function parseArgs(argv) {
  const args = {
    csv: null,
    source: DEFAULT_SOURCE,
    message: DEFAULT_MESSAGE,
    send: false,
    from: process.env.SENDBLUE_FROM_NUMBER || DEFAULT_FROM_NUMBER,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--csv') {
      args.csv = next;
      index += 1;
    } else if (arg === '--source') {
      args.source = next || args.source;
      index += 1;
    } else if (arg === '--message') {
      args.message = next || args.message;
      index += 1;
    } else if (arg === '--from') {
      args.from = next || args.from;
      index += 1;
    } else if (arg === '--send') {
      args.send = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  npm run leadgen:import -- --csv ./leads.csv [--source meta-lead-gen] [--send]

Required env:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Required for --send:
  SENDBLUE_API_KEY
  SENDBLUE_API_SECRET
  SENDBLUE_FROM_NUMBER optional, defaults to +16452063407

Accepted CSV columns:
  phone, phone_number, mobile_phone, name, full_name, first_name, last_name,
  email, city, market, neighborhood, address, property_address, issue,
  project, message, notes, created_time, campaign_name, ad_name, form_name
`);
}

function parseCsv(content) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim() !== '')) rows.push(row);

  if (rows.length < 2) return [];

  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map((values) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = (values[index] || '').trim();
    });
    return record;
  });
}

function normalizeHeader(header) {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function firstValue(record, keys) {
  for (const key of keys) {
    if (record[key]) return record[key].trim();
  }
  return '';
}

function normalizePhone(value) {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (String(value).trim().startsWith('+')) return String(value).trim();
  return '';
}

function fullName(record) {
  const explicitName = firstValue(record, ['name', 'full_name', 'contact_name']);
  if (explicitName) return explicitName;
  return [record.first_name, record.last_name].filter(Boolean).join(' ').trim();
}

function firstName(name) {
  return name.split(/\s+/).filter(Boolean)[0] || '';
}

function leadSummary(lead) {
  const parts = [
    lead.issue && `Issue: ${lead.issue}`,
    lead.address && `Address: ${lead.address}`,
    lead.city && `City: ${lead.city}`,
    lead.notes && `Notes: ${lead.notes}`,
  ].filter(Boolean);
  return parts.join(' | ') || 'Meta lead form submitted; needs manual qualification.';
}

function buildLead(record, source) {
  const name = fullName(record);
  const phone = normalizePhone(firstValue(record, ['phone', 'phone_number', 'mobile_phone', 'mobile', 'cell', 'contact_phone']));
  const email = firstValue(record, ['email', 'email_address']);
  const city = firstValue(record, ['city', 'market', 'location']);
  const neighborhood = firstValue(record, ['neighborhood', 'area']);
  const address = firstValue(record, ['address', 'property_address', 'street_address']);
  const issue = firstValue(record, ['issue', 'project', 'request', 'service_needed', 'what_do_you_need', 'message']);
  const notes = firstValue(record, ['notes', 'comments', 'description']);

  return {
    id: crypto.randomUUID(),
    name,
    first_name: firstName(name),
    phone,
    email,
    city,
    neighborhood,
    address,
    issue,
    notes,
    source,
    campaign_name: firstValue(record, ['campaign_name', 'campaign']),
    ad_name: firstValue(record, ['ad_name', 'ad']),
    form_name: firstValue(record, ['form_name', 'form']),
    raw: record,
  };
}

function renderTemplate(template, lead) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => lead[key] || '');
}

async function sendSms(to, content, fromNumber) {
  const apiKey = process.env.SENDBLUE_API_KEY;
  const apiSecret = process.env.SENDBLUE_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error('Missing SENDBLUE_API_KEY or SENDBLUE_API_SECRET');
  }

  await axios.post('https://api.sendblue.co/api/send-message', {
    number: to,
    content,
    from_number: fromNumber,
  }, {
    headers: {
      'sb-api-key-id': apiKey,
      'sb-api-secret-key': apiSecret,
      'Content-Type': 'application/json',
    },
  });
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.csv) {
    printHelp();
    process.exit(1);
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const content = await fs.readFile(args.csv, 'utf8');
  const records = parseCsv(content);
  const leads = records.map((record) => buildLead(record, args.source)).filter((lead) => lead.phone);

  const skipped = records.length - leads.length;
  const results = [];

  for (const lead of leads) {
    const outbound = renderTemplate(args.message, lead);
    const rawPayload = {
      source: lead.source,
      campaign_name: lead.campaign_name,
      ad_name: lead.ad_name,
      form_name: lead.form_name,
      imported_from_csv: true,
      lead: lead.raw,
    };

    const userPayload = {
      phone: lead.phone,
      role: 'homeowner-lead',
      last_active_at: new Date().toISOString(),
      last_category: 'lead-gen',
      last_urgency: 'normal',
    };

    const requestPayload = {
      user_phone: lead.phone,
      category: 'lead-gen',
      urgency: 'normal',
      summary: leadSummary(lead),
      notes: [
        lead.name && `Name: ${lead.name}`,
        lead.email && `Email: ${lead.email}`,
        lead.campaign_name && `Campaign: ${lead.campaign_name}`,
        lead.ad_name && `Ad: ${lead.ad_name}`,
        lead.form_name && `Form: ${lead.form_name}`,
      ].filter(Boolean).join('\n') || null,
      needs: {
        address: !lead.address,
        timing: true,
        access: false,
        budget: false,
        photos: true,
      },
      property_address: lead.address || null,
      status: args.send ? 'outreach_sent' : 'imported_needs_outreach',
    };

    const inboundMessage = {
      user_phone: lead.phone,
      direction: 'inbound',
      body: leadSummary(lead),
      raw_payload: rawPayload,
    };

    const { error: userError } = await supabase.from('users').upsert(userPayload, { onConflict: 'phone' });
    if (userError) throw userError;

    const { error: requestError } = await supabase.from('requests').insert(requestPayload);
    if (requestError) throw requestError;

    const { error: inboundError } = await supabase.from('messages').insert(inboundMessage);
    if (inboundError) throw inboundError;

    if (args.send) {
      await sendSms(lead.phone, outbound, args.from);

      const outboundMessage = {
        user_phone: lead.phone,
        direction: 'outbound',
        body: outbound,
        raw_payload: { source: args.source, imported_outreach: true, sent: true },
      };

      const { error: outboundError } = await supabase.from('messages').insert(outboundMessage);
      if (outboundError) throw outboundError;
    }

    results.push({ phone: lead.phone, name: lead.name, sent: args.send });
  }

  console.log(JSON.stringify({
    imported: results.length,
    skipped_missing_phone: skipped,
    sent: args.send ? results.length : 0,
    send_disabled: !args.send,
    source: args.source,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
