'use strict';

const { createApp } = require('./app.js');

const PORT = process.env.PORT || 3001;

const { app } = createApp();

app.listen(PORT, () => {
  console.log(`[makeup] Server running at http://localhost:${PORT}`);
  console.log(`[makeup] Environment: ${process.env.NODE_ENV || 'development'}`);
});
