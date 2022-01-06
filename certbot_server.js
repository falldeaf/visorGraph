const http = require('http');
const express = require('express')
const app = express()

app.use(express.static('public', { dotfiles: 'allow' }));

const httpServer = http.createServer(app);

app.listen(8080, function() {
	console.log('http listening on ' + 8080);
});
