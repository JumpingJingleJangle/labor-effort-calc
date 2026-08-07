// Global application state
let cpiData = null;
let chainedCpiData = null;
let cpiwData = null;
let coreCpiData = null;
let householdIncomeData = null;
let individualIncomeData = null;
let educationCostsData = null;
let epiHourlyData = null;
let ssaW2Data = null;
let censusIndividualAllData = null;
let censusIndividualFtData = null;

// Initialize app on load
window.addEventListener('DOMContentLoaded', () => {
  setupServiceWorker();
  loadData();
  setupListeners();
});

// Register PWA Service Worker
function setupServiceWorker() {
  // Bypass Service Worker on localhost/127.0.0.1 to avoid caching during local development
  const isLocalhost = Boolean(
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '[::1]'
  );

  if (isLocalhost) {
    console.log('[Dev Mode] Bypassing Service Worker on localhost to allow instant reloads.');
    return;
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => {
        console.log('Service Worker registered successfully:', reg.scope);

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              const updateToast = document.getElementById('update-toast');
              if (updateToast) {
                updateToast.classList.remove('hidden');
              }
              console.log('New content is available; please refresh.');
            }
          });
        });
      })
      .catch((err) => {
        console.error('Service worker registration failed:', err);
      });
  }
}

// Load all datasets
async function loadData() {
  const calculateBtn = document.getElementById('calculate-btn');
  const measureSelect = document.getElementById('comparison-measure');
  const baselineSelect = document.getElementById('baseline-measure');

  try {
    const [
      cpiRes, chainedRes, cpiwRes, coreRes, householdRes, individualRes, educationRes,
      epiRes, ssaRes, censusAllRes, censusFtRes
    ] = await Promise.all([
      fetch('./data/cpi_data.json'),
      fetch('./data/chained_cpi_data.json'),
      fetch('./data/cpiw_data.json'),
      fetch('./data/core_cpi_data.json'),
      fetch('./data/household_income_quintiles.json'),
      fetch('./data/individual_median_income.json'),
      fetch('./data/education_costs.json'),
      fetch('./data/epi_hourly_percentiles.json'),
      fetch('./data/ssa_w2_percentiles.json'),
      fetch('./data/census_individual_all_percentiles.json'),
      fetch('./data/census_individual_fulltime_percentiles.json')
    ]);

    if (!cpiRes.ok || !chainedRes.ok || !cpiwRes.ok || !coreRes.ok || !householdRes.ok ||
      !individualRes.ok || !educationRes.ok || !epiRes.ok || !ssaRes.ok ||
      !censusAllRes.ok || !censusFtRes.ok) {
      throw new Error('One or more data files failed to load');
    }

    cpiData = await cpiRes.json();
    chainedCpiData = await chainedRes.json();
    cpiwData = await cpiwRes.json();
    coreCpiData = await coreRes.json();
    householdIncomeData = await householdRes.json();
    individualIncomeData = await individualRes.json();
    educationCostsData = await educationRes.json();
    epiHourlyData = await epiRes.json();
    ssaW2Data = await ssaRes.json();
    censusIndividualAllData = await censusAllRes.json();
    censusIndividualFtData = await censusFtRes.json();

    // Populate selects for the initial measure & baseline
    updateYearOptions(measureSelect.value, baselineSelect.value);
    toggleEducationPanel(measureSelect.value);

    // Enable the calculate button
    calculateBtn.removeAttribute('disabled');
  } catch (error) {
    console.error('Failed to load datasets:', error);
    alert('Error loading economic data files. Please ensure all JSON files are in the same folder.');
  }
}

// Set up listeners for select changes and form submit
function setupListeners() {
  const form = document.getElementById('cpi-form');
  const measureSelect = document.getElementById('comparison-measure');
  const baselineSelect = document.getElementById('baseline-measure');

  baselineSelect.addEventListener('change', () => {
    updateYearOptions(measureSelect.value, baselineSelect.value);
  });


  measureSelect.addEventListener('change', () => {
    updateYearOptions(measureSelect.value, baselineSelect.value);
    toggleEducationPanel(measureSelect.value);
  });

  // Collapsible Education panel setup
  const eduHeader = document.getElementById('edu-toggle-header');
  const eduContent = document.getElementById('edu-panel-content');
  const eduArrow = document.getElementById('edu-arrow');

  eduHeader.addEventListener('click', (e) => {
    if (e.target.closest('#adjust-education-container')) {
      return;
    }
    eduContent.classList.toggle('hidden');
    eduArrow.classList.toggle('active');
  });

  // Student loan panel toggle listener
  const loanFinanceSelect = document.getElementById('loan-finance');
  const loanContent = document.getElementById('loan-panel-content');
  if (loanFinanceSelect && loanContent) {
    loanFinanceSelect.addEventListener('change', () => {
      loanContent.classList.toggle('hidden', !loanFinanceSelect.checked);
    });
  }

  // Modal listeners for methodologies
  const infoIcons = document.querySelectorAll('.info-icon');
  infoIcons.forEach(icon => {
    icon.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      openMethodologyModal(icon.id);
    });
  });

  const modalOverlay = document.getElementById('modal-overlay');
  const modalClose = document.getElementById('modal-close');
  if (modalOverlay) modalOverlay.addEventListener('click', closeMethodologyModal);
  if (modalClose) modalClose.addEventListener('click', closeMethodologyModal);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    calculateValues();
  });
}

// Show/hide higher education params depending on measure type
function toggleEducationPanel(measure) {
  const eduPanel = document.getElementById('education-adjustment-panel');
  if (eduPanel) {
    if (measure === 'none') {
      eduPanel.classList.add('hidden');
      document.getElementById('adjust-education').checked = false;
      const loanFinance = document.getElementById('loan-finance');
      if (loanFinance) {
        loanFinance.checked = false;
        document.getElementById('loan-panel-content').classList.add('hidden');
      }
    } else {
      eduPanel.classList.remove('hidden');
    }
  }
}

