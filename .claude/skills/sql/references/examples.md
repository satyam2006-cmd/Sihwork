# SQL Query Examples - Few-Shot Learning

This file contains example natural language queries and their corresponding SQL translations. These examples help demonstrate common patterns and best practices.

## Simple Queries

### Example 1: Basic SELECT with Filter
**Natural Language:** "Get all active users"

**SQL:**
```sql
SELECT id, email, name, created_at, status
FROM users
WHERE status = 'active'
ORDER BY created_at DESC
LIMIT 100;
```

**Explanation:** Retrieves active users, ordered by most recent first, with a defensive LIMIT.

---

### Example 2: Date Range Filter
**Natural Language:** "Show me all opinions created in the last 7 days"

**SQL:**
```sql
SELECT id, title, status, created_at, priority
FROM opinions
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

**Explanation:** Uses PostgreSQL's INTERVAL syntax for date arithmetic.

---

## Aggregation Queries

### Example 3: Count with GROUP BY
**Natural Language:** "How many opinions are there for each status?"

**SQL:**
```sql
SELECT
  status,
  COUNT(*) as opinion_count
FROM opinions
GROUP BY status
ORDER BY opinion_count DESC;
```

**Explanation:** Groups by status and counts, ordered by frequency.

---

### Example 4: Average and Group
**Natural Language:** "What's the average file size per opinion?"

**SQL:**
```sql
SELECT
  o.id,
  o.title,
  COUNT(d.id) as document_count,
  COALESCE(AVG(d.file_size), 0) as avg_file_size,
  COALESCE(SUM(d.file_size), 0) as total_file_size
FROM opinions o
LEFT JOIN documents d ON o.id = d.opinion_id
GROUP BY o.id, o.title
HAVING COUNT(d.id) > 0
ORDER BY total_file_size DESC
LIMIT 50;
```

**Explanation:** Uses LEFT JOIN to include opinions without documents, COALESCE for NULL handling, HAVING to filter groups.

---

## JOIN Queries

### Example 5: Simple INNER JOIN
**Natural Language:** "Show all opinions with their user names"

**SQL:**
```sql
SELECT
  o.id,
  o.title,
  o.status,
  o.created_at,
  u.name as user_name,
  u.email as user_email
FROM opinions o
INNER JOIN users u ON o.user_id = u.id
ORDER BY o.created_at DESC
LIMIT 100;
```

**Explanation:** Joins opinions with users to get user details.

---

### Example 6: Multiple JOINs
**Natural Language:** "List all reviews with opinion details and reviewer names"

**SQL:**
```sql
SELECT
  r.id as review_id,
  r.created_at as review_date,
  o.title as opinion_title,
  o.status as opinion_status,
  reviewer.name as reviewer_name,
  requester.name as requester_name
FROM reviews r
INNER JOIN opinions o ON r.opinion_id = o.id
INNER JOIN users reviewer ON r.reviewer_id = reviewer.id
INNER JOIN users requester ON o.user_id = requester.id
ORDER BY r.created_at DESC
LIMIT 50;
```

**Explanation:** Multiple JOINs with table aliases. Note: users table joined twice with different aliases.

---

### Example 7: LEFT JOIN for Optional Data
**Natural Language:** "Show all opinions and their reviews if they have any"

**SQL:**
```sql
SELECT
  o.id,
  o.title,
  o.status,
  o.created_at,
  COUNT(r.id) as review_count,
  MAX(r.created_at) as latest_review_date
FROM opinions o
LEFT JOIN reviews r ON o.id = r.opinion_id
GROUP BY o.id, o.title, o.status, o.created_at
ORDER BY o.created_at DESC
LIMIT 100;
```

**Explanation:** LEFT JOIN ensures all opinions appear even without reviews. Aggregates reviews per opinion.

---

## Complex Queries

### Example 8: Subquery
**Natural Language:** "Find users who have requested more than 5 opinions"

**SQL:**
```sql
SELECT
  u.id,
  u.name,
  u.email,
  COUNT(o.id) as opinion_count
FROM users u
INNER JOIN opinions o ON u.id = o.user_id
GROUP BY u.id, u.name, u.email
HAVING COUNT(o.id) > 5
ORDER BY opinion_count DESC;
```

**Alternative with subquery:**
```sql
SELECT
  u.id,
  u.name,
  u.email,
  (SELECT COUNT(*) FROM opinions WHERE user_id = u.id) as opinion_count
