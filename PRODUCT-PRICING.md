# Product pricing and scheme net rates

## Admin setup

Open **Products & pricing → Add / Edit product**. Enter the GST-inclusive MRP,
GST percentage, retail margin and stockist margin. The calculator saves PTR and
PTS excluding GST and displays both rates with and without GST.

- Net MRP = MRP ÷ (1 + GST / 100)
- PTR = Net MRP × (1 − retail margin / 100)
- PTS = Net MRP × (1 − retail margin / 100) × (1 − stockist margin / 100)

Both margins are deductions. PTS uses the unrounded calculation; the two standard
rates are rounded to paise when saved. GST percentages are supplied by Admin.

Enter **Landing cost / unit · excl. GST** for one packed saleable unit. This is a
separate field from sample-allocation cost. Landing cost is removed from MR API
responses and exports. Profit is calculated for Admin only and is not sent in
orders or customer messages.

Existing catalogue products retain their saved rates until Admin enters both
margins. Enabling the MRP calculator makes the calculated PTR the order base,
replacing any legacy retail-offer-rate override. A reason is required when editing
product pricing. Existing orders keep their saved base price, GST and selected
scheme terms unless Admin approves repricing.

## Schemes

Each product supports up to 20 alternatives: **Buy + free** (10 + 3, for example)
or **Discount** (5%, for example). Select one scheme or No scheme on an order.
The scheme preview shows net PTR and PTS with and without GST, alongside profit
per supplied unit and profit percentage on landing cost.

For 10 + 3, net rate = 10 billed units × unit rate ÷ 13 supplied units.
Cost applies to all 13 units, including the free units.

- Profit / unit = effective PTS excluding GST − landing cost / unit
- Profit % on cost = profit / unit ÷ landing cost / unit × 100

Missing cost shows unavailable profit. Zero cost shows unavailable percentage.
Negative profit appears as a loss. These are product-cost calculations before
other business expenses.

Example: MRP ₹105, GST 5%, retail margin 20%, stockist margin 10% gives PTR ₹80
excluding GST (₹84 including GST) and PTS ₹72 excluding GST (₹75.60 including GST).
At 10 + 3 and landing cost ₹40, effective PTS is ₹55.38 excluding GST / ₹58.15
including GST. Profit is ₹15.38 per supplied unit, or 38.46% on cost.

## MR order display

Product, scheme and quantity selections immediately update net rates. Free units
are earned per complete buy group: 11 paid units on 10 + 3 supply 14 units, not
14.3. Effective order rates use the actual billed totals divided by actual supplied
units. Percentage discounts round the paid-unit rate to paise; GST rounds on the
line total. The effective unit rate is displayed to two decimals and is not used
to recalculate the invoice total.

The selected **Scheme net / unit** is always shown, even when the entered quantity
is below the scheme's buy quantity. When the current order earns a different net
rate, a separate **Current quantity** card shows that actual rate. For PTR ₹864
and GST 0%, the scheme reference is ₹720.00 for 5 + 1, ₹691.20 for 20 + 5 and ₹682.11
for 30 + 8. An order of 10 paid units earns two free units under 5 + 1, but none
under 20 + 5 or 30 + 8. The quantity note explains this; **Use 20 paid units** (or
the relevant next complete group) changes the quantity only when the MR clicks it.
No fractional free units or automatic quantity changes are introduced.

Direct-company proposed rates are excluding GST and before any selected
percentage discount. Departures from approved pricing still require Admin
approval. Approval previews and order edits use the same calculation as the order
form. No scheme-specific net rate overwrites the standard catalogue PTR or PTS.

Blue identifies PTR, purple identifies PTS, teal identifies GST-inclusive rates,
green identifies profit and red identifies loss. Text labels accompany colours.

## MR custom scheme requests

