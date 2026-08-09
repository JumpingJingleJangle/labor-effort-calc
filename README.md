# Labor-Effort Calculator

A lightweight, offline-capable Progressive Web Application (PWA) that measures the **real purchasing power of labor (work hours)** over time. By comparing price inflation (CPI) directly against wage distributions (Census, SSA, EPI, FRED) and factoring in higher education costs (tuition amortization & student loan inflation discounting), the application calculates how many hours of work are actually required to buy goods across different income percentiles.

---

## Key Features

* **Multi-Index Inflation Baselines**: Supports **CPI-U** (Consumer Price Index for All Urban Consumers), **Chained CPI-U** (chained index accounting for consumer substitution), **CPI-W** (Urban Wage Earners & Clerical Workers), and **Core CPI** (excluding food & energy).
* **Labor-Effort & Wage Distributions**: Evaluates purchasing power changes across individual median earnings, household income quintiles (20th, 40th, 60th, 80th, 95th percentiles), EPI hourly wages, Census ASEC percentiles, and SSA W-2 earnings.
* **Higher Education Cost Adjustments**: Accounts for both foregone working years (opportunity cost) and tuition capital costs (after expected scholarships and grant aid), amortized across expected career working years and weighted by historical college graduation attainment rates.
* **Student Loan Real Debt Discounting**: Calculates the inflation erosion of fixed-rate student debt over 10-year (or custom) repayment terms, dynamically categorizing inflation rates as `historic` or `projected` (using a post-1983 historical average baseline of **2.88%** for future years).

---

## Local Development & Testing

### Running Locally
To launch the app locally using Python's built-in HTTP server:
```bash
cd labor-effort-calc
python3 -m http.server 8000
```
Open `http://localhost:8000` in your web browser. Service Worker registration is automatically bypassed on `localhost` so any code edits update instantly upon refresh!

### Running Unit Tests
The repository includes an offline Node.js math testing runner:
```bash
node tests/app.test.js
```
*(Or navigate to `tests/` and run `node app.test.js`)*

---

## Data Methodology

### 1. Data Sources & Worker Type Compositions

Wages and earnings are sourced from national statistical databases. Because each dataset is compiled differently, it is critical to understand their underlying **worker type compositions** when interpreting purchasing power trends.

| Dataset Name | Source | Historical Range | Worker Type Composition | Key Characteristics |
| :--- | :--- | :--- | :--- | :--- |
| **SSA Net Compensation** | U.S. Social Security Administration (SSA) | 1991–2023 | **Combined W-2 Earners** | **Pure W-2 Labor Earnings**: Taxable W-2 compensation percentiles (20th to 80th) from official IRS tax records. Excludes non-labor cash inflows. *(Derived via linear CDF interpolation across binned tax brackets).* |
| **Census Individual Income (Full-Time, Year-Round)** | U.S. Census Bureau (CPS ASEC Table P-38) | 1967–2024 | **Full-Time, Year-Round Only** | **Active Career Earners**: Median annual earnings for individuals working 35+ hours/week for 50–52 weeks/year. Isolates stable full-time labor income. Excludes non-labor cash inflows. *(Direct published medians).* |
| **Census Individual Income (All Workers)** | U.S. Census Bureau (CPS ASEC Table P-54) | 1967–2024 | **All Earners (15+)** | **Total Individual Money Income**: Combines pre-tax wages plus non-labor cash inflows (Social Security, pensions, disability, unemployment, welfare, interest) for a single individual. Includes part-time, seasonal, and non-working individuals. *(Derived via linear CDF interpolation across binned income brackets).* |
| **Individual Median Income (Legacy FRED)** | Federal Reserve Bank of St. Louis (FRED `MEPAINUSA646N`) | 1974–2024 | **Individual Earners** | **Legacy Individual Median**: Represents the legacy FRED median individual income baseline. |
| **Census Household Income** | U.S. Census Bureau (CPS ASEC Table H-1) | 1967–2024 | **All Residential Households** | **Total Household Money Income**: Combines pre-tax wages plus non-labor cash inflows (Social Security, pensions, disability, unemployment, welfare, interest) aggregated across all resident members of the household unit. Includes retired, unemployed, and non-working household units. *(Direct published quintile limits).* |
| **EPI Hourly Wages** | Economic Policy Institute (EPI) State of Working America | 1973–2025 | **Active Hourly Earners** | **Pure Hourly Labor Rate**: Measures wage rates per hour (deciles 10th to 90th) extracted from BLS CPS microdata. Unaffected by hours-worked variations. Excludes non-labor cash inflows. *(Direct published deciles).* |

#### Percentile Derivation: Direct Published Values vs. Linear Interpolation
* **Direct Published Percentiles**: EPI Hourly Wages, Census Full-Time (P-38), Census Household Income (H-1), and FRED Individual Median are published directly by source agencies as exact percentile dollar thresholds.
* **Linear Interpolation**: SSA Net Compensation and Census Individual All Workers (P-54) are published as grouped frequency tables (counts of workers falling within income ranges). To extract estimated 20th, 40th, 50th, 60th, and 80th percentile values, we applied linear interpolation across the Cumulative Distribution Function of the bounding bracket intervals.

