#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const args = process.argv.slice(2);
const csvPath = args.find((arg) => !arg.startsWith('--'));
const shouldCommit = args.includes('--commit');

function usage() {
  console.log('Usage: node scripts/import-gc-contacts.js <contacts.csv> [--commit]');
  console.log('');
  console.log('Default mode is dry-run. Add --commit to upsert rows into Supabase.');
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
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  if (digits.length === 10) return '+1' + digits;
  if (String(raw).trim().startsWith('+')) return String(raw).trim();
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
  const businessName = value(record, ['business_name', 'business', 'company', 'name', 'contractor_name']);
  return {
    business_name: businessName,
    license_number: value(record, ['license_number', 'license', 'cslb_license', 'license_no']),
    license_status: value(record, ['license_status', 'status']),
    classification: value(record, ['classification', 'class', 'license_class']),
    phone: normalizePhone(value(record, ['phone', 'primary_phone', 'public_phone', 'telephone'])),
    email: value(record, ['email', 'primary_email']),
    website: value(record, ['website', 'url']),
    city: value(record, ['city']),
    county: value(record, ['county']),
    state: value(record, ['state']) || 'CA',
    source_url: value(record, ['source_url', 'source', 'url']),
    source_type: value(record, ['source_type']) || 'csv-import',
    notes: value(record, ['notes']),
    last_verified_at: new Date().toISOString(),
  };
}

function dedupeKey(contact) {
  if (contact.license_number) return 'license:' + contact.license_number.toLowerCase();
  if (contact.phone) return 'phone:' + contact.phone;
  return 'name:' + String(contact.business_name || '').toLowerCase() + '|' + String(contact.city || '').toLowerCase();
}

async function main() {
  if (!csvPath) {
    usage();
    process.exit(1);
  }

  const absolutePath = path.resolve(csvPath);
  const csv = fs.readFileSync(absolutePath, 'utf8');
  const parsed = parseCsv(csv);
  const headers = parsed.shift().map(normalizeHeader);
  const seen = new Map();
  const skipped = [];

  for (const row of parsed) {
    const raw = {};
    headers.forEach((header, index) => {
      raw[header] = row[index] ? row[index].trim() : '';
    });

    const contact = toContact(raw);
    if (!contact.business_name || !contact.phone) {
      skipped.push({ reason: 'missing_business_name_or_phone', row: raw });
      continue;
    }

    const key = dedupeKey(contact);
    if (!seen.has(key)) {
      seen.set(key, contact);
    }
  }

  const contacts = Array.from(seen.values());
  const summary = {
    file: absolutePath,
    mode: shouldCommit ? 'commit' : 'dry-run',
    parsed_rows: parsed.length,
    ready_contacts: contacts.length,
    skipped_rows: skipped.length,
    sample: contacts.slice(0, 5),
  };

  if (!shouldCommit) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --commit');
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const committed = [];

  for (const contact of contacts) {
    let query = supabase.from('gc_contacts').select('id');
    if (contact.license_number) {
      query = query.eq('license_number', contact.license_number);
    } else {
      query = query.eq('phone', contact.phone);
    }

    const { data: existing, error: lookupError } = await query.maybeSingle();
    if (lookupError) {
      throw new Error(lookupError.message || 'gc_contact_lookup_failed');
    }

    const write = existing
      ? supabase.from('gc_contacts').update({ ...contact, updated_at: new Date().toISOString() }).eq('id', existing.id)
      : supabase.from('gc_contacts').insert(contact);

    const { data, error } = await write.select('id, business_name, phone, license_number, city').maybeSingle();
    if (error) {
      throw new Error(error.message || 'gc_contact_write_failed');
    }
    committed.push(data);
  }

  console.log(JSON.stringify({ ...summary, committed: committed.length }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