// Get the dataset array for a specific baseline key
function getBaselineDataset(baseline) {
  switch (baseline) {
    case 'cpi-u': return cpiData;
    case 'chained-cpi': return chainedCpiData;
    case 'cpiw': return cpiwData;
    case 'core-cpi': return coreCpiData;
    default: return cpiData;
  }
}

// Helper to get years range depending on active measure and baseline
function getYearsForMeasure(measure, baseline) {
  // Determine baseline years list
  let baselineYears = [];
  if (baseline === 'all') {
    const allBaselineYears = new Set([
      ...Object.keys(cpiData).map(Number),
      ...Object.keys(chainedCpiData).map(Number),
      ...Object.keys(cpiwData).map(Number),
      ...Object.keys(coreCpiData).map(Number)
    ]);
    baselineYears = Array.from(allBaselineYears);
  } else {
    const baselineData = getBaselineDataset(baseline);
    baselineYears = Object.keys(baselineData).map(Number);
  }

  // If measure is none, we just want standard inflation (so baseline years range)
  if (measure === 'none') {
    return baselineYears.sort((a, b) => b - a);
  }

  // For labor or all labor measures
  let measureYears = [];
  if (measure === 'individual-median') {
    measureYears = Object.keys(individualIncomeData).map(Number);
  } else if (measure.startsWith('household-')) {
    measureYears = Object.keys(householdIncomeData).map(Number);
  } else if (measure.startsWith('epi-hr-')) {
    measureYears = Object.keys(epiHourlyData).map(Number);
  } else if (measure.startsWith('ssa-w2-')) {
    measureYears = Object.keys(ssaW2Data).map(Number);
  } else if (measure.startsWith('census-ind-all-')) {
    measureYears = Object.keys(censusIndividualAllData).map(Number);
  } else if (measure.startsWith('census-ind-ft-')) {
    measureYears = Object.keys(censusIndividualFtData).map(Number);
  } else if (measure === 'all') {
    const allYears = new Set([
      ...Object.keys(individualIncomeData).map(Number),
      ...Object.keys(householdIncomeData).map(Number),
      ...Object.keys(epiHourlyData).map(Number),
      ...Object.keys(ssaW2Data).map(Number),
      ...Object.keys(censusIndividualAllData).map(Number),
      ...Object.keys(censusIndividualFtData).map(Number)
    ]);
    const laborYears = Array.from(allYears);
    if (baseline !== 'all') {
      return laborYears.filter(year => baselineYears.includes(year)).sort((a, b) => b - a);
    }
    return laborYears.sort((a, b) => b - a);
  }

  // Intersect measure years and baseline years for single measure view
  const intersection = measureYears.filter(year => baselineYears.includes(year));
  return intersection.sort((a, b) => b - a);
}

// Re-populate Base Year and Target Year options dynamically
function updateYearOptions(measure, baseline) {
  const baseYearSelect = document.getElementById('base-year');
  const targetYearSelect = document.getElementById('target-year');

  const currentBase = baseYearSelect.value;
  const currentTarget = targetYearSelect.value;

  baseYearSelect.innerHTML = '';
  targetYearSelect.innerHTML = '';

  const years = getYearsForMeasure(measure, baseline);

  years.forEach((year) => {
    const optBase = document.createElement('option');
    optBase.value = year;
    optBase.textContent = year;
    baseYearSelect.appendChild(optBase);

    const optTarget = document.createElement('option');
    optTarget.value = year;
    optTarget.textContent = year;
    targetYearSelect.appendChild(optTarget);
  });

  if (currentBase && years.includes(Number(currentBase))) {
    baseYearSelect.value = currentBase;
  } else {
    baseYearSelect.value = years.includes(2000) ? 2000 : years[years.length - 1];
  }

  if (currentTarget && years.includes(Number(currentTarget))) {
    targetYearSelect.value = currentTarget;
  } else {
    const latestYear = years[0];
    if (measure === 'all' || measure !== 'none') {
      targetYearSelect.value = years.includes(2024) ? 2024 : latestYear;
    } else {
      targetYearSelect.value = latestYear;
    }
  }
}

// Master calculation routing
function calculateValues() {
  if (!cpiData || !householdIncomeData || !individualIncomeData || !educationCostsData) return;

  const measure = document.getElementById('comparison-measure').value;
  const baseline = document.getElementById('baseline-measure').value;
  const amountInput = document.getElementById('amount');
  const baseYear = parseInt(document.getElementById('base-year').value);
  const targetYear = parseInt(document.getElementById('target-year').value);
  const amount = parseFloat(amountInput.value);

  if (isNaN(amount) || isNaN(baseYear) || isNaN(targetYear)) {
    alert('Please check all input values.');
    return;
  }

  // Determine if we should show the single results card or the comparison table
  if (measure !== 'all' && baseline !== 'all') {
    calculateSingleMeasure(amount, baseYear, targetYear, measure, baseline);
  } else {
    calculateComparisonTable(amount, baseYear, targetYear, measure, baseline);
  }
}