#### Important Definition: "Money Income" vs. "Pure Labor Wages"
When interpreting purchasing power across these series, note the distinction between **Total Money Income** (Census H-1 and P-54) and **Pure Labor Compensation** (SSA W-2, Census P-38, and EPI):
* **Census Money Income (Household H-1 & Individual P-54)**: Measures **Total Pre-Tax Money Income**. Includes wages/salaries plus regular non-labor cash inflows (Social Security, private & public pensions, disability benefits/SSI, unemployment compensation, welfare/public assistance, child support, interest, and dividends). Includes retired, unemployed, and non-working units. *(Excludes non-cash benefits like SNAP/food stamps, Medicaid/Medicare, and capital gains).*
* **Pure Labor Compensation (SSA W-2, Census P-38, & EPI Hourly)**: Measures **only active labor market compensation** (wages, salaries, and net self-employment earnings) and excludes non-labor cash inflows (retirement, entitlement, or transfer payment inflows).

---

### 2. Labor-Effort & Net Real Earnings Math

Standard price calculators track how many dollars are needed to buy a basket of goods over time. To measure real purchasing power from the perspective of a worker, we evaluate **labor-effort (work hours)**:
* If an item costs $100 and a worker earns $10/hour, purchasing it requires **10 hours of work**.
* If later the item costs $200 but the worker's wage rises to $40/hour, purchasing it requires **5 hours of work**.
* Even though nominal price doubled (+100%), the labor-effort required was cut in half (-50%).

To convert a base dollar amount in Base Year $X$ to its labor-effort equivalent in Target Year $Y$:

$$\text{Target Value} = \text{Base Amount} \times \frac{\text{CPI}_Y}{\text{CPI}_X} \times \frac{\text{Wage}_X}{\text{Wage}_Y}$$

#### 2,080-Hour Annual Conversion Baseline
We assume a standard full-time baseline of **2,080 working hours per year** (40 hours/week $\times$ 52 weeks) to convert between annual earnings and hourly rates:
* **Hourly to Annual**: $W_{\text{Annual}} = W_{\text{Hourly}} \times 2080$
* **Annual to Hourly**: $W_{\text{Hourly}} = \frac{W_{\text{Annual}}}{2080}$

---

### 3. Higher Education Cost Adjustments ("Net Wage Formula")

To calculate the population-wide net wage impact of the economic cost of college for a given percentile/benchmark, we divide the workforce into two cohorts for each year: those with a college degree (proportion $P_X$, representing the percent of adults 25+ in Year $X$ with a college degree) and those without (proportion $1 - P_X$).

> **Simplifying Assumption**: We treat this college graduate cohort split ($P_X$) as uniform across all income percentiles. In reality, college graduation rates are higher at upper income percentiles than at lower percentiles. This assumption results in over-estimating the cost of college on the lowest income tiers and under-estimating the impact on the highest income tiers.

#### A. Individual College Graduate Cohort
The net adjusted wage for an individual in the college graduate cohort ($\text{Wage}_{\text{Grad Cohort}, X}$) accounts for both foregone earning years $Y_{\text{lost}}$ (default = **4 years**) out of an expected lifetime working career $W$ (default = **44 total working years**), as well as direct capital tuition expenses $C_{\text{Nominal}, X}$ (sourced from NCES & College Board averages for tuition and fees after expected scholarships and grant aid) amortized over the graduate's remaining career years ($W - Y_{\text{lost}}$):

$$\text{Wage}_{\text{Grad Cohort}, X} = \text{Wage}_X \times \left(1 - \frac{Y_{\text{lost}}}{W}\right) - \frac{C_{\text{Nominal}, X}}{W - Y_{\text{lost}}}$$

> **Exclusion of Room & Board**: Capital cost $C_{\text{Nominal}, X}$ intentionally excludes room and board expenses because housing and food are universal living expenses incurred by all workers regardless of college attendance. Including room and board would artificially inflate lifetime college student expenses beyond the actual incremental cost increase unique to higher education.

#### B. Population-Weighted Sum
The final population-weighted net wage ($\text{Wage}_{\text{Nominal Adjusted}, X}$) blends both cohorts by multiplying the graduate cohort wage by historical attainment rate $P_X$ and the non-college baseline wage $\text{Wage}_X$ by $(1 - P_X)$:

$$\text{Wage}_{\text{Nominal Adjusted}, X} = P_X \times \text{Wage}_{\text{Grad Cohort}, X} + (1 - P_X) \times \text{Wage}_X$$

#### C. Simplified Single-Line Equation (Execution Form)
Substituting the graduate cohort formula into the weighted sum yields the equation executed by the calculator engine:

$$\text{Wage}_{\text{Nominal Adjusted}, X} = \text{Wage}_X \times \left(1 - P_X \times \frac{Y_{\text{lost}}}{W}\right) - P_X \times \frac{C_{\text{Nominal}, X}}{W - Y_{\text{lost}}}$$

---

### 4. Student Loan Interest & Real Debt Discounting

If **Finance Tuition with Student Loans** is selected, tuition cost $C_{\text{Nominal}, X}$ is multiplied by a real principal + interest repayment factor $M_{\text{Real}}$ to account for debt erosion by inflation during repayment:

$$C_{\text{Nominal, Financed}, X} = C_{\text{Nominal}, X} \times M_{\text{Real}, X}$$

where $M_{\text{Real}, X}$ discounts nominal annuity payments at average annual inflation rate $\pi_X$ over the $N$-year repayment term (default = **10 years** at **5.0% interest**):

$$M_{\text{Real}, X} = \left[ \frac{r(1+r)^N}{(1+r)^N - 1} \right] \times \left[ \frac{1 - (1 + \pi_X)^{-N}}{\pi_X} \right]$$

* **Historical Terms** ($X + N \le 2026$): $\pi_X$ is calculated from actual historical CPI changes.
* **Projected Terms** ($X + N > 2026$): $\pi_X$ uses actual CPI through 2026 and projects a **2.88%** annual inflation rate (historical post-1983 baseline average) for future years.
