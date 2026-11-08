ALTER TABLE local_procurement_expenditures ADD COLUMN settlement_details_json TEXT CHECK (settlement_details_json IS NULL OR json_valid(settlement_details_json));
