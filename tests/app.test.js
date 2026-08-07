const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Mock DOM elements and document structure
const elementMocks = {
  'adjust-education': { checked: false },
  'loan-finance': { checked: false },
  'loan-rate': { value: '5.0' },
  'loan-term': { value: '10' },
  'working-years': { value: '44' },
  'lost-years': { value: '4' },
  'result-val': { textContent: '' },
  'inflation-percentage': { textContent: '', className: '' },
  'explanation-text': { innerHTML: '' },
  'base-year-label': { textContent: '' },
  'target-year-label': { textContent: '' },
  'base-cpi-val': { textContent: '' },
  'target-cpi-val': { textContent: '' }
};

const domMock = {
  cpiData: null,
  chainedCpiData: null,
  cpiwData: null,
  coreCpiData: null,
  householdIncomeData: null,
  individualIncomeData: null,
  educationCostsData: null,
  epiHourlyData: null,
  ssaW2Data: null,
  censusIndividualAllData: null,
  censusIndividualFtData: null,
  window: {
    addEventListener: () => {}
  },
  navigator: {},
  document: {
    getElementById: (id) => {
      if (!elementMocks[id]) {
        elementMocks[id] = { 
          checked: false, 
          value: '', 
          innerHTML: '',
          textContent: '',
          children: [],
          appendChild: function(child) {
            this.children.push(child);
            if (child.innerHTML) this.innerHTML += child.innerHTML;
            if (child.textContent) this.textContent += child.textContent;
          },
          classList: { add: () => {}, remove: () => {}, toggle: () => {} },
          scrollIntoView: () => {}
        };
      }
      return elementMocks[id];
    },
    createElement: (tag) => {
      return {
        tag,
        innerHTML: '',
        textContent: '',
        children: [],
        appendChild: function(child) {
          this.children.push(child);
          if (child.innerHTML) this.innerHTML += child.innerHTML;
          if (child.textContent) this.textContent += child.textContent;
        },
        classList: { add: () => {}, remove: () => {}, toggle: () => {} }
      };
    }
  },
  console: console,
  Math: Math,
  parseFloat: parseFloat,
  parseInt: parseInt,
  Intl: Intl
};

// Create sandbox execution context
vm.createContext(domMock);

// Load and execute app.js in sandbox with pre-populated lexical variables
const appPath = path.join(__dirname, '../app.js');
const dataDir = path.join(__dirname, '../data');

let appCode = fs.readFileSync(appPath, 'utf8');

appCode += `
cpiData = ${fs.readFileSync(path.join(dataDir, 'cpi_data.json'), 'utf8')};
chainedCpiData = ${fs.readFileSync(path.join(dataDir, 'chained_cpi_data.json'), 'utf8')};
cpiwData = ${fs.readFileSync(path.join(dataDir, 'cpiw_data.json'), 'utf8')};
coreCpiData = ${fs.readFileSync(path.join(dataDir, 'core_cpi_data.json'), 'utf8')};
householdIncomeData = ${fs.readFileSync(path.join(dataDir, 'household_income_quintiles.json'), 'utf8')};
individualIncomeData = ${fs.readFileSync(path.join(dataDir, 'individual_median_income.json'), 'utf8')};
educationCostsData = ${fs.readFileSync(path.join(dataDir, 'education_costs.json'), 'utf8')};
epiHourlyData = ${fs.readFileSync(path.join(dataDir, 'epi_hourly_percentiles.json'), 'utf8')};
ssaW2Data = ${fs.readFileSync(path.join(dataDir, 'ssa_w2_percentiles.json'), 'utf8')};
censusIndividualAllData = ${fs.readFileSync(path.join(dataDir, 'census_individual_all_percentiles.json'), 'utf8')};
censusIndividualFtData = ${fs.readFileSync(path.join(dataDir, 'census_individual_fulltime_percentiles.json'), 'utf8')};
`;

vm.runInContext(appCode, domMock);

// Test Runner suite
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`\x1b[32m[PASS]\x1b[0m ${message}`);
    testsPassed++;
  } else {
    console.error(`\x1b[31m[FAIL]\x1b[0m ${message}`);
    testsFailed++;
  }
}

console.log("Starting CPI & Labor-Value Calculator Math Unit Tests...\n");

