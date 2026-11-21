// Builds the redacted Excel fixtures used by src/lib/ingest/__tests__/xlsx.test.ts.
// node scripts/make-xlsx-samples.mjs
// Names, handles and references are fictional; the layout mirrors a real Paytm passbook export.
import * as XLSX from "xlsx";
import fs from "node:fs";

const dir = "src/lib/ingest/__fixtures__";
fs.mkdirSync(dir, { recursive: true });

function write(file, sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows, { cellDates: true }), name);
  const bookType = file.endsWith(".xls") ? "biff8" : "xlsx";
  fs.writeFileSync(`${dir}/${file}`, XLSX.write(wb, { type: "buffer", bookType, compression: true }));
}

// 1. Paytm passbook shape
const paytmHistory = [
  ["Passbook Payment History"],
  ["Name: [REDACTED]", "", "Mobile: ******3014"],
  ["Statement period: 01/10/2026 to 31/10/2026"],
  [],
  ["Date", "Time", "Transaction Details", "", "Your Account", "Amount", "UPI Ref No.", "Tags"],
  ["02/10/2026", "12:41:07", "Paid to Burger King", "burgerking-2.bdp@hdfcbank", "HDFC Bank - 21", "-229.96", "528912345678", "🍔 #Food"],
  ["03/10/2026", "09:05:44", "Money sent to Karan Malhotra", "******3014@ptaxi", "HDFC Bank - 21", "-1,500.00", "528912345679", "💸 #Transfers"],
  ["05/10/2026", "20:15:00", "Received from Ananya Rao", "ananya.rao@okicici", "HDFC Bank - 21", "+2,000.00", "528912345680", "💰 #Money Received"],
  ["07/10/2026", "08:30:12", "Paid to Zepto Marketplace Private Limited", "zepto.payu@hdfcbank", "HDFC Bank - 21", "-412.00", "528912345681", "🛒 #Groceries"],
  ["10/10/2026", "19:02:55", "Paid to Uber India", "uber.rzp@axisbank", "HDFC Bank - 21", -186.5, "528912345682", "🚕 #Travel"],
  [],
  ["12/10/2026", "13:13:13", "Paid to Swiggy", "swiggy@icici", "HDFC Bank - 21", "-349.00", "528912345683", "🍔 #Food"],
  ["15/10/2026", "10:00:00", "Cashback received", "", "Paytm Wallet", "+25.00", "", "🎁 #Cashback"],
  ["18/10/2026", "11:11:11", "Paid to BigBasket", "bigbasket@okhdfc", "HDFC Bank - 21", "abc", "528912345684", "🛒 #Groceries"],
  ["", "", "Paid to Chai Point", "chaipoint@ybl", "HDFC Bank - 21", "-50.00", "528912345685", "☕ #Food"],
  [new Date(2026, 9, 21), "21:45:30", "Money sent to Priya", "9876543210@paytm", "HDFC Bank - 21", "-300.00", "528912345686", "💸 #Transfers"],
];
write("paytm-sample.xlsx", [
  ["Summary", [["Paytm Passbook"], ["Name", "[REDACTED]"], ["Period", "01/10/2026 - 31/10/2026"], ["Total Paid", "₹2,977.46"], ["Total Received", "₹2,025.00"]]],
  ["Wallet Payment History", [["Date", "Time", "Transaction Details", "Amount"], ["01/10/2026", "10:00:00", "Added to wallet", "+100.00"]]],
  ["Passbook Payment History", paytmHistory],
]);

// 2. A generic bank statement (HDFC-style), to prove the heuristics are not Paytm-specific
const bankSheets = [
  [
    "Statement",
    [
      ["HDFC BANK Ltd."],
      ["Account No : XXXXXXXX4821"],
      [],
      ["Date", "Narration", "Chq./Ref.No.", "Value Dt", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"],
      ["14/11/26", "UPI-SWIGGY-SWIGGY@ICICI-ICIC0DC0099-431298765432-ORDER", "0000431298765432", "14/11/26", "412.00", "", "45,120.10"],
      ["15/11/26", "NEFT CR-CITI0000002-ACME TECHNOLOGIES PVT LTD-SALARY NOV 2026", "CITIN26111500", "15/11/26", "", "85,000.00", "1,30,120.10"],
    ],
  ],
];
write("bank-sample.xlsx", bankSheets);
write("bank-sample.xls", bankSheets); // legacy BIFF8, the format older bank portals still export

// 3. Headers no heuristic can read: the app must ask the user to map columns
write("unmapped-sample.xlsx", [
  [
    "Sheet1",
    [
      ["When", "What", "How much"],
      ["01/11/2026", "Coffee", "-120"],
      ["02/11/2026", "Refund", "500"],
    ],
  ],
]);
console.log("wrote", fs.readdirSync(dir).join(", "));
