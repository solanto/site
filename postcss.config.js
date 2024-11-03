import autoprefixer from "autoprefixer"
import cssnano from "cssnano"

export default {
	map: process.env?.PRODUCTION ? false : "inline",
	plugins: [autoprefixer, cssnano]
}
