// Собирает сценарий n8n из кода инструментов: node n8n/build.mjs → n8n/favorit-parts-bot.json.
// Готовый файл импортируется в n8n через «Import from File».
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8')

// У Code Tool в n8n нет импортов, поэтому общая часть вставляется в код каждого инструмента.
export function toolCode(name) {
  return `${read('./tools/favorit.js')}\n${read(`./tools/${name}.js`)}`
}

const SYSTEM_MESSAGE = `Ты — помощник по подбору автозапчастей в магазине Favorit. Отвечаешь по-русски, коротко и по делу.

Как искать:
1. Артикул из сообщения передай в find_part_brands. Если производителей несколько и пользователь не назвал нужного, перечисли их с ценой и остатком и спроси, какой нужен.
2. Чтобы показать аналоги, вызови get_part_offers с brand и number из ответа find_part_brands: номер у производителя может отличаться от того, что ввёл пользователь.
3. Если просят «в наличии» или «что можно купить сейчас», передай inStockOnly: true.

Правила:
- Цены, остатки и сроки бери только из ответов инструментов. Ничего не придумывай и не округляй цены.
- Если инструмент вернул ошибку, перескажи её пользователю своими словами.
- Если в сообщении нет артикула, попроси его прислать.
- Пиши простым текстом без таблиц и Markdown: ответ уходит в Telegram. Цену пиши как «1 082 ₽», дату отгрузки — как «30.10».
- Аналогов показывай не больше пяти, самые дешёвые из тех, что в наличии.`

function codeTool(id, name, description, inputSchema, position) {
  return {
    id,
    name,
    type: '@n8n/n8n-nodes-langchain.toolCode',
    typeVersion: 1.3,
    position,
    parameters: {
      description,
      language: 'javaScript',
      jsCode: toolCode(name.replaceAll('_', '-')),
      specifyInputSchema: true,
      schemaType: 'manual',
      inputSchema: JSON.stringify(inputSchema, null, 2),
    },
  }
}

export function buildWorkflow() {
  const nodes = [
    {
      id: 'chat-trigger',
      name: 'Чат n8n',
      type: '@n8n/n8n-nodes-langchain.chatTrigger',
      typeVersion: 1.5,
      position: [0, 0],
      parameters: { options: {} },
    },
    {
      id: 'telegram-trigger',
      name: 'Telegram',
      type: 'n8n-nodes-base.telegramTrigger',
      typeVersion: 1.2,
      position: [0, 200],
      parameters: { updates: ['message'], additionalFields: {} },
    },
    {
      id: 'agent',
      name: 'AI-агент',
      type: '@n8n/n8n-nodes-langchain.agent',
      typeVersion: 3.1,
      position: [300, 100],
      parameters: {
        promptType: 'define',
        // Сообщение приходит либо из чата n8n, либо из Telegram.
        text: '={{ $json.chatInput ?? $json.message?.text }}',
        options: { systemMessage: SYSTEM_MESSAGE, maxIterations: 6, enableStreaming: false },
      },
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      type: '@n8n/n8n-nodes-langchain.lmChatDeepSeek',
      typeVersion: 1,
      position: [160, 360],
      parameters: { model: 'deepseek-chat', options: { temperature: 0.2 } },
    },
    {
      id: 'memory',
      name: 'Память диалога',
      type: '@n8n/n8n-nodes-langchain.memoryBufferWindow',
      typeVersion: 1.4,
      position: [320, 360],
      parameters: {
        sessionIdType: 'customKey',
        // Своя история у каждого чата: sessionId в чате n8n, id чата в Telegram.
        sessionKey: '={{ $json.sessionId ?? String($json.message?.chat?.id) }}',
        contextWindowLength: 10,
      },
    },
    codeTool(
      'tool-brands',
      'find_part_brands',
      'Ищет автозапчасть по артикулу в API Favorit. Возвращает JSON: производители, которые выпускают деталь с таким номером, с минимальной ценой, остатком и лучшим складом. Первый шаг поиска.',
      {
        type: 'object',
        properties: {
          number: { type: 'string', description: 'Артикул, например 01089. Пробелы и дефисы допустимы' },
        },
        required: ['number'],
      },
      [480, 360],
    ),
    codeTool(
      'tool-offers',
      'get_part_offers',
      'Возвращает JSON: искомую деталь конкретного производителя и до 10 аналогов с ценой, остатком и лучшим складом. analoguesTotal — сколько аналогов найдено всего. brand и number бери из ответа find_part_brands.',
      {
        type: 'object',
        properties: {
          brand: { type: 'string', description: 'Производитель, например FEBI' },
          number: { type: 'string', description: 'Номер детали у этого производителя' },
          inStockOnly: { type: 'boolean', description: 'Только позиции с остатком' },
        },
        required: ['brand', 'number'],
      },
      [640, 360],
    ),
    {
      id: 'from-telegram',
      name: 'Из Telegram?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [700, 100],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
          conditions: [
            {
              id: 'is-telegram',
              leftValue: "={{ $('Telegram').isExecuted }}",
              rightValue: '',
              operator: { type: 'boolean', operation: 'true', singleValue: true },
            },
          ],
          combinator: 'and',
        },
        options: {},
      },
    },
    {
      id: 'telegram-reply',
      name: 'Ответ в Telegram',
      type: 'n8n-nodes-base.telegram',
      typeVersion: 1.2,
      position: [940, 0],
      parameters: {
        resource: 'message',
        operation: 'sendMessage',
        chatId: "={{ $('Telegram').item.json.message.chat.id }}",
        text: '={{ $json.output }}',
        additionalFields: { appendAttribution: false },
      },
    },
  ]

  const ai = (type, node) => ({ [type]: [[{ node, type, index: 0 }]] })
  const main = (...targets) => ({ main: targets.map((node) => (node ? [{ node, type: 'main', index: 0 }] : [])) })

  return {
    name: 'Подбор автозапчастей: AI-агент Favorit',
    nodes,
    connections: {
      'Чат n8n': main('AI-агент'),
      Telegram: main('AI-агент'),
      'AI-агент': main('Из Telegram?'),
      // В чат n8n ответ возвращается сам, в Telegram — отдельным сообщением.
      'Из Telegram?': main('Ответ в Telegram', null),
      DeepSeek: ai('ai_languageModel', 'AI-агент'),
      'Память диалога': ai('ai_memory', 'AI-агент'),
      find_part_brands: ai('ai_tool', 'AI-агент'),
      get_part_offers: ai('ai_tool', 'AI-агент'),
    },
    settings: { executionOrder: 'v1' },
    pinData: {},
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(
    new URL('./favorit-parts-bot.json', import.meta.url),
    `${JSON.stringify(buildWorkflow(), null, 2)}\n`,
  )
}
