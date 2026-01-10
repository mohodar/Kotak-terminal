const config = {
  development: {
    port: 3000,
    host: "localhost",
    corsOrigin: "http://localhost:5173",
  },
  production: {
    port: process.env.PORT || 3000,
    host: "0.0.0.0",
    corsOrigin: [
      "https://steadfastapp.in",
      "https://www.steadfastapp.in",
      "https://api.steadfastapp.in",
    ],
  },
};

const environment = process.env.NODE_ENV || "development";
const currentConfig = config[environment];

// Ensure corsOrigin is always an array
currentConfig.corsOrigin = Array.isArray(currentConfig.corsOrigin)
  ? currentConfig.corsOrigin
  : [currentConfig.corsOrigin];

// Add 'Access-Control-Allow-Origin' header to the response
currentConfig.corsHeaders = {
  "Access-Control-Allow-Origin": currentConfig.corsOrigin,
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

module.exports = currentConfig;
