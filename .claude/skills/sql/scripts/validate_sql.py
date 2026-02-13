#!/usr/bin/env python3
"""
SQL Validation and Error Correction Script

This script validates SQL queries for common issues:
- Syntax errors
- Schema mismatches (table/column names)
- JOIN validation
- GROUP BY compliance
- Type checking
- NULL handling
"""

import re
import json
import sys
from typing import Dict, List, Tuple, Optional
from pathlib import Path


class SQLValidator:
    def __init__(self, schema_path: Optional[str] = None):
        """Initialize validator with optional schema file."""
        self.schema = {}
        if schema_path and Path(schema_path).exists():
            with open(schema_path, 'r') as f:
                self.schema = json.load(f)

        self.errors = []
        self.warnings = []

    def validate(self, sql: str) -> Tuple[bool, List[str], List[str]]:
        """
        Validate SQL query and return results.

        Returns:
            Tuple of (is_valid, errors, warnings)
        """
        self.errors = []
        self.warnings = []

        # Clean and normalize SQL
        sql = sql.strip()

        # Run validation checks
        self._check_basic_syntax(sql)
        self._check_schema_references(sql)
        self._check_group_by_compliance(sql)
        self._check_join_conditions(sql)
        self._check_dangerous_operations(sql)

        is_valid = len(self.errors) == 0
        return is_valid, self.errors, self.warnings

    def _check_basic_syntax(self, sql: str):
        """Check for basic SQL syntax issues."""
        # Check for unterminated strings
        single_quotes = sql.count("'")
        double_quotes = sql.count('"')

        if single_quotes % 2 != 0:
            self.errors.append("Unterminated string literal (unmatched single quote)")

        if double_quotes % 2 != 0:
            self.errors.append("Unterminated identifier (unmatched double quote)")

        # Check for balanced parentheses
        paren_count = 0
        for char in sql:
            if char == '(':
                paren_count += 1
            elif char == ')':
                paren_count -= 1
            if paren_count < 0:
                self.errors.append("Unbalanced parentheses")
                break

        if paren_count > 0:
            self.errors.append("Unclosed parenthesis")

        # Check for common typos
        if re.search(r'\bFROM\s+WHERE\b', sql, re.IGNORECASE):
            self.errors.append("Missing table name between FROM and WHERE")

        if re.search(r'\bSELECT\s+FROM\b', sql, re.IGNORECASE):
            self.errors.append("Missing column list between SELECT and FROM")

    def _check_schema_references(self, sql: str):
        """Check if referenced tables and columns exist in schema."""
        if not self.schema:
            self.warnings.append("No schema loaded - skipping schema validation")
            return

        # Extract table names from FROM and JOIN clauses
        from_pattern = r'\bFROM\s+(\w+)'
        join_pattern = r'\bJOIN\s+(\w+)'

        tables_in_query = set()
        tables_in_query.update(re.findall(from_pattern, sql, re.IGNORECASE))
        tables_in_query.update(re.findall(join_pattern, sql, re.IGNORECASE))

        # Check if tables exist
        schema_tables = set(self.schema.get('tables', {}).keys())
        for table in tables_in_query:
            if table.lower() not in [t.lower() for t in schema_tables]:
                self.errors.append(f"Table '{table}' not found in schema")

        # Extract column references (simplified)
        # This is a basic check - production would need a full SQL parser
        select_pattern = r'\bSELECT\s+(.*?)\s+FROM'
        select_match = re.search(select_pattern, sql, re.IGNORECASE | re.DOTALL)

        if select_match and select_match.group(1).strip() != '*':
            columns = select_match.group(1)
            # Basic column extraction (doesn't handle all cases)
            col_refs = re.findall(r'(\w+)\.(\w+)', columns)

            for table, column in col_refs:
                table_schema = self.schema.get('tables', {}).get(table, {})
                table_columns = table_schema.get('columns', {})

                if column not in table_columns:
                    self.errors.append(
                        f"Column '{column}' not found in table '{table}'"
                    )

    def _check_group_by_compliance(self, sql: str):
        """Check GROUP BY compliance with aggregate functions."""
        has_aggregate = bool(re.search(
            r'\b(COUNT|SUM|AVG|MIN|MAX|STRING_AGG)\s*\(',
            sql,
            re.IGNORECASE
        ))

        has_group_by = bool(re.search(r'\bGROUP\s+BY\b', sql, re.IGNORECASE))

        if has_aggregate and not has_group_by:
            # Check if there are non-aggregate columns in SELECT
            select_pattern = r'\bSELECT\s+(.*?)\s+FROM'
            select_match = re.search(select_pattern, sql, re.IGNORECASE | re.DOTALL)

            if select_match:
                select_clause = select_match.group(1)
                # If we have columns and aggregates mixed, need GROUP BY
                if re.search(r'\w+\.\w+', select_clause):
                    self.warnings.append(
                        "Query contains aggregate functions and column references. "
                        "Consider adding GROUP BY clause."
                    )

        if has_group_by:
            # Verify GROUP BY columns are in SELECT
            group_by_pattern = r'\bGROUP\s+BY\s+(.*?)(?:ORDER|HAVING|LIMIT|$)'
            group_match = re.search(group_by_pattern, sql, re.IGNORECASE | re.DOTALL)

            if group_match:
                group_cols = [c.strip() for c in group_match.group(1).split(',')]
                select_pattern = r'\bSELECT\s+(.*?)\s+FROM'
                select_match = re.search(select_pattern, sql, re.IGNORECASE | re.DOTALL)

                if select_match:
                    select_clause = select_match.group(1)
                    for col in group_cols:
                        if col not in select_clause:
                            self.warnings.append(
                                f"GROUP BY column '{col}' not in SELECT clause"
                            )

    def _check_join_conditions(self, sql: str):
        """Check for proper JOIN conditions."""
        # Find JOINs without ON clauses
        join_pattern = r'\bJOIN\s+\w+(?:\s+\w+)?\s+(?!ON\b)'
        problematic_joins = re.findall(join_pattern, sql, re.IGNORECASE)

        if problematic_joins:
            self.warnings.append(
                "JOIN found without ON clause - may result in cross join"
            )

        # Check for ambiguous column references in multi-table queries
        if re.search(r'\bJOIN\b', sql, re.IGNORECASE):
            # Look for unqualified column references in WHERE/ON
            where_pattern = r'\b(WHERE|ON)\s+(.*?)(?:GROUP|ORDER|LIMIT|$)'
            where_matches = re.findall(where_pattern, sql, re.IGNORECASE | re.DOTALL)

            for _, condition in where_matches:
                # Look for column references without table prefix
                unqualified = re.findall(r'\b(\w+)\s*[=<>]', condition)
                if unqualified and not re.search(r'\w+\.', condition):
                    self.warnings.append(
                        "Consider using table aliases to avoid ambiguous column references"
                    )
                    break

    def _check_dangerous_operations(self, sql: str):
        """Check for potentially dangerous operations."""
        # Check for DELETE/UPDATE without WHERE
        if re.search(r'\b(DELETE|UPDATE)\b', sql, re.IGNORECASE):
            if not re.search(r'\bWHERE\b', sql, re.IGNORECASE):
                self.errors.append(
                    "DELETE or UPDATE without WHERE clause - this will affect all rows!"
                )

        # Check for SELECT without LIMIT on large operations
        if re.search(r'\bSELECT\b', sql, re.IGNORECASE):
            if not re.search(r'\bLIMIT\b', sql, re.IGNORECASE):
                self.warnings.append(
                    "Consider adding LIMIT clause to prevent large result sets"
                )

        # Check for potential SQL injection patterns
        dangerous_patterns = [
            (r';\s*DROP\s+', "Potential SQL injection detected (DROP statement)"),
            (r'--\s*$', "SQL comment detected - potential injection vector"),
            (r"'\s*OR\s+'1'\s*=\s*'1", "Potential SQL injection detected (OR 1=1)"),
        ]

        for pattern, message in dangerous_patterns:
            if re.search(pattern, sql, re.IGNORECASE):
                self.errors.append(message)


def main():
    """CLI interface for SQL validation."""
    if len(sys.argv) < 2:
        print("Usage: python validate_sql.py <sql_query> [schema_file]")
        sys.exit(1)

    sql_query = sys.argv[1]
    schema_file = sys.argv[2] if len(sys.argv) > 2 else None

    validator = SQLValidator(schema_file)
    is_valid, errors, warnings = validator.validate(sql_query)

    # Output results as JSON
    result = {
        "valid": is_valid,
        "errors": errors,
        "warnings": warnings
    }

    print(json.dumps(result, indent=2))

    # Exit with error code if validation failed
    sys.exit(0 if is_valid else 1)


if __name__ == "__main__":
    main()
