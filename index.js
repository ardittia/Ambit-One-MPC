#!/usr/bin/env node
/**
 * Ambit One MCP Server — Streamable HTTP Transport
 * Compatible con mcp-remote v0.1.37+
 *
 * Variables de entorno requeridas:
 *   AMBIT_ONE_API_KEY  → Tu API Key de PideDirecto
 *   PORT               → Puerto (Render lo asigna automáticamente)
 */

import express from "express";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PORT = process.env.PORT || 3000;
const API_BASE_URL = "https://api.pidedirecto.mx/pidedirecto/v2";
const API_KEY = process.env.AMBIT_ONE_API_KEY;

if (!API_KEY) {
  console.error("❌ Error: Falta la variable de entorno AMBIT_ONE_API_KEY");
  process.exit(1);
}

// ─── Helpers API ─────────────────────────────────────────────────────────────

async function apiGet(path, params = {}) {
  const url = new URL(`${API_BASE_URL}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString(), {
    headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function apiPost(path, body = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return JSON.parse(text);
}

// ─── Crear servidor MCP con todas las herramientas ───────────────────────────

function createMcpServer() {
  const server = new McpServer({
    name: "ambit-one-pidedirecto",
    version: "1.0.0",
  });

  // ── ÓRDENES ────────────────────────────────────────────────────────────────

  server.tool("get_orders",
    "Obtener lista de órdenes de una tienda, con filtro opcional por fechas.",
    {
      storeId: z.string().describe("UUID de la tienda en PideDirecto"),
      startDate: z.string().optional().describe("Fecha inicio (ISO 8601)"),
      endDate: z.string().optional().describe("Fecha fin (ISO 8601)"),
    },
    async ({ storeId, startDate, endDate }) => {
      const data = await apiGet("/getOrders", { storeId, startDate, endDate });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool("get_order",
    "Obtener el detalle completo de una orden específica.",
    { orderId: z.string().describe("UUID de la orden") },
    async ({ orderId }) => {
      const data = await apiGet("/getOrder", { orderId });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool("accept_order",
    "Aceptar una orden en estado NEW.",
    { orderId: z.string().describe("UUID de la orden") },
    async ({ orderId }) => {
      const data = await apiPost("/acceptOrder", { orderId });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool("reject_order",
    "Rechazar una orden en estado NEW con un motivo.",
    {
      orderId: z.string().describe("UUID de la orden"),
      reason: z.enum([
        "CLOSING_SOON", "PROBLEM_IN_RESTAURANT", "SOLD_OUT",
        "INCORRECT_PRICE", "DRIVER_NOT_FOUND", "REJECTED_BY_ADMIN", "OTHER",
      ]).describe("Motivo del rechazo"),
    },
    async ({ orderId, reason }) => {
      const data = await apiPost("/rejectOrder", { orderId, reason });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool("cancel_order",
    "Cancelar una orden existente.",
    { orderId: z.string().describe("UUID de la orden") },
    async ({ orderId }) => {
      const data = await apiPost("/cancelOrder", { orderId });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── CREAR PEDIDOS ──────────────────────────────────────────────────────────

  const orderItemSchema = z.array(z.object({
    name: z.string(),
    unitPrice: z.string(),
    quantity: z.number(),
    productId: z.string().optional(),
    externalProductId: z.string().optional(),
    note: z.string().optional(),
    modifierGroups: z.array(z.object({
      name: z.string(),
      modifiers: z.array(z.object({ name: z.string(), price: z.string(), quantity: z.number() })),
    })).optional(),
  })).describe("Lista de productos del pedido");

  const paymentMethodSchema = z.enum([
    "CARD", "CASH", "CARD_ON_DELIVERY", "PAYMENT_LINK",
    "PAYMENT_TERMINAL", "TRANSFER", "CUSTOMER_CREDIT_ACCOUNT", "MULTIPLE",
  ]).describe("Método de pago");

  server.tool("create_delivery_order",
    "Crear una orden de delivery (a domicilio).",
    {
      storeId: z.string().describe("UUID de la tienda"),
      customerName: z.string().describe("Nombre del cliente"),
      customerPhoneNumber: z.string().describe("Teléfono del cliente"),
      customerEmail: z.string().optional().describe("Email del cliente"),
      customerAddressStreet: z.string().describe("Dirección de entrega"),
      customerAddressLat: z.number().describe("Latitud"),
      customerAddressLng: z.number().describe("Longitud"),
      customerAddressInstructions: z.string().optional().describe("Instrucciones de entrega"),
      orderItems: orderItemSchema,
      paymentMethod: paymentMethodSchema,
      subtotal: z.string().describe("Subtotal"),
      total: z.string().describe("Total final"),
      deliveryCost: z.string().optional().describe("Costo del delivery"),
      pickupTimeType: z.enum(["ASAP", "PLANNED"]).describe("Tipo de tiempo"),
      pickupTime: z.string().optional().describe("Hora planeada (ISO 8601)"),
      instructions: z.string().optional().describe("Instrucciones generales"),
      driverInstructions: z.string().optional().describe("Instrucciones para el repartidor"),
      webhookUrl: z.string().optional().describe("URL de webhook"),
      externalOrderId: z.string().optional().describe("ID externo"),
      deliveryEstimateId: z.string().optional().describe("ID del estimado de delivery"),
    },
    async (body) => {
      const data = await apiPost("/createDeliveryOrder", body);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool("create_take_away_order",
    "Crear una orden para recoger en tienda (take away).",
    {
      storeId: z.string().describe("UUID de la tienda"),
      customerName: z.string().describe("Nombre del cliente"),
      customerPhoneNumber: z.string().describe("Teléfono del cliente"),
      customerEmail: z.string().optional().describe("Email del cliente"),
      orderItems: orderItemSchema,
      paymentMethod: paymentMethodSchema,
      subtotal: z.string().describe("Subtotal"),
      total: z.string().describe("Total final"),
      pickupTimeType: z.enum(["ASAP", "PLANNED"]).describe("Tipo de tiempo"),
      pickupTime: z.string().optional().describe("Hora planeada (ISO 8601)"),
      instructions: z.string().optional().describe("Instrucciones generales"),
      webhookUrl: z.string().optional().describe("URL de webhook"),
      externalOrderId: z.string().optional().describe("ID externo"),
    },
    async (body) => {
      const data = await apiPost("/createTakeAwayOrder", body);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── DELIVERY & LOGÍSTICA ───────────────────────────────────────────────────

  server.tool("get_delivery_estimate",
    "Obtener estimado de tiempo y costo de delivery.",
    {
      storeId: z.string().describe("UUID de la tienda"),
      customerLat: z.number().describe("Latitud de destino"),
      customerLng: z.number().describe("Longitud de destino"),
    },
    async ({ storeId, customerLat, customerLng }) => {
      const data = await apiGet("/getDeliveryEstimate", { storeId, customerLat, customerLng });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool("get_driver_position",
    "Obtener la posición GPS actual del repartidor.",
    { orderId: z.string().describe("UUID de la orden") },
    async ({ orderId }) => {
      const data = await apiGet("/getDriverPosition", { orderId });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── CATÁLOGO / MENÚ ────────────────────────────────────────────────────────

  server.tool("get_store_menu",
    "Obtener el menú completo de la tienda: categorías, productos y modificadores.",
    { storeId: z.string().describe("UUID de la tienda") },
    async ({ storeId }) => {
      const data = await apiGet("/getStoreMenu", { storeId });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool("get_store_catalog",
    "Obtener el catálogo completo de productos de la tienda.",
    { storeId: z.string().describe("UUID de la tienda") },
    async ({ storeId }) => {
      const data = await apiGet("/getStoreCatalog", { storeId });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool("hide_product",
    "Ocultar un producto del menú.",
    {
      storeId: z.string().describe("UUID de la tienda"),
      productId: z.string().describe("UUID del producto"),
    },
    async ({ storeId, productId }) => {
      const data = await apiPost("/hideProduct", { storeId, productId });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool("un_hide_product",
    "Mostrar un producto oculto en el menú.",
    {
      storeId: z.string().describe("UUID de la tienda"),
      productId: z.string().describe("UUID del producto"),
    },
    async ({ storeId, productId }) => {
      const data = await apiPost("/unhideProduct", { storeId, productId });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool("change_product_price",
    "Cambiar el precio de un producto en el menú.",
    {
      storeId: z.string().describe("UUID de la tienda"),
      productId: z.string().optional().describe("UUID del producto"),
      externalProductId: z.string().optional().describe("ID externo del producto"),
      price: z.string().describe("Nuevo precio (ej: '99.00')"),
    },
    async ({ storeId, productId, externalProductId, price }) => {
      const data = await apiPost("/changeProductPrice", { storeId, productId, externalProductId, price });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool("upload_store_menu",
    "Subir o reemplazar el menú completo de la tienda.",
    {
      storeId: z.string().describe("UUID de la tienda"),
      menuName: z.string().describe("Nombre del menú"),
      categories: z.array(z.any()).describe("Array de categorías con sus productos"),
      channels: z.array(z.enum([
        "PIDEDIRECTO", "PIDEDIRECTOPOS", "PIDEDIRECTOKIOSK",
        "UBER_EATS", "DIDI_FOOD", "RAPPI", "PEDIDOS_YA",
      ])).optional().describe("Canales donde aplica el menú"),
    },
    async ({ storeId, menuName, categories, channels }) => {
      const data = await apiPost("/uploadStoreMenu", { storeId, menuName, categories, channels });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── PAGOS ──────────────────────────────────────────────────────────────────

  server.tool("create_payment_link",
    "Generar un link de pago online.",
    {
      storeId: z.string().describe("UUID de la tienda"),
      amount: z.string().describe("Monto a cobrar (ej: '250.00')"),
      customerName: z.string().describe("Nombre del cliente"),
      customerPhoneNumber: z.string().describe("Teléfono del cliente"),
      customerEmail: z.string().optional().describe("Email del cliente"),
      description: z.string().optional().describe("Descripción del pago"),
      externalOrderId: z.string().optional().describe("ID externo"),
      webhookUrl: z.string().optional().describe("URL de webhook"),
    },
    async (body) => {
      const data = await apiPost("/createPaymentLink", body);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  return server;
}

// ─── Servidor Express con Streamable HTTP Transport ───────────────────────────

const app = express();
app.use(express.json());

// Sesiones activas
const transports = new Map();

// Health check
app.get("/", (req, res) => {
  res.json({
    name: "Ambit One MCP Server",
    version: "1.0.0",
    status: "running",
    activeSessions: transports.size,
  });
});

// Endpoint MCP principal — POST para mensajes del cliente
app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];

  // Sesión existente — reusar el transporte guardado
  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId);
    await transport.handleRequest(req, res, req.body);
    return;
  }

  // Nueva sesión — crear transporte y servidor frescos
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  transport.onclose = () => {
    if (transport.sessionId) transports.delete(transport.sessionId);
  };

  const server = createMcpServer();
  await server.connect(transport);

  // Procesar el request (esto genera transport.sessionId internamente)
  await transport.handleRequest(req, res, req.body);

  // Guardar el transporte DESPUÉS de handleRequest, cuando sessionId ya existe
  if (transport.sessionId) {
    transports.set(transport.sessionId, transport);
  }
});

// Endpoint MCP — GET para SSE (notificaciones del servidor al cliente)
app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  const transport = transports.get(sessionId);

  if (!transport) {
    return res.status(400).json({ error: `Sesión no encontrada: ${sessionId}` });
  }

  await transport.handleRequest(req, res);
});

// Endpoint MCP — DELETE para cerrar sesión
app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  const transport = transports.get(sessionId);

  if (transport) {
    await transport.close();
    transports.delete(sessionId);
  }

  res.status(200).send();
});

app.listen(PORT, () => {
  console.log(`✅ Ambit One MCP Server corriendo en puerto ${PORT}`);
  console.log(`   MCP endpoint: http://localhost:${PORT}/mcp`);
});
