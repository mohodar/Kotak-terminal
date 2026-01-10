const fs = require('fs');
const csv = require('fast-csv');
const { parse, isBefore } = require("date-fns");

const csvFilePath = './symbols/Nfo_Index_Derivatives.csv';

console.log("Starting CSV parse test with date-fns...");

if (!fs.existsSync(csvFilePath)) {
    console.error("File not found!");
    process.exit(1);
}

const expiryDates = new Set();
const today = new Date();

fs.createReadStream(csvFilePath)
    .pipe(csv.parse({ headers: true }))
    .on("data", (row) => {
        // console.log("Row:", row.Symbol);
        try {
            if (row["ExpiryDate"]) {
                expiryDates.add(row["ExpiryDate"]);
                // Simulate the logic in kotakneo.js
                const date = parse(row["ExpiryDate"], "ddMMMyyyy", new Date());
            } else {
                console.warn("Undefined ExpiryDate for row:", row);
                // Trigger the error if it was happening on undefined
                const date = parse(undefined, "ddMMMyyyy", new Date());
            }
        } catch (e) {
            console.error("Error processing row:", e.message);
            // process.exit(1); 
        }
    })
    .on("end", () => {
        console.log("CSV parsing completed.");
        const sortedExpiryDates = Array.from(expiryDates);
        console.log(`Found ${sortedExpiryDates.length} expiry dates.`);
    })
    .on("error", (error) => {
        console.error("CSV parsing error:", error);
    });
