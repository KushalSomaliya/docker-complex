const keys = require("./keys");

// Express App Setup
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Postgres Client Setup
const { Pool } = require("pg");

const pgClient = new Pool({
  user: keys.pgUser,
  host: keys.pgHost,
  database: keys.pgDatabase,
  password: keys.pgPassword,
  port: keys.pgPort,
});
pgClient.on("error", () => console.log("Lost PG connection"));

const TABLE_NAME = "values";

const ensureValuesTable = async () => {
  try {
    await pgClient.query(
      `CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (number INT)`
    );
    console.log(`Ensured Postgres table "${TABLE_NAME}" exists`);
  } catch (err) {
    console.log("PG table creation failed, retrying in 1s", err.message);
    setTimeout(ensureValuesTable, 1000);
  }
};

pgClient.on("connect", () => {
  console.log("Postgres client connected, ensuring table");
  ensureValuesTable();
});

// Redis Client Setup
const redis = require("redis");
const redisClient = redis.createClient({
  host: keys.redisHost,
  port: keys.redisPort,
  retry_strategy: () => 1000,
});
const redisPublisher = redisClient.duplicate();

const getIndexesFromRedis = () =>
  new Promise((resolve) => {
    redisClient.hkeys("values", (err, indexes) => {
      if (err || !indexes) {
        console.log("Redis hkeys error or empty", err ? err.message : "none");
        return resolve([]);
      }
      console.log("Redis hkeys returned indexes:", indexes);
      resolve(indexes.map((number) => ({ number })));
    });
  });

// Express route handlers

app.get("/", (req, res) => {
  res.send("Hi");
});

app.get("/values/all", async (req, res) => {
  console.log("GET /values/all - fetching from Postgres");
  try {
    const values = await pgClient.query(`SELECT * from ${TABLE_NAME}`);
    console.log("PG rows returned:", values.rows);
    if (values.rows.length) {
      return res.send(values.rows);
    }
  } catch (err) {
    console.log("PG select error, falling back to redis", err.message);
  }

  const indexes = await getIndexesFromRedis();
  res.send(indexes);
});

app.get("/values/current", async (req, res) => {
  redisClient.hgetall("values", (err, values) => {
    if (err) {
      console.log("Redis hgetall error:", err.message);
    } else {
      console.log("Redis hgetall values:", values);
    }
    res.send(values);
  });
});

app.post("/values", async (req, res) => {
  const index = req.body.index;

  if (parseInt(index) > 40) {
    console.log("Rejecting index > 40:", index);
    return res.status(422).send("Index too high");
  }

  console.log("Storing index", index);
  redisClient.hset("values", index, "Nothing yet!");
  redisPublisher.publish("insert", index);
  pgClient
    .query(`INSERT INTO ${TABLE_NAME}(number) VALUES($1)`, [index])
    .catch((err) => console.log("PG insert error", err.message));

  res.send({ working: true });
});

app.listen(5000, (err) => {
  console.log("Listening");
});
