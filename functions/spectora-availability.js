/**
 * Netlify Function: spectora-availability
 *
 * Fetches the Spectora iCal feed server-side (avoids CORS),
 * parses VEVENT entries, and returns JSON for the front-end
 * availability calendar.
 *
 * Endpoint: /.netlify/functions/spectora-availability
 */

const ical = require('node-ical');

const ICAL_URL =
  'https://outlook.office365.com/owa/calendar/73c1ee7d9fee493c9f67057d88373d84@heartlandinspectiongroup.com/44be9cd44aa640cb985fd5778946b8e35271852733375210576/calendar.ics';

exports.handler = async function (event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    const data = await ical.async.fromURL(ICAL_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; HeartlandInspections/1.0; Calendar Sync)',
        Accept: 'text/calendar, text/plain, */*',
      },
    });

    const events = [];
    const now = new Date();

    for (const key of Object.keys(data)) {
      const ev = data[key];

      if (ev.type !== 'VEVENT') continue;
      if (ev.status && ev.status.toUpperCase() === 'CANCELLED') continue;
      if (!ev.start) continue;

      const start = new Date(ev.start);

      let end;
      if (ev.end) {
        end = new Date(ev.end);
      } else {
        // Missing end → treat as 2-hour block or full-day
        end = new Date(start);
        if (
          start.getHours() === 0 &&
          start.getMinutes() === 0 &&
          start.getSeconds() === 0
        ) {
          end.setHours(23, 59, 59, 999);
        } else {
          end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
        }
      }

      // Skip events older than 1 day or further than 60 days out
      const oneDayAgo = new Date(now.getTime() - 86400000);
      if (end < oneDayAgo) continue;
      const sixtyDays = new Date(now.getTime() + 60 * 86400000);
      if (start > sixtyDays) continue;

      events.push({
        start: start.toISOString(),
        end: end.toISOString(),
        summary: ev.summary || 'Booked',
      });
    }

    events.sort((a, b) => new Date(a.start) - new Date(b.start));

    // Deduplicate by start+end
    const seen = new Set();
    const deduped = events.filter((e) => {
      const k = e.start + '|' + e.end;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        lastFetched: now.toISOString(),
        eventCount: deduped.length,
        events: deduped,
      }),
    };
  } catch (err) {
    console.error('Spectora iCal fetch error:', err);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        error: 'Unable to fetch availability from Spectora.',
        message: err.message || 'Unknown upstream error',
        lastFetched: new Date().toISOString(),
        events: [],
      }),
    };
  }
};
