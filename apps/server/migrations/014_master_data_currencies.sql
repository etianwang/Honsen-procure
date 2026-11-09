-- Align master-data currency checks with the existing shared currency contract.
-- Additive compatibility only: no business row or historical snapshot is rewritten.
ALTER TABLE projects DROP CONSTRAINT projects_default_currency_check;
ALTER TABLE projects ADD CONSTRAINT projects_default_currency_check CHECK (default_currency IN ('XOF','XAF','CNY','USD','EUR','ETB'));
ALTER TABLE project_print_defaults DROP CONSTRAINT project_print_defaults_default_currency_check;
ALTER TABLE project_print_defaults ADD CONSTRAINT project_print_defaults_default_currency_check CHECK (default_currency IN ('XOF','XAF','CNY','USD','EUR','ETB'));
ALTER TABLE exchange_rates DROP CONSTRAINT exchange_rates_from_currency_check;
ALTER TABLE exchange_rates ADD CONSTRAINT exchange_rates_from_currency_check CHECK (from_currency IN ('XOF','XAF','CNY','USD','EUR','ETB'));
ALTER TABLE exchange_rates DROP CONSTRAINT exchange_rates_to_currency_check;
ALTER TABLE exchange_rates ADD CONSTRAINT exchange_rates_to_currency_check CHECK (to_currency IN ('XOF','XAF','CNY','USD','EUR','ETB'));