// --- TEST 1: Standard Price Inflation (No Labor, CPI-U) ---
try {
  const res = domMock.performCalculation(100.0, 2000, 2024, 'none', 'cpi-u', false);
  assert(res.hasData === true, "Test 1: Standard calculation has data");
  
  // Nominal price calculation: 100 * (313.689 / 172.2) = 182.17
  const expectedValue = 100.0 * (313.689 / 172.2);
  assert(Math.abs(res.targetValue - expectedValue) < 0.01, `Test 1: Standard price inflation equals $${expectedValue.toFixed(2)} (Actual: $${res.targetValue.toFixed(2)})`);
} catch (e) {
  assert(false, `Test 1 encountered error: ${e.message}`);
}

// --- TEST 2: Labor Effort without Education costs (CPI-U, Individual Median) ---
try {
  elementMocks['adjust-education'].checked = false;
  const res = domMock.performCalculation(100.0, 2000, 2024, 'individual-median', 'cpi-u', false);
  
  // Ratio calculation: 100 * (313.689 / 172.2) * (21520 / 45140) = 86.83
  const expectedValue = 100.0 * (313.689 / 172.2) * (21520.0 / 45140.0);
  assert(Math.abs(res.targetValue - expectedValue) < 0.01, `Test 2: Wage ratio purchasing effort equals $${expectedValue.toFixed(2)} (Actual: $${res.targetValue.toFixed(2)})`);
} catch (e) {
  assert(false, `Test 2 encountered error: ${e.message}`);
}

// --- TEST 3: Labor Effort with Education (No Financing) ---
try {
  elementMocks['adjust-education'].checked = true;
  elementMocks['loan-finance'].checked = false;
  elementMocks['working-years'].value = '44';
  elementMocks['lost-years'].value = '4';
  
  const res = domMock.performCalculation(100.0, 2000, 2024, 'individual-median', 'cpi-u', false);
  
  // Wage 2000: 21520, Grad Rate: 0.256, Tuition: 8800 * (172.2 / 313.689) = 4830.40
  // Adj 2000 wage: 21520 * (1 - 0.256 * 4/44) - 0.256 * (4830.40 / 40) = 20988.25
  // Wage 2024: 45140, Grad Rate: 0.384, Tuition: 9200 * (313.689 / 313.689) = 9200.00
  // Adj 2024 wage: 45140 * (1 - 0.384 * 4/44) - 0.384 * (9200.00 / 40) = 43475.88
  // Ratio: 100 * (313.689 / 172.2) * (20988.25 / 43475.88) = 87.94
  assert(Math.abs(res.targetValue - 87.94) < 0.05, `Test 3: Education cost adjusted purchasing power equals $87.94 (Actual: $${res.targetValue.toFixed(2)})`);
} catch (e) {
  assert(false, `Test 3 encountered error: ${e.message}`);
}

// --- TEST 4: Labor Effort with Education and 25% Loan Financing over 10 Years ---
try {
  elementMocks['adjust-education'].checked = true;
  elementMocks['loan-finance'].checked = true;
  elementMocks['loan-rate'].value = '25.0';
  elementMocks['loan-term'].value = '10';
  
  const res = domMock.performCalculation(100.0, 2000, 2024, 'individual-median', 'cpi-u', false);
  
  // Base inflation rate over repayment (2000-2010): 2.389%
  // M_base: annuity (0.28007) * discount (8.803) = 2.465
  // Target inflation rate (2024-2034): 2.820%
  // M_target: annuity (0.28007) * discount (8.609) = 2.411
  // Final equivalent value: $88.00
  assert(Math.abs(res.targetValue - 88.00) < 0.05, `Test 4: Real debt discounted purchasing power equals $88.00 (Actual: $${res.targetValue.toFixed(2)})`);
  assert(res.loanBaseDetails.projected === false, "Test 4: Base year repayment (2000-2010) is historical");
  assert(res.loanTargetDetails.projected === true, "Test 4: Target year repayment (2024-2034) is projected (past 2026)");
} catch (e) {
  assert(false, `Test 4 encountered error: ${e.message}`);
}

