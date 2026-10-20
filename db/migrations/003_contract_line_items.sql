-- Which line items of its bid notice each award covers, as published in
-- "Line Item No" (legacy series only; the 2.0 files have no line number, so
-- the array stays empty there).
--
-- Some notices carry several award notices from one awardee for the same line
-- item. Adding them up overstates the awarded total, so ml/ needs to see when
-- that happens.
ALTER TABLE contracts ADD COLUMN line_items TEXT[] NOT NULL DEFAULT '{}';
