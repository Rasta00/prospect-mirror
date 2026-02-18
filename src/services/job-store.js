const ProgressEmitter = require('../utils/progress-emitter');
const config = require('../../config/default');

/** In-memory job store — Map<jobId, JobRecord> */
const jobs = new Map();

/** In-memory progress emitters — Map<jobId, ProgressEmitter> */
const emitters = new Map();

/**
 * Get or create a ProgressEmitter for a job.
 */
function getEmitter(jobId) {
  if (!emitters.has(jobId)) {
    emitters.set(jobId, new ProgressEmitter(jobId));
  }
  return emitters.get(jobId);
}

/**
 * Periodically clean up old jobs.
 */
setInterval(() => {
  const cutoff = Date.now() - config.jobs.ttlMs;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      jobs.delete(id);
      emitters.delete(id);
    }
  }
}, 60_000);

module.exports = { jobs, emitters, getEmitter };
