#!/usr/bin/env node
/**
 * Ambit One MCP Server — Modo Remoto (SSE)
 * Deploy en Render, Railway, Fly.io, etc.
 *
 * Variables de entorno requeridas:
 *   AMBIT_ONE_API_KEY  → Tu API Key de PideDirecto
 *   PORT               → Puerto (Render lo asigna automáticamente)
 */

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

const PORT = process.env.PORT || 3000;
const API_BASE_URL = "https://api.pidedirecto.mx/pidedirecto/v2";
const API_KEY = process.env.AMBIT_ONE_API_KEY;

if (!API_KEY) {
  console.error("❌ Error: Falta la variable de entorno AMBIT_ONE_API_KEY");
  process.exit(1);
}

// ─── Helper para llamadas al API ─────────────────────────────────────────────

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

// ─── Función que crea y configura el servidor MCP ────────────────────────────

function createMcpServer() {
  const server = new McpServer({
    name: "ambit-one-pidedirecto",
    version: "1.0.0",
  });

  // ── ÓRDENES ────────────────────────────────────────────────────────────────

  server.tool(
    "get_orders",
    "Obtener lista de órdenes de una tienda, con filtro opcional por fechas.",
    {
      storeId: z.string().describe("UUID de la tienda en PideDirecto"),
      startDate: z.string().optional().describe("Fecha inicio (ISO 8601, ej: 2024-01-01T00:00:00Z)"),
      endDate: z.string().optional().describe("Fecha fin (ISO 8601, ej: 2024-01-31T23:59:59Z)"),
    },
    async ({ storeId, startDate, endDate }) => {
      const data = await apiGet("/getOrders", { storeId, startDate, endDate });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "get_order",
    "Obtener el detalle completo de una orden específica.",
    { orderId: z.string().describe("UUID de la orden") },
    async ({ orderId }) => {
      const data = await apiGet("/getOrder", { orderId });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "accept_order",
    "Aceptar una orden en estado NEW.",
    { orderId: z.string().describe("UUID de la orden a aceptar") },
    async ({ orderId }) => {
      const data = await apiPost("/acceptOrder", { orderId });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "reject_order",
    "Rechazar una orden en estado NEW con un motivo.",
    {
      orderId: z.string().describe("UUID de la orden a rechazar"),
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

  server.tool(
    "cancel_order",
    "Cancelar una orden existente.",
    { orderId: z.string().describe("UUID de la orden a cancelar") },
    async ({ orderId }) => {
      const data = await apiPost("/cancelOrder", { orderId });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── CREAR PEDIDOS ──────────────────────────────────────────────────────────

  server.tool(
    "create_delivery_order",
    "Crear una orden de delivery (a domicilio).",
    {
      storeId: z.string().describe("UUID de la tienda"),
      customerName: z.string().describe("Nombre del cliente"),
      customerPhoneNumber: z.string().describe("Teléfono del cliente"),
      customerEmail: z.string().optional().describe("Email del cliente"),
      customerAddressStreet: z.string().describe("Dirección de entrega"),
      customerAddressLat: z.number().describe("Latitud de la dirección"),
      customerAddressLng: z.number().describe("Longitud de la dirección"),
      customerAddressInstructions: z.string().optional().describe("Instrucciones de entrega"),
      orderItems: z.array(z.object({
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
      })).describe("Lista de productos del pedido"),
      paymentMethod: z.enum([
        "CARD", "CASH", "CARD_ON_DELIVERY", "PAYMENT_LINK",
        "PAYMENT_TERMINAL", "TRANSFER", "CUSTOMER_CREDIT_ACCOUNT", "MULTIPLE",
      ]).describe("Método de pago"),
      subtotal: z.string().describe("Subtotal antes de envío/descuentos"),
      total: z.string().describe("Total final del pedido"),
      deliveryCost: z.string().optional().describe("Costo del delivery"),
      pickupTimeType: z.enum(["ASAP", "PLANNED"]).describe("Tipo de tiempo de recolección"),
      pickupTime: z.string().optional().describe("Hora planeada (ISO 8601), requerida si PLANNED"),
      instructions: z.string().optional().describe("Instrucciones generales"),
      driverInstructions: z.string().optional().describe("Instrucciones para el repartidor"),
      webhookUrl: z.string().optional().describe("URL para recibir actualizaciones del pedido"),
      externalOrderId: z.string().optional().describe("ID del pedido en sistema externo"),
      deliveryEstimateId: z.string().optional().describe("ID del estimado de delivery"),
    },
    async (body) => {
      const data = await apiPost("/createDeliveryOrder", body);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "create_take_away_order",
    "Crear una orden para recoger en tienda (take away).",
    {
      storeId: z.string().describe("UUID de la tienda"),
      customerName: z.string().describe("Nombre del cliente"),
      customerPhoneNumber: z.string().describe("Teléfono del cliente"),
      customerEmail: z.string().optional().describe("Email del cliente"),
      orderItems: z.array(z.object({
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
      })).describe("Lista de productos del pedido"),
      paymentMethod: z.enum([
        "CARD", "CASH", "CARD_ON_DELIVERY", "PAYMENT_LINK",
        "PAYMENT_TERMINAL", "TRANSFER", "CUSTOMER_CREDIT_ACCOUNT", "MULTIPLE",
      ]).describe("Método de pago"),
      subtotal: z.string().describe("Subtotal"),
      total: z.string().describe("Total final"),
      pickupTimeType: z.enum(["ASAP", "PLANNED"]).describe("Tipo de tiempo de recolección"),
      pickupTime: z.string().optional().describe("Hora planeada (ISO 8601), requerida si PLANNED"),
      instructions: z.string().optional().describe("Instrucciones generales"),
      webhookUrl: z.string().optional().describe("URL para recibir actualizaciones"),
      externalOrderId: z.string().optional().describe("ID en sistema externo"),
    },
    async (body) => {
      const data = await apiPost("/createTakeAwayOrder", body);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── DELIVERY & LOGÍSTICA ───────────────────────────────────────────────────

  server.tool(
    "get_delivery_estimate",
    "Obtener estimado de tiempo y costo de delivery antes de crear una orden.",
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

  server.tool(
    "get_driver_position",
    "Obtener la posición GPS actual del repartidor para una orden.",
    { orderId: z.string().describe("UUID de la orden") },
    async ({ orderId }) => {
      const data = await apiGet("/getDriverPosition", { orderId });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── CATÁLOGO / MENÚ ────────────────────────────────────────────────────────

  server.tool(
    "get_store_menu",
    "Obtener el menú completo de la tienda: categorías, productos y modificadores.",
    { storeId: z.string().describe("UUID de la tienda") },
    async ({ storeId }) => {
      const data = await apiGet("/getStoreMenu", { storeId });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "get_store_catalog",
    "Obtener el catálogo completo de productos de la tienda.",
    { storeId: z.string().describe("UUID de la tienda") },
    async ({ storeId }) => {
      const data = await apiGet("/getStoreCatalog", { storeId });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "hide_product",
    "Ocultar un producto del menú para que los clientes no lo vean.",
    {
      storeId: z.string().describe("UUID de la tienda"),
      productId: z.string().describe("UUID del producto a ocultar"),
    },
    async ({ storeId, productId }) => {
      const data = await apiPost("/hideProduct", { storeId, productId });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "un_hide_product",
    "Mostrar un producto que estaba oculto en el menú.",
    {
      storeId: z.string().describe("UUID de la tienda"),
      productId: z.string().describe("UUID del producto a mostrar"),
    },
    async ({ storeId, productId }) => {
      const data = await apiPost("/unhideProduct", { storeId, productId });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "change_product_price",
    "Cambiar el precio de un producto en el menú.",
    {
      storeId: z.string().describe("UUID de la tienda"),
      productId: z.string().optional().describe("UUID del producto"),
      externalProductId: z.string().optional().describe("ID externo del producto"),
      price: z.string().describe("Nuevo precio del producto (ej: '99.00')"),
    },
    async ({ storeId, productId, externalProductId, price }) => {
      const data = await apiPost("/changeProductPrice", { storeId, productId, externalProductId, price });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "upload_store_menu",
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

  server.tool(
    "create_payment_link",
    "Generar un link de pago online para una orden.",
    {
      storeId: z.string().describe("UUID de la tienda"),
      amount: z.string().describe("Monto a cobrar (ej: '250.00')"),
      customerName: z.string().describe("Nombre del cliente"),
      customerPhoneNumber: z.string().describe("Teléfono del cliente"),
      customerEmail: z.string().optional().describe("Email del cliente"),
      description: z.string().optional().describe("Descripción del pago"),
      externalOrderId: z.string().optional().describe("ID en sistema externo"),
      webhookUrl: z.string().optional().describe("URL para notificación de pago"),
    },
    async (body) => {
      const data = await apiPost("/createPaymentLink", body);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  return server;
}

// ─── Servidor HTTP con SSE ────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Mapa de transports activos por sesión
const transports = new Map();

// Health check (Render lo usa para verificar que el servicio está vivo)
app.get("/", (req, res) => {
  res.json({
    name: "Ambit One MCP Server",
    version: "1.0.0",
    status: "running",
    activeSessions: transports.size,
  });
});

// Endpoint SSE — el cliente MCP se conecta aquí
app.get("/sse", async (req, res) => {
  console.log("Nueva conexión SSE");
  const server = createMcpServer();
  const transport = new SSEServerTransport("/message", res);
  transports.set(transport.sessionId, transport);

  res.on("close", () => {
    console.log(`Sesión cerrada: ${transport.sessionId}`);
    transports.delete(transport.sessionId);
  });

  await server.connect(transport);
});

// Endpoint POST — el cliente envía mensajes aquí
app.post("/message", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports.get(sessionId);

  if (!transport) {
    return res.status(400).json({ error: `Sesión no encontrada: ${sessionId}` });
  }

  await transport.handlePostMessage(req, res);
});

app.listen(PORT, () => {
  console.log(`✅ Ambit One MCP Server corriendo en puerto ${PORT}`);
  console.log(`   SSE endpoint: http://localhost:${PORT}/sse`);
});
