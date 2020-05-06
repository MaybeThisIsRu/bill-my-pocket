module.exports = {
	theme: {
		container: {
			center: true,
			padding: "0.25rem"
		},
		cursor: {
			help: "help"
		},
		extend: {
			colors: {},
			screens: {
				dm: { raw: "(prefers-color-scheme: dark)" }
			}
		},
		fontFamily: {
			serif: ["Bitter", "serif"],
			sans: [
				"-apple-system",
				"BlinkMacSystemFont",
				"Segoe UI",
				"Roboto",
				"Helvetica Neue",
				"Arial",
				"Noto Sans",
				"sans-serif",
				"Apple Color Emoji",
				"Segoe UI Emoji",
				"Segoe UI Symbol",
				"Noto Color Emoji"
			]
		}
	},
	variants: {
		cursor: ['hover']
	},
	plugins: []
};
