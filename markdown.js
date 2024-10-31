import katex from "@xtthaop/markdown-it-katex"
import { exec } from "child_process"
import sanitize from "eval-sanitizer"
import { JSDOM } from "jsdom"
import markdownIt from "markdown-it"
import abbr from "markdown-it-abbr/dist/index.cjs.js"
import callout from "markdown-it-callouts"
import details from "markdown-it-collapsible"
import deflist from "markdown-it-deflist/dist/index.cjs.js"
import { markdownItFancyListPlugin as fancyList } from "markdown-it-fancy-lists"
import footnote from "markdown-it-footnote"
import ins from "markdown-it-mark/dist/index.cjs.js"
import mark from "markdown-it-mark/dist/markdown-it-mark.js"
import small from "markdown-it-small"
import filesystem from "node:fs"
import { join } from "node:path"
import shortHash from "short-hash"
import {
	escapeHtml,
	unescapeAll
} from "./node_modules/markdown-it/lib/common/utils.mjs"
import getBBox from "svg-pathdata-getbbox"
import embedAspectRatios from "./embed-aspect-ratios.js"
// import WebMscore from "webmscore"

try {
	filesystem.statSync("tmp/")
	filesystem.rmSync("tmp/", { recursive: true, force: true })
} catch (error) {
	if (error.code !== "ENOENT") throw error
}

filesystem.mkdirSync("tmp")

filesystem.chmodSync("musescore/musescore", 0o755)

const eleventyOutputPath = "dist"
const abcBundlePath = "bundle/abc"

filesystem.mkdirSync(join(eleventyOutputPath, abcBundlePath), {
	recursive: true
})

// 🖋️ markdown-it config & off-the-shelf extensions

const markdown = markdownIt({ html: true })
	.use(abbr)
	.use(callout)
	.use(deflist)
	.use(details)
	.use(fancyList)
	.use(footnote)
	.use(ins)
	.use(katex, { fleqn: true })
	.use(mark)
	.use(small)

// 🎼 extend markdown-it to render audio & engravings of abc notation ✨server-side✨
//
// see https://paulrosen.github.io/abcjs/overview/faq.html#how-do-i-use-abcjs-in-a-server-side-rendering-app
//
// you see how abcjs only works in a browser context? not very demure. not very mindful. (lol)
//
// we can emulate a browser context with JSDOM instead >:)
//
// i don't love the idea of using a client-side midi synthesizer when i could just serve an
// audio file, so we'll use musescore as our synthesizer instead of abcjs and manually place // audio files similarly to how `@11ty/eleventy-plugin-bundle` does it

const defaultFence = markdown.renderer.rules.fence.bind(markdown.renderer.rules)

const abcjsScript = filesystem
	.readFileSync("node_modules/abcjs/dist/abcjs-basic-min.js")
	.toString()

const webmscoreScript = filesystem
	.readFileSync("node_modules/webmscore/webmscore.js")
	.toString()

// i wrote this nested mess before i knew about `node:fs/promises`
async function renderAudioFile(content, midi, bundledFilePath, stylePath = "") {
	// const dom = new JSDOM(
	// 	`<body>
	// 		<div id="abc"></div>
	//      <script>${webmscoreScript}</script>
	//    </body>`,
	// 	{ runScripts: "dangerously" }
	// )

	// dom.window.URL = {
	// 	createObjectURL: blob => blob.toString("base64")
	// }

	// dom.window.midi = midi

	// dom.window.eval(`
	//   WebMscore.ready.then(async () => {
	// 		const score = await WebMscore.load("midi", midi, [], false)
	// 		console.log(await score.saveAudio("mp3"))
	// 		score.destroy()
	// 	})
	// `)

	// await dom.window.WebMscore.ready

	// const score = await dom.window.WebMscore.load("midi", midi, [], false)

	// filesystem.writeFile(
	// 	join(eleventyOutputPath, bundledFilePath),
	// 	await score.saveAudio("mp3")
	// )

	// score.destroy()

	filesystem.mkdtemp("tmp/musescore-", (_, dir) => {
		filesystem.writeFile(join(dir, "midi.mid"), midi, () => {
			const out = join(dir, "out.mp3")

			const styleFlag = stylePath ? "-S " + stylePath : ""

			exec(
				`musescore --appimage-extract-and-run -o ${out} ${join(dir, "midi.mid")} ${styleFlag}`,
				{ stdio: "ignore" },
				error => {
					// ignore musescore's GUI & audio IO errors
					if (error && error.code != 40) throw error

					filesystem.copyFile(
						out,
						join(eleventyOutputPath, bundledFilePath),
						() => {
							filesystem.rm(
								dir,
								{ recursive: true, force: true },
								() => {}
							)
						}
					)
				}
			)
		})
	})
}

