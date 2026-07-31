# Retrieval Pipeline

Strict order:

1. agentmemory (`memory_recall`)
2. codebase-memory-mcp (`search_graph`, `trace_path`, `get_architecture`)
3. Understand-Anything — session start only, once
4. Semantic Search
5. AST (Tree-sitter / AFT)
6. LSP
7. Git history
8. RTK shell
9. Targeted file reads
10. Full file reads

Never cat large files.
Never recursively grep if indexed search exists.
Never duplicate retrieval.

Two consecutive lookups teaching nothing new → stop searching, state what is
missing, work with what you have.
