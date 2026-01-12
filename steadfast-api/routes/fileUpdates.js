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
    const { usersession, consumerKey, sid, baseUrl } = credentials;
    // According to documentation, we must first fetch the dynamic file paths
    // Endpoint: GET <Base URL>/script-details/1.0/masterscrip/file-paths
    // Header: Authorization: <plain token>

    const segments = ['nse_fo', 'bse_fo'];
    console.log(`Starting Kotak Neo symbol download using dynamic file-paths API...`);

    try {
        // Step 1: Request dynamic file paths
        // Use the baseUrl provided in tradeApiValidate response or fallback to napi
        const effectiveBaseUrl = baseUrl || "https://napi.kotaksecurities.com";
        const scripMasterUrl = `${effectiveBaseUrl}/script-details/1.0/masterscrip/file-paths`;

        console.log(`Requesting Kotak file paths from: ${scripMasterUrl}`);

        const pathResponse = await axios.get(scripMasterUrl, {
            headers: {
                'Authorization': consumerKey, // Documentation says "Token provided in dashboard"
                'Sid': sid,
                'Auth': usersession,
                'neo-fin-key': 'neotradeapi',
                'accept': 'application/json'
            }
        });

        if (!pathResponse.data || !pathResponse.data.data || !pathResponse.data.data.filesPaths) {
            console.error("Kotak API Path Response missing data:", JSON.stringify(pathResponse.data));
            throw new Error("Failed to get dynamic file paths from Kotak API");
        }

        const filesPaths = pathResponse.data.data.filesPaths;
        console.log(`Found ${filesPaths.length} file paths from Kotak API.`);

        for (const segment of segments) {
            // Find the URL for this segment (e.g., ends with nse_fo.csv)
            const fileUrl = filesPaths.find(p => p.toLowerCase().includes(`${segment}.csv`));

            if (!fileUrl) {
                console.warn(`No URL found for segment ${segment} in API response.`);
                continue;
            }

            const fileName = `kotak_${segment}.csv`;
            const filePath = path.join(symbolsFolder, fileName);

            // We force download if we are here (called from symbols route when outdated/missing)
            console.log(`Downloading ${fileName} from dynamic URL...`);

            let writer = fs.createWriteStream(filePath);
            try {
                // Step 2: Download from S3/S3-Proxy
                const jwtToken = usersession.startsWith('eyJ') ? `Bearer ${usersession}` : usersession;

                let downloadResponse;
                const strategies = [
                    { name: 'JWT', headers: { 'Authorization': jwtToken, 'Auth': usersession, 'Sid': sid, 'neo-fin-key': 'neotradeapi', 'User-Agent': 'Mozilla/5.0' } },
                    { name: 'ConsumerKey', headers: { 'Authorization': consumerKey, 'neo-fin-key': 'neotradeapi', 'User-Agent': 'Mozilla/5.0' } },
                    { name: 'NoAuth', headers: { 'User-Agent': 'Mozilla/5.0' } }
                ];

                for (const strategy of strategies) {
                    try {
                        console.log(`Trying ${strategy.name} strategy for ${segment}...`);
                        downloadResponse = await axios({
                            url: fileUrl,
                            method: 'GET',
                            headers: strategy.headers,
                            maxRedirects: 0,
                            responseType: 'stream',
                            validateStatus: status => status >= 200 && status < 400
                        });
                        console.log(`${strategy.name} strategy SUCCESSFUL for ${segment}.`);
                        break; // Success!
                    } catch (err) {
                        console.error(`${strategy.name} strategy failed for ${segment}: ${err.response?.status || err.message}`);
                        if (strategy.name === 'NoAuth') throw new Error(`All download strategies failed for ${segment}`);
                    }
                }

                // Handle Redirect to S3
                if (downloadResponse.status >= 300 && downloadResponse.status < 400 && downloadResponse.headers.location) {
                    console.log(`Redirecting to ${segment} S3 location. Dropping Authorization headers...`);
                    downloadResponse = await axios({
                        url: downloadResponse.headers.location,
                        method: 'GET',
                        responseType: 'stream',
                        headers: {
                            'User-Agent': 'Mozilla/5.0'
                            // NO Authorization or neo-fin-key here
                        }
                    });
                }

                // Check for XML error response (AccessDenied) before writing to file
                // We peek at the first chunk of data
                await new Promise((resolve, reject) => {
                    let firstChunk = true;
                    downloadResponse.data.on('data', (chunk) => {
                        if (firstChunk) {
                            firstChunk = false;
                            const preview = chunk.slice(0, 100).toString();
                            if (preview.includes('<?xml') || preview.includes('<Error>')) {
                                writer.destroy();
                                reject(new Error(`Download for ${segment} returned XML error instead of CSV: ${preview}...`));
                                return;
                            }
                        }
                        writer.write(chunk);
                    });

                    downloadResponse.data.on('end', () => {
                        writer.end();
                        resolve();
                    });

                    downloadResponse.data.on('error', (err) => {
                        writer.destroy();
                        reject(err);
                    });

                    writer.on('error', (err) => {
                        writer.destroy();
                        reject(err);
                    });
                });

                console.log(`Successfully downloaded ${fileName}`);
            } catch (error) {
                console.error(`Failed to download ${fileName}: ${error.message}`);
                if (writer) writer.destroy();
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }
        }
    } catch (error) {
        console.error(`Kotak Scrip Master workflow failed: ${error.message}`);
        if (error.response) {
            console.error("Error Response Data:", JSON.stringify(error.response.data));
        }
    }
}



// Check and update files on startup for both brokers
// (async () => {
//     await checkAndUpdateFiles('flattrade');
//     // await checkAndUpdateFiles('shoonya');
// })();

module.exports = { checkAndUpdateFiles, downloadKotakFiles, isFileOutdated };
