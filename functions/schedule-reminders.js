/**
 * schedule-reminders.js
 *
 * DISABLED — Auto reminder emails are not in use.
 * Reminder broadcasts will be handled manually via the Broadcasts tab.
 */

exports.handler = async function () {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, message: 'Reminders are handled via Broadcasts tab.' }),
  };
};
