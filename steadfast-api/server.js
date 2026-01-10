const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const config = require("./config");
const net = require("net");

const flattradeRoutes = require("./routes/flattrade");
const shoonyaRoutes = require("./routes/shoonya");
const kotakneoRoutes = require("./routes/kotakneo");
const virtualRoutes = require("./routes/virtual");
const fileUpdates = require('./routes/fileUpdates');

const app = express();

app.use(cors(config.corsHeaders));

app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const fs = require('fs');
const path = require('path');
require("dotenv").config();

// Log unhandled exceptions to a file
process.on('uncaughtException', (err) => {
  const logMessage = `[${new Date().toISOString()}] Uncaught Exception: ${err.stack}\n`;
  fs.appendFileSync('server_crash.log', logMessage);
  console.error("Critical Error logged to server_crash.log");
  process.exit(1);
});

// Log unhandled rejections to a file
process.on('unhandledRejection', (reason, promise) => {
  const logMessage = `[${new Date().toISOString()}] Unhandled Rejection: ${reason.stack || reason}\n`;
  fs.appendFileSync('server_crash.log', logMessage);
});

let storedCredentials = {
  flattrade: { usersession: "", userid: "" },
  shoonya: { usersession: "", userid: "" },
  kotakneo: { usersession: "", userid: "", sid: "", baseUrl: "" },
};

let selectedBroker = "";
const pythonServerPort = 5555; // Match Python server IPC_PORT

app.set("case sensitive routing", false);
app.use("/flattrade", flattradeRoutes(storedCredentials));
app.use("/shoonya", shoonyaRoutes(storedCredentials));
app.use("/kotakneo", kotakneoRoutes(storedCredentials));
app.use("/virtual", virtualRoutes());

app.get("/", (req, res) => res.send("Welcome to the Steadfast API"));

const BROKER_PORTS = {
  flattrade: 8765,
  shoonya: 8766,
  kotakneo: 8767,
};

function sendToPythonServer(message) {
  return new Promise((resolve, reject) => {
    console.log(`Attempting to connect to Python server on port ${pythonServerPort}...`);
    const client = new net.Socket();

    // Add a timeout to prevent hanging
    client.setTimeout(5000);

    client.connect(pythonServerPort, "localhost", () => {
      console.log("Connected to Python server, sending message:", JSON.stringify(message));
      client.write(JSON.stringify(message));
    });

    client.on("data", (data) => {
      console.log("Received data from Python server:", data.toString());
      client.destroy();
      resolve(data.toString());
    });

    client.on("close", () => {
      console.log("Connection to Python server closed");
    });

    client.on("error", (err) => {
      console.error("Error connecting to Python server:", err);
      client.destroy(); // Ensure socket is destroyed on error
      reject(err);
    });

    client.on('timeout', () => {
      console.error('Connection to Python server timed out');
      client.destroy();
      reject(new Error('Connection timed out'));
    });
  });
}

app.post("/set-broker", async (req, res) => {
  const { broker } = req.body;
  if (broker && (broker === "flattrade" || broker === "shoonya" || broker === "kotakneo")) {
    selectedBroker = broker;

    try {
      // Send the broker selection to the Python server
      await sendToPythonServer({
        action: "set_broker",
        broker: selectedBroker,
      });

      const port = BROKER_PORTS[broker];
      res.json({
        message: `Selected broker set to ${selectedBroker}, WebSocket running on port ${port}`,
      });
    } catch (error) {
      console.error("Error sending broker selection:", error);
      res.status(500).json({ message: "Error setting broker" });
    }
  } else {
    res.status(400).json({ message: "Invalid broker selection" });
  }
});

app.use((err, req, res, next) => {
  console.error("Error details:", err);
  console.error("Stack trace:", err.stack);
  res.status(500).json({
    message: "An error occurred on the server",
    error: err.message,
  });
});

app.listen(config.port, config.host, () => {
  console.log(`Server is running on http://${config.host}:${config.port}`);
});

// Code To Download Updated Instrument files everyday after 7am IST(1:30am UTC). 
(async () => {
  // Flattrade
  await fileUpdates.checkAndUpdateFiles('flattrade');
  // Shoonya
  await fileUpdates.checkAndUpdateFiles('shoonya');
  // Kotak Neo
  await fileUpdates.checkAndUpdateFiles('kotakneo');
})();

module.exports = app;
