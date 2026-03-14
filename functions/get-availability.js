/**
 * Netlify Function: get-availability
 *
 * Returns Jake's busy windows from Outlook for the next N days
 * so the public booking wizard can block off unavailable slots.
 *
 * GET /api/get-availability?weeks=4
 *
 * Response:
 * {
 *   busy: [
 *     { start: "2026-03-10T14:00:00Z", end: "2026-03-10T16:30:00Z" },
 *     ...
 *   ]
 * }
 */

const AZURE_TENANT_ID     = process.env.AZURE_TENANT_ID;
const AZURE_CLIENT_ID     = process.env.AZURE_CLIENT_ID;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const CALENDAR_USER       = 'jake@heartlandinspectiongroup.com';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store', // never cache — availability must always be fresh
};

async function getAzureToken() {
  if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET) return null;
  var res = await fetch(
    'https://login.microsoftonline.com/' + AZURE_TENANT_ID + '/oauth2/v2.0/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     AZURE_CLIENT_ID,
        client_secret: AZURE_CLIENT_SECRET,
        scope:         'https://graph.microsoft.com/.default',
        grant_type:    'client_credentials',
      }).toString(),
    }
  );
  if (!res.ok) { console.error('[get-availability] Azure token failed:', await res.text()); return null; }
  var data = await res.json();
  return data.access_token;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  // weeks param comes from the wizard (CFG.PUBLIC_WEEKS_AHEAD), default 4
  var weeks = Math.min(parseInt(event.queryStringParameters && event.queryStringParameters.weeks) || 4, 26);
  var days  = weeks * 7;

  // Build time window — start now, end N days out
  var startTime = new Date();
  var endTime   = new Date(startTime.getTime() + days * 24 * 60 * 60 * 1000);

  var startIso = startTime.toISOString();
  var endIso   = endTime.toISOString();

  try {
    var token = await getAzureToken();
    if (!token) {
      console.warn('[get-availability] Azure not configured — returning empty busy list');
      return { statusCode: 200, headers, body: JSON.stringify({ busy: [] }) };
    }

    // Use Graph API calendar view to get all events in the window
    // calendarView returns expanded recurring events, which getSchedule does not always do cleanly
    var url = 'https://graph.microsoft.com/v1.0/users/' + encodeURIComponent(CALENDAR_USER)
      + '/calendarView'
      + '?startDateTime=' + encodeURIComponent(startIso)
      + '&endDateTime='   + encodeURIComponent(endIso)
      + '&$select=subject,start,end,showAs,isCancelled'
      + '&$top=100'
      + '&$orderby=start/dateTime';

    var res = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type':  'application/json',
        // No Prefer header — Graph returns UTC, dateTime strings are always UTC
      }
    });

    if (!res.ok) {
      var errText = await res.text();
      console.error('[get-availability] Graph calendarView failed:', errText);
      return { statusCode: 200, headers, body: JSON.stringify({ busy: [] }) };
    }

    var data  = await res.json();
    var events = data.value || [];

    // Filter out cancelled events and free/tentative slots
    // showAs values: free, tentative, busy, oof, workingElsewhere
    var busy = events
      .filter(function(e) {
        return !e.isCancelled && e.showAs !== 'free';
      })
      .map(function(e) {
        // Graph returns UTC datetimes without a Z suffix — add it so JS parses correctly
        var startStr = e.start.dateTime.endsWith('Z') ? e.start.dateTime : e.start.dateTime + 'Z';
        var endStr   = e.end.dateTime.endsWith('Z')   ? e.end.dateTime   : e.end.dateTime   + 'Z';
        return { start: startStr, end: endStr };
      });

    events.forEach(function(e) {
      console.log('[get-availability] event:', e.subject, '| showAs:', e.showAs, '| cancelled:', e.isCancelled, '| start:', e.start.dateTime, e.start.timeZone);
    });
    console.log('[get-availability] Returning', busy.length, 'of', events.length, 'events as busy, over', days, 'days');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ busy }),
    };

  } catch (err) {
    console.error('[get-availability] Error:', err.message);
    // Fail open — return empty so wizard still works if Outlook is down
    return { statusCode: 200, headers, body: JSON.stringify({ busy: [] }) };
  }
};