// Single measure layout updates
function calculateSingleMeasure(amount, baseYear, targetYear, measure, baseline) {
  document.getElementById('comparison-results-section').classList.add('hidden');
  const resultsSection = document.getElementById('results-section');
  resultsSection.classList.remove('hidden');

  const { targetValue, pctChange, baseIndex, targetIndex, baseCpi, targetCpi, hasData, errorMsg, finalBaseWage, finalTargetWage, loanBaseDetails, loanTargetDetails } = performCalculation(amount, baseYear, targetYear, measure, baseline, false);

  if (!hasData) {
    alert(errorMsg);
    return;
  }

  const formatter = new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('result-val').textContent = formatter.format(targetValue);

  const pctBadge = document.getElementById('inflation-percentage');
  const pctFormatted = pctChange.toFixed(1);
  if (pctChange >= 0) {
    pctBadge.textContent = `+${pctFormatted}%`;
    pctBadge.className = 'percentage-badge positive';
  } else {
    pctBadge.textContent = `${pctFormatted}%`;
    pctBadge.className = 'percentage-badge negative';
  }

  const baseYearLabel = document.getElementById('base-year-label');
  const targetYearLabel = document.getElementById('target-year-label');
  const baseCpiVal = document.getElementById('base-cpi-val');
  const targetCpiVal = document.getElementById('target-cpi-val');
  const explanationText = document.getElementById('explanation-text');

  const formattedInput = formatter.format(amount);
  const formattedResult = formatter.format(targetValue);

  const baselineName = getBaselineName(baseline);
  const adjustEducation = document.getElementById('adjust-education').checked;

  if (measure === 'none') {
    baseYearLabel.textContent = `${baseYear} ${baselineName}`;
    targetYearLabel.textContent = `${targetYear} ${baselineName}`;
    baseCpiVal.textContent = baseIndex.toFixed(3);
    targetCpiVal.textContent = targetIndex.toFixed(3);
    explanationText.innerHTML = `Due to price inflation measured by <strong>${baselineName}</strong>, a purchase costing <strong>$${formattedInput}</strong> in <strong>${baseYear}</strong> would require <strong>$${formattedResult}</strong> in <strong>${targetYear}</strong> to buy the same basket of goods.`;

    // Hide effort items
    document.getElementById('base-effort-divider').classList.add('hidden');
    document.getElementById('base-effort-item').classList.add('hidden');
    document.getElementById('target-effort-divider').classList.add('hidden');
    document.getElementById('target-effort-item').classList.add('hidden');
  } else {
    const measureName = getMeasureName(measure);

    baseYearLabel.textContent = `${baseYear} Wage | CPI`;
    targetYearLabel.textContent = `${targetYear} Wage | CPI`;

    baseCpiVal.textContent = `$${formatter.format(finalBaseWage)} | ${baseCpi.toFixed(1)}`;
    targetCpiVal.textContent = `$${formatter.format(finalTargetWage)} | ${targetCpi.toFixed(1)}`;

    // Show and calculate effort items
    document.getElementById('base-effort-divider').classList.remove('hidden');
    document.getElementById('base-effort-item').classList.remove('hidden');
    document.getElementById('target-effort-divider').classList.remove('hidden');
    document.getElementById('target-effort-item').classList.remove('hidden');

    const isHourly = measure.startsWith('epi-hr-');
    document.getElementById('base-effort-val').textContent = calculateEffortDisplay(amount, finalBaseWage, baseCpi, baseCpi, isHourly);
    document.getElementById('target-effort-val').textContent = calculateEffortDisplay(amount, finalTargetWage, targetCpi, baseCpi, isHourly);

    let eduNote = "";
    if (adjustEducation) {
      const baseBurden = ((baseIndex - finalBaseWage) / baseIndex * 100).toFixed(1);
      const targetBurden = ((targetIndex - finalTargetWage) / targetIndex * 100).toFixed(1);

      let loanInfo = "";
      const loanFinance = document.getElementById('loan-finance').checked;
      if (loanFinance && loanBaseDetails && loanTargetDetails) {
        const basePiPercent = (loanBaseDetails.pi * 100).toFixed(2);
        const targetPiPercent = (loanTargetDetails.pi * 100).toFixed(2);
        const baseLabel = loanBaseDetails.projected ? `projected ${basePiPercent}%` : `historic ${basePiPercent}%`;
        const targetLabel = loanTargetDetails.projected ? `projected ${targetPiPercent}%` : `historic ${targetPiPercent}%`;
        loanInfo = `<br><span class="edu-explanation-note">*(Tuition financed with student loans. Debt burden reduced by inflation at <strong>${baseLabel}</strong> for ${baseYear} and <strong>${targetLabel}</strong> for ${targetYear} repayment terms)*</span>`;
      }

      eduNote = `<br><span class="edu-explanation-note">*(Education cost adjustments applied: College cost burden reduced lifetime wages by <strong>${baseBurden}%</strong> in ${baseYear} and <strong>${targetBurden}%</strong> in ${targetYear})*</span>${loanInfo}`;
    }

    if (pctChange <= 0) {
      explanationText.innerHTML = `Based on <strong>${measureName}</strong> and baseline <strong>${baselineName}</strong>, a purchase of <strong>$${formattedInput}</strong> in <strong>${baseYear}</strong> represents a labor-effort equivalent to <strong>$${formattedResult}</strong> in <strong>${targetYear}</strong>. The work hours required to buy it fell by <strong>${Math.abs(pctChange).toFixed(1)}%</strong> because wages increased in real terms.${eduNote}`;
    } else {
      explanationText.innerHTML = `Based on <strong>${measureName}</strong> and baseline <strong>${baselineName}</strong>, a purchase of <strong>$${formattedInput}</strong> in <strong>${baseYear}</strong> represents a labor-effort equivalent to <strong>$${formattedResult}</strong> in <strong>${targetYear}</strong>. The work hours required to buy it rose by <strong>${pctChange.toFixed(1)}%</strong> because wages decreased in real terms.${eduNote}`;
    }
  }

  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Helper to calculate labor effort in hours/weeks
function calculateEffortDisplay(amount, wage, cpi, baseCpi, isHourly) {
  const nominalPrice = amount * (cpi / baseCpi);
  if (isHourly) {
    const hours = nominalPrice / wage;
    return `${hours.toLocaleString('en-US', { maximumFractionDigits: 1 })} hours`;
  } else {
    const hours = nominalPrice / (wage / 2080);
    const weeks = nominalPrice / (wage / 52);
    if (weeks >= 1.0) {
      return `${hours.toLocaleString('en-US', { maximumFractionDigits: 1 })} hours (${weeks.toLocaleString('en-US', { maximumFractionDigits: 2 })} weeks)`;
    } else {
      return `${hours.toLocaleString('en-US', { maximumFractionDigits: 1 })} hours`;
    }
  }
}

// Master grid renderer for comparison table
function calculateComparisonTable(amount, baseYear, targetYear, measure, baseline) {
  document.getElementById('results-section').classList.add('hidden');
  const comparisonSection = document.getElementById('comparison-results-section');
  comparisonSection.classList.remove('hidden');

  const tableHeader = document.getElementById('comparison-table-header');
  const tableBody = document.getElementById('comparison-table-body');

  tableHeader.innerHTML = '';
  tableBody.innerHTML = '';

  const formatter = new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // CASE 1: Standard nominal price inflation matrix across baselines
  if (measure === 'none' && baseline === 'all') {
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `<th>Baseline</th><th>Equivalent Value</th><th>Change</th>`;
    tableHeader.appendChild(headerRow);

    const baselines = ['cpi-u', 'chained-cpi', 'cpiw', 'core-cpi'];
    baselines.forEach((b) => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      nameCell.innerHTML = `<strong>${getBaselineName(b)}</strong>`;
      row.appendChild(nameCell);

      const { targetValue, pctChange, hasData, minYear, maxYear } = performCalculation(amount, baseYear, targetYear, 'none', b, false);

      const valCell = document.createElement('td');
      const changeCell = document.createElement('td');

      if (hasData) {
        valCell.textContent = `$${formatter.format(targetValue)}`;
        const pctFormatted = pctChange.toFixed(1);
        if (pctChange >= 0) {
          changeCell.innerHTML = `<span class="percentage-badge positive">+${pctFormatted}%</span>`;
        } else {
          changeCell.innerHTML = `<span class="percentage-badge negative">${pctFormatted}%</span>`;
        }
      } else {
        row.className = 'row-disabled';
        valCell.innerHTML = `<span class="warning-badge">Unavailable</span>`;
        changeCell.textContent = `Requires data from ${minYear} to ${maxYear}`;
      }
      row.appendChild(valCell);
      row.appendChild(changeCell);
      tableBody.appendChild(row);
    });

    comparisonSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  // CASE 2: Wage effort matrix / tables
  const activeMeasures = measure === 'all'
    ? [
      'ssa-w2-50',
      'census-ind-ft-50',
      'census-ind-all-50',
      'household-60',
      'epi-hr-50',
      'individual-median'
    ]
    : [measure];

  const activeBaselines = baseline === 'all'
    ? ['cpi-u', 'chained-cpi', 'cpiw', 'core-cpi']
    : [baseline];

  // Render Table Headers <thead>
  const headerRow = document.createElement('tr');
  const measureTh = document.createElement('th');
  measureTh.textContent = 'Measure';
  headerRow.appendChild(measureTh);

  if (activeBaselines.length === 1) {
    const valTh = document.createElement('th');
    valTh.textContent = 'Equivalent Value';
    const changeTh = document.createElement('th');
    changeTh.textContent = 'Change';
    headerRow.appendChild(valTh);
    headerRow.appendChild(changeTh);
  } else {
    activeBaselines.forEach((b) => {
      const th = document.createElement('th');
      th.textContent = getBaselineName(b);
      headerRow.appendChild(th);
    });
  }
  tableHeader.appendChild(headerRow);

  // Render Table Rows <tbody>
  activeMeasures.forEach((m) => {
    const row = document.createElement('tr');

    // Add Measure Name cell
    const nameCell = document.createElement('td');
    nameCell.innerHTML = `<strong>${getMeasureName(m)}</strong>`;
    row.appendChild(nameCell);

    // Add Value/Change Cells for each active baseline
    activeBaselines.forEach((b) => {
      const { targetValue, pctChange, hasData, minYear, maxYear } = performCalculation(amount, baseYear, targetYear, m, b, true);

      if (activeBaselines.length === 1) {
        // Render 2 cells: Value and Change
        const valCell = document.createElement('td');
        const changeCell = document.createElement('td');

        if (hasData) {
          valCell.textContent = `$${formatter.format(targetValue)}`;
          const pctFormatted = pctChange.toFixed(1);
          if (pctChange >= 0) {
            changeCell.innerHTML = `<span class="percentage-badge positive">+${pctFormatted}%</span>`;
          } else {
            changeCell.innerHTML = `<span class="percentage-badge negative">${pctFormatted}%</span>`;
          }
        } else {
          row.className = 'row-disabled';
          valCell.innerHTML = `<span class="warning-badge">Unavailable</span>`;
          changeCell.textContent = `Requires data from ${minYear} to ${maxYear}`;
        }
        row.appendChild(valCell);
        row.appendChild(changeCell);
      } else {
        // Render 1 combined cell: Value + Badge Percentage Change
        const cell = document.createElement('td');
        if (hasData) {
          const pctFormatted = pctChange.toFixed(1);
          const valStr = `$${formatter.format(targetValue)}`;
          const changeBadge = `<span class="percentage-badge ${pctChange >= 0 ? 'positive' : 'negative'}">${pctChange >= 0 ? '+' : ''}${pctFormatted}%</span>`;
          cell.innerHTML = `<div class="matrix-cell-content"><span>${valStr}</span> ${changeBadge}</div>`;
        } else {
          cell.innerHTML = `<span class="warning-badge">Unavailable</span><br><span class="range-subtext">${minYear}–${maxYear}</span>`;
        }
        row.appendChild(cell);
      }
    });

    tableBody.appendChild(row);
  });

  comparisonSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Helper to extract wage value and actual percentile from data
function getWageValueAndPct(dataset, year, key, defaultPctVal) {
  if (!dataset || !dataset[year] || !dataset[year][key]) {
    return { val: null, pct: defaultPctVal };
  }
  const entry = dataset[year][key];
  if (typeof entry === 'object' && entry !== null && 'val' in entry) {
    return { val: entry.val, pct: entry.pct };
  }
  return { val: Number(entry), pct: defaultPctVal };
}

// Math calculation handler
function performCalculation(amount, baseYear, targetYear, measure, baseline, relative = false) {
  let baseIndex, targetIndex;
  let minYear, maxYear;
  let isLabor = false;

  const baselineData = getBaselineDataset(baseline);

  if (measure === 'none') {
    const range = getBaselineRange(baseline);
    minYear = range.min; maxYear = range.max;
    baseIndex = baselineData[baseYear];
    targetIndex = baselineData[targetYear];
  } else {
    isLabor = true;
    if (measure === 'individual-median') {
      minYear = 1974; maxYear = 2024;
      baseIndex = individualIncomeData[baseYear];
      targetIndex = individualIncomeData[targetYear];
    } else if (measure.startsWith('household-')) {
      minYear = 1967; maxYear = 2024;
      const percentileStr = measure.split('-')[1];
      const percentileKey = percentileStr + 'th';
      baseIndex = householdIncomeData[baseYear] ? householdIncomeData[baseYear][percentileKey] : null;
      targetIndex = householdIncomeData[targetYear] ? householdIncomeData[targetYear][percentileKey] : null;
    } else if (measure.startsWith('epi-hr-')) {
      minYear = 1973; maxYear = 2025;
      const percentileStr = measure.split('-')[2];
      const percentileKey = percentileStr + 'th';
      const baseInfo = getWageValueAndPct(epiHourlyData, baseYear, percentileKey, parseFloat(percentileStr));
      const targetInfo = getWageValueAndPct(epiHourlyData, targetYear, percentileKey, parseFloat(percentileStr));
      baseIndex = baseInfo.val;
      targetIndex = targetInfo.val;
    } else if (measure.startsWith('ssa-w2-')) {
      minYear = 1991; maxYear = 2023;
      const percentileStr = measure.split('-')[2];
      const percentileKey = percentileStr + 'th';
      const baseInfo = getWageValueAndPct(ssaW2Data, baseYear, percentileKey, parseFloat(percentileStr));
      const targetInfo = getWageValueAndPct(ssaW2Data, targetYear, percentileKey, parseFloat(percentileStr));
      baseIndex = baseInfo.val;
      targetIndex = targetInfo.val;
    } else if (measure.startsWith('census-ind-all-')) {
      minYear = 1967; maxYear = 2024;
      const percentileStr = measure.split('-')[3];
      const percentileKey = percentileStr + 'th';
      const baseInfo = getWageValueAndPct(censusIndividualAllData, baseYear, percentileKey, parseFloat(percentileStr));
      const targetInfo = getWageValueAndPct(censusIndividualAllData, targetYear, percentileKey, parseFloat(percentileStr));
      baseIndex = baseInfo.val;
      targetIndex = targetInfo.val;
    } else if (measure.startsWith('census-ind-ft-')) {
      minYear = 1967; maxYear = 2024;
      const percentileStr = measure.split('-')[3];
      const percentileKey = percentileStr + 'th';
      const baseInfo = getWageValueAndPct(censusIndividualFtData, baseYear, percentileKey, parseFloat(percentileStr));
      const targetInfo = getWageValueAndPct(censusIndividualFtData, targetYear, percentileKey, parseFloat(percentileStr));
      baseIndex = baseInfo.val;
      targetIndex = targetInfo.val;
    }
  }

  // Check data availability for the selected years
  if (baseIndex === undefined || targetIndex === undefined || baseIndex === null || targetIndex === null) {
    return {
      hasData: false,
      minYear,
      maxYear,
      errorMsg: `The selected measure "${getMeasureName(measure)}" only has data from ${minYear} to ${maxYear}.`
    };
  }

  let targetValue, pctChange;
  let baseCpi = null, targetCpi = null;
  let finalBaseWage = baseIndex;
  let finalTargetWage = targetIndex;
  let loanBaseDetails = { multiplier: 1.0, pi: 0, projected: false };
  let loanTargetDetails = { multiplier: 1.0, pi: 0, projected: false };

  if (!isLabor) {
    // Standard nominal price inflation calculation
    targetValue = amount * (targetIndex / baseIndex);
    pctChange = ((targetIndex - baseIndex) / baseIndex) * 100;
  } else {
    baseCpi = baselineData[baseYear];
    targetCpi = baselineData[targetYear];

    // Check baseline bounds
    if (baseCpi === undefined || targetCpi === undefined || baseCpi === null || targetCpi === null) {
      const baselineRange = getBaselineRange(baseline);
      return {
        hasData: false,
        minYear: Math.max(minYear, baselineRange.min),
        maxYear: Math.min(maxYear, baselineRange.max),
        errorMsg: `The active inflation baseline "${getBaselineName(baseline)}" only has data from ${baselineRange.min} to ${baselineRange.max}.`
      };
    }

    // Apply Higher Education Cost Adjustment if checked
    const adjustEducation = document.getElementById('adjust-education').checked;
    if (adjustEducation) {
      const W = parseFloat(document.getElementById('working-years').value) || 44;
      const Y = parseFloat(document.getElementById('lost-years').value) || 4;

      const baseEdu = educationCostsData[baseYear];
      const targetEdu = educationCostsData[targetYear];

      if (baseEdu && targetEdu) {
        const cpi2024 = baselineData[2024];

        if (cpi2024) {
          // Calculate student loan multipliers if financing is checked
          const loanFinance = document.getElementById('loan-finance').checked;
          if (loanFinance) {
            const r = (parseFloat(document.getElementById('loan-rate').value) || 5.0) / 100;
            const N = parseInt(document.getElementById('loan-term').value) || 10;
            loanBaseDetails = calculateLoanDetails(baseYear, r, N, baselineData, baseCpi);
            loanTargetDetails = calculateLoanDetails(targetYear, r, N, baselineData, targetCpi);
          }

          // Apply interest multiplier to tuition
          const baseTuition = baseEdu.total_tuition_real * loanBaseDetails.multiplier;
          const targetTuition = targetEdu.total_tuition_real * loanTargetDetails.multiplier;

          // Convert 2024 constant tuition to nominal base/target tuition
          const baseNominalTuition = baseTuition * (baseCpi / cpi2024);
          const targetNominalTuition = targetTuition * (targetCpi / cpi2024);

          let baseTuitionBurden = baseNominalTuition / (W - Y);
          let targetTuitionBurden = targetNominalTuition / (W - Y);

          if (measure.startsWith('epi-hr-')) {
            baseTuitionBurden /= 2080;
            targetTuitionBurden /= 2080;
          }

          // Apply Net Adjusted Wage Index formula:
          finalBaseWage = baseIndex * (1 - baseEdu.graduation_rate * (Y / W)) - baseEdu.graduation_rate * baseTuitionBurden;
          finalTargetWage = targetIndex * (1 - targetEdu.graduation_rate * (Y / W)) - targetEdu.graduation_rate * targetTuitionBurden;

          if (finalBaseWage <= 0) finalBaseWage = 0.01;
          if (finalTargetWage <= 0) finalTargetWage = 0.01;
        }
      }
    }

    // Labor-effort calculations
    targetValue = amount * (targetCpi / baseCpi) * (finalBaseWage / finalTargetWage);
    const hoursRatio = (targetCpi / baseCpi) * (finalBaseWage / finalTargetWage);
    pctChange = (hoursRatio - 1) * 100;
  }

  return {
    targetValue,
    pctChange,
    baseIndex,
    targetIndex,
    baseCpi,
    targetCpi,
    finalBaseWage,
    finalTargetWage,
    loanBaseDetails,
    loanTargetDetails,
    hasData: true
  };
}

// Get min/max years of baselines
function getBaselineRange(baseline) {
  switch (baseline) {
    case 'cpi-u': return { min: 1913, max: 2026 };
    case 'chained-cpi': return { min: 1999, max: 2026 };
    case 'cpiw': return { min: 1913, max: 2026 };
    case 'core-cpi': return { min: 1957, max: 2026 };
    default: return { min: 1913, max: 2026 };
  }
}

// Helper to get baseline display names
function getBaselineName(baseline) {
  switch (baseline) {
    case 'cpi-u': return 'CPI-U (Traditional)';
    case 'chained-cpi': return 'Chained CPI-U';
    case 'cpiw': return 'CPI-W (COLA)';
    case 'core-cpi': return 'Core CPI';
    default: return baseline;
  }
}

// Helper to get user-friendly measure names
function getMeasureName(measure) {
  if (measure.startsWith('epi-hr-')) {
    const pct = measure.split('-')[2];
    return `EPI Hourly Wage (${pct}th Percentile)`;
  }
  if (measure.startsWith('ssa-w2-')) {
    const pct = measure.split('-')[2];
    return `SSA W-2 Earnings (${pct}th Percentile)`;
  }
  if (measure.startsWith('census-ind-all-')) {
    const pct = measure.split('-')[3];
    return `Census Individual All Workers (${pct}th Percentile)`;
  }
  if (measure.startsWith('census-ind-ft-')) {
    const pct = measure.split('-')[3];
    return `Census Individual FT Workers (${pct}th Percentile)`;
  }

  switch (measure) {
    case 'none': return 'Price Inflation (CPI)';
    case 'individual-median': return 'Individual Median Income';
    case 'household-20': return 'Household Income (20th Percentile)';
    case 'household-40': return 'Household Income (40th Percentile)';
    case 'household-60': return 'Household Income (60th Percentile)';
    case 'household-80': return 'Household Income (80th Percentile)';
    case 'all': return 'All Median / Middle-Tier Labor Measures';
    default: return measure;
  }
}

// Calculate the real debt burden multiplier and details by discounting payments at average inflation rate
function calculateLoanDetails(year, r, N, baselineData, startCpi) {
  if (r <= 0) return { multiplier: 1.0, pi: 0, projected: false };

  // Find CPI at year + N
  let endCpi = baselineData[year + N];
  let projected = false;

  if (endCpi === undefined || endCpi === null) {
    projected = true;
    const maxAvailableYear = 2026;
    const cpiMax = baselineData[maxAvailableYear];
    if (year <= maxAvailableYear) {
      const yearsAvail = maxAvailableYear - year;
      endCpi = cpiMax * Math.pow(1.0288, N - yearsAvail);
    } else {
      endCpi = startCpi * Math.pow(1.0288, N);
    }
  }

  // Calculate average annual inflation rate pi
  const pi = Math.pow(endCpi / startCpi, 1 / N) - 1;

  // Calculate nominal annuity
  const annuity = (r * Math.pow(1 + r, N)) / (Math.pow(1 + r, N) - 1);

  // Calculate discount factor using pi
  let discountFactor;
  if (Math.abs(pi) < 0.0001) {
    discountFactor = N;
  } else {
    discountFactor = (1 - Math.pow(1 + pi, -N)) / pi;
  }

  const multiplier = annuity * discountFactor;
  return { multiplier, pi, projected };
}

// Modal open handler
function openMethodologyModal(id) {
  const modal = document.getElementById('methodology-modal');
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');

  if (!modal || !title || !body) return;

  if (id === 'info-labor-effort') {
    title.textContent = "Methodology: Labor-Effort & Net Real Earnings";
    body.innerHTML = `
      <h2>1. The Worker's Perspective: Purchasing Power in Work Hours</h2>
      <p>Standard price calculators measure inflation by tracking how many dollars are needed to buy a basket of goods over time. While useful, this does not represent the experience of the individual worker.</p>
      <p>To measure the real cost of living from the perspective of the worker, we evaluate <strong>labor-effort (work hours)</strong>:</p>
      <ul>
        <li>If an item costs $100 in nominal dollars and a worker earns $10 per hour, buying that item requires <strong>10 hours of work</strong>.</li>
        <li>If in a later year the item costs $200 but the worker's wage has risen to $40 per hour, buying that item now requires only <strong>5 hours of work</strong>.</li>
        <li>Even though the price doubled (+100%), the real labor-effort required to purchase it was <strong>cut in half (-50%)</strong>. The item has become "cheaper" in terms of labor-effort.</li>
      </ul>
      <p>By comparing the rate of price inflation directly against the rate of wage growth, this calculator maps changes in the actual work-hours needed to buy goods.</p>
      <p>To convert a base amount of dollars in a Base Year to its labor-effort equivalent in a Target Year, the calculator evaluates the active inflation baseline (CPI) and the chosen wage index:</p>
      <div class="formula-block">
        Target Value = Base Amount &times; (CPI<sub>Target</sub> / CPI<sub>Base</sub>) &times; (Wage<sub>Base</sub> / Wage<sub>Target</sub>)
      </div>
      <hr>
      <h2>2. Data Foundations</h2>
      <p>Wages are sourced from reputable national historical distributions. When comparing datasets, pay close attention to <strong>worker type composition</strong>:</p>
      <ul>
        <li><strong>SSA W-2 Net Compensation</strong>: Sourced from U.S. Social Security Administration (SSA) Net Compensation Distributions (1991–2023). Tracks taxable W-2 compensation percentiles (20th to 95th) from official IRS tax records. Excludes non-labor cash inflows. <em>(Derived via linear CDF interpolation across binned tax brackets)</em>.</li>
        <li><strong>Census Individual Income (Full-Time, Year-Round)</strong>: Sourced from U.S. Census Bureau CPS ASEC Table P-38 (1967–2024). Tracks median annual earnings for full-time career workers (35+ hours/week, 50–52 weeks/year). Isolates stable full-time labor income and excludes non-labor cash inflows. <em>(Direct published medians)</em>.</li>
        <li><strong>Census Individual Income (All Workers)</strong>: Sourced from U.S. Census Bureau CPS ASEC Table P-54 (1967–2024). Tracks <em>Total Individual Money Income</em> percentiles (20th to 80th). Combines pre-tax wages plus non-labor cash inflows (Social Security, pensions, disability, unemployment, welfare, interest) for a single individual. Includes part-time, seasonal, and non-working individuals. <em>(Derived via linear CDF interpolation across binned income brackets)</em>.</li>
        <li><strong>Census Household Income</strong>: Sourced from U.S. Census Bureau CPS ASEC Table H-1 (1967–2024). Tracks <em>Total Household Money Income</em> percentiles (20th to 80th). Combines pre-tax wages plus non-labor cash inflows (Social Security, pensions, disability, unemployment, welfare, interest) aggregated across all resident members of the household unit. Includes retired, unemployed, and non-working household units. <em>(Direct published quintile limits)</em>.</li>
        <li><strong>EPI Hourly Wages</strong>: Sourced from Economic Policy Institute (EPI) State of Working America Data Library (1973–2025). Tracks nominal wage rates per hour (deciles 10th to 90th) extracted from BLS CPS microdata. Unaffected by hours-worked variations and excludes non-labor cash inflows. <em>(Direct published deciles)</em>.</li>
        <li><strong>Individual Median Income (Legacy FRED)</strong>: Sourced from Federal Reserve Bank of St. Louis (FRED Series <code>MEPAINUSA646N</code>, 1974–2024), representing the legacy median individual income baseline.</li>
      </ul>
      <p><strong>Money Income vs. Pure Labor Compensation</strong>: Census Household (H-1) and Individual All Workers (P-54) measure Total Pre-Tax Money Income (wages plus non-labor cash inflows: Social Security, pensions, disability, unemployment, welfare, interest). In contrast, Census Full-Time (P-38), SSA W-2 earnings, and EPI hourly wages measure Pure Labor Compensation (wages, salaries, net self-employment).</p>
      <p><strong>Percentile Derivation Note</strong>: While EPI Hourly, Census Full-Time (P-38), Census Household (H-1), and FRED series are published directly as exact percentile dollar amounts, both SSA W-2 earnings and Census Individual All Workers (P-54) are published as binned frequency distributions. For SSA and P-54, we applied <strong>linear interpolation across Cumulative Distribution Functions (CDFs)</strong> of the bounding brackets to extract estimated 20th, 40th, 50th, 60th, and 80th percentile threshold values. Furthermore, since Table P-54 is published in constant 2024 dollars, its interpolated values are converted back into historical nominal dollars for each respective year using the baseline CPI deflator, preventing inflation double-adjustments.</p>
    `;
  } else if (id === 'info-edu-adjustment') {
    title.textContent = "Methodology: Higher Education Cost Adjustments";
    body.innerHTML = `
      <h2>1. Core Concept: Time & Capital Cost Amortization</h2>
      <p>Observed wage increases over time are correlated with a more educated workforce. However, acquiring that education requires substantial upfront commitments. To calculate the net wages of the population, we account for both the working years lost (opportunity cost) and the direct capital costs of college (tuition and fees after expected scholarships and grant aid). These lifetime expenses are amortized (spread out) across a worker's expected career years and weighted by the proportion of the population that graduated college.</p>
      <hr>
      <h2>2. Net Wage Formula ("The Why")</h2>
      <p>To calculate the population-wide net wage impact of the economic cost of college for a given percentile/benchmark, we divide the workforce into two cohorts for each year: those with a college degree (proportion <strong>P</strong>, representing the percent of adults 25+ in that year with a college degree) and those without (proportion <strong>1 - P</strong>).</p>
      <p><strong>Simplifying Assumption</strong>: We treat this cohort split the same across all labor benchmarks (such as the 20th or 80th percentiles). We assume the percentage of college graduates is evenly distributed across these income percentiles. This results in over-estimating the cost of college on the lowest income tiers and under-estimating the impact on the highest income tiers.</p>
      <p>We first calculate the net adjusted wage for an individual in the college graduate cohort (Wage<sub>Grad Cohort</sub>) by accounting for foregone earning years Y<sub>lost</sub> (default is 4 years) out of expected lifetime working years W (default is 44 years) and direct 4-year tuition capital expenses C<sub>Nominal</sub> (after expected scholarships and grant aid) amortized over remaining working career years (W - Y<sub>lost</sub>):</p>
      <div class="formula-block">
        Wage<sub>Grad Cohort</sub> = Wage &times; (1 - Y<sub>lost</sub> / W) - C<sub>Nominal</sub> / (W - Y<sub>lost</sub>)
      </div>
      <p>Then, the final population-weighted net wage (Wage<sub>Nominal Adjusted</sub>) is computed as the weighted sum of the two cohorts by blending the graduate cohort wage with the baseline non-college wage (Wage):</p>
      <div class="formula-block">
        Wage<sub>Nominal Adjusted</sub> = P &times; Wage<sub>Grad Cohort</sub> + (1 - P) &times; Wage
      </div>
      <h3>Simplified Execution Form:</h3>
      <p>Substituting the grad cohort formula into the weighted sum and grouping terms yields the simplified, single-line equation executed by the calculator:</p>
      <div class="formula-block">
        Wage<sub>Nominal Adjusted</sub> = Wage &times; (1 - P &times; Y<sub>lost</sub> / W) - P &times; C<sub>Nominal</sub> / (W - Y<sub>lost</sub>)
      </div>
      <h3>How the Wage Reductions are Structured:</h3>
      <ul>
        <li><strong>For the Non-College Cohort</strong> (proportion 1 - P): No adjustments are made to their wages, as they did not incur tuition or lose career working years.</li>
        <li><strong>For the College Graduate Cohort</strong> (proportion P):
          <ul>
            <li><strong>Opportunity Cost Reduction</strong>: The worker loses Y<sub>lost</sub> years of earning potential out of an expected lifetime working career of W years. This compresses their working hours, reducing their lifetime earning potential by the fraction Y<sub>lost</sub> / W (default is 4 / 44 &approx; 9.1%).</li>
            <li><strong>Direct Capital Cost Reduction</strong>: The worker pays a total nominal tuition cost of C<sub>Nominal</sub> (plus interest if financed). This capital cost is amortized evenly across the expected remaining working years in their career (W - Y<sub>lost</sub>, default is 44 - 4 = 40 years), reducing their annual earnings by the fraction C<sub>Nominal</sub> / (W - Y<sub>lost</sub>).</li>
          </ul>
        </li>
        <li><strong>Blending the Cohorts</strong>: By multiplying both the opportunity cost reduction and the direct capital cost reduction by the historical college graduation rate P, the formula blends the two cohorts together to calculate the population-wide net wage for the selected percentile/benchmark.</li>
      </ul>
      <hr>
      <h2>3. Direct Capital Costs & Tuition Pricing</h2>
      <p>Tuition costs represent the out-of-pocket tuition expenses for a 4-year undergraduate degree:</p>
      <ul>
        <li><strong>Tuition after Aid vs. Sticker Price</strong>: Rather than published sticker prices, the model utilizes <strong>average annual tuition and fees after expected scholarships and grant aid</strong> (subtracting average grants, scholarships, and tax credits that do not need to be repaid) sourced from the College Board. This avoids upward price bias.</li>
        <li><strong>Exclusion of Room & Board</strong>: The model intentionally excludes room and board expenses because housing and food are universal living costs incurred by all individuals regardless of whether they attend college. Including room and board would artificially inflate the lifetime expenses of college students beyond the actual incremental cost increase unique to higher education.</li>
        <li><strong>Unit Conversions (Hourly vs. Annual)</strong>: When evaluating hourly wage measures (such as EPI Hourly), annual amortized college costs are converted into an hourly equivalent by dividing by <strong>2,080 annual working hours</strong> (40 hours/week &times; 52 weeks).</li>
        <li><strong>Source Data</strong>: Sourced from the U.S. National Center for Education Statistics (NCES) and the College Board.</li>
      </ul>
      <hr>
      <h2>4. Student Loan Interest & Real Debt Discounting</h2>
      <p>If <strong>Finance Tuition with Student Loans</strong> is checked, the direct tuition cost is scaled by the real principal + interest repayment multiplier M<sub>Real</sub> to account for the fact that future nominal payments are eroded by inflation during the repayment term:</p>
      <div class="formula-block">
        C<sub>Nominal, Adjusted</sub> = C<sub>Nominal</sub> &times; M<sub>Real</sub>
      </div>
      <p>where M<sub>Real</sub> represents the real value of the debt payments (deflated to base/target year dollars) by discounting the nominal annuity payments at the average annual inflation rate (&pi;) experienced over the N-year repayment term:</p>
      <div class="formula-block">
        M<sub>Real</sub> = [ r(1+r)<sup>N</sup> / ((1+r)<sup>N</sup> - 1) ] &times; [ (1 - (1 + &pi;)<sup>-N</sup>) / &pi; ]
      </div>
      <p>If &pi; = 0 (no inflation), the multiplier simplifies to the nominal multiplier:</p>
      <div class="formula-block">
        M<sub>Real</sub> = N &times; [ r(1+r)<sup>N</sup> / ((1+r)<sup>N</sup> - 1) ]
      </div>
      <h3>Calculating the Repayment Inflation Rate (&pi;):</h3>
      <ul>
        <li><strong>Historical Years</strong>: Calculated from actual CPI index changes over the N-year repayment period starting in Year X:
          <div class="formula-block" style="display:inline-block; margin: 0.5rem 0;">&pi; = (CPI<sub>X+N</sub> / CPI<sub>X</sub>)<sup>1/N</sup> - 1</div>
        </li>
        <li><strong>Future Years</strong>: We use the actual CPI up to the end of our dataset (2026) and project a constant <strong>2.88%</strong> annual inflation rate (the calmed post-1983 historical average inflation rate) for the remaining years of the repayment term.</li>
        <li><strong>Subsidized Direct Loan assumption</strong>: We assume the student utilizes federal Direct Subsidized loans, meaning interest does not accumulate during the 4 years of study. Compounding begins upon graduation and continues through the N-year repayment term (defaulting to the standard repayment term of 10 years).</li>
      </ul>
    `;
  }

  modal.classList.remove('hidden');
}

function closeMethodologyModal() {
  const modal = document.getElementById('methodology-modal');
  if (modal) modal.classList.add('hidden');
}
