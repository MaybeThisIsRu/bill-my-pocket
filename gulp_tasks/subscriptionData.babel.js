const fetch = require("node-fetch");
const currencyFormat = require("currency-format");
const log = require("fancy-log");
const fs = require("fs");
const path = require("path");
const { RateLimiter } = require("limiter");
const limiter = new RateLimiter(1, 5000);

const PPP_API = "https://api.purchasing-power-parity.com";
const DATA_SRC_DIR = path.resolve(__dirname, "../data_src/");
const DATA_DEST_DIR = path.resolve(__dirname, "../data/services/");
const SUBSCRIPTION_CATEGORIES = [];

// TODO Cache as much data as possible by timestamps, check exists and stale before making fresh API calls

const getDiscountedPrice = ({ factor, exchangeRate, price }) =>
	price * exchangeRate * factor;

const getCountryKeyInList = ({ countryAlpha2, countriesList }) => {
	const countryKey = Object.keys(countriesList.countries).find(
		c => c === countryAlpha2
	);

	if (countryKey === undefined)
		return Error("Base country not found in country list - code correct?");

	return countryKey;
};

const getCountryMainCurrencyDetails = ({ countryAlpha2, countriesList }) => {
	// To return:
	// ISO 4217 code (USD, INR, GBP etc)
	// symbol with grapheme and template

	const countryKey = getCountryKeyInList({
		countryAlpha2,
		countriesList
	});

	// This can be a CSV, or a single string value
	// If CSV, we default to the first as the main currency
	const currencyCodeList = countriesList.countries[countryKey].currency;
	let mainCurrencyCode;
	if (currencyCodeList.search(",")) {
		// CSV string
		mainCurrencyCode = currencyCodeList.split(",")[0];
	} else {
		// Single value
		mainCurrencyCode = currencyCodeList;
	}

	const details = currencyFormat[mainCurrencyCode];

	return {
		code: mainCurrencyCode,
		symbol: details.symbol
	};
};

const getSubscriptionIndex = ({ subscriptionName, subscriptions }) => {
	const subscriptionIndex = subscriptions.findIndex(
		s => s.name === subscriptionName
	);
	if (subscriptionIndex === undefined || subscriptionIndex === -1)
		return Error(
			"Subscription base country not found in country list - code correct?"
		);
	return subscriptionIndex;
};

const getRegionIndexInSubscription = ({
	countryAlpha2,
	subscriptionName,
	subscriptions
}) => {
	const subIndex = getSubscriptionIndex({
		subscriptionName,
		subscriptions
	});

	const regionIndex = subscriptions[subIndex].regionPrices.findIndex(
		region => region.countryAlpha2 === countryAlpha2
	);
	if (regionIndex === undefined || regionIndex === -1)
		return Error(
			"No region with that country code found - is the code correct?"
		);
	return regionIndex;
};

const setBaseDetails = ({ sub, subscriptions, countriesList }) => {
	try {
		const countryKey = getCountryKeyInList({
			countryAlpha2: sub.basePrice.countryAlpha2,
			countriesList
		});
		const subIndex = getSubscriptionIndex({
			subscriptionName: sub.name,
			subscriptions
		});

		// Set the base country name in our subscriptions data
		subscriptions[subIndex].basePrice.countryName =
			countriesList.countries[countryKey].name;

		// Country flag as emoji
		subscriptions[subIndex].basePrice.countryEmoji =
			countriesList.countries[countryKey].emoji;

		const baseCountryAlpha2 =
			subscriptions[subIndex].basePrice.countryAlpha2;

		const mainCurrencyDetails = getCountryMainCurrencyDetails({
			countryAlpha2: baseCountryAlpha2,
			countriesList
		});

		subscriptions[subIndex].basePrice.currency = mainCurrencyDetails;
	} catch (e) {
		log(e);
	}
};

const setIntermediatePriceInSub = ({
	idealMonthlyPriceInUS,
	idealAnnualPriceInUS,
	subscriptionName,
	subscriptions
}) => {
	log("setIntermediatePriceInSub called");
	const subIndex = getSubscriptionIndex({
		subscriptionName,
		subscriptions
	});

	subscriptions[subIndex].intermediaryPrice = {
		amount: {
			idealMonthly: idealMonthlyPriceInUS,
			idealAnnual: idealAnnualPriceInUS
		}
	};
};

