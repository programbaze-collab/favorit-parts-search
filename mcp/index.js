#!/usr/bin/env node
// Запуск MCP-сервера через stdio — так его подключают Claude Code и Claude Desktop.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createFavoritClient } from './favorit.js'
import { createServer } from './server.js'

await createServer(createFavoritClient()).connect(new StdioServerTransport())
