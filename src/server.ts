import { createApp } from "./app";
import { createDb } from "./config/db";
import { loadConfig, loadDatabaseUrl } from "./config/env";

const config = loadConfig();
const { db } = createDb(loadDatabaseUrl());
const app = createApp(config, db);

app.listen(config.port, (): void => {
  console.log("Listening on port:", config.port);
});