markdown.renderer.rules.fence = (tokens, idx, options, env, slf) => {
	const token = tokens[idx]
	const content = token.content.trim()

	if (token.info === "abc") {
		const dom = new JSDOM(
			`<body>
				<div id="abc"></div>
         		<script>${abcjsScript}</script>
          	</body>`,
			{ runScripts: "dangerously" }
		)

		// engrave & render midi
		const [tune] = dom.window.ABCJS.renderAbc("abc", sanitize`${content}`, {
			ariaLabel: "",
			addClasses: true,
			paddingleft: 0,
			wrap: {
				preferredMeasuresPerLine: 4
			}
		})

		const svg = dom.window.document.getElementById("abc").firstElementChild

		const { width, height } = getBBox.getBBoxFromEl(svg)
		svg.setAttribute("width", width)
		svg.setAttribute("viewBox", `0 40 ${width} ${height}`)

		const midi = dom.window.ABCJS.synth.getMidiFile(tune, {
			midiOutputType: "binary",
			bpm: 100
		})

		console.log(midi)

		let stylePath = ""

		if (/^R: *swing/gm.test(content)) {
			stylePath = "./musescore/styles/swing.mss"
		}

		// we don't want identical MIDIs with different MuseScore styles to have the
		// same hash, so we'll salt the output hash with the style specification
		const styleSalt = stylePath ? filesystem.readFileSync(stylePath) : ""

		const bundledFilePath = join(
			abcBundlePath,
			shortHash(midi.toString() + styleSalt) + ".mp3"
		)

		// if the file doesn't exist: render it async, so as not to bog down the main
		// content pipeline
		filesystem.stat(join(eleventyOutputPath, bundledFilePath), error => {
			if (error) {
				if (error.code === "ENOENT") {
					renderAudioFile(content, midi, bundledFilePath, stylePath)
				} else throw error
			}
		})

		return `
			<music>
			  <section>
   			  <div class="abc-container scroll-fade-horizontal${width > 739 ? " full-width" : ""}">
   		    	${svg.outerHTML}
  				</div>
          <audio controls>
   					<source src="${join("/", bundledFilePath)}">
      		</audio>
				</section>
				<section>
  				<details>
  					<summary>abc notation</summary>
  					${defaultFence(tokens, idx, options, env, slf)}
  				</details>
				</section>
			</music>
		`
	}

	// remaining code yoinked from `markdown-it` & modified to use `eleventy-plugin-syntaxhighlight`

	const info = token.info ? unescapeAll(token.info).trim() : ""
	let langName = ""
	let langAttrs = ""

	if (info) {
		const arr = info.split(/(\s+)/g)
		langName = arr[0]
		langAttrs = arr.slice(2).join("")
	}

	let highlighted
	if (options.highlight) {
		highlighted =
			options.highlight(token.content, langName, langAttrs) ||
			escapeHtml(token.content)
	} else {
		highlighted = escapeHtml(token.content)
	}

	if (highlighted.indexOf("<pre") === 0) {
		return highlighted + "\n"
	}

	// If language exists, inject class gently, without modifying original token.
	// May be, one day we will add .deepClone() for token and simplify this part, but
	// now we prefer to keep things local.
	if (info) {
		const i = token.attrIndex("class")
		const tmpAttrs = token.attrs ? token.attrs.slice() : []

		if (i < 0) {
			tmpAttrs.push(["class", options.langPrefix + langName])
		} else {
			tmpAttrs[i] = tmpAttrs[i].slice()
			tmpAttrs[i][1] += " " + options.langPrefix + langName
		}

		tmpAttrs.push(["language", langName])

		// Fake token just to render attributes
		const tmpToken = {
			attrs: tmpAttrs
		}

		return `<syntax-highlight language="abc"><code${slf.renderAttrs(tmpToken)}>${highlighted}</code></syntax-highlight>\n`
	}

	return `<syntax-highlight language=""><code${slf.renderAttrs(token)}>${highlighted}</code></syntax-highlight>\n`
}

// 🔗 render external links as `favicon-link`s & open in new tab

const defaultLinkOpen =
	markdown.renderer.rules.link_open ||
	((tokens, idx, options, _, self) => self.renderToken(tokens, idx, options))

markdown.renderer.rules.link_open = (tokens, idx, options, env, self) => {
	const token = tokens[idx]
	const href = token.attrGet("href")

	if (href.startsWith("http")) {
		token.attrPush(["webc:is", "favicon-link"])
		token.attrPush(["target", "_blank"])
	}

	return defaultLinkOpen(tokens, idx, options, env, self)
}

