'use strict';
// A small classification server for tests and CI. It speaks the same MCP
// protocol as the real classifier, answers the tool `classify_transaction`
// from a fixed keyword table, and listens on loopback only. It needs no
// network and no key.
const http = require('node:http');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const {
  StreamableHTTPServerTransport,
} = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1'];

const EXPENSE_KEYWORDS = [
  ['Alimentación', ['almuerzo', 'cena', 'comida', 'desayuno', 'restaurante']],
  ['Transporte', ['taxi', 'uber', 'bus', 'gasolina', 'pasaje']],
  ['Vivienda', ['alquiler', 'renta', 'luz', 'agua']],
  ['Salud', ['farmacia', 'medicina', 'doctor']],
  ['Entretenimiento', ['cine', 'netflix', 'concierto']],
  ['Educación', ['curso', 'libro', 'colegio']],
  ['Ahorro/Inversión', ['ahorro', 'inversión', 'inversion']],
];
const INCOME_KEYWORDS = [
  ['Salario', ['salario', 'sueldo', 'nómina', 'nomina']],
  ['Ingreso extra', ['freelance', 'bono', 'venta']],
  ['Reembolso', ['reembolso', 'devolución', 'devolucion']],
];

function classify(description, type) {
  const text = String(description).toLowerCase();
  const table = type === 'income' ? INCOME_KEYWORDS : EXPENSE_KEYWORDS;
  for (const [category, words] of table) {
    if (words.some((word) => text.includes(word))) return category;
  }
  return 'Otros';
}

function buildServer() {
  const server = new McpServer({ name: 'fake-classifier', version: '1.0.0' });
  server.registerTool(
    'classify_transaction',
    {
      description: 'Classify a transaction into one category (test double).',
      inputSchema: {
        description: z.string(),
        amount: z.number(),
        type: z.enum(['income', 'expense']),
      },
    },
    async ({ description, type }) => ({
      content: [{ type: 'text', text: classify(description, type) }],
    }),
  );
  return server;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

async function startFakeMcpServer({ host = '127.0.0.1', port = 0 } = {}) {
  if (!LOOPBACK_HOSTS.includes(host)) {
    throw new Error('The fake MCP server only listens on loopback.');
  }
  const httpServer = http.createServer(async (req, res) => {
    if (req.url !== '/mcp') {
      res.writeHead(404).end();
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' }).end();
      return;
    }
    try {
      const body = await readBody(req);
      const server = buildServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on('close', () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch {
      if (!res.headersSent) res.writeHead(500).end();
    }
  });
  await new Promise((resolve) => httpServer.listen(port, host, resolve));
  const address = httpServer.address();
  return {
    host: address.address,
    port: address.port,
    url: `http://${address.address}:${address.port}/mcp`,
    close: () => new Promise((resolve) => httpServer.close(resolve)),
  };
}

module.exports = { startFakeMcpServer, classify };

if (require.main === module) {
  const host = process.env.FAKE_MCP_HOST || '127.0.0.1';
  const port = Number(process.env.FAKE_MCP_PORT || 8765);
  startFakeMcpServer({ host, port }).then((started) => {
    console.log(`fake MCP server listening at ${started.url}`);
  });
}
