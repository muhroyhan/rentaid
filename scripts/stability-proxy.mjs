import { createServer, request } from "node:http";
import { createHash } from "node:crypto";

// Test-only proxy: forward the request completely, then discard its committed response.
export async function stabilityProxy(port, target) {
  const faults = { offline: false, dropPath: null, dropped: [], requests: [] };
  const server = createServer((incoming, outgoing) => {
    if (faults.offline) {
      outgoing.destroy();
      return;
    }
    const chunks = [];
    incoming.on("data", (chunk) => chunks.push(chunk));
    incoming.on("end", () => {
      const body = Buffer.concat(chunks);
      if (
        incoming.method === "POST" &&
        ["/api/v1/checkout", "/api/v1/payment-simulator"].includes(incoming.url)
      ) {
        faults.requests.push({
          path: incoming.url,
          key: incoming.headers["idempotency-key"],
          payloadHash: createHash("sha256").update(body).digest("hex"),
        });
      }
      const discard =
        incoming.method === "POST" && incoming.url === faults.dropPath;
      const upstream = request(
        new URL(incoming.url, target),
        {
          method: incoming.method,
          headers: { ...incoming.headers, host: new URL(target).host },
        },
        (response) => {
          if (discard) {
            response.resume();
            response.on("end", () => {
              faults.dropped.push({
                path: incoming.url,
                status: response.statusCode,
                key: incoming.headers["idempotency-key"],
                payloadHash: createHash("sha256").update(body).digest("hex"),
              });
              outgoing.destroy();
            });
          } else {
            outgoing.writeHead(response.statusCode, response.headers);
            response.pipe(outgoing);
          }
        },
      );
      upstream.on("error", () => {
        if (!outgoing.headersSent) outgoing.writeHead(502);
        outgoing.end();
      });
      upstream.end(body);
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    faults,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
