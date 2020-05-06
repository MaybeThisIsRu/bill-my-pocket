module.exports = {
	postUrl: (collection, slug) => {
		try {
			if (collection.length < 1) throw "Collection appears to be empty";
			if (!Array.isArray(collection))
				throw "Collection is an invalid type - it must be an array!";
			if (typeof slug !== "string")
				throw "Slug is an invalid type - it must be a string!";

			const found = collection.find(p => p.fileSlug.includes(slug));
			if (found === 0 || found === undefined)
				throw `${slug} not found in specified collection.`;
			else return found.url;
		} catch (e) {
			console.error(
				`An error occured while searching for the url to ${slug}. Details:`,
				e
			);
		}
	},
	isOldPost: date => {
		const { getUnixTime } = require("date-fns");

		const postTimestamp = getUnixTime(new Date(date));

		const cutoffTimestamp = getUnixTime(
			new Date().setFullYear(new Date().getFullYear() - 1)
		);

		// ? Is this one of the ideal ways to compare dates?
		if (cutoffTimestamp < postTimestamp) return false;
		else return true;
	},
	getKeys: data => {
		return Object.keys(JSON.parse(data));
	},
	getKeyValue: (subs, subName) => {
		return subs[subName];
	},
	getAlleppRate: (regionalAmt, discountedAmt) => {
		let rate, allepp;
		if (regionalAmt < discountedAmt) {
			allepp = "Yes, by";
			rate = (
				((discountedAmt - regionalAmt) / discountedAmt) *
				100
			).toFixed();
		} else if (regionalAmt === discountedAmt) {
			allepp = "Yes, by";
			rate = 0;
		} else {
			allepp = "No, by";
			rate = (
				((regionalAmt - discountedAmt) / regionalAmt) *
				100
			).toFixed();
		}
		return `${allepp} ~${rate}%`;
	}
};
