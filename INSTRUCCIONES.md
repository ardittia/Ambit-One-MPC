# Ambit One MCP Server — Instrucciones de instalación

## 1. Requisitos previos
- Node.js 18 o superior (`node --version` para verificar)
- Tu API Key de Ambit One / PideDirecto

## 2. Instalar dependencias

Abre Terminal, navega a la carpeta del proyecto y ejecuta:

```bash
cd ~/Downloads/ambit-one-mcp   # o donde hayas guardado la carpeta
npm install
```

## 3. Configurar Claude Desktop

Abre el archivo:
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

Y agrega dentro de `"mcpServers"`:

```json
"ambit-one-local": {
  "command": "node",
  "args": ["/ruta/completa/a/ambit-one-mcp/index.js"],
  "env": {
    "AMBIT_ONE_API_KEY": "TU_API_KEY_AQUI"
  }
}
```

> ⚠️ Reemplaza `/ruta/completa/a/ambit-one-mcp/` con la ruta real donde guardaste la carpeta.
> Por ejemplo: `/Users/tu-usuario/Downloads/ambit-one-mcp/index.js`

El archivo completo se verá así:

```json
{
  "preferences": {
    "coworkWebSearchEnabled": true,
    "coworkScheduledTasksEnabled": true,
    "ccdScheduledTasksEnabled": true,
    "sidebarMode": "task"
  },
  "mcpServers": {
    "ambit-one-local": {
      "command": "node",
      "args": ["/Users/tu-usuario/Downloads/ambit-one-mcp/index.js"],
      "env": {
        "AMBIT_ONE_API_KEY": "TU_API_KEY_AQUI"
      }
    }
  }
}
```

## 4. Reiniciar Claude Desktop

Cierra y vuelve a abrir Claude Desktop (Cmd + Q → abrir).

## 5. Verificar

En Claude Desktop verás las siguientes herramientas disponibles:
- get_orders / get_order
- accept_order / reject_order / cancel_order
- create_delivery_order / create_take_away_order
- get_delivery_estimate / get_driver_position
- get_store_menu / get_store_catalog
- hide_product / un_hide_product / change_product_price / upload_store_menu
- create_payment_link

## Herramientas disponibles (16 en total)

| Herramienta | Descripción |
|---|---|
| `get_orders` | Lista órdenes de una tienda |
| `get_order` | Detalle de una orden |
| `accept_order` | Aceptar orden |
| `reject_order` | Rechazar orden con motivo |
| `cancel_order` | Cancelar orden |
| `create_delivery_order` | Crear pedido a domicilio |
| `create_take_away_order` | Crear pedido para recoger |
| `get_delivery_estimate` | Estimado de tiempo y costo |
| `get_driver_position` | Posición GPS del repartidor |
| `get_store_menu` | Menú completo de la tienda |
| `get_store_catalog` | Catálogo de productos |
| `upload_store_menu` | Subir/actualizar menú |
| `hide_product` | Ocultar producto |
| `un_hide_product` | Mostrar producto oculto |
| `change_product_price` | Cambiar precio de producto |
| `create_payment_link` | Generar link de pago |
