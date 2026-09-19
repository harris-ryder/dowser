import { BRAND, MCP_PATH } from './config.js';
import app from './app.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';

app.listen(port, host, () => {
  console.log(`${BRAND} listening on http://${host}:${port}  (MCP at ${MCP_PATH})`);
});
