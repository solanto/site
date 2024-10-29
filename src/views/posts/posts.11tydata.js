export default {
	layout: "post",
	tags: "post",
	eleventyComputed: {
		modified: ({ updated, date }) => updated ?? date,
		nontrivialTags: ({ tags }) => tags.filter(tag => tag != "post")
	}
}
