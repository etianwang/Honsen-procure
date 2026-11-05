ALTER TABLE local_purchase_orders ADD COLUMN manual_stamp_duty_minor INTEGER CHECK(manual_stamp_duty_minor IS NULL OR manual_stamp_duty_minor >= 0);
CREATE TRIGGER local_manual_stamp_duty_frozen
BEFORE UPDATE OF manual_stamp_duty_minor ON local_purchase_orders
WHEN OLD.formally_issued_at IS NOT NULL AND NEW.manual_stamp_duty_minor IS NOT OLD.manual_stamp_duty_minor
BEGIN SELECT RAISE(ABORT, 'issued manual stamp duty is immutable'); END;
