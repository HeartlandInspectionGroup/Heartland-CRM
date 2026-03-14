// delete-record.js
// Cascading delete for inspection records and/or bookings.
// Deletes in correct FK order:
//   1. client_portal_tokens (by client_email, references bookings)
//   2. inspection_section_data (by record id, if table exists)
//   3. inspection_records
//   4. bookings (by booking_id on the record)
//
// Accepts: { id } to delete a single record
//          { status: 'draft' } to delete all drafts
//          { status: 'draft', older_than: '<ISO date>' } to delete eligible drafts
//          { booking_id } to delete a booking and all related records
// Requires x-admin-token header.

const { createClient } = require('@supabase/supabase-js');
const { requireAuth }  = require('./auth');

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };

  const authError = requireAuth(event);
  if (authError) return authError;

  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  try {

    // ── BOOKING DELETE ──────────────────────────────────────────────
    // Delete a booking and everything linked to it
    if (body.booking_id) {
      const bookingId = body.booking_id;

      // 1. Find records linked to this booking (to get client email + record ids)
      const { data: records } = await sb
        .from('inspection_records')
        .select('id, cust_email')
        .eq('booking_id', bookingId);

      // 2. Delete client_portal_tokens by client email (if any records found)
      if (records && records.length) {
        const emails = [...new Set(records.map(r => r.cust_email).filter(Boolean))];
        for (const email of emails) {
          await sb.from('client_portal_tokens').delete().eq('client_email', email);
        }

        // 3. Delete inspection_section_data for each record (ignore error if table doesn't exist)
        for (const rec of records) {
          try {
            await sb.from('inspection_section_data').delete().eq('record_id', rec.id);
          } catch(e) { /* table may not exist */ }
        }

        // 4. Delete inspection_records
        await sb.from('inspection_records').delete().eq('booking_id', bookingId);
      }

      // 5. Delete client_portal_tokens by booking_id directly (belt-and-suspenders)
      await sb.from('client_portal_tokens').delete().eq('booking_id', bookingId);

      // 6. Delete the booking
      const { error: bkErr } = await sb.from('bookings').delete().eq('id', bookingId);
      if (bkErr) throw bkErr;

      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
    }

    // ── RECORD DELETE ───────────────────────────────────────────────
    // Find the record(s) first so we can cascade
    let recordQuery = sb.from('inspection_records').select('id, cust_email, booking_id');

    if (body.id) {
      recordQuery = recordQuery.eq('id', body.id);
    } else if (body.status) {
      recordQuery = recordQuery.eq('status', body.status);
      if (body.older_than) recordQuery = recordQuery.lt('updated_at', body.older_than);
    } else {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Must provide id, status, or booking_id' }) };
    }

    const { data: records, error: fetchErr } = await recordQuery;
    if (fetchErr) throw fetchErr;
    if (!records || !records.length) {
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, deleted: 0 }) };
    }

    // 1. Delete client_portal_tokens by client email
    const emails = [...new Set(records.map(r => r.cust_email).filter(Boolean))];
    for (const email of emails) {
      await sb.from('client_portal_tokens').delete().eq('client_email', email);
    }

    // 2. Delete inspection_section_data (ignore if table doesn't exist)
    for (const rec of records) {
      try {
        await sb.from('inspection_section_data').delete().eq('record_id', rec.id);
      } catch(e) { /* table may not exist */ }
    }

    // 3. Delete inspection_records
    let delQuery = sb.from('inspection_records').delete();
    if (body.id) {
      delQuery = delQuery.eq('id', body.id);
    } else {
      delQuery = delQuery.eq('status', body.status);
      if (body.older_than) delQuery = delQuery.lt('updated_at', body.older_than);
    }
    const { error: delErr } = await delQuery;
    if (delErr) throw delErr;

    // 4. If deleting a single record that has a booking_id, also clean up tokens by booking_id
    if (body.id && records[0] && records[0].booking_id) {
      await sb.from('client_portal_tokens').delete().eq('booking_id', records[0].booking_id);
    }

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, deleted: records.length }) };

  } catch (err) {
    console.error('delete-record error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
