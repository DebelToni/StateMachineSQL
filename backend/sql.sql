psql -U antonhristov -d postgres -f db/schema/01_tables.sql
psql -U antonhristov -d postgres -f db/schema/02_indexes.sql
psql -U antonhristov -d postgres -f db/schema/03_views.sql
psql -U antonhristov -d postgres -f db/data/initial_data.sql
