const state = {
    tariffs: null,
    period: 'year', // 'month' or 'year'
    clientType: 'new', // 'new' or 'existing'
    selectedPlan: 'optimal',
    docs: {
        waybills: 0,
        edi: 0,
        yuzdo: 0
    },
    addons: {
        cross_border: {},
        additional_services: {},
        mobile_id: {},
        pro_features: {},
        tech_support: 'basic'
    }
};

const formatPrice = (price) => parseFloat(price).toFixed(2);

document.addEventListener('DOMContentLoaded', initApp);

// Global error handler for better diagnostics
window.onerror = function(message, source, lineno, colno, error) {
    const loadingElem = document.getElementById('loading');
    if (loadingElem) {
        loadingElem.innerHTML = `<p style="color:red; background:white; padding:10px; border:2px solid red;">
            <b>Критическая ошибка JS:</b><br>${message}<br>
            <small>Line: ${lineno}, Col: ${colno}</small>
        </p>`;
    }
    return false;
};

async function initApp() {
    console.log("Initializing app...");
    const loadingElem = document.getElementById('loading');
    
    try {
        console.log("Fetching ctt_tariffs.json...");
        const response = await fetch('ctt_tariffs.json');
        
        if (!response.ok) {
            throw new Error(`Не удалось загрузить ctt_tariffs.json (Статус: ${response.status}). 
            Убедитесь, что файл находится в той же папке и вы используете локальный сервер (CORS).`);
        }
        
        state.tariffs = await response.json();
        console.log("Tariffs loaded:", state.tariffs);
        
        if (!state.tariffs.base_plans) {
            throw new Error("Неверная структура JSON: отсутствует поле base_plans.");
        }

        document.getElementById('loading').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        document.getElementById('vat-notice').textContent = state.tariffs.meta.vat_notice;
        
        setupEventListeners();
        renderPlans();
        renderAddons();
        updateCalculations();
        console.log("App ready.");
    } catch (err) {
        console.error("Initialization error:", err);
        loadingElem.innerHTML = `<div style="color:red; background:white; padding:20px; border:1px solid red; border-radius:8px; max-width:400px; text-align:left;">
            <h3 style="margin-top:0">Ошибка инициализации</h3>
            <p>${err.message}</p>
            <p style="font-size:0.8rem; color:#666; margin-top:10px;">
                <b>Подсказка:</b> Если вы открываете файл напрямую (через двойной клик), 
                браузер может блокировать загрузку данных. Используйте VS Code Live Server или другой веб-сервер.
            </p>
        </div>`;
    }
}

function setupEventListeners() {
    document.querySelectorAll('input[name="period"]').forEach(r => {
        r.addEventListener('change', (e) => {
            state.period = e.target.value;
            renderPlans(); 
            updateCalculations();
        });
    });

    document.querySelectorAll('input[name="client_type"]').forEach(r => {
        r.addEventListener('change', (e) => {
            state.clientType = e.target.value;
            validatePlanSelection();
            renderPlans();
            updateCalculations();
        });
    });

    ['waybills', 'edi', 'yuzdo'].forEach(docType => {
        const slider = document.getElementById(`slider-${docType}`);
        const input = document.getElementById(`input-${docType}`);
        
        const sync = (val) => {
            val = parseInt(val) || 0;
            if(val > 1000000) val = 1000000;
            slider.value = Math.min(val, 5000); 
            input.value = val;
            state.docs[docType] = val;
            updateCalculations();
        };

        slider.addEventListener('input', (e) => sync(e.target.value));
        input.addEventListener('input', (e) => sync(e.target.value));
    });
    
    document.getElementById('btn-export').addEventListener('click', generatePDF);
}

function validatePlanSelection() {
    const currentPlanConfig = state.tariffs.base_plans[state.selectedPlan];
    if (currentPlanConfig && currentPlanConfig.target === 'new_only' && state.clientType === 'existing') {
        const allowedPlans = Object.keys(state.tariffs.base_plans).filter(k => state.tariffs.base_plans[k].target === 'all');
        state.selectedPlan = allowedPlans.includes('comfort') ? 'comfort' : allowedPlans[0];
    }
}