FROM users u
WHERE (SELECT COUNT(*) FROM opinions WHERE user_id = u.id) > 5
ORDER BY opinion_count DESC;
```

**Explanation:** First version uses JOIN + HAVING (more efficient). Second shows subquery pattern.

---

### Example 9: Common Table Expression (CTE)
**Natural Language:** "Show top 10 users by number of opinions with completion stats"

**SQL:**
```sql
WITH user_stats AS (
  SELECT
    user_id,
    COUNT(*) as total_opinions,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_opinions,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_opinions
  FROM opinions
  GROUP BY user_id
)
SELECT
  u.name,
  u.email,
  us.total_opinions,
  us.completed_opinions,
  us.pending_opinions,
  ROUND(100.0 * us.completed_opinions / NULLIF(us.total_opinions, 0), 2) as completion_rate
FROM user_stats us
INNER JOIN users u ON us.user_id = u.id
ORDER BY us.total_opinions DESC
LIMIT 10;
```

**Explanation:** CTE for cleaner complex queries. Uses FILTER for conditional counts, NULLIF to avoid division by zero.

---

### Example 10: Time-based Analysis
**Natural Language:** "Show opinion trends by month for the last 6 months"

**SQL:**
```sql
SELECT
  DATE_TRUNC('month', created_at) as month,
  COUNT(*) as opinion_count,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
  COUNT(*) FILTER (WHERE priority = 'urgent') as urgent_count
FROM opinions
WHERE created_at >= NOW() - INTERVAL '6 months'
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC;
```

**Explanation:** DATE_TRUNC for time bucketing, FILTER for conditional aggregation.

---

## Advanced Patterns

### Example 11: Window Functions
**Natural Language:** "Rank users by number of opinions and show their percentile"

**SQL:**
```sql
SELECT
  u.name,
  u.email,
  COUNT(o.id) as opinion_count,
  RANK() OVER (ORDER BY COUNT(o.id) DESC) as rank,
  PERCENT_RANK() OVER (ORDER BY COUNT(o.id) DESC) as percentile
FROM users u
LEFT JOIN opinions o ON u.id = o.user_id
GROUP BY u.id, u.name, u.email
ORDER BY opinion_count DESC
LIMIT 50;
```

**Explanation:** Window functions for ranking without limiting result set.

---

### Example 12: CASE Statement
**Natural Language:** "Categorize opinions by processing time"

**SQL:**
```sql
SELECT
  id,
  title,
  status,
  created_at,
  completed_at,
  EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600 as hours_to_complete,
  CASE
    WHEN completed_at IS NULL THEN 'Not completed'
    WHEN completed_at - created_at < INTERVAL '24 hours' THEN 'Fast (< 24h)'
    WHEN completed_at - created_at < INTERVAL '72 hours' THEN 'Normal (24-72h)'
    ELSE 'Slow (> 72h)'
  END as processing_speed
FROM opinions
WHERE status = 'completed'
ORDER BY created_at DESC
LIMIT 100;
```

**Explanation:** CASE for conditional logic, EXTRACT for time calculations.

---

## Common Patterns Summary

### Pattern 1: Pagination
```sql
SELECT * FROM table
ORDER BY created_at DESC
LIMIT 20 OFFSET 0;  -- Page 1
```

### Pattern 2: Search
```sql
SELECT * FROM table
WHERE
  LOWER(column) LIKE LOWER('%search_term%')
  OR column_text @@ to_tsquery('search_term');  -- Full-text search
```

### Pattern 3: Existence Check
```sql
-- Prefer EXISTS over IN for better performance
SELECT * FROM users u
WHERE EXISTS (
  SELECT 1 FROM opinions o
  WHERE o.user_id = u.id
  AND o.status = 'pending'
);
```

### Pattern 4: NULL Handling
```sql
SELECT
  COALESCE(column, 'default_value') as column,
  NULLIF(column, '') as column_no_empty,
  column IS NULL as is_null,
  column IS NOT NULL as has_value
FROM table;
```

### Pattern 5: String Operations
```sql
SELECT
  CONCAT(first_name, ' ', last_name) as full_name,
  SUBSTRING(text FROM 1 FOR 100) as preview,
  LENGTH(text) as text_length,
  TRIM(column) as trimmed
FROM table;
```

---

## Performance Tips

1. **Always use LIMIT** for exploratory queries
2. **Use indexed columns** in WHERE clauses
3. **Prefer INNER JOIN** over subqueries when possible
4. **Use EXISTS** instead of IN for large datasets
5. **Add indexes** on foreign keys and frequently filtered columns
6. **Avoid SELECT *** - specify needed columns
7. **Use EXPLAIN ANALYZE** to understand query performance

---

## Security Reminders

1. Never concatenate user input directly into SQL
2. Use parameterized queries for all dynamic values
3. Validate and sanitize all inputs
4. Apply row-level security (RLS) policies in Supabase
5. Use least-privilege principle for database roles
6. Audit sensitive queries (especially DELETE/UPDATE)
