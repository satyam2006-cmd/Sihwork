---
name: sql
description: |
  Convert natural language queries into accurate PostgreSQL/Supabase SQL queries using a multi-stage approach.

  **When to use this skill:**
  - User asks to query, search, retrieve, filter, or analyze database data
  - User mentions "get data", "find records", "show me", "how many", "list all"
  - User asks about database statistics, aggregations, or reports
  - User wants to JOIN data across multiple tables
  - User needs help writing or understanding SQL queries

  **Triggers:**
  - "query the database"
  - "get/fetch/retrieve data from"
  - "find/search for records"
  - "how many/count"
  - "show me all/list"
  - "generate SQL"
  - Natural language questions about data
---

# SQL Query Generator - Multi-Stage Approach

This skill converts natural language into PostgreSQL-compatible SQL queries using a structured, multi-agent inspired approach based on SQL-of-Thought methodology.

## Multi-Stage Process

### Stage 1: Schema Linking
**Objective:** Identify which tables and columns are relevant to the query.

1. Load database schema from `references/schema.json`
2. Analyze the natural language query to extract:
   - Entities mentioned (table names, column names)
   - Relationships implied (joins needed)
   - Filters and conditions
3. Map natural language terms to database schema elements
4. Identify primary and foreign key relationships

### Stage 2: Query Planning
**Objective:** Decompose the query into logical subproblems.

1. Identify query type: SELECT, INSERT, UPDATE, DELETE, aggregation, join, etc.
2. Break down complex queries into steps:
   - What data to retrieve (SELECT clause)
   - Which tables to access (FROM clause)
   - How tables relate (JOIN conditions)
   - What filters to apply (WHERE clause)
   - How to group data (GROUP BY)
   - How to aggregate (COUNT, SUM, AVG, etc.)
   - How to sort (ORDER BY)
   - Result limits (LIMIT, OFFSET)
3. Create a logical execution plan

### Stage 3: SQL Generation
**Objective:** Convert the query plan into syntactically correct SQL.

1. Construct SQL using PostgreSQL syntax
2. Apply best practices:
   - Use explicit column names (avoid SELECT *)
   - Include table aliases for clarity
   - Use appropriate JOIN types (INNER, LEFT, RIGHT)
   - Add proper WHERE conditions
   - Include defensive LIMIT clauses
3. Format SQL for readability

### Stage 4: Validation & Error Correction
**Objective:** Check for errors and fix them.

Use `scripts/validate_sql.py` to:
1. Check syntax errors
2. Verify table and column names exist in schema
3. Validate JOIN conditions
4. Check for common issues:
   - Missing GROUP BY with aggregations
   - Ambiguous column references
   - Type mismatches
   - NULL handling issues
5. Suggest corrections using error taxonomy

### Stage 5: Explanation
**Objective:** Explain the query in human terms.

Provide:
1. Plain English explanation of what the query does
2. Assumptions made about the schema
3. Performance considerations
4. Alternative approaches if applicable

## Best Practices

### Security
- **READ-ONLY by default**: Generate SELECT queries unless explicitly asked for modifications
- **No raw user input**: Use parameterized queries when possible
- **Ask for confirmation**: For INSERT, UPDATE, DELETE operations
- **Validate inputs**: Check for SQL injection patterns

### Performance
- Always include LIMIT clauses for exploratory queries
- Suggest indexes for frequently queried columns
- Prefer EXISTS over IN for large datasets
- Use appropriate JOIN types

### Schema Awareness
- Reference `references/schema.json` for table structures
- Respect foreign key relationships
- Handle NULL values appropriately
- Consider data types in comparisons

## Example Workflow

**Natural Language:** "Show me the top 5 customers who made the most purchases in the last month"

**Stage 1 - Schema Linking:**
- Tables: `customers`, `orders`
- Columns: `customers.name`, `orders.customer_id`, `orders.created_at`
- Relationship: `orders.customer_id` → `customers.id`

**Stage 2 - Query Planning:**
1. JOIN customers and orders tables
2. Filter orders by date (last 30 days)
3. GROUP BY customer
4. COUNT orders per customer
5. ORDER BY count DESC
6. LIMIT 5

**Stage 3 - SQL Generation:**
```sql
SELECT
  c.name,
  COUNT(o.id) as purchase_count
FROM customers c
INNER JOIN orders o ON c.id = o.customer_id
WHERE o.created_at >= NOW() - INTERVAL '30 days'
GROUP BY c.id, c.name
ORDER BY purchase_count DESC
LIMIT 5;
```

**Stage 4 - Validation:**
✓ Syntax correct
✓ Tables exist
✓ JOIN condition valid
✓ GROUP BY includes all non-aggregated SELECT columns

**Stage 5 - Explanation:**
"This query finds the 5 customers with the most orders in the past month by joining the customers and orders tables, filtering for recent orders, counting orders per customer, and sorting by count."

## Schema Management

Update `references/schema.json` with your database structure. The schema should include:
- Table names
- Column names and types
- Primary keys
- Foreign keys
- Indexes
- Sample data (optional, helps with understanding)

## Error Taxonomy

Common errors and fixes:
1. **Schema mismatch**: Column doesn't exist → Check schema.json for correct name
2. **Missing JOIN**: Multiple tables without JOIN → Add JOIN condition
3. **Ambiguous column**: Column exists in multiple tables → Add table alias
4. **Type mismatch**: Comparing incompatible types → Cast or convert
5. **GROUP BY error**: Non-aggregated column not in GROUP BY → Add to GROUP BY
6. **NULL handling**: Not accounting for NULLs → Use COALESCE or IS NULL checks

## Progressive Context Loading

1. **Initial load**: This SKILL.md file (~2-3k tokens)
2. **Schema load**: `references/schema.json` only when needed
3. **Examples load**: `references/examples.md` for complex queries
4. **Script execution**: Run validation without loading full script content

## Resources

- `references/schema.json` - Database schema definition
- `references/examples.md` - Few-shot examples for common patterns
- `scripts/validate_sql.py` - SQL validation and error checking
- `scripts/schema_loader.py` - Load and parse schema information
