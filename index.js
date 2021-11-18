require('dotenv').config()
const port = process.env.PORT || 3000;
const db_url = process.env.DBURL || 'mongodb://localhost:27017';

//EXPRESS
const express = require('express');
const bodyParser = require('body-parser')
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

app.get('/getsettings', async (req, res) => {
	const dblocal = await db;
	const collection = dblocal.collection('settings');
	const result = await collection.find({}).toArray();
	res.json(result);
});

app.get('/getsetting/:name', async (req, res) => {
	const dblocal = await db;
	const collection = dblocal.collection('settings');
	const result = await collection.findOne({name: req.params.name});
	res.json(result);
});

app.post('/newsetting', async (req, res) => {
	const dblocal = await db;
	const collection = dblocal.collection('settings');
	await collection.updateOne({name: req.body.name}, {$set: req.body}, {upsert: true});
	res.json(req.body);
});

app.get('/progress/:deviceid/:name/:percent/:color', async (req, res) => {
	const dblocal = await db;
	const collection = dblocal.collection('progress');

	if(req.params.percent >= 100) {
		await collection.deleteMany({deviceid:req.params.deviceid});
		addPush({deviceid:result.deviceid, type: 'error', title: result.name + " timeout", message: result.name + " has timed out", url: ""});
	} else {
		var json_progress = req.params;
		json_progress.update_time = new Date();
	
		await collection.updateOne({deviceid: req.params.deviceid}, {$set: json_progress}, {upsert: true});
	}

	res.send(req.params.deviceid + " updated");
});

app.get('/push/:deviceid/:type/:title/:message/:url', async (req, res) => {
	//TODO: sanitize inputs
	res.send(await addPush(req.params)?"✔️":"💀");
});

app.get('/getpushes', async (req, res) => {
	const dblocal = await db;
	const collection = dblocal.collection('pushes');
	const result = await collection.find({}).toArray();
	res.send(result);
});

app.listen(3000, function() {
	console.log('listening on 3000');
});

async function addPush(push_obj) {
	const dblocal = await db;
	const collection = dblocal.collection('pushes');
	//TODO: sanitize inputs
	await collection.insertOne(push_obj);
	return true;
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
			addPush({deviceid:result.deviceid, type: 'error', title: result.name + " timeout", message: result.name + " has timed out", url: ""});
		}
	});
}, 60000);