Choose **Other / Custom scheme** while taking an order. Enter the paid and free
quantities per group, such as 10 + 4, and add the reason in the order notes.
The entered order quantity still determines the number of complete groups earned.
The preview displays the proposed net rate excluding and including GST.

This applies to stockist and direct company orders. Admin first reviews the
scheme in **Approvals → Scheme & pricing requests**. Until approval, the request
does not create an order invoice or reserve stock. Rejection records a reason
visible to the MR; the MR can place a new request with revised terms.

**Approve custom scheme** saves the reviewed prices and quantities and creates
an order awaiting separate approval. It does not forward anything to a stockist.
Admin must then approve the order to forward it, or approve the company order
before completing company supply. A special company rate can be requested with
the custom scheme in the same review. Catalogue schemes and prices are unchanged.

Custom changes to an existing open order also require review. Pending custom
changes block order approval and completion. Approval
of the change returns the order to the separate order-approval step. Existing
prices and GST remain fixed unless repricing is explicitly approved. Completed
orders cannot receive a new custom scheme; use a new order for a new offer.
Month locks, MR access rules and the original order-month restriction still apply.

## Primary sales: retail schemes and stockist bulk offers

After selecting a product on a primary invoice, **Retail schemes for MR** loads
the schemes from Product Pricing. Select one or several, select all, or choose
no retail scheme. Both buy/free and percentage alternatives are supported.
The server saves the selected scheme labels on that invoice; existing labels
stay unchanged during quantity edits even if the catalogue later changes.
Older manually entered references remain until Admin explicitly replaces them.

The **Stockist bulk offer** and **Stockist discount %** are separate Admin-only
references. For example, a stockist can receive 100 paid + 20 free packed units
while the retail selling scheme remains 10 + 3. Enter case supplies as the actual
number of individual packed units. Stock added is exactly paid + free quantity;
selecting retail schemes never creates extra stock. The invoice value remains
the manually entered total excluding GST.

MRs see retail references, available stock and the stockist invoice total.
Internal bulk-offer notes and stockist discounts are excluded from MR API data,
screens and monthly reports, including older archived report columns. All current
product retail schemes remain selectable when placing an MR order; primary
invoice references do not replace the selected order scheme or its calculation.

## CSV and deployment

Product export and the import template include GST, both margins, landing cost
and both GST-inclusive rates. Use `10+3; 5%` to import scheme alternatives.
Derived PTR/PTS recalculate from the margins; imported inclusive-rate columns are
informational. Original six-column CSV files remain supported. Missing new columns
preserve existing pricing metadata. A blank offer list removes all schemes.

Deploy with the existing `/usr/local/sbin/vetmech-deploy` command after GitHub checks
pass. These fields use existing product and invoice JSON; no database migration,
new environment variable or Nginx change is required.

Automated checks cover calculator boundaries, exact half-paise rounding, free-unit
and percentage schemes, profit/loss, CSV compatibility, MR cost privacy, server-side
recalculation, direct proposals, saved-order price preservation and UI input changes.

## Company profit by supply source

Admin catalogue pricing and each scheme show separate direct (PTR reference) and stockist (PTS) profit per supplied unit. Order entry and saved secondary-order details show an Admin-only company profit estimate.

- Direct: actual order subtotal excluding GST minus landing cost for paid + free units. No stockist margin is deducted. Proposed special prices are subject to approval; saved orders use their saved subtotal.
- Stockist: current PTS after the selected percentage discount × paid quantity, minus landing cost for paid + free units. Buy/free schemes use actual supplied quantities, including incomplete groups.
- Profit percentage is profit divided by total landing cost; zero cost has no percentage. Missing cost/PTS is unavailable, never silently treated as zero.
- Estimates use current catalogue landing cost and (for stockists) PTS, clearly labelled in the UI. They are not historical accounting snapshots or actual agency-invoice profit; manual primary invoice values are unchanged. Closed reports, sales/target values and customer prices are unchanged. MR responses do not receive landing cost or these profit breakdowns.
