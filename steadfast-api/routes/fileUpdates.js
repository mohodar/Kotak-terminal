const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { formatISO, fromUnixTime, isBefore } = require('date-fns');

const symbolsFolder = path.join(path.resolve(__dirname, '../'), 'symbols'); // Ensure 'symbols' folder exists

// Ensure 'symbols' folder exists
if (!fs.existsSync(symbolsFolder)) {
    fs.mkdirSync(symbolsFolder);
}

// URLs for the files (you can update these dynamically)
const brokerUrls = {
    flattrade: [
        'https://flattrade.s3.ap-south-1.amazonaws.com/scripmaster/Nfo_Index_Derivatives.csv',
        'https://flattrade.s3.ap-south-1.amazonaws.com/scripmaster/Bfo_Index_Derivatives.csv',
    ],
    shoonya: [
        'https://api.shoonya.com/NFO_symbols.txt.zip',
        'https://api.shoonya.com/BFO_symbols.txt.zip'
    ],
    kotakneo: []
};

// Function to check if file is outdated (older than 7 am)
function isFileOutdated(filePath) {
    if (!fs.existsSync(filePath)) return true;

    const stats = fs.statSync(filePath);
    const lastModifiedTime = formatISO(new Date(stats.mtime));
    const sevenAMToday = fromUnixTime((new Date().setUTCHours(1, 30)) / 1000);
    return isBefore(lastModifiedTime, sevenAMToday);
}

// Function to download a file and check headers from GET request (instead of HEAD)
async function downloadFile(url, customName = null) {
    try {
        // Make the GET request to fetch the file and headers
        const response = await axios.get(url, { responseType: 'stream' });

        // Extract filename from URL (or use custom name if provided)
        let fileName = customName || path.basename(url);

        // Check if Content-Disposition header exists for the filename
        if (!customName && response.headers['content-disposition']) {
            const contentDisposition = response.headers['content-disposition'];
            const matches = contentDisposition.match(/filename="(.+)"/);
            if (matches && matches[1]) {
                fileName = matches[1];
            }
        }

        const filePath = path.join(symbolsFolder, fileName);

        // Check if file is outdated, skip download if it's not.
        if (!isFileOutdated(filePath)) {
            console.log(`File ${fileName} is up-to-date, skipping download.`)
            return filePath
        } else {
            console.log(`File ${fileName} is downloading.`)
        }

        // Now download the file
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(filePath));
            writer.on('error', reject);
        });
    } catch (error) {
        console.error(`Error downloading file from ${url}:`, error);
        // throw error;
    }
}

// Function to handle downloading all files for a broker
async function downloadBrokerFiles(broker, customNames = []) {
    const urls = brokerUrls[broker];

    if (!urls) {
        console.log(`No URLs found for broker: ${broker}`);
        return;
    }

    const downloadPromises = urls.map((url, index) => {
        const customName = customNames[index] || null;
        return downloadFile(url, customName);
    });

    try {
        const downloadedFiles = await Promise.all(downloadPromises);
        // console.log(`${broker} files downloaded successfully:`, downloadedFiles);
    } catch (error) {
        console.error(`Error downloading files for ${broker}:`, error);
    }
}

// Check and update files for the broker
async function checkAndUpdateFiles(broker, customNames = []) {
    // console.log(`Checking files for ${broker}...`);

    try {
        if (broker === 'kotakneo') {
            // Kotak Neo requires authentication and is handled lazily via downloadKotakFiles
            return;
        }

        // Download all files for the broker
        await downloadBrokerFiles(broker, customNames);
        console.log(`Files for ${broker} updated successfully.`);
    } catch (error) {
        console.error(`Error downloading files for ${broker}:`, error);
    }
}

