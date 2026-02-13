#!/usr/bin/env python3
"""
Schema Loader and Analyzer

This script loads database schema information and provides utilities for:
- Parsing schema.json
- Finding relevant tables and columns
- Identifying relationships
- Suggesting JOINs based on foreign keys
"""

import json
import sys
from typing import Dict, List, Set, Tuple, Optional
from pathlib import Path


class SchemaLoader:
    def __init__(self, schema_path: str):
        """Initialize schema loader with path to schema.json."""
        self.schema_path = Path(schema_path)
        self.schema = self._load_schema()

    def _load_schema(self) -> Dict:
        """Load schema from JSON file."""
        if not self.schema_path.exists():
            raise FileNotFoundError(f"Schema file not found: {self.schema_path}")

        with open(self.schema_path, 'r') as f:
            return json.load(f)

    def get_tables(self) -> List[str]:
        """Get list of all table names."""
        return list(self.schema.get('tables', {}).keys())

    def get_columns(self, table: str) -> Dict:
        """Get columns for a specific table."""
        return self.schema.get('tables', {}).get(table, {}).get('columns', {})

    def get_primary_key(self, table: str) -> Optional[str]:
        """Get primary key column for a table."""
        table_info = self.schema.get('tables', {}).get(table, {})
        return table_info.get('primary_key')

    def get_foreign_keys(self, table: str) -> Dict[str, str]:
        """
        Get foreign key relationships for a table.

        Returns:
            Dict mapping {column_name: referenced_table.referenced_column}
        """
        table_info = self.schema.get('tables', {}).get(table, {})
        return table_info.get('foreign_keys', {})

    def find_relevant_tables(self, keywords: List[str]) -> List[str]:
        """
        Find tables relevant to given keywords.

        Args:
            keywords: List of search terms

        Returns:
            List of table names that match keywords
        """
        relevant = set()
        keywords_lower = [k.lower() for k in keywords]

        for table_name, table_info in self.schema.get('tables', {}).items():
            # Check table name
            if any(kw in table_name.lower() for kw in keywords_lower):
                relevant.add(table_name)
                continue

            # Check column names
            columns = table_info.get('columns', {})
            for col_name in columns.keys():
                if any(kw in col_name.lower() for kw in keywords_lower):
                    relevant.add(table_name)
                    break

            # Check table description if available
            description = table_info.get('description', '')
            if any(kw in description.lower() for kw in keywords_lower):
                relevant.add(table_name)

        return sorted(list(relevant))

    def find_join_path(self, table1: str, table2: str) -> Optional[List[Dict]]:
        """
        Find how to JOIN two tables.

        Args:
            table1: First table name
            table2: Second table name

        Returns:
            List of JOIN conditions, or None if no path found
        """
        # Direct foreign key relationship
        fk1 = self.get_foreign_keys(table1)
        fk2 = self.get_foreign_keys(table2)

        # Check if table1 has FK to table2
        for col, ref in fk1.items():
            if ref.startswith(f"{table2}."):
                ref_col = ref.split('.')[1]
                return [{
                    'type': 'INNER JOIN',
                    'left_table': table1,
                    'right_table': table2,
                    'condition': f"{table1}.{col} = {table2}.{ref_col}"
                }]

        # Check if table2 has FK to table1
        for col, ref in fk2.items():
            if ref.startswith(f"{table1}."):
                ref_col = ref.split('.')[1]
                return [{
                    'type': 'INNER JOIN',
                    'left_table': table2,
                    'right_table': table1,
                    'condition': f"{table2}.{col} = {table1}.{ref_col}"
                }]

        # Could implement multi-hop JOIN path finding here
        # For now, return None if no direct relationship
        return None

    def suggest_columns(self, table: str, context: List[str]) -> List[str]:
        """
        Suggest relevant columns based on context keywords.

        Args:
            table: Table name
            context: List of keywords describing what user wants

        Returns:
            List of suggested column names
        """
        columns = self.get_columns(table)
        context_lower = [c.lower() for c in context]

        suggested = []
        for col_name, col_info in columns.items():
            # Match column name
            if any(kw in col_name.lower() for kw in context_lower):
                suggested.append(col_name)
                continue

            # Match column type for specific requests
            col_type = col_info.get('type', '').lower()
            if 'date' in context_lower and 'timestamp' in col_type:
                suggested.append(col_name)
            elif 'time' in context_lower and 'timestamp' in col_type:
                suggested.append(col_name)
            elif 'text' in context_lower and 'varchar' in col_type:
                suggested.append(col_name)

        return suggested

    def get_table_info(self, table: str) -> str:
        """
        Get human-readable information about a table.

        Returns:
            Formatted string with table details
        """
        if table not in self.schema.get('tables', {}):
            return f"Table '{table}' not found in schema"

        table_info = self.schema['tables'][table]
        lines = [f"Table: {table}"]

        if 'description' in table_info:
            lines.append(f"Description: {table_info['description']}")

        lines.append("\nColumns:")
        for col_name, col_info in table_info.get('columns', {}).items():
            col_type = col_info.get('type', 'unknown')
            nullable = 'NULL' if col_info.get('nullable', True) else 'NOT NULL'
            lines.append(f"  - {col_name}: {col_type} {nullable}")

        if 'primary_key' in table_info:
            lines.append(f"\nPrimary Key: {table_info['primary_key']}")

        if 'foreign_keys' in table_info:
            lines.append("\nForeign Keys:")
            for col, ref in table_info['foreign_keys'].items():
                lines.append(f"  - {col} → {ref}")

        return "\n".join(lines)

    def export_schema_summary(self) -> str:
        """Export a concise schema summary for context loading."""
        lines = ["Database Schema Summary\n"]

        for table_name in sorted(self.get_tables()):
            table_info = self.schema['tables'][table_name]
            columns = table_info.get('columns', {})
            pk = table_info.get('primary_key', '')
            fks = table_info.get('foreign_keys', {})

            lines.append(f"{table_name}:")
            lines.append(f"  PK: {pk}")

            if fks:
                lines.append(f"  FKs: {', '.join([f'{k}→{v}' for k, v in fks.items()])}")

            col_list = ', '.join(columns.keys())
            lines.append(f"  Columns: {col_list}\n")

        return "\n".join(lines)


