/**
 * Integration test to verify the MCP server applies a 60-second query timeout
 * when no explicit query_timeout is configured (PostgreSQL, MySQL, MariaDB, SQL Server).
 *
 * Uses execute_sql with a long-running query (pg_sleep) and asserts it times out
 * after approximately 60 seconds.
 *
 * Requires Docker for Testcontainers.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';

describe('Query timeout integration test', () => {
  let postgresContainer: StartedPostgreSqlContainer;
  let serverProcess: ChildProcess | null = null;
  const testPort = 3012;
  const baseUrl = `http://localhost:${testPort}`;

  beforeAll(async () => {
    postgresContainer = await new PostgreSqlContainer('postgres:15-alpine')
      .withDatabase('testdb')
      .withUsername('testuser')
      .withPassword('testpass')
      .start();

    const dsn = postgresContainer
      .getConnectionUri()
      .replace(/^postgresql:/, 'postgres:');
    const dsnWithSsl = dsn.includes('?')
      ? `${dsn}&sslmode=disable`
      : `${dsn}?sslmode=disable`;

    serverProcess = spawn('pnpm', ['run', 'dev:backend'], {
      env: {
        ...process.env,
        DSN: dsnWithSsl,
        TRANSPORT: 'http',
        PORT: testPort.toString(),
        NODE_ENV: 'test',
      },
      stdio: 'pipe',
    });

    serverProcess.stdout?.on('data', (data) => {
      process.stdout.write(`[server] ${data}`);
    });
    serverProcess.stderr?.on('data', (data) => {
      process.stderr.write(`[server] ${data}`);
    });

    let serverReady = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const res = await fetch(`${baseUrl}/mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 'ping', method: 'notifications/initialized' }),
        });
        if (res.status < 500) {
          serverReady = true;
          break;
        }
      } catch {
        /* server not ready */
      }
    }
    if (!serverReady) {
      throw new Error('Server did not start within expected time');
    }
  }, 90000);

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        serverProcess?.on('exit', () => resolve());
        setTimeout(() => resolve(), 3000);
      });
    }
    await postgresContainer?.stop();
  }, 10000);

  async function callExecuteSql(sql: string): Promise<{ response: any; durationMs: number }> {
    const start = Date.now();
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'timeout-test',
        method: 'tools/call',
        params: { name: 'execute_sql', arguments: { sql } },
      }),
    });
    const body = await res.json();
    const durationMs = Date.now() - start;
    return { response: body, durationMs };
  }

  it(
    'should time out a long-running query after ~60 seconds when no query_timeout is configured',
    async () => {
      const { response, durationMs } = await callExecuteSql('SELECT pg_sleep(120)');

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('content');
      const content = JSON.parse(response.result.content[0].text);
      expect(content.success).toBe(false);
      expect(content.error).toBeDefined();
      expect(content.code).toBe('EXECUTION_ERROR');

      expect(durationMs).toBeGreaterThanOrEqual(55000);
      expect(durationMs).toBeLessThan(90000);
    },
    95000
  );
});
