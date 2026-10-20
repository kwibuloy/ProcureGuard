-- Sum of the published "Item Budget" of the line items an award covers.
-- NULL when any of them is missing or not a positive amount (the files use
-- placeholders such as -1), and for the 2.0 series, which has no line number.
--
-- ml/ compares a notice awarded on only some of its line items with the budget
-- of those lines rather than the whole approved budget.
ALTER TABLE contracts ADD COLUMN item_budget NUMERIC(18, 2);
