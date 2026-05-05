const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const R2MCP_PORT = process.env.R2MCP_PORT || 8765;
const R2MCP_PATH = path.join(__dirname, '..', 'src', 'r2mcp'); // 假设已经编译好

async function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = require('net').createConnection(port, '127.0.0.1');
    socket.on('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => {
      resolve(false);
    });
  });
}

function startR2Mcp() {
  console.error(`[Wrapper] Starting r2mcp on port ${R2MCP_PORT}...`);
  const r2mcp = spawn(R2MCP_PATH, ['-H', R2MCP_PORT.toString(), '-r'], {
    detached: true,
    stdio: 'ignore'
  });
  r2mcp.unref();
}

async function callR2Mcp(method, params) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: `tools/${method}`,
      params: { arguments: params }
    });

    const req = http.request({
      hostname: '127.0.0.1',
      port: R2MCP_PORT,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.error) {
            reject(new Error(json.error.message || 'Unknown JSON-RPC error'));
          } else {
            // MCP tools response usually has a 'content' array
            const result = json.result;
            if (result && result.content && result.content[0]) {
              resolve(result.content[0].text || JSON.stringify(result.content[0]));
            } else {
              resolve(JSON.stringify(result));
            }
          }
        } catch (e) {
          reject(new Error(`Failed to parse r2mcp response: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  // 1. Read input from stdin
  let inputData = '';
  process.stdin.on('data', (chunk) => {
    inputData += chunk;
  });

  process.stdin.on('end', async () => {
    try {
      if (!inputData.trim()) {
        process.exit(0);
      }

      const args = JSON.parse(inputData);
      const command = args.command || args.command1; // 支持串行调用的简单兼容

      if (!command) {
        throw new Error('No command specified in VCP request');
      }

      // 2. Ensure r2mcp daemon is running
      const isOpen = await isPortOpen(R2MCP_PORT);
      if (!isOpen) {
        startR2Mcp();
        // 等待一下让 server 起来
        await new Promise(r => setTimeout(r, 1000));
      }

      // 3. Call r2mcp via MCP/HTTP
      // VCP passes command, args. We map it to tool call
      // mapping run_command to run_command in MCP
      let toolName = command;
      if (command === 'run_command') toolName = 'run_command'; // maps VCP command to tool name

      const result = await callR2Mcp(toolName, args);

      // 4. Output VCP result
      console.log(JSON.stringify({
        status: 'success',
        result: result
      }));

    } catch (e) {
      console.log(JSON.stringify({
        status: 'error',
        error: e.message
      }));
      process.exit(1);
    }
  });
}

main();