const setIntermediatePrice = ({ sub, subscriptions }) => {
	return new Promise((resolve, reject) => {
		let idealMonthlyPriceInUS, idealAnnualPriceInUS;

		fetchPPPDetails(sub.basePrice.countryAlpha2)
			.then(response => {
				try {
					if (response.ppp) {
						log("Intermediate Price response received");
						if (sub.basePrice.amount.monthly) {
							idealMonthlyPriceInUS = +(
								(sub.basePrice.amount.monthly *
									response.ppp.currencyMain.exchangeRate) /
								response.ppp.ppp
							).toFixed(2);
						}

						if (sub.basePrice.amount.annual) {
							idealAnnualPriceInUS = +(
								(sub.basePrice.amount.annual *
									response.ppp.currencyMain.exchangeRate) /
								response.ppp.ppp
							).toFixed(2);
						}

						setIntermediatePriceInSub({
							idealMonthlyPriceInUS,
							idealAnnualPriceInUS,
							subscriptionName: sub.name,
							subscriptions
						});

						resolve();
					} else {
						throw Error(
							"API response for intermediary price does not have the ppp object"
						);
					}
				} catch (e) {
					log.error(e);
				}
			})
			.catch(error => {
				reject(error);
			});
	});
};

const setRegionDetails = ({ ids, data, subscriptions, countriesList }) => {
	try {
		const subIndex = getSubscriptionIndex({
			subscriptionName: ids.name,
			subscriptions
		});

		const regionIndex = getRegionIndexInSubscription({
			countryAlpha2: ids.countryAlpha2,
			subscriptionName: ids.name,
			subscriptions
		});

		const countryKey = getCountryKeyInList({
			countryAlpha2: ids.countryAlpha2,
			countriesList
		});

		// Set PPP price details
		subscriptions[subIndex].regionPrices[regionIndex].discountedAmount = {
			monthly: data.discountedMonthlyPrice,
			annual: data.discountedAnnualPrice
		};

		// Set country name from country code
		subscriptions[subIndex].regionPrices[regionIndex].countryName =
			countriesList.countries[countryKey].name;

		// Country flag as emoji
		subscriptions[subIndex].regionPrices[regionIndex].countryEmoji =
			countriesList.countries[countryKey].emoji;

		// Set currency details
		const currencyData = getCountryMainCurrencyDetails({
			countryAlpha2: ids.countryAlpha2,
			countriesList
		});

		subscriptions[subIndex].regionPrices[
			regionIndex
		].currency = currencyData;
	} catch (e) {
		log.error(e);
	}
};

const fetchPPPDetails = target => {
	return new Promise((resolve, reject) => {
		limiter.removeTokens(1, (err, remainingRequests) => {
			fetch(`${PPP_API}/?target=${target}`)
				.then(response => response.json())
				.then(json => {
					resolve(json);
				})
				.catch(error => {
					reject(error);
				});
		})
	});
};

const setter = ({ region, sub, subscriptions, countriesList }) => {
	return new Promise((resolve, reject) => {
		fetchPPPDetails(region.countryAlpha2)
			.then(response => {
				try {
					if (response.ppp) {
						let discountedMonthlyPrice, discountedAnnualPrice;
						// Calculate region discounted price against intermediary price - month
						if (sub.intermediaryPrice) {
							log("Intermediary price found - month");
							discountedMonthlyPrice = +getDiscountedPrice({
								factor: response.ppp.pppConversionFactor,
								exchangeRate:
									response.ppp.currencyMain.exchangeRate,
								price: sub.intermediaryPrice.amount.idealMonthly
							}).toFixed(2);
						} else {
							log("Base price found - month");
							if (sub.basePrice.amount.monthly) {
								discountedMonthlyPrice = +getDiscountedPrice({
									factor: response.ppp.pppConversionFactor,
									exchangeRate:
										response.ppp.currencyMain.exchangeRate,
									price: sub.basePrice.amount.monthly
								}).toFixed(2);
							}
						}

						// Calculate region discounted price against intermediary price - annual
						if (sub.intermediaryPrice) {
							log("Intermediary price found - annual");
							discountedAnnualPrice = +getDiscountedPrice({
								factor: response.ppp.pppConversionFactor,
								exchangeRate:
									response.ppp.currencyMain.exchangeRate,
								price: sub.intermediaryPrice.amount.idealAnnual
							}).toFixed(2);
						} else {
							if (sub.basePrice.amount.annual) {
								log("Base price found - annual");
								discountedAnnualPrice = +getDiscountedPrice({
									factor: response.ppp.pppConversionFactor,
									exchangeRate:
										response.ppp.currencyMain.exchangeRate,
									price: sub.basePrice.amount.annual
								}).toFixed(2);
							}
						}

						// Set region details - whether discounted amounts are against US or other base country
						log("Setting region details");
						setRegionDetails({
							ids: {
								name: sub.name,
								countryAlpha2: region.countryAlpha2
							},
							data: {
								discountedMonthlyPrice,
								discountedAnnualPrice,
								currencyMain: {
									code: response.ppp.currencyMain.code,
									symbol: response.ppp.currencyMain.symbol
								}
							},
							subscriptions,
							countriesList
						});

						resolve();
					} else {
						throw Error(
							`API sent an invalid response while getting regional price data; ${response.message}`
						);
					}
				} catch (e) {
					log.error(e);
				}
			})
			.catch(e => {
				reject(e);
			});
	});
};

