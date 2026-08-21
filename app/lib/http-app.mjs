import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CantonApiError } from "./canton-client.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(appRoot, "public");
const lucidePath = path.resolve(appRoot, "../node_modules/lucide/dist/umd/lucide.js");
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) {
      throw new CantonApiError("Request body is too large.", {
        status: 413,
        code: "REQUEST_TOO_LARGE",
      });
    }
  }

  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw new CantonApiError("Request body must be valid JSON.", {
      status: 400,
      code: "INVALID_JSON",
    });
  }
}

async function sendFile(response, filePath) {
  try {
    const file = await stat(filePath);
    if (!file.isFile()) {
      return false;
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes.get(path.extname(filePath)) ?? "application/octet-stream",
      "Content-Length": file.size,
      "Cache-Control": filePath.endsWith("index.html") ? "no-store" : "public, max-age=300",
    });
    createReadStream(filePath).pipe(response);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function publicFilePath(urlPath) {
  const relativePath = urlPath === "/" ? "index.html" : decodeURIComponent(urlPath.slice(1));
  const candidate = path.resolve(publicRoot, relativePath);
  return candidate.startsWith(`${publicRoot}${path.sep}`) ? candidate : null;
}

export function createRequestHandler({ cantonClient }) {
  return async function requestHandler(request, response) {
    try {
      const url = new URL(request.url, "http://localhost");

      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, await cantonClient.health());
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/attestations") {
        sendJson(response, 201, await cantonClient.createEligibilityAttestation(await readJson(request)));
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/attestations/")) {
        const contractId = decodeURIComponent(url.pathname.slice("/api/attestations/".length));
        sendJson(response, 200, await cantonClient.getEligibilityAttestation(contractId));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/offers") {
        sendJson(response, 201, await cantonClient.createAssetOffer(await readJson(request)));
        return;
      }

      const acceptOfferMatch = url.pathname.match(/^\/api\/offers\/([^/]+)\/accept$/);
      if (request.method === "POST" && acceptOfferMatch) {
        const contractId = decodeURIComponent(acceptOfferMatch[1]);
        sendJson(response, 200, await cantonClient.acceptAssetOffer(contractId, await readJson(request)));
        return;
      }

      const offerMatch = url.pathname.match(/^\/api\/offers\/([^/]+)$/);
      if (request.method === "GET" && offerMatch) {
        sendJson(
          response,
          200,
          await cantonClient.getAssetOffer(decodeURIComponent(offerMatch[1])),
        );
        return;
      }

      const complianceMatch = url.pathname.match(/^\/api\/compliance-pending\/([^/]+)$/);
      if (request.method === "GET" && complianceMatch) {
        sendJson(
          response,
          200,
          await cantonClient.getCompliancePending(decodeURIComponent(complianceMatch[1])),
        );
        return;
      }

      const approveComplianceMatch = url.pathname.match(
        /^\/api\/compliance-pending\/([^/]+)\/approve$/,
      );
      if (request.method === "POST" && approveComplianceMatch) {
        sendJson(
          response,
          200,
          await cantonClient.approveCompliance(decodeURIComponent(approveComplianceMatch[1])),
        );
        return;
      }

      const agreementMatch = url.pathname.match(/^\/api\/agreements\/([^/]+)$/);
      if (request.method === "GET" && agreementMatch) {
        sendJson(
          response,
          200,
          await cantonClient.getPurchaseAgreement(decodeURIComponent(agreementMatch[1])),
        );
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/payment-proposals") {
        sendJson(
          response,
          201,
          await cantonClient.createTokenizedPaymentProposal(await readJson(request)),
        );
        return;
      }

      const approvePaymentMatch = url.pathname.match(
        /^\/api\/payment-proposals\/([^/]+)\/approve$/,
      );
      if (request.method === "POST" && approvePaymentMatch) {
        sendJson(
          response,
          200,
          await cantonClient.approveTokenizedPayment(decodeURIComponent(approvePaymentMatch[1])),
        );
        return;
      }

      const paymentProposalMatch = url.pathname.match(/^\/api\/payment-proposals\/([^/]+)$/);
      if (request.method === "GET" && paymentProposalMatch) {
        sendJson(
          response,
          200,
          await cantonClient.getTokenizedPaymentProposal(
            decodeURIComponent(paymentProposalMatch[1]),
          ),
        );
        return;
      }

      const acceptPaymentMatch = url.pathname.match(
        /^\/api\/approved-payments\/([^/]+)\/accept$/,
      );
      if (request.method === "POST" && acceptPaymentMatch) {
        sendJson(
          response,
          200,
          await cantonClient.acceptTokenizedPayment(decodeURIComponent(acceptPaymentMatch[1])),
        );
        return;
      }

      const approvedPaymentMatch = url.pathname.match(/^\/api\/approved-payments\/([^/]+)$/);
      if (request.method === "GET" && approvedPaymentMatch) {
        sendJson(
          response,
          200,
          await cantonClient.getApprovedTokenizedPayment(
            decodeURIComponent(approvedPaymentMatch[1]),
          ),
        );
        return;
      }

      const paymentRequestMatch = url.pathname.match(/^\/api\/payment-requests\/([^/]+)$/);
      if (request.method === "GET" && paymentRequestMatch) {
        sendJson(
          response,
          200,
          await cantonClient.getTokenizedPaymentRequest(
            decodeURIComponent(paymentRequestMatch[1]),
          ),
        );
        return;
      }

      if (request.method === "GET" && url.pathname === "/vendor/lucide.js") {
        if (!(await sendFile(response, lucidePath))) {
          sendJson(response, 503, {
            code: "LUCIDE_NOT_INSTALLED",
            message: "Run npm install before starting the application.",
          });
        }
        return;
      }

      if (request.method === "GET") {
        const filePath = publicFilePath(url.pathname);
        if (filePath && (await sendFile(response, filePath))) {
          return;
        }
      }

      sendJson(response, 404, { code: "NOT_FOUND", message: "Resource not found." });
    } catch (error) {
      const knownError = error instanceof CantonApiError;
      sendJson(response, knownError ? error.status : 500, {
        code: knownError ? error.code : "INTERNAL_ERROR",
        message: knownError ? error.message : "Unexpected server error.",
      });
      if (!knownError) {
        console.error(error);
      }
    }
  };
}
