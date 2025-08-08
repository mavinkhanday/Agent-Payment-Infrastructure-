const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const KillSwitchMonitor = require('./services/kill-switch-monitor');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3001'
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'AI Cost Tracker API is running' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/usage', require('./routes/usage'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/agents', require('./routes/agents'));
app.use('/api/killswitch', require('./routes/killswitch'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  
  // Initialize Kill Switch Monitor
  KillSwitchMonitor.initialize();
});