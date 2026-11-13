import express from 'express';
import { randomUUID } from 'node:crypto';
import { escapeEmailHtml } from './emailAddress.js';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function createEmailRoutes({ notifications, send }) {
  const router = express.Router();
  router.post('/gmail/send', async (req, res) => {
    if (req.user?.role !== 'Admin') return res.status(403).json({ error: 'Only an Admin can compose custom email.' });
    const { to, subject, text, issueId, eventType, notificationId } = req.body;
    if (eventType && !['MANUAL_DISPATCH', 'CUSTOM_EMAIL'].includes(eventType)) return res.status(400).json({ error: 'Automatic notices are sent by the action endpoint.' });
    if (typeof subject !== 'string' || !subject.trim() || subject.length > 300 || typeof text !== 'string' || !text.trim() || text.length > 20000
      || issueId && (typeof issueId !== 'string' || issueId.length > 50) || notificationId && !uuid.test(notificationId)) return res.status(400).json({ error: 'Enter a valid recipient, subject and message.' });
    try {
      if (!await notifications.customRecipient(to, issueId)) return res.status(400).json({ error: 'Choose a registered recipient. Ticket messages can go only to its student, assigned RO or an Admin.' });
      const record = await send({ to, subject, text, html: `<p style="white-space:pre-wrap">${escapeEmailHtml(text)}</p>`, issueId,
        eventType: 'MANUAL_DISPATCH', notificationKey: `custom:${req.user.id}:${notificationId || randomUUID()}` });
      res.status(201).json({ success: true, delivered: record.status === 'DELIVERED_GMAIL', record });
    } catch { res.status(503).json({ error: 'The email could not be processed. No substitute recipient was used.' }); }
  });
  router.post('/mentors/:id/notifications', async (req, res) => {
    const id = req.params.id;
    if (!req.user || !(req.user.role === 'Admin' || req.user.role === 'Mentor' && req.user.id.toUpperCase() === id.toUpperCase())) return res.status(403).json({ error: 'You can notify only your own mentor account.' });
    const { kind, schedule = {}, notificationId } = req.body;
    if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule) || notificationId && !uuid.test(notificationId)) return res.status(400).json({ error: 'Invalid notification details.' });
    try {
      const record = await notifications.mentor(id, kind, schedule, `mentor:${id}:${kind}:${notificationId || `${schedule.date}:${schedule.time || ''}`}`);
      res.status(201).json({ success: true, delivered: record.status === 'DELIVERED_GMAIL', record });
    } catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'The mentor email could not be processed.' }); }
  });
  return router;
}
