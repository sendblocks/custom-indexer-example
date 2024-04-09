const { ethers } = require("ethers");
const fs = require("fs");

// Read the JSON ABI from file 
const abiJsonPath = process.argv[2];
const abiJson = fs.readFileSync(abiJsonPath, "utf8");

// Parse the JSON ABI 
const jsonAbi = JSON.parse(abiJson);

// Continue with the rest of your code
const iface = new ethers.utils.Interface(jsonAbi);

// Convert to full representation
const FormatTypes = ethers.utils.FormatTypes;
const fullAbi = iface.format(FormatTypes.full);

// Output the full ABI to file
const fullAbiPath = process.argv[3];
fs.writeFileSync(fullAbiPath, JSON.stringify(fullAbi, null, 2));
