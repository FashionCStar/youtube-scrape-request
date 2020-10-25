const express = require('express');
const scraper = require('./scraper');
const cors = require('cors');
const app = express();
app.use(cors());
// var timeout = express.timeout // express v3 and below
var timeout = require('connect-timeout'); //express v4


//Home page
app.get('/', (req, res) => {
    res.sendFile(__dirname + "/index.html");
});

//API route
app.get('/api/search', (req, res) => {
    scraper.youtube(req.query.q, req.query.key, req.query.pageToken)
        .then(x => res.json(x))
        .catch(e => res.send(e));
});

app.use(timeout(120000));
app.listen(process.env.PORT || 3000, function () {
  console.log('Listening on port 3000');
});

module.exports = app;