// --- TEST 5: UI Explanation text for Higher Education Cost Adjustment (No Loan) ---
try {
  elementMocks['adjust-education'].checked = true;
  elementMocks['loan-finance'].checked = false;
  
  domMock.calculateSingleMeasure(100.0, 2000, 2024, 'individual-median', 'cpi-u');
  const html = elementMocks['explanation-text'].innerHTML;
  
  assert(html.includes("Education cost adjustments applied: College cost burden reduced lifetime wages"), "Test 5: Explanation text contains education burden note");
  assert(html.includes("2.5%") && html.includes("2000"), "Test 5: Explanation text lists correct 2000 education burden (2.5%)");
  assert(html.includes("3.7%") && html.includes("2024"), "Test 5: Explanation text lists correct 2024 education burden (3.7%)");
  assert(!html.includes("Tuition financed with student loans"), "Test 5: Explanation text does NOT contain student loan financing info");
} catch (e) {
  assert(false, `Test 5 encountered error: ${e.message}`);
}

// --- TEST 6: UI Explanation text for Higher Education & Student Loans Financing ---
try {
  elementMocks['adjust-education'].checked = true;
  elementMocks['loan-finance'].checked = true;
  elementMocks['loan-rate'].value = '25.0';
  elementMocks['loan-term'].value = '10';
  
  domMock.calculateSingleMeasure(100.0, 2000, 2024, 'individual-median', 'cpi-u');
  const html = elementMocks['explanation-text'].innerHTML;
  
  assert(html.includes("Education cost adjustments applied: College cost burden reduced lifetime wages"), "Test 6: Explanation text contains education burden note");
  assert(html.includes("Tuition financed with student loans"), "Test 6: Explanation text contains student loan financing details");
  assert(html.includes("historic") && html.includes("2.39%") && html.includes("2000"), "Test 6: Explanation text lists correct historic base year inflation rate");
  assert(html.includes("projected") && html.includes("2.82%") && html.includes("2024"), "Test 6: Explanation text lists correct projected target year inflation rate");
} catch (e) {
  assert(false, `Test 6 encountered error: ${e.message}`);
}

// --- TEST 7: EPI Hourly Wage calculation (No Education Adjustment) ---
try {
  elementMocks['adjust-education'].checked = false;
  const res = domMock.performCalculation(100.0, 2000, 2024, 'epi-hr-50', 'cpi-u', false);
  assert(res.hasData === true, "Test 7: EPI Hourly calculation has data");
  // Expected value: 100.0 * (313.689 / 172.2) * (12.02 / 24.87) = 88.03
  assert(Math.abs(res.targetValue - 88.03) < 0.05, `Test 7: EPI hourly median equivalent value equals $88.03 (Actual: $${res.targetValue.toFixed(2)})`);
} catch (e) {
  assert(false, `Test 7 encountered error: ${e.message}`);
}

// --- TEST 8: EPI Hourly Wage calculation with Education Adjustment (2080-hour conversion) ---
try {
  elementMocks['adjust-education'].checked = true;
  elementMocks['loan-finance'].checked = false;
  elementMocks['working-years'].value = '44';
  elementMocks['lost-years'].value = '4';
  
  const res = domMock.performCalculation(100.0, 2000, 2024, 'epi-hr-50', 'cpi-u', false);
  // Expected value: 100 * (313.689 / 172.2) * (11.725 / 23.960) = 89.14
  assert(Math.abs(res.targetValue - 89.14) < 0.05, `Test 8: EPI hourly education adjusted value equals $89.14 (Actual: $${res.targetValue.toFixed(2)})`);
} catch (e) {
  assert(false, `Test 8 encountered error: ${e.message}`);
}

// --- TEST 9: SSA W-2 Earnings calculation ---
try {
  elementMocks['adjust-education'].checked = false;
  const res = domMock.performCalculation(100.0, 2000, 2023, 'ssa-w2-50', 'cpi-u', false);
  // Expected value: 100 * (304.7 / 172.2) * (20988.35 / 43263.06) = 85.83
  const baseCpi = 172.2;
  const targetCpi = 304.7; // year 2023 CPI from cpi_data.json
  const expectedValue = 100.0 * (targetCpi / baseCpi) * (20988.35 / 43263.06);
  assert(Math.abs(res.targetValue - expectedValue) < 0.05, `Test 9: SSA W-2 earnings median equivalent value equals $${expectedValue.toFixed(2)} (Actual: $${res.targetValue.toFixed(2)})`);
} catch (e) {
  assert(false, `Test 9 encountered error: ${e.message}`);
}

