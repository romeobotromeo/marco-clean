#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const VALID_AUDIENCES = ['gc', 'real_estate_agent', 'runner'];
const VALID_CHANNELS = ['call', 'sms'];
const DEFAULT_LIMIT = 25;
const COST_CENTS = {
  sms: 2,
  call: 25,
};

const args = process.argv.slice(2);

function usage() {
  console.log('Usage: node scripts/generate-outreach-preview.js --audience gc|real_estate_agent|runner --channel call|sms --csv <path> [--limit <n>] [--commit]');
  console.log('');
  console.log('Default mode is dry-run. Add --commit to insert draft rows into outreach_queue only.');
}

function argValue(name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : null;
}

function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      if (row.some((currentValue) => currentValue.trim() !== '')) rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((currentValue) => currentValue.trim() !== '')) rows.push(row);
  return rows;
}

function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizePhone(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const digits = trimmed.replace(/[^0-9]/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  if (digits.length === 10) return '+1' + digits;
  if (trimmed.startsWith('+')) return trimmed;
  return '+' + digits;
}

function value(record, names) {
  for (const name of names) {
    const normalized = normalizeHeader(name);
    if (record[normalized]) return String(record[normalized]).trim();
  }
  return null;
}

function toContact(record) {
  const businessName = value(record, ['business_name', 'business', 'name', 'company', 'contractor_name']);
  const contactName = value(record, ['contact_name', 'first_name', 'owner_name', 'agent_name', 'runner_name']);

  return {
    business_name: businessName,
    name: contactName || businessName,
    company: businessName,
    phone: normalizePhone(value(record, ['phone', 'primary_phone', 'public_phone', 'telephone', 'mobile'])),
    city: value(record, ['city']),
    county: value(record, ['county']),
    source_url: value(record, ['source_url', 'source', 'url', 'profile_url']),
    contact_name: contactName,
    raw: record,
  };
}

function displayName(contact, fallback) {
  return contact.contact_name || contact.business_name || fallback;
}

function locationPhrase(contact) {
  if (contact.city && contact.county) return contact.city + ' / ' + contact.county + ' County';
  if (contact.city) return contact.city;
  if (contact.county) return contact.county + ' County';
  return 'your area';
}

function scriptTemplates(audience, channel, contact) {
  const name = displayName(contact, 'there');
  const company = contact.business_name || contact.company || 'your team';
  const location = locationPhrase(contact);

  if (audience === 'gc' && channel === 'call') {
    return [{
      preview_type: 'gc_call_intro',
      message_or_script: 'Hi ' + name + ', this is Joshua with MARCO. We are testing on-demand project manager and field support for contractors around ' + location + '. If ' + company + ' ever needs help for a quick site visit, photos, punch-list documentation, client update, vendor meetup, or one-hour project support, MARCO can help coordinate it by text. Is that something your team ever needs?',
    }];
  }

  if (audience === 'gc' && channel === 'sms') {
    return [{
      preview_type: 'gc_follow_up_sms',
      message_or_script: 'Hi ' + name + ', Joshua from MARCO. We are testing on-demand project manager/field support for contractors around ' + location + ': site photos, punch-list docs, vendor meetups, client updates, errands, and short-notice project help. Reply YES if you want the pilot details, STOP to opt out.',
    }];
  }

  if (audience === 'real_estate_agent' && channel === 'call') {
    return [{
      preview_type: 'real_estate_agent_call_intro',
      message_or_script: 'Hi ' + name + ', this is Joshua with MARCO. We help agents get property work handled by text: listing prep errands, vendor coordination, access checks, photos, walkthrough documentation, and local runner help. I noticed you work around ' + location + '. Could I ask how you currently handle vendor coordination when a seller needs work done quickly?',
    }];
  }

  if (audience === 'real_estate_agent' && channel === 'sms') {
    return [{
      preview_type: 'real_estate_agent_follow_up_sms',
      message_or_script: 'Hi ' + name + ', Joshua with MARCO. We help agents with on-demand field support around ' + location + ': listing prep errands, vendor coordination, access checks, photos, walkthrough docs, and runner help. Worth a quick intro this week? Reply STOP to opt out.',
    }];
  }

  if (audience === 'runner' && channel === 'sms') {
    return [
      {
        preview_type: 'runner_invite_sms',
        message_or_script: 'Hi ' + name + ', Joshua with MARCO. We are onboarding reliable local runners/operators for paid property tasks around ' + location + ': photos, check-ins, vendor meetups, and field documentation. Interested in joining the first runner pool?',
      },
      {
        preview_type: 'runner_video_interview_invite_sms',
        message_or_script: 'Hi ' + name + ', quick MARCO follow-up: we are doing short video interviews for local runner/operator roles around ' + location + '. If you are interested, reply YES and I will send the next step.',
      },
    ];
  }

  return [];
}

function providerFor(channel) {
  return channel === 'sms' ? 'twilio_preview' : 'call_preview';
}

function metadataFor(contact, previewType, sourceFile) {
  return {
    preview_type: previewType,
    contact: {
      business_name: contact.business_name,
      name: contact.name,
      phone: contact.phone,
      city: contact.city,
      county: contact.county,
      source_url: contact.source_url,
      contact_name: contact.contact_name,
    },
    source_file: sourceFile,
    generated_by: 'scripts/generate-outreach-preview.js',
  };
}

function parseContacts(csvPath, limit) {
  const absolutePath = path.resolve(csvPath);
  const csv = fs.readFileSync(absolutePath, 'utf8');
  const parsed = parseCsv(csv);
  if (!parsed.length) {
    return { absolutePath, inputCount: 0, contacts: [], skipped: [] };
  }

  const headers = parsed.shift().map(normalizeHeader);
  const contacts = [];
  const skipped = [];

  for (const row of parsed) {
    const raw = {};
    headers.forEach((header, index) => {
      raw[header] = row[index] ? row[index].trim() : '';
    });

    const contact = toContact(raw);
    if (!contact.phone) {
      skipped.push({ reason: 'missing_phone', row: raw });
      continue;
    }

    contacts.push(contact);
    if (contacts.length >= limit) break;
  }

  return {
    absolutePath,
    inputCount: parsed.length,
    contacts,
    skipped,
  };
}

function validate() {
  const audience = argValue('--audience');
  const channel = argValue('--channel');
  const csvPath = argValue('--csv');
  const limitRaw = argValue('--limit');
  const shouldCommit = args.includes('--commit');
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : DEFAULT_LIMIT;

  if (!audience || !VALID_AUDIENCES.includes(audience)) {
    usage();
    throw new Error('Invalid or missing --audience. Expected one of: ' + VALID_AUDIENCES.join(', '));
  }

  if (!channel || !VALID_CHANNELS.includes(channel)) {
    usage();
    throw new Error('Invalid or missing --channel. Expected one of: ' + VALID_CHANNELS.join(', '));
  }

  if (!csvPath) {
    usage();
    throw new Error('Missing --csv. No non-CSV source is implemented yet.');
  }

  if (!Number.isInteger(limit) || limit < 1) {
    usage();
    throw new Error('Invalid --limit. Expected a positive integer.');
  }

  if (audience === 'runner' && channel === 'call') {
    usage();
    throw new Error('Unsupported audience/channel pair. Runner previews are implemented for sms only.');
  }

  return { audience, channel, csvPath, limit, shouldCommit };
}

async function main() {
  const options = validate();
  const parsed = parseContacts(options.csvPath, options.limit);
  const previews = [];

  for (const contact of parsed.contacts) {
    const templates = scriptTemplates(options.audience, options.channel, contact);
    if (!templates.length) {
      continue;
    }

    for (const template of templates) {
      previews.push({
        audience_type: options.audience,
        channel: options.channel,
        provider: providerFor(options.channel),
        message_or_script: template.message_or_script,
        estimated_cost_cents: COST_CENTS[options.channel],
        metadata: metadataFor(contact, template.preview_type, parsed.absolutePath),
      });
    }
  }

  const summary = {
    mode: options.shouldCommit ? 'commit' : 'dry-run',
    audience: options.audience,
    channel: options.channel,
    input_count: parsed.inputCount,
    ready_count: previews.length,
    skipped_count: parsed.skipped.length,
    estimated_cost_cents: previews.reduce((total, preview) => total + preview.estimated_cost_cents, 0),
    sample_previews: previews.slice(0, 5),
  };

  if (!options.shouldCommit) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --commit');
  }

  const rows = previews.map((preview) => ({
    dry_run: true,
    approval_status: 'pending',
    status: 'draft',
    audience_type: preview.audience_type,
    channel: preview.channel,
    provider: preview.provider,
    message_or_script: preview.message_or_script,
    estimated_cost_cents: preview.estimated_cost_cents,
    metadata: preview.metadata,
  }));

  if (!rows.length) {
    console.log(JSON.stringify({ ...summary, inserted_count: 0, inserted_sample: [] }, null, 2));
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from('outreach_queue')
    .insert(rows)
    .select('id, audience_type, channel, status, approval_status, dry_run, estimated_cost_cents');

  if (error) {
    throw new Error(error.message || 'outreach_queue_insert_failed');
  }

  console.log(JSON.stringify({ ...summary, inserted_count: data.length, inserted_sample: data.slice(0, 5) }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