def main():
    """CLI interface for schema operations."""
    if len(sys.argv) < 2:
        print("Usage: python schema_loader.py <schema_file> [command] [args...]")
        print("\nCommands:")
        print("  tables                    - List all tables")
        print("  columns <table>          - List columns for table")
        print("  info <table>             - Get detailed table info")
        print("  find <keyword>           - Find tables matching keyword")
        print("  join <table1> <table2>   - Suggest JOIN between tables")
        print("  summary                  - Export schema summary")
        sys.exit(1)

    schema_file = sys.argv[1]
    loader = SchemaLoader(schema_file)

    if len(sys.argv) == 2:
        # Default: show summary
        print(loader.export_schema_summary())
        return

    command = sys.argv[2]

    if command == "tables":
        print(json.dumps(loader.get_tables(), indent=2))

    elif command == "columns" and len(sys.argv) > 3:
        table = sys.argv[3]
        print(json.dumps(loader.get_columns(table), indent=2))

    elif command == "info" and len(sys.argv) > 3:
        table = sys.argv[3]
        print(loader.get_table_info(table))

    elif command == "find" and len(sys.argv) > 3:
        keywords = sys.argv[3:]
        tables = loader.find_relevant_tables(keywords)
        print(json.dumps(tables, indent=2))

    elif command == "join" and len(sys.argv) > 4:
        table1 = sys.argv[3]
        table2 = sys.argv[4]
        path = loader.find_join_path(table1, table2)
        print(json.dumps(path, indent=2))

    elif command == "summary":
        print(loader.export_schema_summary())

    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == "__main__":
    main()
