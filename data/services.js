const fs = require("fs");
const path = require("path");

const SERVICES_DIR = path.join(__dirname, "services/");
const SERVICE_TYPES = [];

try {
	// Check if directory exists
	if (!fs.existsSync(SERVICES_DIR)) throw "Services data directory does not exist";
	
	// Get all the files in directory, strip file extension, return as array
	fs.readdirSync(SERVICES_DIR).forEach(file => {
		const extension = path.extname(file);
		const slug = file.replace(extension, '');
		SERVICE_TYPES.push(slug);
	});
} catch (e) {
	console.error(e);
}

module.exports = SERVICE_TYPES;
