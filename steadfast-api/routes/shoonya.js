const express = require("express");
const router = express.Router();
const { createProxyMiddleware } = require("http-proxy-middleware");
const axios = require("axios");
const NodeCache = require("node-cache");
const fs = require("fs");
const csv = require("fast-csv");
const path = require("path");
const qs = require("qs");
const { parse, isBefore } = require("date-fns");
const unzipper = require("unzipper");

const symbolCache = new NodeCache({ stdTTL: 4 * 60 * 60 });

module.exports = (storedCredentials) => {
  router.use(
    "/shoonyaApi",
    createProxyMiddleware({
      target: "https://api.shoonya.com",
      changeOrigin: true,
      pathRewrite: {
        "^/shoonyaApi": "",
      },
    })
  );

  router.post("/login", async (req, res) => {
    console.log("Received Shoonya login request");
    console.log("Request body:", req.body);
    try {
      if (!req.body || Object.keys(req.body).length === 0) {
        throw new Error("Empty request body");
      }

      const { jKey, jData } = req.body;

      if (!jKey || !jData) {
        throw new Error("jKey or jData is missing");
      }

      const payload = `jKey=${jKey}&jData=${jData}`;

      const response = await axios.post(
        "https://api.shoonya.com/NorenWClientTP/QuickAuth",
        payload,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );
      console.log("Shoonya API response:", response.data);
      res.json(response.data);
    } catch (error) {
      console.error("Error in Shoonya login:", error.message);
      console.error("Full error object:", error);
      res
        .status(400)
        .json({ message: "Error logging in to Shoonya", error: error.message });
    }
  });

  // ===> NON-TRADING API CALLS  <===

  // ===> Endpoint to set Shoonya credentials
  router.post("/setCredentials", (req, res) => {
    console.log("Received POST request to set Shoonya credentials");
    const { usersession, userid } = req.body;

    // Store the Shoonya credentials and security IDs
    storedCredentials.shoonya = {
      usersession,
      userid,
    };

    res.json({ message: "Shoonya Credentials updated successfully" });
    console.log(
      `${new Date().toLocaleTimeString()}  Updated Shoonya credentials`
    );
  });

  // ===> Endpoint to retrieve Shoonya websocket data
  router.get("/websocketData", (req, res) => {
    // console.log("Received GET request for Shoonya websocket data");

    // Use the stored Shoonya credentials and security IDs
    const websocketData = {
      usersession: storedCredentials.shoonya.usersession,
      userid: storedCredentials.shoonya.userid,
    };

    res.json(websocketData);
    console.log("Sending Shoonya websocket data:");
  });

  // ===> Get Shoonya Funds
  router.post("/fundLimit", async (req, res) => {
    const jKey = req.query.SHOONYA_API_TOKEN;
    const clientId = req.query.SHOONYA_CLIENT_ID;

    if (!jKey || !clientId) {
      return res
        .status(400)
        .json({ message: "API token or Client ID is missing." });
    }

    const jData = JSON.stringify({
      uid: clientId,
      actid: clientId,
    });
    const payload = `jKey=${jKey}&jData=${jData}`;
    try {
      const response = await axios.post(
        "https://api.shoonya.com/NorenWClientTP/Limits",
        payload,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );
      res.json(response.data);
    } catch (error) {
      res.status(500).json({
        message: "Error fetching Shoonya fund limits",
        error: error.message,
      });
      console.error("Error fetching Shoonya fund limits:", error);
    }
  });

  // ===> Get Shoonya Symbols
  router.get("/symbols", (req, res) => {
    const { exchangeSymbol, masterSymbol } = req.query;

    const cacheKey = `${exchangeSymbol}_${masterSymbol}`;

    const cachedData = symbolCache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    const bfoSymbolMapping = {
      SENSEX: "BSXOPT",
      BANKEX: "BKXOPT",
      SENSEX50: "SX50OPT",
    };

    const callStrikes = [];
    const putStrikes = [];
    const expiryDates = new Set();

    let zipFilePath;
    if (exchangeSymbol === "BFO") {
      zipFilePath = path.join(__dirname, "../symbols/BFO_symbols.txt.zip");
    } else if (exchangeSymbol === "NFO") {
      zipFilePath = path.join(__dirname, "../symbols/NFO_symbols.txt.zip");
    } else {
      return res
        .status(400)
        .json({ message: "Invalid exchangeSymbol. Must be 'BFO' or 'NFO'." });
    }

    fs.createReadStream(zipFilePath)
      .pipe(unzipper.Parse())
      .on("entry", (entry) => {
        const fileName = entry.path;
        if (fileName.endsWith(".txt")) {
          entry
            .pipe(csv.parse({ headers: true, delimiter: "," }))
            .on("data", (row) => {
              let symbolMatches;
              if (exchangeSymbol === "BFO") {
                const mappedSymbol =
                  bfoSymbolMapping[masterSymbol] || masterSymbol;
                symbolMatches = row["Symbol"].startsWith(mappedSymbol);
              } else {
                symbolMatches = row["Symbol"] === masterSymbol;
              }

              if (row["Exchange"] === exchangeSymbol && symbolMatches) {
                const strikeData = {
                  tradingSymbol: row["TradingSymbol"],
                  securityId: row["Token"],
                  expiryDate: row["Expiry"],
                  strikePrice: row["StrikePrice"],
                  Lotsize: row["LotSize"],
                };
                if (row["OptionType"] === "CE") {
                  callStrikes.push(strikeData);
                } else if (row["OptionType"] === "PE") {
                  putStrikes.push(strikeData);
                }
                expiryDates.add(row["Expiry"]);
              }
            })
            .on("end", () => {
              console.log("\nFinished processing file");
              console.log(`Call Strikes: ${callStrikes.length}`);
              console.log(`Put Strikes: ${putStrikes.length}`);
              console.log(`Expiry Dates: ${expiryDates.size}`);

              callStrikes.sort((a, b) => a.strikePrice - b.strikePrice);
              putStrikes.sort((a, b) => a.strikePrice - b.strikePrice);
              const today = new Date();
              const sortedExpiryDates = Array.from(expiryDates)
                .filter(
                  (dateStr) =>
                    !isBefore(
                      parse(dateStr, "dd-MMM-yyyy", new Date()),
                      today
                    ) ||
                    parse(dateStr, "dd-MMM-yyyy", new Date()).toDateString() ===
                    today.toDateString()
                )
                .sort((a, b) => {
                  const dateA = parse(a, "dd-MMM-yyyy", new Date());
                  const dateB = parse(b, "dd-MMM-yyyy", new Date());
                  return dateA - dateB;
                });

              const result = {
                callStrikes,
                putStrikes,
                expiryDates: sortedExpiryDates,
              };

              symbolCache.set(cacheKey, result);

              res.json(result);
            });
        } else {
          entry.autodrain();
        }
      })
      .on("error", (error) => {
        res.status(500).json({
          message: "Failed to process Shoonya zip file",
          error: error.message,
        });
        console.error(
          `Error processing Shoonya zip file ${zipFilePath}:`,
          error
        );
      });
  });

  // ===> Get Shoonya Orders and Trades
  router.get("/getOrdersAndTrades", async (req, res) => {
    const jKey = req.query.SHOONYA_API_TOKEN;
    const clientId = req.query.SHOONYA_CLIENT_ID;

    if (!jKey || !clientId) {
      return res
        .status(400)
        .json({ message: "Token or Client ID is missing." });
    }

    const orderBookPayload = `jKey=${jKey}&jData=${JSON.stringify({
      uid: clientId,
      prd: "M",
    })}`;
    const tradeBookPayload = `jKey=${jKey}&jData=${JSON.stringify({
      uid: clientId,
      actid: clientId,
    })}`;

    try {
      // Fetch Order Book
      const orderBookRes = await axios.post(
        "https://api.shoonya.com/NorenWClientTP/OrderBook",
        orderBookPayload,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      // Fetch Trade Book
      const tradeBookRes = await axios.post(
        "https://api.shoonya.com/NorenWClientTP/TradeBook",
        tradeBookPayload,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      res.json({
        orderBook: orderBookRes.data,
        tradeBook: tradeBookRes.data,
      });
    } catch (error) {
      res.status(500).json({
        message: "Error fetching Shoonya orders and trades",
        error: error.message,
      });
      console.error("Error fetching Shoonya orders and trades:", error);
    }
  });

  // ===> Get Shoonya Option Greek
  router.post("/getOptionGreek", async (req, res) => {
    const jKey = req.headers.authorization?.split(" ")[1];
    const { jData } = req.body;

    if (!jKey) {
      return res
        .status(400)
        .json({ message: "Token is missing. Please generate a token first." });
    }

    const payload = `jKey=${jKey}&jData=${jData}`;

    try {
      const response = await axios.post(
        "https://api.shoonya.com/NorenWClientTP/GetOptionGreek",
        payload,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );
      res.json(response.data);
      console.log(`\nShoonya Get Option Greek details:`, response.data);
    } catch (error) {
      res.status(500).json({
        message: "Error getting Shoonya option Greek",
        error: error.message,
      });
      console.error("Error getting Shoonya option Greek:", error);
    }
  });

  // ===> TRADING API CALLS <===

  // ===> Place Shoonya Order
  router.post("/placeOrder", async (req, res) => {
    const jKey = req.headers.authorization?.split(" ")[1];

    if (!jKey) {
      return res
        .status(400)
        .json({ message: "Token is missing. Please generate a token first." });
    }

    const jData = qs.parse(req.body);

    // Apply 2-point buffer for SL-LMT orders
    if (jData.prctyp === "SL-LMT") {
      const triggerPrice = parseFloat(jData.trgprc);
      if (!isNaN(triggerPrice)) {
        if (jData.trantype === "BUY" || jData.trantype === "B") {
          jData.prc = (triggerPrice + 2).toString();
        } else if (jData.trantype === "SELL" || jData.trantype === "S") {
          jData.prc = (triggerPrice - 2).toString();
        }
      }
    }

    const payload = `jKey=${jKey}&jData=${JSON.stringify(jData)}`;

    try {
      const response = await axios.post(
        "https://api.shoonya.com/NorenWClientTP/PlaceOrder",
        payload,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );
      res.json(response.data);
      console.log(
        `\nShoonya Order Place details:`,
        jData,
        response.data
      );
    } catch (error) {
      res.status(500).json({
        message: "Error placing Shoonya Place order",
        error: error.message,
      });
      console.error("Error placing Shoonya Place order:", error);
    }
  });

  // ===> Cancel Shoonya Order
  router.post("/cancelOrder", async (req, res) => {
    const { norenordno, uid } = req.body;
    const jKey = req.query.SHOONYA_API_TOKEN;

    if (!jKey) {
      return res
        .status(400)
        .json({ message: "Token is missing. Please generate a token first." });
    }

    const jData = JSON.stringify({ norenordno, uid });
    const payload = `jKey=${jKey}&jData=${jData}`;

    try {
      const response = await axios.post(
        "https://api.shoonya.com/NorenWClientTP/CancelOrder",
        payload,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );
      res.json(response.data);
      console.log(`\n Shoonya Cancel Order:`, { norenordno }, response.data);
    } catch (error) {
      res.status(500).json({
        message: "Error cancelling Shoonya order",
        error: error.message,
      });
      console.error("Error cancelling Shoonya order:", error);
    }
  });

  return router;
};