async function downloadKotakFiles(credentials) {
    const { usersession, consumerKey } = credentials;
    // We try the standard constructed URL pattern
    // Pattern: https://lapi.kotaksecurities.com/wso2-scripmaster/v1/prod/{YYYY-MM-DD}/transformed/{segment}.csv

    // Fallback if Date is not today (e.g. for testing)
    const dateStr = formatISO(new Date()).split('T')[0];
    const segments = ['nse_fo', 'bse_fo'];
    const segmentMap = {};

    console.log(`Starting Kotak Neo symbol download for date: ${dateStr}`);

    // Attempt to fetch dynamic paths first
    try {
        const scripMasterUrl = `${credentials.baseUrl}/script-details/1.0/masterscrip/file-paths`;
        console.log(`Requesting file paths from: ${scripMasterUrl}`);

        const pathResponse = await axios.get(scripMasterUrl, {
            headers: {
                'Authorization': credentials.consumerKey || usersession, // Match Trade API pattern (no Bearer)
                'Sid': credentials.sid,
                'Auth': usersession,
                'neo-fin-key': 'neotradeapi',
                'accept': 'application/json'
            }
        });

        console.log("Kotak API Path Response:", JSON.stringify(pathResponse.data));
        // If successful, we would parse `pathResponse.data` here. 
        // For now, let's just see if it works or gives 404/401.
    } catch (e) {
        console.error(`API Path Fetch Failed: ${e.message} (Status: ${e.response?.status})`);

        // Try alternate endpoint spelling found in some docs
        try {
            const altUrl = "https://gw-napi.kotaksecurities.com/script-details/1.0/masterscrip/file-paths";
            console.log(`Trying alternate URL: ${altUrl}`);
            const altResp = await axios.get(altUrl, {
                headers: {
                    'Authorization': `Bearer ${usersession}`,
                    'Sid': credentials.sid,
                    'Auth': usersession,
                    'neo-fin-key': 'neotradeapi',
                    'accept': 'application/json'
                }
            });
            console.log("Alternate API Response:", JSON.stringify(altResp.data));
        } catch (e2) {
            console.error(`Alternate API Failed: ${e2.message}`);
        }
    }

    for (const segment of segments) {
        const fileName = `kotak_${segment}.csv`;
        const filePath = path.join(symbolsFolder, fileName);
        // Use dynamic URL if found, else fallback to constructed one
        const fileUrl = segmentMap[segment] || `https://lapi.kotaksecurities.com/wso2-scripmaster/v1/prod/${dateStr}/transformed/${segment}.csv`;

        if (!isFileOutdated(filePath)) {
            // console.log(`${fileName} is up to date.`);
            continue;
        }

        let writer;
        try {
            console.log(`Downloading ${fileName} from ${fileUrl}...`);
            writer = fs.createWriteStream(filePath);

            // Clean WSO2 Headers: User-Agent + Bearer Token (access_token prefers)
            const token = credentials.access_token || usersession;
            const headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                'Authorization': token, // No 'Bearer ' prefix to match Trade API pattern
                'neo-fin-key': 'neotradeapi'
            };

            // Step 1: Request with maxRedirects: 0 to catch the redirect
            let response = await axios({
                url: fileUrl,
                method: 'GET',
                headers: headers,
                maxRedirects: 0,
                responseType: 'stream',
                validateStatus: status => status >= 200 && status < 401 // Catch 3xx
            });

            // Step 2: Handle Redirect (302/301/307)
            if (response.status >= 300 && response.status < 400 && response.headers.location) {
                console.log(`Redirect detected to S3. Following without headers...`);
                // Follow redirect WITHOUT Auth headers (S3 rejects them)
                response = await axios({
                    url: response.headers.location,
                    method: 'GET',
                    responseType: 'stream',
                    headers: {
                        "User-Agent": headers["User-Agent"] // Keep UA, explicitly DROP Auth and neo-fin-key
                    },
                    transformRequest: [(data, headers) => {
                        // Double tap: Explicitly delete headers in transformRequest to be sure
                        delete headers['Authorization'];
                        delete headers['neo-fin-key'];
                        delete headers['common']['Authorization'];
                        return data;
                    }]
                });
            }

            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
                response.data.on('error', reject);
            });
            console.log(`Successfully downloaded ${fileName}`);
        } catch (error) {
            console.error(`Failed to download ${fileName}: ${error.message}`);
            // Check nested response for S3 XML error
            if (error.response && error.response.data) {
                try {
                    if (Buffer.isBuffer(error.response.data) || typeof error.response.data === 'string') {
                        console.error("Server Error Details:", error.response.data.toString());
                    } else {
                        // Stream reading
                        const chunks = [];
                        for await (const chunk of error.response.data) {
                            chunks.push(chunk);
                        }
                        console.error("Server Error Details:", Buffer.concat(chunks).toString());
                    }
                } catch (e) { }
            }

            if (writer) {
                try { writer.end(); writer.destroy(); } catch (e) { }
            }

            // Clean up empty/partial file so fallback works
            if (fs.existsSync(filePath)) {
                try {
                    await new Promise(r => setTimeout(r, 100));
                    fs.unlinkSync(filePath);
                    console.log(`Deleted incomplete file: ${filePath}`);
                } catch (delErr) {
                    console.error("Error deleting incomplete file:", delErr.message);
                }
            }

            if (error.response && error.response.status === 404) {
                console.warn("File not found (404). It might be too early in the day or a holiday.");
            }
        }
    }
}



// Check and update files on startup for both brokers
// (async () => {
//     await checkAndUpdateFiles('flattrade');
//     // await checkAndUpdateFiles('shoonya');
// })();

module.exports = { checkAndUpdateFiles, downloadKotakFiles, isFileOutdated };