function renderPlans() {
    const container = document.getElementById('plans-container');
    container.innerHTML = '';

    const plans = state.tariffs.base_plans;
    
    for (const [id, plan] of Object.entries(plans)) {
        const isNewOnly = plan.target === 'new_only';
        const isDisabled = isNewOnly && state.clientType === 'existing';
        
        let priceToDisplay = state.period === 'year' ? (plan.price_year_promo / 12) : plan.price_month;

        const card = document.createElement('div');
        card.className = `plan-card ${isDisabled ? 'disabled' : ''} ${state.selectedPlan === id ? 'active' : ''}`;
        
        if(!isDisabled) {
            card.addEventListener('click', () => {
                state.selectedPlan = id;
                // Once user manually selects, we stop auto-selection? 
                // Or maybe we keep recommending. Let's just update for now.
                renderPlans();
                updateCalculations();
            });
        }

        let includesHtml = '';
        if (plan.included.waybills) includesHtml += `Накладные: ${plan.included.waybills} шт<br>`;
        if (plan.included.yuzdo) includesHtml += `ЮЗДО: ${plan.included.yuzdo} шт<br>`;
        if (plan.included.incoming === 'unlimited') includesHtml += `Входящие: безлимит<br>`;

        card.innerHTML = `
            <div class="plan-name">${plan.name}</div>
            <div class="plan-price">${formatPrice(priceToDisplay)} <span>BYN / мес</span></div>
            ${state.period === 'year' ? `<div style="font-size:0.8rem; color:var(--accent);">Оплата за год: ${formatPrice(plan.price_year_promo)} BYN</div>` : ''}
            <div class="plan-includes">${includesHtml}</div>
        `;
        container.appendChild(card);
    }
}

function createAddonRow(title, desc, controlHtml) {
    return `
        <div class="addon-row">
            <div class="addon-info">
                <h3>${title}</h3>
                <p>${desc}</p>
            </div>
            <div class="addon-control">
                ${controlHtml}
            </div>
        </div>
    `;
}

function renderAddons() {
    const container = document.getElementById('addons-container');
    let html = '';

    // Tech Support
    html += `<h3>Техническая поддержка</h3>`;
    let supportControls = '<div class="radio-switcher">';
    for (const [id, details] of Object.entries(state.tariffs.tech_support)) {
        supportControls += `
            <input type="radio" id="ts-${id}" name="tech_support" value="${id}" ${state.addons.tech_support === id ? 'checked' : ''}>
            <label for="ts-${id}">${details.name} (+${details.price} BYN)</label>
        `;
    }
    supportControls += '</div>';
    html += createAddonRow('Уровень поддержки', 'Абонентская плата в месяц', supportControls);

    // Cross Border
    html += `<h3 style="margin-top:1rem;">Трансграничный ЭДО (Россия)</h3>`;
    ['tedi', 'tedo'].forEach(type => {
        let options = `<option value="0">Не выбрано</option>`;
        state.tariffs.cross_border_packages[type].forEach(pkg => {
            options += `<option value="${pkg.amount}">Пакет ${pkg.amount} шт (${pkg.price} BYN)</option>`;
        });
        const selectId = `cross-border-${type}`;
        html += createAddonRow(type === 'tedi' ? 'Входящие (TEDI)' : 'Исходящие (TEDO)', 'Пакеты сообщений в месяц', `<select id="${selectId}" onchange="updateAddonState('cross_border', '${type}', this.value)">${options}</select>`);
    });

    // Mobile ID
    html += `<h3 style="margin-top:1rem;">Услуги Mobile ID</h3>`;
    for (const [id, details] of Object.entries(state.tariffs.mobile_id)) {
        html += createAddonRow(
            id === 'auth' ? 'Аутентификация' : 'Подписание', 
            `${details.price} BYN за ${details.unit}`, 
            `<input type="number" min="0" value="0" style="width:80px;" onchange="updateAddonState('mobile_id', '${id}', this.value)">`
        );
    }

    // Pro Features
    html += `<h3 style="margin-top:1rem;">Pro-функционал (подписка)</h3>`;
    for (const [id, details] of Object.entries(state.tariffs.pro_features)) {
        html += createAddonRow(
            id.replace('pro_', 'PRO '), 
            `${details.price} BYN ${details.unit}`, 
            `<input type="checkbox" style="width:20px;height:20px;" onchange="updateAddonState('pro_features', '${id}', this.checked ? 1 : 0)">`
        );
    }

    // Additional Services
    html += `<h3 style="margin-top:1rem;">Разовые и дополнительные услуги</h3>`;
    for (const [id, details] of Object.entries(state.tariffs.additional_services)) {
        html += createAddonRow(
            details.name, 
            `${details.price} BYN за ${details.unit}`, 
            `<input type="number" min="0" value="0" style="width:80px;" onchange="updateAddonState('additional_services', '${id}', this.value)">`
        );
    }

    container.innerHTML = html;

    // Attach listener to newly created tech support radios
    document.querySelectorAll('input[name="tech_support"]').forEach(r => {
        r.addEventListener('change', (e) => {
            state.addons.tech_support = e.target.value;
            updateCalculations();
        });
    });
}

