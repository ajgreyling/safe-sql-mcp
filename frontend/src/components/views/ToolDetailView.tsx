import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Navigate, useSearchParams } from 'react-router-dom';
import { fetchSource } from '../../api/sources';
import { executeTool } from '../../api/tools';
import { ApiError } from '../../api/errors';
import type { Tool } from '../../types/datasource';
import { SqlEditor, RunButton, ResultsTabs, type ResultTab, type SqlEditorHandle } from '../tool';
import CopyIcon from '../icons/CopyIcon';
import CheckIcon from '../icons/CheckIcon';

export default function ToolDetailView() {
  const { sourceId, toolName } = useParams<{ sourceId: string; toolName: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tool, setTool] = useState<Tool | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  // Ref to access SqlEditor's selection
  const sqlEditorRef = useRef<SqlEditorHandle>(null);

  // Query state
  const [sql, setSql] = useState(() => {
    // Only for execute_sql tools - read from URL on mount
    return searchParams.get('sql') || '';
  });
  const [resultTabs, setResultTabs] = useState<ResultTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!sourceId || !toolName) return;

    setIsLoading(true);
    setError(null);
    // Reset result state when switching tools
    setResultTabs([]);
    setActiveTabId(null);

    fetchSource(sourceId)
      .then((sourceData) => {
        const foundTool = sourceData.tools.find((t) => t.name === toolName);
        setTool(foundTool || null);
        setIsLoading(false);
      })
      .catch((err: ApiError) => {
        setError(err);
        setIsLoading(false);
      });
  }, [sourceId, toolName]);

  // Determine tool type (execute_sql or search_objects only)
  const getToolType = useCallback((): 'execute_sql' | 'search_objects' => {
    if (!tool) return 'execute_sql';
    if (tool.name.startsWith('execute_sql')) return 'execute_sql';
    return 'search_objects';
  }, [tool]);

  const toolType = getToolType();

  // Update URL when sql changes (debounced for execute_sql tools)
  useEffect(() => {
    if (toolType !== 'execute_sql') return;

    const timer = setTimeout(() => {
      setSearchParams((currentParams) => {
        const newParams = new URLSearchParams(currentParams);

        if (sql.trim()) {
          newParams.set('sql', sql);
        } else {
          newParams.delete('sql');
        }

        return newParams;
      }, { replace: true });
    }, 300);

    return () => clearTimeout(timer);
  }, [sql, toolType, setSearchParams]);

  // Run query
  const handleRun = useCallback(async () => {
    if (!tool || !toolName || toolType !== 'execute_sql') return;

    setIsRunning(true);

    const startTime = performance.now();
    const sqlToExecute = sqlEditorRef.current?.getSelectedSql() ?? sql;

    try {
      const queryResult = await executeTool(toolName, { sql: sqlToExecute });
      const endTime = performance.now();
      const duration = endTime - startTime;

      const newTab: ResultTab = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        result: queryResult,
        error: null,
        executedSql: sqlToExecute,
        executionTimeMs: duration,
      };
      setResultTabs(prev => [newTab, ...prev]);
      setActiveTabId(newTab.id);
    } catch (err) {
      const errorTab: ResultTab = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        result: null,
        error: err instanceof Error ? err.message : 'Query failed',
        executedSql: sqlToExecute,
        executionTimeMs: 0,
      };
      setResultTabs(prev => [errorTab, ...prev]);
      setActiveTabId(errorTab.id);
    } finally {
      setIsRunning(false);
    }
  }, [tool, toolName, toolType, sql]);

  const isRunDisabled = toolType === 'execute_sql' ? !sql.trim() : true;

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [sql]);

  const handleTabClose = useCallback((idToClose: string) => {
    setResultTabs(prev => {
      const index = prev.findIndex(tab => tab.id === idToClose);
      const newTabs = prev.filter(tab => tab.id !== idToClose);

      if (idToClose === activeTabId && newTabs.length > 0) {
        const nextIndex = Math.min(index, newTabs.length - 1);
        setActiveTabId(newTabs[nextIndex].id);
      } else if (newTabs.length === 0) {
        setActiveTabId(null);
      }

      return newTabs;
    });
  }, [activeTabId]);

  if (!sourceId || !toolName) {
    return <Navigate to="/" replace />;
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-8 py-12">
        <div className="text-muted-foreground">Loading tool details...</div>
      </div>
    );
  }

  if (error) {
    if (error.status === 404) {
      return <Navigate to="/404" replace />;
    }

    return (
      <div className="container mx-auto px-8 py-12">
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-destructive mb-2">Error</h2>
          <p className="text-destructive/90">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!tool) {
    return <Navigate to="/404" replace />;
  }

  // search_objects placeholder
  if (toolType === 'search_objects') {
    return (
      <div className="container mx-auto px-8 py-12 max-w-4xl">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-foreground font-mono">{tool.name}</h1>
          </div>
          <p className="text-muted-foreground leading-relaxed">{tool.description}</p>
          <div className="border border-border rounded-lg bg-card p-8 text-center">
            <p className="text-muted-foreground">
              Interactive UI for this tool is coming soon.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-8 py-12 max-w-4xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-foreground font-mono">{tool.name}</h1>
          </div>
          <p className="text-muted-foreground leading-relaxed">{tool.description}</p>
        </div>

        {/* SQL Editor (execute_sql only; search_objects returns early) */}
        {toolType === 'execute_sql' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">
                SQL Statement
              </label>
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded cursor-pointer transition-colors"
                title="Copy SQL"
              >
                {copied ? (
                  <>
                    <CheckIcon className="w-3.5 h-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <CopyIcon className="w-3.5 h-3.5" />
                    Copy
                  </>
                )}
              </button>
            </div>
            <SqlEditor
              ref={sqlEditorRef}
              value={sql}
              onChange={setSql}
              onRunShortcut={handleRun}
              disabled={isRunDisabled || isRunning}
              readOnly={false}
              placeholder="SELECT * FROM table_name LIMIT 10;"
            />
          </div>
        )}

        {/* Run Button */}
        <RunButton
          onClick={handleRun}
          disabled={isRunDisabled}
          loading={isRunning}
        />

        {/* Results */}
        <ResultsTabs
          tabs={resultTabs}
          activeTabId={activeTabId}
          onTabSelect={setActiveTabId}
          onTabClose={handleTabClose}
          isLoading={isRunning}
        />
      </div>
    </div>
  );
}
