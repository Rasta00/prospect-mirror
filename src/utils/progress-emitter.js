const { EventEmitter } = require('events');

/**
 * Per-job progress tracker. Emits SSE-friendly events.
 *
 * Phases: crawl → brand → techDetect → audit → contentAI → competitiveAI → drupal → report
 */
class ProgressEmitter extends EventEmitter {
  constructor(jobId) {
    super();
    this.jobId = jobId;
    this.phases = {};
    this.startTime = Date.now();
  }

  /** Mark a phase as started */
  start(phase, label) {
    this.phases[phase] = { status: 'running', label, startedAt: Date.now() };
    this._emit('phase:start', { phase, label });
  }

  /** Update progress within a phase (0-100) */
  progress(phase, pct, detail) {
    if (this.phases[phase]) {
      this.phases[phase].pct = pct;
      this.phases[phase].detail = detail;
    }
    this._emit('phase:progress', { phase, pct, detail });
  }

  /** Mark a phase complete with summary data */
  complete(phase, summary) {
    if (this.phases[phase]) {
      this.phases[phase].status = 'done';
      this.phases[phase].duration = Date.now() - (this.phases[phase].startedAt || this.startTime);
    }
    this._emit('phase:complete', { phase, summary });
  }

  /** Mark a phase as failed (non-fatal — pipeline continues) */
  fail(phase, error) {
    if (this.phases[phase]) {
      this.phases[phase].status = 'error';
      this.phases[phase].error = error;
    }
    this._emit('phase:error', { phase, error });
  }

  /** Entire job done */
  done(result) {
    this._emit('job:done', { duration: Date.now() - this.startTime, result });
  }

  /** Entire job failed fatally */
  fatal(error) {
    this._emit('job:error', { error: error.message || String(error) });
  }

  _emit(event, data) {
    this.emit(event, { jobId: this.jobId, ts: Date.now(), ...data });
    // Also emit a generic 'update' so SSE listener only needs one handler
    this.emit('update', { event, jobId: this.jobId, ts: Date.now(), ...data });
  }

  /** Snapshot for GET /status (non-SSE fallback) */
  snapshot() {
    return {
      jobId: this.jobId,
      elapsed: Date.now() - this.startTime,
      phases: { ...this.phases },
    };
  }
}

module.exports = ProgressEmitter;