// --- TEST 10: Census Individual All Workers percentile calculation ---
try {
  elementMocks['adjust-education'].checked = false;
  const res = domMock.performCalculation(100.0, 2000, 2024, 'census-ind-all-20', 'cpi-u', false);
  // Expected value: 100 * (313.689 / 172.2) * (7326.26 / 17440.98) = 76.52
  const expectedValue = 100.0 * (313.689 / 172.2) * (7326.26 / 17440.98);
  assert(Math.abs(res.targetValue - expectedValue) < 0.05, `Test 10: Census individual 20th percentile equivalent value equals $${expectedValue.toFixed(2)} (Actual: $${res.targetValue.toFixed(2)})`);
} catch (e) {
  assert(false, `Test 10 encountered error: ${e.message}`);
}

// --- TEST 11: Census Individual Full-Time Workers (Table P-38) ---
try {
  elementMocks['adjust-education'].checked = false;
  const res = domMock.performCalculation(100.0, 2000, 2024, 'census-ind-ft-50', 'cpi-u', false);
  const expectedValue = 100.0 * (313.689 / 172.2) * (33218.82 / 65134.11);
  assert(Math.abs(res.targetValue - expectedValue) < 0.05, `Test 11: Census individual FT median equivalent value equals $${expectedValue.toFixed(2)} (Actual: $${res.targetValue.toFixed(2)})`);
} catch (e) {
  assert(false, `Test 11 encountered error: ${e.message}`);
}

// --- TEST 12: Household Income Quintiles (Table H-1) ---
try {
  elementMocks['adjust-education'].checked = false;
  const res = domMock.performCalculation(100.0, 2000, 2024, 'household-60', 'cpi-u', false);
  const expectedValue = 100.0 * (313.689 / 172.2) * (52170 / 105500);
  assert(Math.abs(res.targetValue - expectedValue) < 0.05, `Test 12: Household income 60th percentile equivalent value equals $${expectedValue.toFixed(2)} (Actual: $${res.targetValue.toFixed(2)})`);
} catch (e) {
  assert(false, `Test 12 encountered error: ${e.message}`);
}

// --- TEST 13: Out-of-Bounds Year Error Handling ---
try {
  const res = domMock.performCalculation(100.0, 1980, 2024, 'ssa-w2-50', 'cpi-u', false);
  assert(res.hasData === false, "Test 13: Out-of-bounds year calculation returns hasData = false");
  assert(res.errorMsg.includes("1991 to 2023"), "Test 13: Out-of-bounds calculation provides clear year range error message");
} catch (e) {
  assert(false, `Test 13 encountered error: ${e.message}`);
}

// --- TEST 14: Matrix Comparison Table Rendering ---
try {
  elementMocks['adjust-education'].checked = false;
  domMock.calculateComparisonTable(100.0, 2000, 2024, 'all', 'cpi-u');
  const tableBody = elementMocks['comparison-table-body'];
  assert(tableBody.innerHTML.includes("SSA W-2 Earnings"), "Test 14: Matrix table contains SSA W-2 Earnings row");
  assert(tableBody.innerHTML.includes("Census Individual FT Workers"), "Test 14: Matrix table contains Census FT Workers row");
} catch (e) {
  assert(false, `Test 14 encountered error: ${e.message}`);
}

// --- TEST 15: Dynamic Year Options Populator ---
try {
  domMock.updateYearOptions('ssa-w2-50', 'cpi-u');
  const years = domMock.getYearsForMeasure('ssa-w2-50', 'cpi-u');
  assert(years[0] === 2023 && years[years.length - 1] === 1991, "Test 15: Year options correctly restrict to SSA W-2 range (1991-2023)");
} catch (e) {
  assert(false, `Test 15 encountered error: ${e.message}`);
}

// --- SUMMARY ---
console.log(`\nTests Completed: ${testsPassed + testsFailed}`);
console.log(`\x1b[32mPassed: ${testsPassed}\x1b[0m`);
if (testsFailed > 0) {
  console.log(`\x1b[31mFailed: ${testsFailed}\x1b[0m`);
  process.exit(1);
} else {
  console.log("\nAll tests completed successfully!");
  process.exit(0);
}
