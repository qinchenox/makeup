'use strict';

// In-memory job store for SSE progress tracking
const jobs = new Map();

function createJob() {
  const id = 'job-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const job = { id, stage: 'queued', progress: 0, message: '等待开始', result: null, error: null };
  jobs.set(id, job);
  // Auto-cleanup after 10 min
  setTimeout(() => jobs.delete(id), 10 * 60 * 1000);
  return job;
}

function updateJob(id, stage, progress, message) {
  const job = jobs.get(id);
  if (job) {
    job.stage = stage;
    job.progress = progress;
    job.message = message;
  }
}

function completeJob(id, result) {
  const job = jobs.get(id);
  if (job) { job.stage = 'done'; job.progress = 100; job.result = result; }
}

function failJob(id, error) {
  const job = jobs.get(id);
  if (job) { job.stage = 'failed'; job.error = error; }
}

function sseHandler(req, res) {
  const { jobId } = req.params;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const job = jobs.get(jobId);
  if (!job) {
    res.write('data: ' + JSON.stringify({ error: 'Job not found' }) + '\n\n');
    return res.end();
  }

  // Send current state
  res.write('data: ' + JSON.stringify({ stage: job.stage, progress: job.progress, message: job.message }) + '\n\n');

  // Poll for updates
  const interval = setInterval(() => {
    const j = jobs.get(jobId);
    if (!j) { clearInterval(interval); return res.end(); }
    res.write('data: ' + JSON.stringify({ stage: j.stage, progress: j.progress, message: j.message, result: j.result, error: j.error }) + '\n\n');
    if (j.stage === 'done' || j.stage === 'failed') {
      clearInterval(interval);
      res.end();
    }
  }, 500);

  req.on('close', () => clearInterval(interval));
}

module.exports = { createJob, updateJob, completeJob, failJob, sseHandler, jobs };
