import { pollNanopool } from "../services/nanopool.js";
import { pool } from "../db/pool.js";

const result = await pollNanopool();
console.log(JSON.stringify(result, null, 2));
await pool.end();
