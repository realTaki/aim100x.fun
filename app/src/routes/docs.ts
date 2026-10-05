import { createFileRoute } from "@tanstack/react-router";
import { handleProductDocsRequest } from "@/lib/product-docs";

export const Route = createFileRoute("/docs")({
  server: {
    handlers: {
      GET: ({ request }) => handleProductDocsRequest(request),
      HEAD: ({ request }) => handleProductDocsRequest(request),
    },
  },
});
