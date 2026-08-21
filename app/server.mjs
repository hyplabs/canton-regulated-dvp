import { createServer } from "node:http";
import { CantonClient } from "./lib/canton-client.mjs";
import { createRequestHandler } from "./lib/http-app.mjs";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 4173);
const server = createServer(createRequestHandler({ cantonClient: new CantonClient() }));

server.listen(port, host, () => {
  console.log(`Regulated Settlement UI: http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
