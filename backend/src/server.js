const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Locate backend root and load environment variables
const backendDir = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendDir, '.env') });

// Database initialization
require('./config/database');

const transactionRoutes = require('./routes/transactionRoutes');
const budgetRoutes = require('./routes/budgetRoutes');
const splitRoutes = require('./routes/splitRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Parse incoming JSON requests
app.use(express.json());

// API Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Mount API routes
app.use('/api/transactions', transactionRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/splits', splitRoutes);

// JSON 404 handler for unknown API routes
app.use('/api', notFoundHandler);

// Serve frontend static files from myapp- root directory
const frontendDir = path.resolve(backendDir, '..');
app.use(express.static(frontendDir));

// Fallback to index.html for root or client navigation
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// Central error-handling middleware
app.use(errorHandler);

// Start server if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Serving frontend from: ${frontendDir}`);
  });
}

module.exports = app;
