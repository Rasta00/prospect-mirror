const express = require('express');
const { jobs } = require('../services/job-store');

const router = express.Router();

/**
 * GET /api/result/:jobId
 *
 * Returns the full analysis result once the job is complete.
 */
router.get('/result/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.status === 'running') {
    return res.status(202).json({ status: 'running', message: 'Analysis still in progress' });
  }

  if (job.status === 'error') {
    return res.status(500).json({ status: 'error', error: job.error });
  }

  res.json({
    status: 'done',
    url: job.url,
    result: job.result,
  });
});

module.exports = router;
