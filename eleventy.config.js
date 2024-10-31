import { EleventyRenderPlugin } from "@11ty/eleventy"
import syntaxHighlighting from "@11ty/eleventy-plugin-syntaxhighlight"
import webc from "@11ty/eleventy-plugin-webc"
import typography from "@jamshop/eleventy-plugin-typography"
import postcssPlugin from "@jgarber/eleventy-plugin-postcss"
import tinyHTML from "@sardine/eleventy-plugin-tinyhtml"
import yaml from "js-yaml"
import { JSDOM } from "jsdom"
import postcss from "postcss"
import postcssrc from "postcss-load-config"
import markdown from "./markdown.js"
import Prism from "prismjs"
import loadPrismLanguages from "prismjs/components/index.js"
import bundleTransforms from "./bundle-transforms.js"
import { DateTime } from "luxon"
import urlEqual from "url-equal"
import redirects from "eleventy-plugin-redirects"

/**
 * 🎈 11ty config
 * @param {import("@11ty/eleventy").UserConfig} config
 * @returns {}
 */
export default async function (config) {
	config.setServerOptions({
		// Default values are shown:

		// Whether the live reload snippet is used
		liveReload: true,

		// Whether DOM diffing updates are applied where possible instead of page reloads
		domDiff: true,

		// The starting port number
		// Will increment up to (configurable) 10 times if a port is already in use.
		port: 8080,

		// Additional files to watch that will trigger server updates
		// Accepts an Array of file paths or globs (passed to `chokidar.watch`).
		// Works great with a separate bundler writing files to your output folder.
		// e.g. `watch: ["_site/**/*.css"]`
		watch: [],

		// Show local network IP addresses for device testing
		showAllHosts: false,

		// Use a local key/certificate to opt-in to local HTTP/2 with https
		https: {
			// key: "./localhost.key",
			// cert: "./localhost.cert",
			key: "./localhost+1-key.pem",
			cert: "./localhost+1.pem"
		},

		// Change the default file encoding for reading/serving files
		encoding: "utf-8",

		// Show the dev server version number on the command line
		showVersion: false,

		// Added in Dev Server 2.0+
		// The default file name to show when a directory is requested.
		indexFileName: "index.html",

		// Added in Dev Server 2.0+
		// An object mapping a URLPattern pathname to a callback function
		// for on-request processing.
		onRequest: {}
	})

	config.setLibrary("md", markdown)

	config.addPlugin(postcssPlugin)
	config.addPlugin(EleventyRenderPlugin)
	config.addPlugin(typography)
	config.addPlugin(redirects, {
		template: "clientSide"
	})

	config.addPlugin(webc, {
		components: ["src/components/**/*.webc"]
	})

	config.addTemplateFormats("bundledpostcss")

	const postcssConfig = await postcssrc()

	config.addExtension("bundledpostcss", {
		compile: async inputContent => {
			const { options, plugins } = postcssConfig

			return async () =>
				await postcss(plugins)
					.process(inputContent, {
						...options,
						from: undefined
					})
					.then(result => result.css)
		}
	})

	config.addPlugin(syntaxHighlighting, {
		preAttributes: {
			tabindex: "0",
			class: ({ language }) =>
				`prism language-${language} scroll-fade-horizontal`
		}
	})

	config.addDataExtension("yaml", yaml.load)

	config.addPassthroughCopy("src/views/**/*.woff2")
	config.addPassthroughCopy("src/views/**/*.ttf")
	config.addPassthroughCopy("src/views/**/*.svg")
	config.addPassthroughCopy("src/views/**/*.png")

	config.addFilter("demote", content => {
		const dom = new JSDOM(content)
		const document = dom.window.document

		for (const level of [5, 4, 3, 2, 1]) {
			for (const heading of document.querySelectorAll("h" + level)) {
				const demoted = document.createElement("h" + (level + 1))
				demoted.innerHTML = heading.innerHTML

				heading.replaceWith(demoted)
			}
		}

		return document.body.innerHTML
	})

	// https://moment.github.io/luxon/#/formatting?id=table-of-tokens
	config.addFilter(
		"timestamp",
		(
			date = new Date().toISOString(),
			format = "yyyy-LL-dd 'at' T '<abbr title=\"'ZZZZZ'\">'ZZZZ'</abbr>"
		) => {
			console.log(date)
			return DateTime.fromISO(date.toString()).toFormat(format)
		}
	)

	config.addFilter("urlEqual", urlEqual)

	config.addFilter(
		"innerHTML",
		content =>
			new JSDOM(content).window.document.body.firstElementChild.innerHTML
	)

	config.addFilter("prism", (content, language) => {
		loadPrismLanguages([language])

		if (language in Object.keys(Prism.languages))
			return Prism.highlight(content, Prism.languages[language], language)

		return content
	})

	config.addTransform("bundle-extra", function (content) {
		if (this.page.outputFileExtension != "html") return content

		const dom = new JSDOM(content)
		const document = dom.window.document

		for (const query in bundleTransforms)
			if (document.querySelector(query))
				document.head.innerHTML += bundleTransforms[query]

		return dom.serialize()
	})

	// config.addTransform("tabindex-abbr", function (content) {
	// 	if (this.page.outputFileExtension != "html") return content

	// 	const dom = new JSDOM(content)
	// 	const document = dom.window.document

	// 	for (const abbr of document.querySelectorAll("abbr"))
	// 		if (!abbr.hasAttribute("tabindex"))
	// 			abbr.setAttribute("tabindex", "0")

	// 	return dom.serialize()
	// })

	config.addPassthroughCopy({
		"node_modules/a11y-syntax-highlighting/dist/prism/a11y-light.min.css":
			"/bundle/prism-a11y-light.min.css"
	})

	config.addPassthroughCopy({
		"node_modules/modern-normalize/modern-normalize.css":
			"/bundle/modern-normalize.css"
	})

	config.addPlugin(tinyHTML, {
		collapseWhitespace: false
	})

	return {
		htmlTemplateEngine: "webc",
		dir: {
			input: "src/views",
			includes: "../includes",
			output: "dist",
			data: "../data"
		}
	}
}
