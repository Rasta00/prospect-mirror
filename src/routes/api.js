const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { normalizeUrl } = require('../utils/url-utils');
const { runPipeline } = require('../services/orchestrator');
const { jobs } = require('../services/job-store');

const router = express.Router();

/**
 * POST /api/analyze
 * Body: { url: string }
 * Returns: { jobId: string }
 */
router.post('/analyze', (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "url" field' });
  }

  let normalized;
  try {
    normalized = normalizeUrl(url);
  } catch (err) {
    return res.status(400).json({ error: `Invalid URL: ${err.message}` });
  }

  const jobId = uuidv4();

  // Create job record
  jobs.set(jobId, {
    id: jobId,
    url: normalized,
    status: 'running',
    createdAt: Date.now(),
    result: null,
    error: null,
  });

  // Fire and forget — progress is tracked via SSE
  runPipeline(jobId, normalized).catch(err => {
    const job = jobs.get(jobId);
    if (job) {
      job.status = 'error';
      job.error = err.message || String(err);
    }
  });

  res.json({ jobId });
});

module.exports = router;
