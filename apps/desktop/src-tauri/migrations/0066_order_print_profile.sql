ALTER TABLE local_purchase_orders ADD COLUMN print_profile_json TEXT CHECK (print_profile_json IS NULL OR json_valid(print_profile_json));
CREATE TRIGGER order_print_profile_immutable BEFORE UPDATE OF print_profile_json ON local_purchase_orders
WHEN (OLD.print_profile_json IS NOT NULL OR OLD.formally_issued_at IS NOT NULL)
 AND NEW.print_profile_json IS NOT OLD.print_profile_json
BEGIN SELECT RAISE(ABORT, 'Frozen print profile cannot be changed or removed'); END;
