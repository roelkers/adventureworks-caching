const keys = require('./keys');

// Express App Setup
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Postgres Client Setup
const { Pool } = require('pg');
const pgClient = new Pool({
  user: keys.pgUser,
  host: keys.pgHost,
  database: keys.pgDatabase,
  password: keys.pgPassword,
  port: keys.pgPort
});
pgClient.on('error', () => console.log('Lost PG connection'));

// Redis Client Setup
const redis = require('redis');
const redisClient = redis.createClient({
  host: keys.redisHost,
  port: keys.redisPort,
  retry_strategy: () => 1000
});

// Express route handlers

app.get('/salesorderdetail/:id', async (req, res) => {
  const { id } = req.params
  const { rows } = await pgClient.query('SELECT * FROM salesorderdetail WHERE salesorderdetailid=$1', [id])
  res.send(rows[0])
})


app.get('/salesorderdetail', async (req, res) => {
  const { year, maxtotaldue } = req.query
  if (year && maxtotaldue) {

    redisClient.hget('salesorderdetail', `${year}`, async (err, result) => {
      if (err) throw new Error(err)
      if (result) {
        return res.send(JSON.parse(result))
      }
      else {
        const { rows } = await pgClient.query(`
          SELECT card_sub.cardtype, card_sub.cardnumber, sales_sub.salesorderid, sales_sub.totaldue 
          FROM (
          SELECT * FROM creditcard WHERE EXPYEAR>$1) card_sub, 
          LATERAL (SELECT salesorderheader.salesorderid, salesorderheader.totaldue 
              FROM salesorderheader 
              WHERE salesorderheader.creditcardid=card_sub.creditcardid  
              ORDER BY salesorderheader.totaldue LIMIT 1) as sales_sub;
    `, [year])

        redisClient.hset('salesorderdetail', `${year}`, JSON.stringify(rows.slice(0, 100)))
        res.send(rows.slice(0, 100))
      }
    })
  }
})

app.listen(5000, err => {
  console.log('Listening');
});