const getSubsWithInjectedData = (subscriptions, countriesList) => {
	let regionCount = 0,
		regionRunTimes = 0,
		subCount = 0,
		subRunTimes = 0;

	// TODO more effecient way to calculate this count
	for (const sub of subscriptions) {
		subCount++;
		for (const region of sub.regionPrices) {
			regionCount++;
		}
	}
	log("regionCount is", regionCount, " and subCount", subCount);

	return new Promise((resolve, reject) => {
		for (const sub of subscriptions) {
			subRunTimes++;
			setBaseDetails({
				sub,
				subscriptions,
				countriesList
			});
			for (const region of sub.regionPrices) {
				if (sub.basePrice.countryAlpha2 !== "US") {
					// Base country is not US.
					// First find the ideal price for the US, then calculate the other countries' discounted prices to *that*
					setIntermediatePrice({
						sub,
						subscriptions
					}).then(() => {
						setter({
							region,
							sub,
							subscriptions,
							countriesList
						})
							.then(() => {
								regionRunTimes++;
								log(
									`Can resolve with regionRunTimes ${regionRunTimes}/${regionCount} and subRunTimes ${subRunTimes}/${subCount}?`
								);
								if (
									regionRunTimes === regionCount &&
									subRunTimes === subCount
								) {
									log(
										`Resolving with regionRunTimes ${regionRunTimes}/${regionCount} and subRunTimes ${subRunTimes}/${subCount}`
									);
									resolve(subscriptions);
								}
							})
							.catch(e => {
								reject(e);
							});
					});
				} else {
					setter({
						region,
						sub,
						subscriptions,
						countriesList
					})
						.then(() => {
							regionRunTimes++;
							log(
								`Can resolve with regionRunTimes ${regionRunTimes}/${regionCount} and subRunTimes ${subRunTimes}/${subCount}?`
							);
							if (
								regionRunTimes === regionCount &&
								subRunTimes === subCount
							) {
								log(
									`Resolving with regionRunTimes ${regionRunTimes}/${regionCount} and subRunTimes ${subRunTimes}/${subCount}`
								);
								resolve(subscriptions);
							}
						})
						.catch(e => {
							reject(e);
						});
				}
			}
		}
	});
};

const writeToFile = ({ fileName, subscriptions }) => {
	try {
		const outputPath = `${DATA_DEST_DIR}/${fileName}`;
		if (!fs.readdirSync(DATA_DEST_DIR))
			throw Error("Destination data directory does not exist. Create?");

		fs.writeFileSync(outputPath, JSON.stringify(subscriptions));
	} catch (e) {
		log.error(e);
	}
};

// Function returned to gulp
const main = () => {
	const countriesList = require("countries-list");

	return new Promise((resolve, reject) => {
		let runTimes = 0,
			filesCount = 0;
		try {
			fs.readdirSync(DATA_SRC_DIR).forEach(file => {
				const ext = path.extname(file);
				if (ext === ".json") SUBSCRIPTION_CATEGORIES.push(file);
			});

			if (!SUBSCRIPTION_CATEGORIES.length) throw Error("No data to read");
			else filesCount = SUBSCRIPTION_CATEGORIES.length;

			// Once we have the file names, construct data files
			for (const CATEGORY of SUBSCRIPTION_CATEGORIES) {
				const srcPath = path.join(DATA_SRC_DIR, CATEGORY);
				const subscriptions = require(srcPath);
				getSubsWithInjectedData(subscriptions, countriesList)
					.then(data => {
						log(`getSubsWithInjectedData finished for ${srcPath}`);

						// Create dest dir if it does not exist
						if (!fs.existsSync(DATA_DEST_DIR)) {
							fs.mkdirSync(DATA_DEST_DIR, {
								recursive: true
							});
						}

						writeToFile({
							fileName: CATEGORY,
							subscriptions: data
						});

						if (++runTimes === filesCount) {
							resolve();
						}
					})
					.catch(error => {
						log(error);
					});
			}
		} catch (e) {
			reject(e);
		}
	});
};

module.exports = main;
