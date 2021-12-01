require('dotenv').config()
const env = process.env.NODE_ENV || 'development';
const port = process.env.PORT || 80;
const ssl_port = process.env.SSLPORT || 3000;
const db_url = process.env.DBURL || 'mongodb://localhost:27017';
const api_key = process.env.APIKEY;
const key = process.env.KEY;
const cert = process.env.CERT;

const serve_index = require('serve-index');
const http = require('http');
const https = require('https');
const fs = require('fs');

//EXPRESS
const express = require('express');
const bodyParser = require('body-parser')
const cors = require('cors');
const app = express();

//middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public', { dotfiles: 'allow' }));

//DATABASE
const db = (async () => {
	const { MongoClient } = require('mongodb');
	const client = new MongoClient(db_url);
	await client.connect();
	const db_name = 'visor';
	return client.db(db_name);
})();

let json_progress = {};

app.get('/', (req, res) => {
	res.send("root");
});

app.get('/getsettings/:apikey', async (req, res) => {
	if(apikeyCheck(req.params, res)) { return; }

	const dblocal = await db;
	const collection = dblocal.collection('settings');
	const result = await collection.find({}).toArray();
	res.json(result);
});

app.get('/getsetting/:apikey/:name', async (req, res) => {
	if(apikeyCheck(req.params, res)) { return; }

	const dblocal = await db;
	const collection = dblocal.collection('settings');
	const result = await collection.findOne({name: req.params.name});
	res.json(result);
});

app.get('/getbytag/:apikey/:tag', async (req, res) => {
	if(apikeyCheck(req.params, res)) { return; }

	const dblocal = await db;
	const collection = dblocal.collection('settings');
	const result = await collection.find({tags: new RegExp(req.params.tag,'g')}).toArray();
	res.json(result);
});

app.get('/settag/:apikey/:name/:tag/:action', async (req, res) => {
	if(apikeyCheck(req.params, res)) { return; }

	const dblocal = await db;
	const collection = dblocal.collection('settings');

	switch(req.params.action) {
		case "add":
			collection.updateOne( 
				{ name : req.params.name },
				{ $push: { tags: req.params.tag } }
			)
			break;
		case "remove":
			break;
		case "only":
			break;
	}

	res.send("✔️");
});

app.post('/newsetting', async (req, res) => {
	if(apikeyCheck(req.body, res)) { return; }

	const dblocal = await db;
	const collection = dblocal.collection('settings');
	await collection.updateOne({name: req.body.name}, {$set: req.body}, {upsert: true});
	res.json(req.body);
});

app.get('/progress/:apikey/:deviceid/:name/:percent/:color', async (req, res) => {
	if(apikeyCheck(req.params, res)) { return; }

	const dblocal = await db;
	const collection = dblocal.collection('progress');

	//If the deviceid is already at 100, it's finished
	if(req.params.percent >= 100) {

		//If the deviceid is in the collection, delete it and send a notification
		const result = await collection.find({deviceid: req.params.deviceid}).toArray();
		if(result.length > 0) {
			await collection.deleteMany({deviceid:req.params.deviceid});
			addPush({deviceid:result.deviceid, type: 'error', title: result.name + " timeout", message: result.name + " has timed out", url: ""});
		}
	//if the deviceid is still under 100 update with the new progress value
	} else {
		var json_progress = req.params;
		json_progress.update_time = new Date();
	
		await collection.updateOne({deviceid: req.params.deviceid}, {$set: json_progress}, {upsert: true});
	}

	res.send(req.params.deviceid + " updated");
});

app.get('/getprogress/:apikey', async (req, res) => {
	if(apikeyCheck(req.params, res)) { return; }

	const dblocal = await db;
	const collection = dblocal.collection('progress');
	const result = await collection.find({}).toArray();
	res.json(result);
});

app.get('/push/:apikey/:deviceid/:type/:title/:message/:url', async (req, res) => {
	if(apikeyCheck(req.params, res)) { return; }
	var new_push = req.params;
	new_push.timestamp = new Date();

	//TODO: sanitize inputs
	res.send(await addPush(req.params)?"✔️":"💀");
});

app.get('/getpushes/:apikey/latest', async (req, res) => {
	if(apikeyCheck(req.params, res)) { return; }

	var dt = new Date();
	var one_hour_ago = new Date(dt.setHours(dt.getHours() - 1));

	const dblocal = await db;
	const collection = dblocal.collection('pushes');
	const result = await collection.find({ timestamp: {$gt: one_hour_ago} }).toArray();
	res.send(result);
});

if(env === "production") {
	/////////////HTTPS///////////////
	const httpsServer = https.createServer({
		key: fs.readFileSync(key),
		cert: fs.readFileSync(cert),
	}, app);

	httpsServer.listen(ssl_port, () => {
		console.log('HTTPS Server running on port ' + ssl_port);
	});
}

/////////////HTTP////////////////
const httpServer = http.createServer(app);

app.listen(port, function() {
	console.log('http listening on ' + port);
});

async function addPush(push_obj) {
	const dblocal = await db;
	const collection = dblocal.collection('pushes');
	//TODO: sanitize inputs
	await collection.insertOne(push_obj);
	return true;
}

//Check if the client has the correct API KEY
function apikeyCheck(obj, res) {
	let test = (obj.apikey !== api_key);
	if(test) { res.send("💀"); }
	delete obj.apikey;
	return test;
}

//Check every minute for stalled progess bars
setInterval(async () => {
	const dblocal = await db;
	const collection = dblocal.collection('progress');
	const results = await collection.find({}).toArray();

	const ten_minutes = 1000 * 60 * 10;
	results.forEach(async (result) => {
		const compare = Date.now() - result.update_time;
		if(compare > ten_minutes) {
			await collection.deleteMany({deviceid:result.deviceid});
			addPush({deviceid:result.deviceid, type: 'message', title: result.name + " timeout", message: result.name + " has timed out", url: ""});
		}
	});
}, 60000);