// WSL workaround: ensure Chrome can find all shared libraries
if (process.env.WSL_DISTRO_NAME) {
  process.env.LD_LIBRARY_PATH = '/tmp:' + (process.env.LD_LIBRARY_PATH || '');
}

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const config = require('./config/default');

const apiRoutes = require('./src/routes/api');
const statusRoutes = require('./src/routes/status');
const resultRoutes = require('./src/routes/result');
const exportRoutes = require('./src/routes/export');

const app = express();

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
    },
  },
}));
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check for Railway
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Routes
app.use('/api', apiRoutes);
app.use('/api', statusRoutes);
app.use('/api', resultRoutes);
app.use('/api', exportRoutes);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`\n  Prospect Mirror running at http://localhost:${config.port}\n`);
  console.log(`  Anthropic API: ${config.anthropic.apiKey ? 'configured' : 'NOT SET'}`);
  console.log(`  Drupal population: ${config.drupal.enabled ? config.drupal.baseUrl : 'disabled'}\n`);
});
