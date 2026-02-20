/**
 * Tests that destructive SQL (UPDATE, DELETE, INSERT, etc.) is not passed for execution
 * when config comes from CLI default (read-only) or TOML with readonly = true.
 * Only ConnectorManager is mocked; real ToolRegistry and execute_sql handler are used.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Connector, ConnectorType } from '../../connectors/interface.js';
import { ConnectorManager } from '../../connectors/manager.js';
import { createExecuteSqlToolHandler } from '../execute-sql.js';
import { initializeToolRegistry } from '../registry.js';
import { loadFixtureConfig } from '../../__fixtures__/helpers.js';

vi.mock('../../connectors/manager.js');

const createMockConnector = (sourceId: string, id: ConnectorType = 'postgres'): Connector => ({
  id,
  name: 'Mock Connector',
  getId: () => sourceId,
  dsnParser: {} as any,
  connect: vi.fn(),
  disconnect: vi.fn(),
  clone: vi.fn(),
  getSchemas: vi.fn(),
  getTables: vi.fn(),
  tableExists: vi.fn(),
  getTableSchema: vi.fn(),
  getTableIndexes: vi.fn(),
  getStoredProcedures: vi.fn(),
  getStoredProcedureDetail: vi.fn(),
  executeSQL: vi.fn(),
});

const parseToolResponse = (response: any) => JSON.parse(response.content[0].text);

describe('readonly enforcement from config (destructive SQL not passed for execution)', () => {
  beforeEach(() => {
    vi.mocked(ConnectorManager.ensureConnected).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('CLI default config (single-DSN without --destructive)', () => {
    it('should reject UPDATE, DELETE, INSERT and not pass them to connector', async () => {
      const mockConnector = createMockConnector('default');
      vi.mocked(ConnectorManager.getCurrentConnector).mockReturnValue(mockConnector);

      const config = {
        sources: [
          { id: 'default', type: 'postgres' as const, dsn: 'postgres://u:p@localhost:5432/db' },
        ],
        tools: [
          { name: 'execute_sql' as const, source: 'default', readonly: true },
          { name: 'search_objects' as const, source: 'default' },
        ],
      };
      initializeToolRegistry(config);

      const handler = createExecuteSqlToolHandler('default');
      const destructiveStatements = [
        'UPDATE t SET x = 1',
        "DELETE FROM t WHERE id = 1",
        "INSERT INTO users (name) VALUES ('test')",
      ];

      for (const sql of destructiveStatements) {
        vi.mocked(mockConnector.executeSQL).mockClear();
        const result = await handler({ sql }, null);
        expect(result.isError).toBe(true);
        expect(parseToolResponse(result).code).toBe('READONLY_VIOLATION');
        expect(mockConnector.executeSQL).not.toHaveBeenCalled();
      }
    });
  });

  describe('TOML config (execute_sql with readonly = true)', () => {
    it('should reject UPDATE, DELETE, INSERT and not pass them to connector', async () => {
      const { sources, tools } = loadFixtureConfig('readonly-maxrows');
      initializeToolRegistry({ sources, tools: tools || [] });

      const mockConnector = createMockConnector('readonly_limited');
      vi.mocked(ConnectorManager.getCurrentConnector).mockReturnValue(mockConnector);

      const handler = createExecuteSqlToolHandler('readonly_limited');
      const destructiveStatements = [
        'UPDATE t SET x = 1',
        'DELETE FROM t',
        "INSERT INTO users (name) VALUES ('test')",
      ];

      for (const sql of destructiveStatements) {
        vi.mocked(mockConnector.executeSQL).mockClear();
        const result = await handler({ sql }, null);
        expect(result.isError).toBe(true);
        expect(parseToolResponse(result).code).toBe('READONLY_VIOLATION');
        expect(mockConnector.executeSQL).not.toHaveBeenCalled();
      }
    });
  });
});