window.updateAddonState = function(category, key, value) {
    state.addons[category][key] = parseFloat(value) || 0;
    updateCalculations();
}

function calculateOptimalDocCost(docType, amount, totalAmountForTier) {
    if (amount <= 0) return { cost: 0, desc: '' };

    const packages = state.tariffs.document_packages[docType] || [];
    const brackets = state.tariffs.piece_rate_brackets;
    let rateKey = docType === 'waybills' ? 'ettn' : docType;

    // Helper: Progressive piece rate calculation
    const getPiecesCost = (qty) => {
        if (qty <= 0) return 0;
        let cost = 0;
        let remaining = qty;
        
        for (const bracket of brackets) {
            const bracketSize = bracket.max - bracket.min + 1;
            const applicable = Math.min(remaining, bracketSize);
            const rate = bracket.rates[rateKey] || 0;
            
            cost += applicable * rate;
            remaining -= applicable;
            if (remaining <= 0) break;
        }
        
        // Handle overflow if any
        if (remaining > 0) {
            const lastRate = brackets[brackets.length - 1].rates[rateKey] || 0;
            cost += remaining * lastRate;
        }
        return cost;
    };

    // Optimization logic: Try all package combinations
    // Since packages are small in count, we can do a simple recursive or iterative approach
    const sortedPkgs = [...packages].sort((a, b) => b.amount - a.amount);
    
    let bestResult = { cost: getPiecesCost(amount), desc: `${amount} шт (поштучно)` };

    // Simple combinations: try taking N of each package
    // For performance, we limit to reasonable counts
    for (const pkg of sortedPkgs) {
        // Option: Take one or more of this package
        for (let count = 1; count <= Math.ceil(amount / pkg.amount); count++) {
            let pkgTotalAmt = count * pkg.amount;
            let pkgTotalCost = count * pkg.price;
            let remaining = Math.max(0, amount - pkgTotalAmt);
            let total = pkgTotalCost + getPiecesCost(remaining);
            
            if (total < bestResult.cost) {
                bestResult = {
                    cost: total,
                    desc: `${count}x${pkg.amount}шт + ${remaining} поштучно`
                };
            }
        }
    }

    return bestResult;
}

