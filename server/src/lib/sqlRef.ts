import { getTableName, sql, type Column, type SQL } from "drizzle-orm";

/**
 * A column written with its table name, for correlated subqueries inside `sql`.
 * Drizzle drops the table name in single-table selects, so `${departments.id}` inside
 * `(select count(*) from equipment e where e.department_id = ...)` would become `"id"` and match `e.id`.
 */
export function ref(column: Column): SQL {
  return sql.raw(`"${getTableName(column.table)}"."${column.name}"`);
}
