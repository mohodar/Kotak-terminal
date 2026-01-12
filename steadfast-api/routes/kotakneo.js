const express = require("express");
const router = express.Router();
const axios = require("axios");
const NodeCache = require("node-cache");
const fs = require("fs");
const csv = require("fast-csv");
const { parse, isBefore } = require("date-fns");
const unzipper = require("unzipper");
const path = require("path");
const { downloadKotakFiles, isFileOutdated } = require("./fileUpdates");

const symbolCache = new NodeCache({ stdTTL: 4 * 60 * 60 });

const AXIOS_TIMEOUT = 30000; // 30 seconds

async function executeWithRetry(apiFunc, maxRetries = 2, delay = 1000) {
  let lastError;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const response = await apiFunc();

      // Check for HTML response which indicates an error (usually Auth failure from WSO2 gateway)
      if (response && response.data && typeof response.data === 'string' &&
        (response.data.includes('<!DOCTYPE html') || response.data.includes('<html'))) {
        console.error("Received HTML Error Response Content:", response.data.substring(0, 500)); // Log first 500 chars
        const error = new Error('Received HTML response instead of JSON (likely invalid session)');
        error.response = { status: 401, data: response.data }; // Mock a 401 to potentially trigger retry logic if applicable
        throw error;
      }
      return response;
    } catch (error) {
      lastError = error;
      const isTimeout = error.code === 'ECONNABORTED' || error.message.includes('timeout') || error.response?.status === 522 || error.message.includes('ETIMEDOUT');
      const isRetryable = isTimeout || (error.response?.status >= 500 && error.response?.status <= 599);

      if (!isRetryable || i === maxRetries) break;

      console.warn(`Kotak Neo API failed (attempt ${i + 1}/${maxRetries + 1}): ${error.message}. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
  throw lastError;
}

module.exports = (storedCredentials) => {
  // Helper to sync credentials from request if provided and valid
  const syncKotakNeoCredentials = (data, source = "request") => {
    const { accessToken, usersession, auth, sid, userId, userid, baseUrl, baseurl, consumerKey, consumerkey } = data;

    const token = accessToken || usersession || auth;
    const finalSid = sid;
    const finalUserId = userId || userid;
    const finalConsumerKey = consumerKey || consumerkey;
    let finalBaseUrl = baseUrl || baseurl;

    const isValid = (val) => val && val !== "null" && val !== "undefined";

    // Force V2 domain for legacy domains like mis/cis
    // Force V2 domain logic REMOVED to respect API response
    // if (finalBaseUrl && finalBaseUrl.includes("kotaksecurities.com") && !finalBaseUrl.includes("napi") && !finalBaseUrl.includes("cnapi")) {
    //   console.warn(`Force-syncing legacy base URL ${finalBaseUrl} to https://napi.kotaksecurities.com`);
    //   finalBaseUrl = "https://napi.kotaksecurities.com";
    // }

    // Only sync if we have a token AND (it's a new token OR we are missing the consumerKey)
    const isNewToken = token && storedCredentials.kotakneo.usersession !== token;
    const isMissingKey = !storedCredentials.kotakneo.consumerKey && isValid(finalConsumerKey);

    if (token) {
      // Debug logging to see what's happening
      if (isNewToken) {
        console.log(`[Sync Debug] Token Mismatch! Stored: ${(storedCredentials.kotakneo.usersession || '').substring(0, 5)}... New: ${token.substring(0, 5)}... Source: ${source}`);

        // CRITICAL: If we have a valid stored session WITH a consumerKey, DO NOT overwrite it with a request that has NO consumerKey
        // This prevents stale frontend requests (which often lack consumerKey) from killing a valid session
        if (storedCredentials.kotakneo.consumerKey && !isValid(finalConsumerKey)) {
          console.warn(`[Sync Protection] IGNORED stale credentials from ${source} because they lack ConsumerKey and we have a valid active session.`);
          return;
        }
      }
    }

    if (token && (isNewToken || isMissingKey)) {
      console.log(`Auto-syncing Kotak Neo credentials from ${source}...`);

      const newCredentials = {
        usersession: token,
        userid: isValid(finalUserId) ? finalUserId : (storedCredentials.kotakneo.userid || finalUserId),
        sid: isValid(finalSid) ? finalSid : (storedCredentials.kotakneo.sid || finalSid),
        baseUrl: isValid(finalBaseUrl) ? finalBaseUrl : (storedCredentials.kotakneo.baseUrl || "https://napi.kotaksecurities.com"),
        consumerKey: isValid(finalConsumerKey) ? finalConsumerKey : (storedCredentials.kotakneo.consumerKey || finalConsumerKey)
      };

      console.log(`Sync detail: tokenChanged=${isNewToken}, keyRecovered=${isMissingKey}`);
      console.log(`Previous Key: ${!!storedCredentials.kotakneo.consumerKey}, New Key: ${!!newCredentials.consumerKey}`);

      storedCredentials.kotakneo = newCredentials;

      console.log(`Synced credentials: hasSession=${!!storedCredentials.kotakneo.usersession}, hasConsumerKey=${!!storedCredentials.kotakneo.consumerKey}, baseUrl=${storedCredentials.kotakneo.baseUrl}`);

      if (!storedCredentials.kotakneo.consumerKey) {
        console.warn("WARNING: Kotak Neo consumerKey is still MISSING after sync.");
      }
    }
  };

  const getEffectiveBaseUrl = (passedUrl) => {
    let url = passedUrl || (storedCredentials.kotakneo && storedCredentials.kotakneo.baseUrl) || "https://napi.kotaksecurities.com";

    // Ensure we only have the protocol and domain, no path
    try {
      if (url.includes("http")) {
        const urlObj = new URL(url);
        url = `${urlObj.protocol}//${urlObj.host}`;
      }
    } catch (e) {
      console.warn("Invalid URL in getEffectiveBaseUrl:", url);
    }

    // Force V2 domain logic REMOVED
    // if (url.includes("kotaksecurities.com") && !url.includes("napi") && !url.includes("cnapi")) {
    //   return "https://napi.kotaksecurities.com";
    // }
    return url;
  };

  const getPathPrefix = (baseUrl) => {
    // V2 prefix is required for both napi and cnapi domains.
    const isV2 = baseUrl.includes("napi.kotaksecurities.com") || baseUrl.includes("cnapi.kotaksecurities.com");
    return isV2 ? "/Orders/2.0" : "";
  };

  // ===> NON-TRADING API CALLS  <===

  // ===> Login / Generate Token
  router.post("/generateToken", async (req, res) => {
    console.log("Received Kotak Neo generateToken request");
    const { accessToken, userId, mobileNumber, mpin, totp, consumerKey } = req.body;

    try {
      // Step 2: Trade API Login (Mobile, UCC, TOTP)
      console.log("Step 1: tradeApiLogin...");

      // User specifically requested +91 format
      const cleanMobile = mobileNumber.startsWith("+") ? mobileNumber : "+" + mobileNumber;

      const loginPayload = {
        mobileNumber: cleanMobile,
        ucc: userId,
        totp: totp,
      };

      const loginHeaders = {
        Authorization: consumerKey || accessToken,
        "neo-fin-key": "neotradeapi",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "NeoTradeApi-python/1.1.0",
      };

      console.log("-----------------------------------------");
      console.log("KOTAK STEP 1: tradeApiLogin");
      console.log("Payload:", JSON.stringify(loginPayload));
      console.log("Headers (Auth masked):", { ...loginHeaders, Authorization: (consumerKey || accessToken) ? `${(consumerKey || accessToken).substring(0, 5)}***` : 'null' });
      console.log("-----------------------------------------");

      const loginResponse = await axios.post(
        "https://mis.kotaksecurities.com/login/1.0/tradeApiLogin",
        loginPayload,
        { headers: loginHeaders }
      ).catch(err => {
        console.error("tradeApiLogin Axios Error Status:", err.response?.status);
        console.error("tradeApiLogin Axios Error Data:", JSON.stringify(err.response?.data, null, 2));
        throw err;
      });

      if (!loginResponse.data.data || loginResponse.data.data.status !== "success") {
        const errorMsg = loginResponse.data.message || loginResponse.data.data?.message || "Login step failed";
        console.error("Step 1 Failed:", errorMsg, loginResponse.data);
        throw new Error(errorMsg);
      }

      const viewToken = loginResponse.data.data.token;
      const viewSid = loginResponse.data.data.sid;


      // Step 3: Trade API Validate (MPIN)
      console.log("Step 2: tradeApiValidate...");
      const validatePayload = { mpin: String(mpin) };
      const validateHeaders = {
        Authorization: consumerKey || accessToken,
        "neo-fin-key": "neotradeapi",
        Auth: viewToken,
        sid: viewSid,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "NeoTradeApi-python/1.1.0",
      };

      console.log("Validate Payload (MPIN):", JSON.stringify(validatePayload));
      console.log("Validate Headers (Auth masked):", {
        ...validateHeaders,
        Authorization: (consumerKey || accessToken) ? `${(consumerKey || accessToken).substring(0, 5)}***` : 'null',
        Auth: viewToken ? `${viewToken.substring(0, 5)}***` : 'null'
      });

      const validateResponse = await axios.post(
        "https://mis.kotaksecurities.com/login/1.0/tradeApiValidate",
        validatePayload,
        { headers: validateHeaders }
      ).catch(err => {
        console.error("tradeApiValidate Axios Error Status:", err.response?.status);
        console.error("tradeApiValidate Axios Error Data:", JSON.stringify(err.response?.data, null, 2));
        throw err;
      });

      if (!validateResponse.data.data || validateResponse.data.data.status !== "success") {
        const errorMsg = validateResponse.data.message || validateResponse.data.data?.message || "Validation step failed";
        console.error("Step 2 Failed:", errorMsg, validateResponse.data);
        throw new Error(errorMsg);
      }


      let finalBaseUrl = validateResponse.data.data.baseUrl;
      // Force V2 domain logic REMOVED
      // if (finalBaseUrl && (finalBaseUrl.includes("cis.kotaksecurities.com") || finalBaseUrl.includes("mis.kotaksecurities.com"))) {
      //   console.warn(`Overriding base URL ${finalBaseUrl} with https://napi.kotaksecurities.com`);
      //   finalBaseUrl = "https://napi.kotaksecurities.com";
      // }

      // Update stored credentials for WebSocket server
      storedCredentials.kotakneo = {
        usersession: validateResponse.data.data.token,
        userid: userId,
        sid: validateResponse.data.data.sid,
        baseUrl: finalBaseUrl,
        consumerKey: consumerKey || accessToken, // Store the original apiKey/consumerKey
        serverId: validateResponse.data.data.hsServerId, // Store hsServerId for WebSocket
      };

      console.log("Step 2 Success: Trading token obtained. BaseURL:", finalBaseUrl);
      console.log("Stored credentials after login:", {
        userid: storedCredentials.kotakneo.userid,
        hasConsumerKey: !!storedCredentials.kotakneo.consumerKey,
        baseUrl: storedCredentials.kotakneo.baseUrl
      });

      // Return the final tokens and SID, plus baseUrl
      res.json({
        accessToken: validateResponse.data.data.token,
        sid: validateResponse.data.data.sid,
        baseUrl: finalBaseUrl,
        userId,
        serverId: validateResponse.data.data.hsServerId, // Send serverId back
      });
    } catch (error) {
      const errorData = error.response ? error.response.data : error.message;
      console.error("Error in Kotak Neo detailed flow:", JSON.stringify(errorData, null, 2));

      let errorMessage = "Error generating token";
      if (error.response && error.response.data) {
        // Kotak error structure can be nested or flat
        errorMessage = error.response.data.message ||
          error.response.data.error?.message ||
          error.response.data.data?.message ||
          JSON.stringify(error.response.data);
      } else {
        errorMessage = error.message;
      }

      res.status(error.response ? error.response.status : 400).json({
        message: errorMessage,
        error: errorData,
      });
    }

  });

  router.post("/setCredentials", (req, res) => {
    const { usersession, userid, sid, baseUrl, consumerKey, serverId } = req.body;
    console.log("Setting Kotak Neo credentials manually:", { userid, baseUrl, hasConsumerKey: !!consumerKey, hasServerId: !!serverId });
    storedCredentials.kotakneo = {
      usersession,
      userid,
      sid,
      baseUrl: baseUrl || "https://napi.kotaksecurities.com", // Keeping default but allowing override
      consumerKey: (consumerKey && consumerKey !== "null" && consumerKey !== "undefined") ? consumerKey : storedCredentials.kotakneo.consumerKey,
      serverId: serverId || storedCredentials.kotakneo.serverId
    };
    res.json({ message: "Kotak Neo Credentials updated successfully" });
  });

  router.get("/websocketData", (req, res) => {
    const websocketData = {
      usersession: storedCredentials.kotakneo.usersession,
      userid: storedCredentials.kotakneo.userid,
      sid: storedCredentials.kotakneo.sid,
      baseUrl: storedCredentials.kotakneo.baseUrl,
      consumerKey: storedCredentials.kotakneo.consumerKey,
      serverId: storedCredentials.kotakneo.serverId,
    };
    console.log("Serving websocketData to Python:", {
      hasSession: !!websocketData.usersession,
      hasConsumerKey: !!websocketData.consumerKey,
      baseUrl: websocketData.baseUrl
    });
    res.json(websocketData);
  });

  // ===> Get Fund Limits
  router.post("/fundLimit", async (req, res) => {
    syncKotakNeoCredentials(req.query, "fundLimit query");

    const { accessToken, sid, userId, baseUrl, serverId } = req.query;

    const currentBaseUrl = getEffectiveBaseUrl(baseUrl);
    if (!currentBaseUrl) {
      return res.status(400).json({ message: "baseUrl is required for Kotak Neo V2 APIs" });
    }

    try {
      const pathPrefix = getPathPrefix(currentBaseUrl);

      const hasServerId = serverId && serverId !== "undefined" && serverId !== "null";
      const url = hasServerId ? `${currentBaseUrl}${pathPrefix}/quick/user/limits?sId=${serverId}` : `${currentBaseUrl}${pathPrefix}/quick/user/limits`;

      console.log(`Fetching fund limits from: ${url}`);

      const response = await executeWithRetry(() => axios.post(
        url,
        new URLSearchParams({ jData: JSON.stringify({ seg: "ALL", exch: "ALL", prod: "ALL" }) }),
        {
          headers: {
            Authorization: storedCredentials.kotakneo.consumerKey,
            "neo-fin-key": "neotradeapi",
            Auth: accessToken,
            sid: sid,
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "User-Agent": "NeoTradeApi-python/1.1.0"
          },
          timeout: AXIOS_TIMEOUT
        }
      ));

      res.json(response.data);
    } catch (error) {
      console.error("Error fetching Kotak Neo fund limits:", error.message);
      res.status(500).json({
        message: "Error fetching Kotak Neo fund limits",
        error: error.message,
      });
    }
  });

  // ===> Get Symbols (Dynamic version with lazy download)
  // ===> Get Symbols (Refactored for 3-Tier Fallback on missing file OR missing data)
  router.get("/symbols", async (req, res) => {
    const { exchangeSymbol, masterSymbol } = req.query;
    const cacheKey = `${exchangeSymbol}_${masterSymbol}`;

    const cachedData = symbolCache.get(cacheKey);
    if (cachedData) return res.json(cachedData);

    const callStrikes = [];
    const putStrikes = [];
    const expiryDates = new Set();

    // Define Sources in priority order
    const segment = exchangeSymbol === "BFO" ? "bse_fo" : "nse_fo";
    const sources = [
      {
        name: 'kotak',
        path: `./symbols/kotak_${segment}.csv`,
        type: 'csv',
        isKotak: true // triggers download check
      },
      {
        name: 'flattrade',
        path: `./symbols/${exchangeSymbol === "BFO" ? "Bfo_Index_Derivatives.csv" : "Nfo_Index_Derivatives.csv"}`,
        type: 'csv'
      },
      {
        name: 'shoonya',
        path: `./symbols/${exchangeSymbol === "BFO" ? "BFO_symbols.txt.zip" : "NFO_symbols.txt.zip"}`,
        type: 'zip'
      }
    ];

    // Helper to map columns from any source to standardized format
    const mapRow = (row, isKotak = false, segment = '') => {
      // Kotak: pTrdSymbol, lToken/lKey, lLotSize, pExpiryDate (EPOCH), dStrikePrice, pOptionType
      // Flattrade: Tradingsymbol, Token, Lotsize, Expiry, Strike, Optiontype
      // Shoonya: TradingSymbol, Token, LotSize, Expiry, StrikePrice, OptionType

      let expiryDate = row["Expiry"] || row["pExpiryDate"] || row["expDt"] || row["lExpiryDate "] || row["lExpiryDate"];

      // Kotak specific date handling
      if (isKotak && expiryDate) {
        let epoch = parseInt(expiryDate);
        if (!isNaN(epoch)) {
          // nse_fo and cde_fo: Add 315511200 to the epoch value and convert it to IST.
          // mcx_fo and bse_fo: Epoch (lExpiryDate) can be directly converted into human readable date.
          if (segment.includes('nse_fo') || segment.includes('cde_fo')) {
            epoch += 315511200;
          }
          const dateObj = new Date(epoch * 1000);
          const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
          expiryDate = `${String(dateObj.getDate()).padStart(2, '0')}-${months[dateObj.getMonth()]}-${dateObj.getFullYear()}`;
        }
      }

      return {
        tradingSymbol: row["pTrdSymbol"] || row["Tradingsymbol"] || row["trdSym"] || row["TradingSymbol"],
        securityId: (isKotak && row["pSymbol"]) || row["lToken"] || row["lKey"] || row["Token"] || row["Key"] || row["pScripRefKey"],
        expiryDate: expiryDate,
        strikePrice: parseFloat(row["dStrikePrice;"] || row["dStrikePrice"] || row["Strike"] || row["strkPrc"] || row["StrikePrice"]) / (isKotak ? 100 : 1),
        lotsize: parseInt(row["lLotSize"] || row["Lotsize"] || row["lotSz"] || row["LotSize"]),
        optionType: row["pOptionType"] || row["Optiontype"] || row["optTp"] || row["OptionType"],
        symbol: row["pSymbolName"] || row["pSymbol"] || row["Symbol"] || row["uSym"]
      };
    };

    // Helper function to read and filter symbols from a source
    const readSource = (source) => {
      return new Promise((resolve, reject) => {
        const rows = [];
        const processRow = (rawRow) => {
          const row = mapRow(rawRow, source.isKotak, segment);
          // Filter logic: Check if symbol matches masterSymbol
          // Kotak uses 'pSymbol' (e.g., NIFTY 50). 
          // Flattrade uses 'Symbol' (e.g., NIFTY).
          const rowSymbol = (row.symbol || "").toUpperCase();
          const master = masterSymbol.toUpperCase();

          if (rowSymbol === master || (source.isKotak && rowSymbol === `${master} 50`) ||
            (row.tradingSymbol && row.tradingSymbol.startsWith(master))) {
            rows.push(row);
          }
        };

        const handleEnd = () => resolve(rows);
        const handleError = (err) => {
          console.error(`Error reading ${source.name}: ${err.message}`);
          resolve([]); // Resolve empty to continue fallback loop
        };

        try {
          if (source.type === 'zip') {
            fs.createReadStream(source.path)
              .pipe(unzipper.Parse())
              .on("entry", (entry) => {
                if (entry.path.endsWith('.txt') || entry.path.endsWith('.csv')) {
                  entry.pipe(csv.parse({ headers: true }))
                    .on("data", processRow)
                    .on("end", handleEnd)
                    .on("error", handleError);
                } else {
                  entry.autodrain();
                }
              })
              .on('error', handleError)
              .on('finish', () => { if (rows.length === 0) resolve([]); }); // fallback if no entries processed
          } else {
            csv.parseFile(source.path, { headers: true })
              .on("data", processRow)
              .on("end", handleEnd)
              .on("error", handleError);
          }
        } catch (e) {
          handleError(e);
        }
      });
    };

    let finalRows = [];
    let successfulSource = null;

    // Loop through sources until we find data
    for (const source of sources) {
      // 1. Check existence / Download logic for Kotak
      if (source.isKotak) {
        if (isFileOutdated(source.path)) {
          try {
            console.log(`Kotak file ${source.path} outdated/missing. Attempting lazy download...`);
            // Only try if we have credentials, else skip download attempt
            if (storedCredentials.kotakneo.usersession) {
              await downloadKotakFiles(storedCredentials.kotakneo);
            } else {
              console.warn("Kotak credentials missing (not logged in?), skipping lazy download check.");
            }
          } catch (e) {
            console.error("Kotak download failed:", e.message);
          }
        } else {
          console.log(`Kotak symbol file ${source.path} is up-to-date.`);
        }
      }

      if (!fs.existsSync(source.path)) {
        console.warn(`Source file missing: ${source.path} (${source.name}). Skipping.`);
        continue;
      }

      console.log(`Reading symbols from ${source.name} (${source.path})...`);
      const rows = await readSource(source);

      if (rows && rows.length > 0) {
        console.log(`Found ${rows.length} symbols in ${source.name} for ${masterSymbol}.`);
        finalRows = rows;
        successfulSource = source.name;
        break; // Stop looking, we found data
      } else {
        console.warn(`File ${source.path} exists but yielded 0 symbols for ${masterSymbol}. Trying next source...`);
      }
    }

    if (finalRows.length === 0) {
      console.error(`All sources failed to provide symbols for ${masterSymbol}`);
      return res.status(404).json({ message: `Symbol file not found or empty for ${exchangeSymbol}` });
    }

    // Process the found rows
    finalRows.forEach((row) => {
      const strikeData = {
        tradingSymbol: row.tradingSymbol,
        securityId: row.securityId,
        expiryDate: row.expiryDate,
        strikePrice: row.strikePrice,
        lotsize: row.lotsize,
      };

      // Normalize Option Type (CE/PE vs Call/Put)
      const optType = (row.optionType || "").toUpperCase();
      if (optType === "CE" || optType === "CALL" || optType === "C") {
        callStrikes.push(strikeData);
      } else if (optType === "PE" || optType === "PUT" || optType === "P") {
        putStrikes.push(strikeData);
      }

      if (row.expiryDate) {
        expiryDates.add(row.expiryDate);
      }
    });

    const today = new Date();
    const sortedExpiryDates = Array.from(expiryDates)
      .filter(dateStr => {
        if (!dateStr) return false;
        try {
          let parsedDate;
          // Handle different date formats: DD-MMM-YYYY (Flattrade/Shoonya) or DD-MM-YYYY (Kotak sometimes)
          parsedDate = parse(dateStr, "dd-MMM-yyyy", new Date());
          if (isNaN(parsedDate)) parsedDate = parse(dateStr, "dd-MM-yyyy", new Date());
          if (isNaN(parsedDate)) parsedDate = new Date(dateStr);

          if (isNaN(parsedDate)) return false;
          return !isBefore(parsedDate, today) || parsedDate.toDateString() === today.toDateString();
        } catch (e) { return false; }
      })
      .sort((a, b) => {
        const dateA = new Date(a);
        const dateB = new Date(b);
        // Try parse if native date constructor fails for sorting, but filter handled it mostly
        return dateA - dateB;
      });

    const result = {
      callStrikes: callStrikes.sort((a, b) => a.strikePrice - b.strikePrice),
      putStrikes: putStrikes.sort((a, b) => a.strikePrice - b.strikePrice),
      expiryDates: sortedExpiryDates,
      source: successfulSource // Useful debugging info
    };

    symbolCache.set(cacheKey, result);
    res.json(result);
  });

  // ===> Get Orders and Trades
  router.get("/getOrdersAndTrades", async (req, res) => {
    syncKotakNeoCredentials(req.query, "getOrdersAndTrades query");

    const { accessToken, sid, userId, baseUrl, serverId } = req.query;

    const currentBaseUrl = getEffectiveBaseUrl(baseUrl);
    if (!currentBaseUrl) {
      return res.status(400).json({ message: "baseUrl is required for Kotak Neo V2 APIs" });
    }

    try {
      const pathPrefix = getPathPrefix(currentBaseUrl);

      const hasServerId = serverId && serverId !== "undefined" && serverId !== "null";
      const ordersUrl = hasServerId ? `${currentBaseUrl}${pathPrefix}/quick/user/orders?sId=${serverId}` : `${currentBaseUrl}${pathPrefix}/quick/user/orders`;
      const tradesUrl = hasServerId ? `${currentBaseUrl}${pathPrefix}/quick/user/trades?sId=${serverId}` : `${currentBaseUrl}${pathPrefix}/quick/user/trades`;

      console.log(`Fetching orders from: ${ordersUrl}`);
      console.log(`Fetching trades from: ${tradesUrl}`);

      const [orderBookRes, tradeBookRes] = await Promise.all([
        executeWithRetry(() => axios.get(ordersUrl, {
          headers: {
            Authorization: storedCredentials.kotakneo.consumerKey,
            "neo-fin-key": "neotradeapi",
            Auth: accessToken,
            sid: sid,
            Accept: "application/json",
            "User-Agent": "NeoTradeApi-python/1.1.0"
          },
          timeout: AXIOS_TIMEOUT
        })),
        executeWithRetry(() => axios.get(tradesUrl, {
          headers: {
            Authorization: storedCredentials.kotakneo.consumerKey,
            "neo-fin-key": "neotradeapi",
            Auth: accessToken,
            sid: sid,
            Accept: "application/json",
            "User-Agent": "NeoTradeApi-python/1.1.0"
          },
          timeout: AXIOS_TIMEOUT
        }))
      ]);

      // Map Kotak Neo V2 fields to Noren-style fields expected by frontend
      const mappedOrders = (orderBookRes.data.data || []).map(order => {
        const timeStr = order.ordDtTm || order.ordEntTm || "";
        const timeOnly = timeStr.includes(" ") ? timeStr.split(" ")[1] : timeStr;

        return {
          ...order,
          norenordno: order.nOrdNo,
          tsym: order.trdSym,
          trantype: order.trnsTp || "",
          qty: order.qty,
          prc: order.prc,
          status: order.ordSt || order.stat,
          norentm: timeOnly,
          rejreason: order.rejRes || "",
          prctyp: order.prcTp, // Correct mapping: Order Type (L/MKT/SL/SL-M)
          trgprc: order.trgPrc  // Correct mapping: Trigger Price
        };
      });

      const mappedTrades = (tradeBookRes.data.data || []).map(trade => {
        const timeStr = trade.flTm || trade.exTm || "";
        const timeOnly = timeStr.includes(" ") ? timeStr.split(" ")[1] : timeStr;

        return {
          ...trade,
          norenordno: trade.nOrdNo,
          tsym: trade.trdSym,
          trantype: trade.trnsTp || "",
          qty: trade.fldQty,
          flprc: trade.avgPrc,
          norentm: timeOnly
        };
      });

      res.json({
        orderBook: mappedOrders,
        tradeBook: mappedTrades,
      });
    } catch (error) {
      console.error("Error fetching Kotak Neo orders/trades:", error.message);
      res.status(500).json({ message: "Error fetching Kotak Neo orders/trades", error: error.message });
    }
  });

  // ===> Place Order
  router.post("/placeOrder", async (req, res) => {
    syncKotakNeoCredentials(req.headers, "placeOrder headers");

    const auth = req.headers.authorization; // session token (Auth)
    const sid = req.headers.sid;
    const baseUrl = req.headers.baseurl;
    const serverId = req.headers.serverid;

    // Apply 2-point buffer for SL orders
    if (req.body.pt === "SL") {
      const triggerPrice = parseFloat(req.body.tp);
      if (!isNaN(triggerPrice)) {
        if (req.body.tt === "BUY" || req.body.tt === "B") {
          req.body.pr = (triggerPrice + 2).toString();
        } else if (req.body.tt === "SELL" || req.body.tt === "S") {
          req.body.pr = (triggerPrice - 2).toString();
        }
      }
    }

    try {
      const currentBaseUrl = getEffectiveBaseUrl(baseUrl);
      const pathPrefix = getPathPrefix(currentBaseUrl);

      const hasServerId = serverId && serverId !== "undefined" && serverId !== "null";
      const url = hasServerId ? `${currentBaseUrl}${pathPrefix}/quick/order/rule/ms/place?sId=${serverId}` : `${currentBaseUrl}${pathPrefix}/quick/order/rule/ms/place`;

      console.log(`Placing order at: ${url}`);

      const response = await axios.post(url,
        new URLSearchParams({ jData: JSON.stringify(req.body) }),
        {
          headers: {
            Authorization: storedCredentials.kotakneo.consumerKey,
            "neo-fin-key": "neotradeapi",
            Auth: auth,
            sid: sid,
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "User-Agent": "NeoTradeApi-python/1.1.0"
          },
          timeout: AXIOS_TIMEOUT
        }
      );
      res.json(response.data);
    } catch (error) {
      console.error("Error placing Kotak Neo order:", error.response?.data || error.message);
      res.status(500).json({ message: "Error placing Kotak Neo order", error: error.response?.data || error.message });
    }
  });

  // ===> Cancel Order
  router.post("/cancelOrder", async (req, res) => {
    syncKotakNeoCredentials(req.headers, "cancelOrder headers");

    const { orderId, tradingSymbol } = req.body;
    const auth = req.headers.authorization;
    const sid = req.headers.sid;
    const baseUrl = req.headers.baseurl;
    const serverId = req.headers.serverid;

    if (!baseUrl) {
      return res.status(400).json({ message: "baseUrl is required for Kotak Neo V2 APIs" });
    }

    try {
      const currentBaseUrl = getEffectiveBaseUrl(baseUrl);
      const pathPrefix = getPathPrefix(currentBaseUrl);

      const hasServerId = serverId && serverId !== "undefined" && serverId !== "null";
      const url = hasServerId ? `${currentBaseUrl}${pathPrefix}/quick/order/cancel?sId=${serverId}` : `${currentBaseUrl}${pathPrefix}/quick/order/cancel`;

      console.log(`Cancelling order at: ${url}`);

      const response = await axios.post(url,
        new URLSearchParams({ jData: JSON.stringify({ on: orderId, am: "NO", ts: tradingSymbol }) }),
        {
          headers: {
            Authorization: storedCredentials.kotakneo.consumerKey,
            "neo-fin-key": "neotradeapi",
            Auth: auth,
            sid: sid,
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "User-Agent": "NeoTradeApi-python/1.1.0"
          },
          timeout: AXIOS_TIMEOUT
        }
      );
      res.json(response.data);
    } catch (error) {
      console.error("Error cancelling Kotak Neo order:", error.response?.data || error.message);
      res.status(500).json({ message: "Error cancelling Kotak Neo order", error: error.response?.data || error.message });
    }
  });

  // ===> Modify Order
  router.post("/modifyOrder", async (req, res) => {
    syncKotakNeoCredentials(req.headers, "modifyOrder headers");

    const auth = req.headers.authorization;
    const sid = req.headers.sid;
    const baseUrl = req.headers.baseurl;
    const serverId = req.headers.serverid;

    if (!baseUrl) {
      return res.status(400).json({ message: "baseUrl is required for Kotak Neo V2 APIs" });
    }

    // Apply 2-point buffer for SL orders (Frontend usually handles strict logic but this is a fail-safe)
    if (req.body.pt === "SL" || req.body.pt === "SL-M") {
      const triggerPrice = parseFloat(req.body.tp);
      if (!isNaN(triggerPrice)) {
        if (req.body.tt === "BUY" || req.body.tt === "B") {
          req.body.pr = (triggerPrice + 2).toString();
        } else if (req.body.tt === "SELL" || req.body.tt === "S") {
          req.body.pr = (triggerPrice - 2).toString();
        }
      }
    }

    try {
      const currentBaseUrl = getEffectiveBaseUrl(baseUrl);
      const pathPrefix = getPathPrefix(currentBaseUrl);

      const hasServerId = serverId && serverId !== "undefined" && serverId !== "null";
      const url = hasServerId ? `${currentBaseUrl}${pathPrefix}/quick/order/vr/modify?sId=${serverId}` : `${currentBaseUrl}${pathPrefix}/quick/order/vr/modify`;

      console.log(`Modifying order at: ${url}`);

      // Construct Payload aligned with Kotak Neo API Documentation
      // Documentation requires: tk, mp, pc, dd, dq, vd, ts, tt, pr, tp, qt, no, es, pt
      const reqBody = req.body;

      const payload = {
        no: reqBody.no || reqBody.on || reqBody.nOrdNo, // Nest Order Number
        tk: reqBody.tk || reqBody.tok || reqBody.token, // Instrument Token
        vd: reqBody.vd || reqBody.rt || "DAY",          // Validity
        ts: reqBody.ts || reqBody.tradingSymbol || reqBody.trdSym, // Trading Symbol
        tt: reqBody.tt,                                 // Transaction Type (B/S)
        qt: reqBody.qt || reqBody.qty,                  // Quantity
        pr: reqBody.pr || reqBody.price || "0",         // Price
        tp: reqBody.tp || reqBody.triggerPrice || "0",  // Trigger Price
        pt: reqBody.pt || reqBody.priceType,            // Product Type (L, MKT, SL, SL-M)
        es: reqBody.es || reqBody.exchangeSegment,      // Exchange Segment
        pc: reqBody.pc || reqBody.productCode || reqBody.prod, // Product Code (NRML, MIS, etc.)
        mp: reqBody.mp || "0",                          // Market Protection
        dq: reqBody.dq || "0",                          // Disclosed Quantity
        dd: reqBody.dd || "NA",                         // Date/Days
        am: reqBody.am || "NO"                          // After Market Order field (from curl example)
      };

      // Ensure 'no' (Order Number) is present
      if (!payload.no) {
        throw new Error("Missing Order Number ('no' or 'on') in payload");
      }

      console.log('Modify Payload:', JSON.stringify(payload));

      const response = await axios.post(url,
        new URLSearchParams({ jData: JSON.stringify(payload) }),
        {
          headers: {
            Authorization: storedCredentials.kotakneo.consumerKey,
            "neo-fin-key": "neotradeapi",
            Auth: auth,
            sid: sid,
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "User-Agent": "NeoTradeApi-python/1.1.0"
          },
          timeout: AXIOS_TIMEOUT
        }
      );
      console.log('Modify Order Response:', JSON.stringify(response.data, null, 2));
      res.json(response.data);
    } catch (error) {
      console.error("Error modifying Kotak Neo order:", error.response?.data || error.message);
      res.status(500).json({ message: "Error modifying Kotak Neo order", error: error.response?.data || error.message });
    }
  });

  // ===> Get Positions
  router.get("/getPositions", async (req, res) => {
    syncKotakNeoCredentials(req.query, "getPositions query");

    const { accessToken, sid, userId, baseUrl, serverId } = req.query;

    const currentBaseUrl = getEffectiveBaseUrl(baseUrl);
    if (!currentBaseUrl) {
      return res.status(400).json({ message: "baseUrl is required for Kotak Neo V2 APIs" });
    }

    try {
      const pathPrefix = getPathPrefix(currentBaseUrl);

      const hasServerId = serverId && serverId !== "undefined" && serverId !== "null";
      const url = hasServerId ? `${currentBaseUrl}${pathPrefix}/quick/user/positions?sId=${serverId}` : `${currentBaseUrl}${pathPrefix}/quick/user/positions`;

      console.log(`Fetching positions from: ${url}`);

      const response = await executeWithRetry(() => axios.get(url, {
        headers: {
          Authorization: storedCredentials.kotakneo.consumerKey,
          "neo-fin-key": "neotradeapi",
          Auth: accessToken,
          Sid: sid,
          Accept: "application/json"
        },
        timeout: AXIOS_TIMEOUT
      }));

      console.log("Kotak Positions Raw Response:", JSON.stringify(response.data, null, 2));

      // Map Kotak Neo V2 fields to Noren-style fields expected by frontend
      const mappedPositions = (response.data.data || []).map(pos => {
        // Calculate Net Qty if not provided directly
        let netQty = pos.netQty || pos.netQuantity || pos.NetQty || pos.qty;
        if (netQty === undefined || netQty === null) {
          const buyQty = (Number(pos.flBuyQty) || 0) + (Number(pos.cfBuyQty) || 0);
          const sellQty = (Number(pos.flSellQty) || 0) + (Number(pos.cfSellQty) || 0);
          netQty = buyQty - sellQty;
        }

        // Calculate average prices from amounts and quantities
        const totalBuyQty = (Number(pos.flBuyQty) || 0) + (Number(pos.cfBuyQty) || 0);
        const totalSellQty = (Number(pos.flSellQty) || 0) + (Number(pos.cfSellQty) || 0);
        const buyAmount = Number(pos.buyAmt) || 0;
        const sellAmount = Number(pos.sellAmt) || 0;

        const buyAvgPrice = totalBuyQty > 0 ? (buyAmount / totalBuyQty).toFixed(2) : "0.00";
        const sellAvgPrice = totalSellQty > 0 ? (sellAmount / totalSellQty).toFixed(2) : "0.00";

        // Calculate realized PnL only for squared (closed) portions
        // Realized PnL = (Sell Avg - Buy Avg) * Min(Buy Qty, Sell Qty)
        // For open positions (only buy OR only sell), realized PnL should be 0
        let realizedPnl = "0.00";
        if (totalBuyQty > 0 && totalSellQty > 0) {
          // Position has both buy and sell - calculate realized PnL for the squared portion
          const squaredQty = Math.min(totalBuyQty, totalSellQty);
          const buyAvg = buyAmount / totalBuyQty;
          const sellAvg = sellAmount / totalSellQty;
          realizedPnl = ((sellAvg - buyAvg) * squaredQty).toFixed(2);
        }

        return {
          ...pos,
          token: pos.tok || pos.token || pos.instrumentToken,
          tsym: pos.trdSym || pos.tradingSymbol || pos.symbol,
          netqty: netQty || 0,
          lp: pos.ltp || pos.LTP || pos.lastPrice || "0.00",
          prd: pos.prod || pos.product || pos.prd,
          // Map exchange segment (e.g., bse_fo -> BFO, nse_fo -> NFO)
          exch: pos.exSeg === "nse_fo" ? "NFO" :
            pos.exSeg === "bse_fo" ? "BFO" :
              pos.exSeg === "nse_cm" ? "NSE" :
                pos.exSeg === "bse_cm" ? "BSE" :
                  pos.exSeg?.toUpperCase() || pos.exch || "NFO",
          totbuyavgprc: buyAvgPrice,
          totsellavgprc: sellAvgPrice,
          netavgprc: netQty > 0 ? buyAvgPrice : sellAvgPrice,
          daybuyamt: buyAmount,
          daysellamt: sellAmount,
          rpnl: realizedPnl,
          prcftr: pos.multiplier || "1"
        };
      });

      res.json({
        ...response.data,
        data: mappedPositions
      });
    } catch (error) {
      console.error("Error fetching Kotak Neo positions:", error.message);
      res.status(500).json({ message: "Error fetching Kotak Neo positions", error: error.message });
    }
  });

  return router;
};
