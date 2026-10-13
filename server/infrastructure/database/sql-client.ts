export interface SqlClient {
  query<Row>(statement: string, parameters?: unknown[]): Promise<Row[]>
}
