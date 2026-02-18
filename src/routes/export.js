const express = require('express');
const { jobs } = require('../services/job-store');

const router = express.Router();

/**
 * GET /api/export/:jobId/pdf
 *
 * Generates and returns a PDF report for the completed job.
 * (Full implementation in Sprint 3.)
 */
router.get('/export/:jobId/pdf', async (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.status !== 'done') {
    return res.status(400).json({ error: 'Job not complete yet' });
  }

  try {
    const { generatePdf } = require('../services/report-generator');
    const pdfBuffer = await generatePdf(job.result, job.url);

    const domain = new URL(job.url).hostname.replace(/^www\./, '');
    const filename = `prospect-mirror-${domain}-${new Date().toISOString().slice(0, 10)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF export error:', err);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

module.exports = router;
