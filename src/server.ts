import { createApp } from "./app";
import { loadConfig } from "./config/env";

const config = loadConfig();
const app = createApp(config);

app.listen(config.port, (): void => {
  console.log("Listening on port:", config.port);
});
