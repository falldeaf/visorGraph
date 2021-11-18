const db = (async () => {
	return "foo";
})();

(async() => {
	console.log(await db);
})();

