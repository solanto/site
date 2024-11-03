import Fetch from "@11ty/eleventy-fetch"

export const data = {
	permalink: "/styles/fonts.css"
}

export async function render() {
	return await this.renderTemplate(
		await Fetch(
			"https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400;1,700&family=Noto+Color+Emoji&display=swap"
		),
		"css-inline"
	)
}
