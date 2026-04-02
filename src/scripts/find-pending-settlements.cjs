'use strict';

const fs = require('fs');
const path = require('path');

// --- Config ---
const args = process.argv.slice(2);
let dateOverride = null;
let port = 3001;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--date' && args[i + 1]) {
    dateOverride = args[i + 1];
    i++;
  }
  if (args[i] === '--port' && args[i + 1]) {
    port = parseInt(args[i + 1], 10);
    i++;
  }
}

const BASE_URL = `http://localhost:${port}`;

// --- Date helpers ---
function getTargetDate() {
  if (dateOverride) return dateOverride;
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

// --- HTTP helpers ---
async function post(endpoint, body) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} from ${endpoint}: ${text.substring(0, 200)}`);
  }
  return response.json();
}

// --- CSV helpers ---
const CSV_COLUMNS = [
  'Date', 'CardHolderID', 'FeeID', 'FeeType', 'FeeAmount',
  'AccountBalance', 'StatusCode', 'PaidToName', 'Description'
];

function escapeCsv(val) {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowToCsv(row) {
  return CSV_COLUMNS.map(col => escapeCsv(row[col])).join(',');
}

function writeCsv(rows, targetDate) {
  const outputDir = path.join(__dirname, 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').substring(0, 19);
  const filename = `pending-settlements_${targetDate}_run-${timestamp}.csv`;
  const filepath = path.join(outputDir, filename);

  const lines = [CSV_COLUMNS.join(','), ...rows.map(rowToCsv)];
  fs.writeFileSync(filepath, lines.join('\n') + '\n', 'utf8');
  return filepath;
}

// --- Main ---
async function main() {
  const targetDate = getTargetDate();
  const FeeDateFrom = `${targetDate}T00:00:00`;
  const FeeDateTo = `${targetDate}T23:59:59`;

  console.log(`\n=== Find Pending Settlement Payments with Insufficient Balance ===`);
  console.log(`Target date : ${targetDate}`);
  console.log(`Proxy       : ${BASE_URL}`);
  console.log(`Date range  : ${FeeDateFrom} → ${FeeDateTo}\n`);

  // 1. Fetch all fees for the target date
  console.log('Fetching fees from /api/fees/find-by-date...');
  let feeData;
  try {
    feeData = await post('/api/fees/find-by-date', { FeeDateFrom, FeeDateTo });
  } catch (err) {
    console.error('Failed to fetch fees:', err.message);
    process.exit(1);
  }

  // 2. Normalize to array
  const feeList = feeData?.FeeList?.Fee;
  let fees = [];
  if (feeList) {
    fees = Array.isArray(feeList) ? feeList : [feeList];
  }
  console.log(`Total fees returned : ${fees.length}`);

  // 3. Filter: FeeType = SettlementPayment AND StatusCode = Pending
  const pending = fees.filter(f =>
    f.FeeType === 'SettlementPayment' && f.StatusCode === 'Pending'
  );
  console.log(`Pending SettlementPayment fees : ${pending.length}`);

  if (pending.length === 0) {
    console.log('\nNo pending settlement fees found for this date.');
    const filepath = writeCsv([], targetDate);
    console.log(`CSV written (header only): ${filepath}\n`);
    return;
  }

  // 4. Fetch account balance for each pending fee
  console.log('\nChecking account balances...\n');
  const results = [];

  for (const fee of pending) {
    const chId = fee.CardHolderID;
    let acctBal = null;

    try {
      const chData = await post('/api/cardholders/find', { cardholderId: chId });
      // Response path: FindCardHolderByIDResult -> CardHolder (or direct fields)
      const ch = chData?.CardHolder ?? chData;
      acctBal = ch?.AccountBalance ?? null;
    } catch (err) {
      console.warn(`  WARNING: Could not fetch cardholder ${chId}: ${err.message}`);
    }

    const feeAmt = parseFloat(fee.FeeAmount || '0');
    const balAmt = parseFloat(acctBal || '0');
    const balCoversFee = balAmt > feeAmt;

    // Include only where balance does NOT cover the fee (Acct Bal > Fee Amt = false)
    if (!balCoversFee) {
      const row = {
        Date: targetDate,
        CardHolderID: chId,
        FeeID: fee.FeeID,
        FeeType: fee.FeeType,
        FeeAmount: fee.FeeAmount,
        AccountBalance: acctBal ?? 'N/A',
        StatusCode: fee.StatusCode,
        PaidToName: fee.PaidToName ?? '',
        Description: fee.Description ?? ''
      };
      results.push(row);
      console.log(`  FLAGGED  CardHolder=${chId}  FeeID=${fee.FeeID}  FeeAmt=${fee.FeeAmount}  Balance=${acctBal ?? 'N/A'}`);
    } else {
      console.log(`  OK       CardHolder=${chId}  FeeID=${fee.FeeID}  FeeAmt=${fee.FeeAmount}  Balance=${acctBal ?? 'N/A'}`);
    }
  }

  // 5. Output
  console.log(`\n=== Results: ${results.length} fee(s) with insufficient balance ===\n`);

  if (results.length > 0) {
    console.table(results);
  } else {
    console.log('All pending settlement fees have sufficient account balances.');
  }

  const filepath = writeCsv(results, targetDate);
  console.log(`\nCSV report written: ${filepath}\n`);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
