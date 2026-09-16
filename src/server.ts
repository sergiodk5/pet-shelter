import { app } from "./app";
import { loadConfig } from "./config/env";

const config = loadConfig();

app.listen(config.port, (): void => {
  console.log("Listening on port:", config.port);
});
