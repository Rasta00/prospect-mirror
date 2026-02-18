const express = require('express');
const { jobs, getEmitter } = require('../services/job-store');

const router = express.Router();

/**
 * GET /api/status/:jobId
 *
 * SSE stream of job progress events.
 * Falls back to JSON snapshot if Accept header doesn't include text/event-stream.
 */
router.get('/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const wantsSSE = (req.headers.accept || '').includes('text/event-stream');

  if (!wantsSSE) {
    // Plain JSON snapshot
    const emitter = getEmitter(jobId);
    return res.json({
      ...emitter.snapshot(),
      status: job.status,
      url: job.url,
    });
  }

  // SSE stream
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // disable nginx buffering
  });
  res.write('\n');

  const emitter = getEmitter(jobId);

  // Send current snapshot as initial state
  res.write(`event: snapshot\ndata: ${JSON.stringify(emitter.snapshot())}\n\n`);

  const onUpdate = (data) => {
    res.write(`event: ${data.event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  emitter.on('update', onUpdate);

  // If job is already done, send the terminal event immediately
  if (job.status === 'done') {
    res.write(`event: job:done\ndata: ${JSON.stringify({ jobId })}\n\n`);
    res.end();
    return;
  }
  if (job.status === 'error') {
    res.write(`event: job:error\ndata: ${JSON.stringify({ jobId, error: job.error })}\n\n`);
    res.end();
    return;
  }

  // Clean up on client disconnect
  req.on('close', () => {
    emitter.off('update', onUpdate);
  });
});

module.exports = router;