// 📔 `<<` & `>>` as an equivalent to HTML's `cite`
// https://html.spec.whatwg.org/multipage/text-level-semantics.html#the-cite-element
//
// huge thanks to Nicholas J. Markkula for laying out this code
// https://github.com/markdown-it/markdown-it/issues/337#issuecomment-286863431

markdown.inline.ruler.push(
	"cite",
	(state, silent) => {
		let variableStartPos = state.pos

		if (
			state.src.charAt(variableStartPos) !== "<" ||
			state.src.charAt(variableStartPos + 1) !== "<"
		) {
			return false
		}

		variableStartPos += 2

		const markup = state.src.slice(state.pos, variableStartPos)

		const variableEndPos = state.src.indexOf(">>", variableStartPos) + 1

		if (variableEndPos !== -1) {
			const content = state.src.slice(state.pos + 2, variableEndPos - 1)

			//if the citation doesn't include a line break
			if (!content.match(/\r\n|\r|\n/g)) {
				if (!silent) {
					const token = state.push("cite", "span", 0)
					token.attrs = []
					token.content = content
					token.markup = markup
				}

				state.pos = variableEndPos + 1

				return true
			}
		}

		if (!silent) state.pending += markup

		state.pos = variableStartPos

		return true
	},
	{ alt: [] }
)

markdown.renderer.rules["cite"] = (tokens, idx, _opts, _env, self) => {
	const token = tokens[idx]
	return `<cite${self.renderAttrs(token)}>${escapeHtml(token.content)}</cite>`
}

// 📘 `=` as an equivalent to HTML's `dfn`

markdown.inline.ruler.push(
	"dfn",
	(state, silent) => {
		let variableStartPos = state.pos

		if (state.src.charAt(variableStartPos) !== "=") {
			return false
		}

		variableStartPos += 1

		const markup = state.src.slice(state.pos, variableStartPos)

		const variableEndPos = state.src.indexOf("=", variableStartPos)

		if (variableEndPos !== -1) {
			const content = state.src.slice(state.pos + 1, variableEndPos)

			//if the definition doesn't include a line break
			if (!content.match(/\r\n|\r|\n/g)) {
				if (!silent) {
					const token = state.push("dfn", "span", 0)
					token.attrs = []
					token.content = content
					token.markup = markup
				}

				state.pos = variableEndPos + 1

				return true
			}
		}

		if (!silent) state.pending += markup

		state.pos = variableStartPos

		return true
	},
	{ alt: [] }
)

markdown.renderer.rules["dfn"] = (tokens, idx, _opts, _env, self) => {
	const token = tokens[idx]
	return `<dfn${self.renderAttrs(token)}>${escapeHtml(token.content)}</dfn>`
}

markdown.inline.ruler.push(
	"embed",
	(state, silent) => {
		let variableStartPos = state.pos

		if (
			state.src.charAt(variableStartPos) !== "@" ||
			state.src.charAt(variableStartPos + 1) !== "["
		) {
			return false
		}

		variableStartPos += 2

		const markup = state.src.slice(state.pos, variableStartPos)

		const urlStartPos = state.src.indexOf("(", variableStartPos) + 1
		const variableEndPos = state.src.indexOf(")", variableStartPos)
		const labelEndPos = state.src.indexOf("]", variableStartPos)

		if (variableEndPos !== -1) {
			const label = state.src.slice(variableStartPos, labelEndPos)
			const url = state.src.slice(urlStartPos, variableEndPos)

			//if the label & url don't include a line break
			if (!(label.match(/\r\n|\r|\n/g) || url.match(/\r\n|\r|\n/g))) {
				if (!silent) {
					const token = state.push("embed", "span", 0)
					token.block = true
					token.attrs = [["src", url]]
					token.content = label
				}

				state.pos = variableEndPos + 1

				return true
			}
		}

		if (!silent) state.pending += markup

		state.pos = variableStartPos

		return true
	},
	{ alt: [] }
)

markdown.renderer.rules["embed"] = (tokens, idx, _opts, _env, self) => {
	const token = tokens[idx]
	const src = token.attrGet("src")

	const [domain, aspect] = Object.entries(embedAspectRatios).find(
		([domain, _]) =>
			src.match(/^https:\/\/(?:www\.)?(.+)\.com/)[1] == domain
	) ?? [undefined, 1]

	console.log(domain)

	return `
  		<figure>
  		  <aspect-iframe${self.renderAttrs(token)} :@aspect="${aspect}" @domain="${domain}"></aspect-iframe>
  			${token.content ? `<figcaption>${token.content}</figcaption>` : ""}
  		</figure>
	`
}

export default markdown
