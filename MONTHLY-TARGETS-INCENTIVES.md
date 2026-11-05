# Monthly product targets, salary allocation and incentives

Admin: open **Reports & targets → Monthly targets**, select the month, then select an MR under **Product targets & incentives**.

- Set that MR's monthly sales target. Add products with their packing, a sales target in rupees and salary percentage. Product targets must add up to the MR target.
- The optional planned salary budget is a comparison reference, not a fixed wage or an earnings cap. The live preview shows salary at the planned product mix.
- Add any incentive slabs needed for that MR/month. Each threshold must be at or above the target. Only the highest qualifying rate applies, to the entire month's eligible secondary sales.
- Sales must be **strictly greater** than a threshold. With slabs above ₹4 lakh at 1% and above ₹5 lakh at 2%: exactly ₹4 lakh earns no extra incentive; ₹4.5 lakh earns ₹4,500; exactly ₹5 lakh earns ₹5,000; ₹5.5 lakh earns ₹11,000. Product salary allocation is additional and continues on all eligible sales with no cap.
- Products without a salary allocation earn zero product salary, but their eligible sales still count toward overall achievement and additional incentive. Reports identify these sales.
- A new month starts without a plan. Each MR is independent; targets and salary terms are never divided among MRs or automatically carried forward.

## Sales and profit basis

Achievement, salary allocation and incentive use approved secondary sales **excluding GST and after schemes/discounts**, on the order's original date. Direct company and stockist orders count. Pending/cancelled orders are excluded; approved edits recalculate the open month. Free units have no sales value.

Example: product targets of ₹2 lakh at 10% and ₹2 lakh at 12.5% give a salary-at-target preview of ₹45,000. These are product-specific percentages, not percentages of the salary budget.

Admin profit estimates use:
- Direct company: approved order net selling amount.
- Stockist: the monthly plan's PTS snapshot, after the order scheme's percentage discount, multiplied by paid units.
- Landing cost: the plan's unit cost snapshot multiplied by paid + free units.
- Profit after MR allocation: company revenue minus landing cost, product salary allocation and allocated additional incentive.

The incentive is distributed across products in proportion to their eligible sales, with rounding to the paise that preserves the monthly total. This is an internal estimate, not payroll processing or a full accounting profit statement. Other business expenses are excluded. Missing cost/PTS and unmapped legacy sales show incomplete costing rather than a misleading profit.

## Revisions, privacy and month closing

Product cost/PTS snapshots are taken when a product is first included in a month's plan. Catalogue changes do not silently change the calculation. Admin can explicitly refresh these snapshots while revising an open month.

A revision requires a reason. Saving explicitly recalculates the entire open month, including earlier orders. Every complete plan revision is retained in immutable history and the Admin activity log. Concurrent stale edits are rejected. This is a monthly agreement, not a different commission rate for each order date.

Once a product plan exists, use its editor to change the overall target. Simple target saves cannot break the sum of product allocations. Generic record editing/deletion cannot bypass this rule.

Month closing stores the report, including earnings and product targets, and locks the plan. Reopening requires the existing Admin reason workflow. Historical report snapshots remain available and are not changed by later catalogue updates.

MR dashboards and monthly PDF reports show only product targets, achieved sales, achievement percentage and pending target. Salary rates, salary budgets, earnings, internal costs and company profit are Admin-only at the API level as well as in the interface.

## Deployment

Use the normal GitHub pull / VETMECH deployment procedure. No database reset or new environment variables are needed. Plans and immutable revisions use the existing records collection, and are included in the existing full database backup.
