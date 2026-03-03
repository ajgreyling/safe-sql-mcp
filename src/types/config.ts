/**
 * Configuration types for TOML-based multi-database setup
 */

/**
 * SSH tunnel configuration (inline per-source)
 */
export interface SSHConfig {
  ssh_host?: string;
  ssh_port?: number;
  ssh_user?: string;
  ssh_password?: string;
  ssh_key?: string;
  ssh_passphrase?: string;
  /**
   * ProxyJump configuration for multi-hop SSH connections.
   * Comma-separated list of jump hosts: "jump1.example.com,user@jump2.example.com:2222"
   */
  ssh_proxy_jump?: string;
}

/**
 * Database connection parameters (alternative to DSN)
 */
export interface ConnectionParams {
  type: "postgres" | "mysql" | "mariadb" | "sqlserver" | "sqlite";
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  instanceName?: string; // SQL Server named instance support
  sslmode?: "disable" | "require"; // SSL mode for network databases (not applicable to SQLite)
  // SQL Server authentication options
  authentication?: "ntlm" | "azure-active-directory-access-token";
  domain?: string; // Required for NTLM authentication
}

/**
 * Source configuration from [[sources]] array in TOML
 */
export interface SourceConfig extends ConnectionParams, SSHConfig {
  id: string;
  description?: string; // Human-readable description of this data source
  dsn?: string;
  schema?: string; // Default schema (sets search_path for PostgreSQL, filters search_objects)
  connection_timeout?: number; // Connection timeout in seconds
  query_timeout?: number; // Query timeout in seconds (PostgreSQL, MySQL, MariaDB, SQL Server)
  init_script?: string; // Optional SQL script to run on connection (for demo mode or initialization)
  lazy?: boolean; // Defer connection until first query (default: false)
}

/**
 * Built-in tool configuration for execute_sql
 */
export interface ExecuteSqlToolConfig {
  name: "execute_sql"; // Must match BUILTIN_TOOL_EXECUTE_SQL from builtin-tools.ts
  source: string;
  max_rows?: number;
}

/**
 * Built-in tool configuration for search_objects
 */
export interface SearchObjectsToolConfig {
  name: "search_objects"; // Must match BUILTIN_TOOL_SEARCH_OBJECTS from builtin-tools.ts
  source: string;
}

/**
 * Tool configuration (built-in tools only)
 */
export type ToolConfig = ExecuteSqlToolConfig | SearchObjectsToolConfig;

/**
 * Complete TOML configuration file structure
 */
export interface TomlConfig {
  sources: SourceConfig[];
  tools?: ToolConfig[];
}