function updateCalculations() {
    const breakdown = [];
    let totalMonthly = 0; 
    let totalYearly = 0; 

    // 1. Base Plan
    const plan = state.tariffs.base_plans[state.selectedPlan];
    if (state.period === 'year') {
        totalYearly += plan.price_year_promo;
        breakdown.push({ name: `Тариф "${plan.name}" (Год)`, price: plan.price_year_promo });
    } else {
        totalMonthly += plan.price_month;
        breakdown.push({ name: `Тариф "${plan.name}" (Мес)`, price: plan.price_month });
    }

    // 2. Docs (Monthly cost)
    const docNames = { waybills: 'Эл. накладные', edi: 'EDI-сообщения', yuzdo: 'ЮЗДО' };
    for (const [docKey, docName] of Object.entries(docNames)) {
        const inputAmount = state.docs[docKey] || 0;
        if (inputAmount === 0) continue;
        
        const included = plan.included[docKey] || 0;
        let billableAmount = Math.max(0, inputAmount - included);
        
        if (billableAmount > 0) {
            const opt = calculateOptimalDocCost(docKey, billableAmount, inputAmount);
            if (opt.cost > 0) {
                totalMonthly += opt.cost;
                breakdown.push({ name: `${docName} (${opt.desc})`, price: opt.cost });
            }
        }
    }

    // 3. Tech Support (Monthly)
    if (state.addons.tech_support && state.addons.tech_support !== 'basic') {
        const tsPrice = state.tariffs.tech_support[state.addons.tech_support].price;
        if (tsPrice > 0) {
            totalMonthly += tsPrice;
            breakdown.push({ name: `Поддержка: ${state.tariffs.tech_support[state.addons.tech_support].name}`, price: tsPrice });
        }
    }

    // 4. Cross Border (Monthly)
    for (const [type, amount] of Object.entries(state.addons.cross_border)) {
        if (amount > 0) {
            const pkg = state.tariffs.cross_border_packages[type].find(p => p.amount == amount);
            if (pkg) {
                totalMonthly += pkg.price;
                breakdown.push({ name: `Пакет ${type.toUpperCase()} ${amount}шт`, price: pkg.price });
            }
        }
    }

    // 5. Pro Features (Monthly)
    for (const [id, count] of Object.entries(state.addons.pro_features)) {
        if (count > 0) {
            const price = state.tariffs.pro_features[id].price;
            totalMonthly += price;
            breakdown.push({ name: `Опция ${id.replace('pro_', 'PRO ')}`, price: price });
        }
    }

    // 6. Mobile ID (Monthly)
    for (const [id, count] of Object.entries(state.addons.mobile_id)) {
        if (count > 0) {
            const price = state.tariffs.mobile_id[id].price * count;
            totalMonthly += price;
            breakdown.push({ name: `Mobile ID: ${id} x${count}`, price: price });
        }
    }

    // 7. Additional Services (One-time, added strictly to total like yearly)
    // Wait, let's treat them as one-time fees added to the current period Grand Total
    for (const [id, count] of Object.entries(state.addons.additional_services)) {
        if (count > 0) {
            const price = state.tariffs.additional_services[id].price * count;
            totalYearly += price; // adding to yearly so it doesn't get x12 if period='year'. it's a one time fee basically.
            breakdown.push({ name: `Доп. услуга: ${state.tariffs.additional_services[id].name}`, price: price });
        }
    }

    // Calculate final value for EACH plan to find the best one
    let bestPlanId = state.selectedPlan;
    let minGrandTotal = Infinity;
    
    const allPlansResults = {};

    for (const planId in state.tariffs.base_plans) {
        const p = state.tariffs.base_plans[planId];
        // Skip plans that are not for existing clients if selected
        if (p.target === 'new_only' && state.clientType === 'existing') continue;

        let pTotalMonthly = 0;
        let pTotalYearly = (state.period === 'year') ? p.price_year_promo : p.price_month;
        
        // Docs
        for (const [docKey, docName] of Object.entries(docNames)) {
            const inputAmount = state.docs[docKey] || 0;
            const included = p.included[docKey] || 0;
            const billable = Math.max(0, inputAmount - included);
            if (billable > 0) {
                pTotalMonthly += calculateOptimalDocCost(docKey, billable, inputAmount).cost;
            }
        }
        
        // Addons (common for all plans)
        let addonsMonthly = 0;
        let addonsYearly = 0;
        
        // Tech Support
        if (state.addons.tech_support !== 'basic') {
            addonsMonthly += state.tariffs.tech_support[state.addons.tech_support].price;
        }
        // Cross Border
        for (const [type, amount] of Object.entries(state.addons.cross_border)) {
            if (amount > 0) {
                const pkg = state.tariffs.cross_border_packages[type].find(p => p.amount == amount);
                if (pkg) addonsMonthly += pkg.price;
            }
        }
        // Pro
        for (const id in state.addons.pro_features) {
            if (state.addons.pro_features[id] > 0) addonsMonthly += state.tariffs.pro_features[id].price;
        }
        // Mobile ID
        for (const id in state.addons.mobile_id) {
            if (state.addons.mobile_id[id] > 0) addonsMonthly += state.tariffs.mobile_id[id].price * state.addons.mobile_id[id];
        }
        // Extra Services
        for (const id in state.addons.additional_services) {
            if (state.addons.additional_services[id] > 0) addonsYearly += state.tariffs.additional_services[id].price * state.addons.additional_services[id];
        }

        let pGrandTotal = (state.period === 'year') ? (pTotalYearly + (addonsYearly) + (pTotalMonthly + addonsMonthly) * 12) : (pTotalYearly + addonsYearly + pTotalMonthly + addonsMonthly);
        
        allPlansResults[planId] = pGrandTotal;
        if (pGrandTotal < minGrandTotal) {
            minGrandTotal = pGrandTotal;
            bestPlanId = planId;
        }
    }

    // Auto-select best plan if it's different and user hasn't locked it?
    // Let's just always recommend/auto-select for now as per logic.md
    if (state.selectedPlan !== bestPlanId) {
        state.selectedPlan = bestPlanId;
        renderPlans(); // re-render to show active
        return updateCalculations(); // restart with new plan
    }

    // UI Update
    const finalGrandTotal = allPlansResults[state.selectedPlan];
    document.getElementById('total-price').textContent = formatPrice(finalGrandTotal);
    document.getElementById('price-notice').textContent = `за ${state.period === 'year' ? 'год' : 'месяц'}, без НДС`;
    
    // Final Breakdown for the selected plan
    const finalBreakdown = [];
    const activePlan = state.tariffs.base_plans[state.selectedPlan];
    const basePriceDetail = (state.period === 'year') ? activePlan.price_year_promo : activePlan.price_month;
    finalBreakdown.push({ name: `Тариф "${activePlan.name}" (${state.period === 'year' ? 'Год' : 'Мес'})`, price: basePriceDetail });

    let currentMonthlyAddons = 0;
    for (const [docKey, docName] of Object.entries(docNames)) {
        const inputAmount = state.docs[docKey] || 0;
        const included = activePlan.included[docKey] || 0;
        const billable = Math.max(0, inputAmount - included);
        if (billable > 0) {
            const opt = calculateOptimalDocCost(docKey, billable, inputAmount);
            currentMonthlyAddons += opt.cost;
            finalBreakdown.push({ name: `${docName} (сверх ${included}шт: ${opt.desc})`, price: opt.cost });
        }
    }

    // Other Monthly Addons
    if (state.addons.tech_support !== 'basic') {
        const p = state.tariffs.tech_support[state.addons.tech_support].price;
        currentMonthlyAddons += p;
        finalBreakdown.push({ name: `Поддержка: ${state.tariffs.tech_support[state.addons.tech_support].name}`, price: p });
    }
    // ... (rest of addons logic for the final list)
    // For brevity, let's just combine the rest
    for (const cat of ['cross_border', 'pro_features', 'mobile_id']) {
        for (const id in state.addons[cat]) {
            if (state.addons[cat][id] > 0) {
                let p = 0;
                let n = '';
                if(cat === 'pro_features') { p = state.tariffs[cat][id].price; n = id.replace('pro_', 'PRO '); }
                if(cat === 'cross_border') { 
                    const pkg = state.tariffs.cross_border_packages[id].find(x => x.amount == state.addons[cat][id]);
                    p = pkg ? pkg.price : 0; n = `Пакет ${id.toUpperCase()} ${state.addons[cat][id]}шт`;
                }
                if(cat === 'mobile_id') { p = state.tariffs[cat][id].price * state.addons[cat][id]; n = `Mobile ID: ${id} x${state.addons[cat][id]}`; }
                
                if (p > 0) {
                    currentMonthlyAddons += p;
                    finalBreakdown.push({ name: n, price: p });
                }
            }
        }
    }

    // One-time
    let oneTimeTotal = 0;
    for (const id in state.addons.additional_services) {
        if (state.addons.additional_services[id] > 0) {
            const p = state.tariffs.additional_services[id].price * state.addons.additional_services[id];
            oneTimeTotal += p;
            finalBreakdown.push({ name: `Доп. услуга: ${state.tariffs.additional_services[id].name}`, price: p });
        }
    }

    if (state.period === 'year' && currentMonthlyAddons > 0) {
         finalBreakdown.push({ name: `<br><b>Ежемесячные услуги за ГОД (*12)</b>`, price: currentMonthlyAddons * 12 });
    }

    const breakdownHTML = finalBreakdown.map(item => {
        if (item.name.includes('<br>')) {
           return `<div class="item" style="border-top:2px solid #e2e8f0; margin-top:10px;"><span class="item-name">${item.name}</span><span class="item-price">${formatPrice(item.price)} BYN</span></div>`;
        }
        return `<div class="item"><span class="item-name">${item.name}</span><span class="item-price">${formatPrice(item.price)} BYN</span></div>`;
    }).join('');
    
    document.getElementById('breakdown-list').innerHTML = breakdownHTML;
}

function generatePDF() {
    const element = document.querySelector('.summary-card');
    const opt = {
      margin:       [0.5, 0.5, 0.5, 0.5],
      filename:     'ctt_tariffs_calc.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
}
