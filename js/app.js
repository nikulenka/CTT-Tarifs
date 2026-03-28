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
window.state = state;

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

        const loadingEl = document.getElementById('loading');
        const appEl = document.getElementById('app');
        if (loadingEl) loadingEl.classList.add('hidden');
        if (appEl) appEl.classList.remove('hidden');
        
        const vatNoticeEl = document.getElementById('vat-notice');
        if (vatNoticeEl && state.tariffs.meta) {
            vatNoticeEl.textContent = state.tariffs.meta.vat_notice;
        }
        
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
            if (slider) slider.value = Math.min(val, 5000); 
            if (input) input.value = val;
            state.docs[docType] = val;
            updateCalculations();
        };

        if (slider) slider.addEventListener('input', (e) => sync(e.target.value));
        if (input) input.addEventListener('input', (e) => sync(e.target.value));
    });
    
    const btnExport = document.getElementById('btn-export');
    if (btnExport) btnExport.addEventListener('click', generatePDF);
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

    const createCategory = (title, content) => {
        return `
            <details class="addon-category">
                <summary>${title}</summary>
                <div class="addon-category-content">
                    ${content}
                </div>
            </details>
        `;
    };

    // Tech Support
    let supportControls = '<div class="radio-switcher">';
    for (const [id, details] of Object.entries(state.tariffs.tech_support)) {
        supportControls += `
            <input type="radio" id="ts-${id}" name="tech_support" value="${id}" ${state.addons.tech_support === id ? 'checked' : ''}>
            <label for="ts-${id}">${details.name} (+${details.price} BYN)</label>
        `;
    }
    supportControls += '</div>';
    html += createCategory('Техническая поддержка', createAddonRow('Уровень поддержки', 'Абонентская плата в месяц', supportControls));

    // Cross Border
    let cbHtml = '';
    ['tedi', 'tedo'].forEach(type => {
        let options = `<option value="0">Не выбрано</option>`;
        state.tariffs.cross_border_packages[type].forEach(pkg => {
            options += `<option value="${pkg.amount}" ${state.addons.cross_border[type] == pkg.amount ? 'selected' : ''}>Пакет ${pkg.amount} шт (${pkg.price} BYN)</option>`;
        });
        const selectId = `cross-border-${type}`;
        cbHtml += createAddonRow(type === 'tedi' ? 'Входящие (TEDI)' : 'Исходящие (TEDO)', 'Пакеты сообщений в месяц', `<select id="${selectId}" onchange="updateAddonState('cross_border', '${type}', this.value)">${options}</select>`);
    });
    html += createCategory('Трансграничный ЭДО (Россия)', cbHtml);

    // Mobile ID
    let midHtml = '';
    for (const [id, details] of Object.entries(state.tariffs.mobile_id)) {
        midHtml += createAddonRow(
            id === 'auth' ? 'Аутентификация' : 'Подписание', 
            `${details.price} BYN за ${details.unit}`, 
            `<input type="number" min="0" value="${state.addons.mobile_id[id] || 0}" style="width:80px;" onchange="updateAddonState('mobile_id', '${id}', this.value)">`
        );
    }
    html += createCategory('Услуги Mobile ID', midHtml);

    // Pro Features
    let proHtml = '';
    for (const [id, details] of Object.entries(state.tariffs.pro_features)) {
        proHtml += createAddonRow(
            id.replace('pro_', 'PRO '), 
            `${details.price} BYN ${details.unit}`, 
            `<input type="checkbox" style="width:20px;height:20px;" ${state.addons.pro_features[id] ? 'checked' : ''} onchange="updateAddonState('pro_features', '${id}', this.checked ? 1 : 0)">`
        );
    }
    html += createCategory('Pro-функционал (подписка)', proHtml);

    // Additional Services
    let extraHtml = '';
    for (const [id, details] of Object.entries(state.tariffs.additional_services)) {
        extraHtml += createAddonRow(
            details.name, 
            `${details.price} BYN за ${details.unit}`, 
            `<input type="number" min="0" value="${state.addons.additional_services[id] || 0}" style="width:80px;" onchange="updateAddonState('additional_services', '${id}', this.value)">`
        );
    }
    html += createCategory('Разовые и дополнительные услуги', extraHtml);

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

function calculateOptimalDocCost(docType, totalIn, included) {
    if (totalIn <= included) return { cost: 0, desc: 'включено' };

    const amount = totalIn - included;
    const packages = state.tariffs.document_packages[docType] || [];
    const brackets = state.tariffs.piece_rate_brackets;
    let rateKey = docType === 'waybills' ? 'ettn' : docType;

    // Helper: Progressive piece rate calculation for a SPECIFIC RANGE [start, end]
    const getPiecesCostRange = (start, end) => {
        if (end <= start) return 0;
        
        const getFullCost = (qty) => {
            if (qty <= 0) return 0;
            let cost = 0;
            let remaining = qty;
            for (const bracket of brackets) {
                const bracketMax = bracket.max === null ? Infinity : bracket.max;
                const bracketSize = bracketMax === Infinity ? Infinity : (bracketMax - bracket.min + 1);
                const applicable = Math.min(remaining, bracketSize);
                cost += applicable * (bracket.rates[rateKey] || 0);
                remaining -= applicable;
                if (remaining <= 0) break;
            }
            if (remaining > 0) {
                cost += remaining * (brackets[brackets.length - 1].rates[rateKey] || 0);
            }
            return cost;
        };

        return getFullCost(end) - getFullCost(start);
    };

    // 1. Just piece rate for the excess
    let bestResult = { 
        cost: getPiecesCostRange(included, totalIn), 
        desc: `${amount} шт (поштучно)` 
    };

    // 2. Try packages
    // A package covers docs from [included+1] to [included+pkg.amount]
    for (const pkg of packages) {
        // Option A: 1 package + remaining
        const pkgAmt = pkg.amount;
        const coveredTo = included + pkgAmt;
        let total = pkg.price;
        let desc = `пакет ${pkgAmt} шт`;
        
        if (coveredTo < totalIn) {
            const extra = totalIn - coveredTo;
            total += getPiecesCostRange(coveredTo, totalIn);
            desc += ` + ${extra} шт`;
        }
        
        if (total < bestResult.cost) {
            bestResult = { cost: total, desc: desc };
        }

        // Option B: Multiple packages? (Rare but possible)
        for (let n = 2; n <= Math.ceil(amount / pkgAmt); n++) {
            let nPkgAmt = n * pkgAmt;
            let nPkgCoveredTo = included + nPkgAmt;
            let nTotal = n * pkg.price;
            let nDesc = `${n}x${pkgAmt}шт`;

            if (nPkgCoveredTo < totalIn) {
                const extra = totalIn - nPkgCoveredTo;
                nTotal += getPiecesCostRange(nPkgCoveredTo, totalIn);
                nDesc += ` + ${extra} шт`;
            }

            if (nTotal < bestResult.cost) {
                bestResult = { cost: nTotal, desc: nDesc };
            }
        }
    }

    return bestResult;
}

function updateCalculations() {
    console.log("Updating calculations...");
    const multiplier = state.period === 'year' ? 12 : 1;
    const docNames = { waybills: 'Эл. накладные', edi: 'EDI-сообщения', yuzdo: 'ЮЗДО' };

    // 1. FIND BEST PLAN FIRST (Auto-recommendation)
    let bestPlanId = state.selectedPlan;
    let minGrandTotal = Infinity;
    
    for (const pId in state.tariffs.base_plans) {
        const p = state.tariffs.base_plans[pId];
        if (p.target === 'new_only' && state.clientType === 'existing') continue;

        // FEATURE CHECKS: Skip plans that don't support the documents the user wants to send
        if (state.docs.waybills > 0 && p.features.outgoing === false) continue;
        if (state.docs.edi > 0 && p.features.edi === false) continue;

        let pBase = p.price_month;
        if (state.period === 'year') {
            pBase = (state.clientType === 'new') ? p.price_year_promo : p.price_year;
        }
        let pDocsMonth = 0;
        for (const dk in docNames) {
            const inAmt = state.docs[dk] || 0;
            const inc = (p.included[dk] || 0) / 12;
            if (inAmt > inc) pDocsMonth += calculateOptimalDocCost(dk, inAmt, inc).cost;
        }

        let pAddonsMonth = 0;
        if (state.addons.tech_support !== 'basic') pAddonsMonth += state.tariffs.tech_support[state.addons.tech_support].price;
        for (const type in state.addons.cross_border) {
            const amt = state.addons.cross_border[type];
            if (amt > 0) {
                const pkg = state.tariffs.cross_border_packages[type].find(x => x.amount == amt);
                if (pkg) pAddonsMonth += pkg.price;
            }
        }
        for (const id in state.addons.pro_features) if (state.addons.pro_features[id] > 0) pAddonsMonth += state.tariffs.pro_features[id].price;
        for (const id in state.addons.mobile_id) if (state.addons.mobile_id[id] > 0) pAddonsMonth += state.tariffs.mobile_id[id].price * state.addons.mobile_id[id];

        let pOneTime = 0;
        for (const id in state.addons.additional_services) {
            if (state.addons.additional_services[id] > 0) pOneTime += state.tariffs.additional_services[id].price * state.addons.additional_services[id];
        }

        let grand = pBase + (pDocsMonth + pAddonsMonth) * multiplier + pOneTime;
        // Float precision safety
        if (grand < minGrandTotal - 0.01) {
            minGrandTotal = grand;
            bestPlanId = pId;
        }
    }

    if (bestPlanId !== state.selectedPlan) {
        console.log(`Auto-switching to better plan: ${bestPlanId}`);
        state.selectedPlan = bestPlanId;
        renderPlans();
        // Calculate one more time for the final breakdown of the NEW plan
        // To avoid infinite loop, we call a simplified version or just return here
        // Actually, since we already found the 'absolute' best plan in the loop above,
        // we can just re-run calculation once.
        updateCalculationsInternal(); 
        return;
    }

    updateCalculationsInternal();
}

function updateCalculationsInternal() {
    const activePlan = state.tariffs.base_plans[state.selectedPlan];
    const finalBreakdown = [];
    const docNames = { waybills: 'Эл. накладные', edi: 'EDI-сообщения', yuzdo: 'ЮЗДО' };
    const multiplier = state.period === 'year' ? 12 : 1;
    const basePrice = (state.period === 'year') ? ((state.clientType === 'new') ? activePlan.price_year_promo : activePlan.price_year) : activePlan.price_month;
    finalBreakdown.push({ name: `Тариф "${activePlan.name}" (${state.period === 'year' ? 'Год' : 'Мес'})`, price: basePrice });

    let currentMonthlyAddons = 0;
    for (const [docKey, docName] of Object.entries(docNames)) {
        const inputAmount = state.docs[docKey] || 0;
        const included = (activePlan.included[docKey] || 0) / 12;
        if (inputAmount > included) {
            const opt = calculateOptimalDocCost(docKey, inputAmount, included);
            currentMonthlyAddons += opt.cost;
            finalBreakdown.push({ name: `${docName} (${opt.desc})`, price: opt.cost });
        }
    }

    if (state.addons.tech_support !== 'basic') {
        const p = state.tariffs.tech_support[state.addons.tech_support].price;
        currentMonthlyAddons += p;
        finalBreakdown.push({ name: `Поддержка: ${state.tariffs.tech_support[state.addons.tech_support].name}`, price: p });
    }

    // Combine other monthly addons
    for (const cat of ['cross_border', 'pro_features', 'mobile_id']) {
        for (const id in state.addons[cat]) {
            const val = state.addons[cat][id];
            if (val > 0) {
                let p = 0; let n = '';
                if(cat === 'pro_features') { p = state.tariffs[cat][id].price; n = `Опция ${id.replace('pro_', 'PRO ')}`; }
                if(cat === 'cross_border') { 
                    const pkg = state.tariffs.cross_border_packages[id].find(x => x.amount == val);
                    p = pkg ? pkg.price : 0; n = `Пакет ${id.toUpperCase()} ${val}шт`;
                }
                if(cat === 'mobile_id') { p = state.tariffs[cat][id].price * val; n = `Mobile ID: ${id} x${val}`; }
                
                if (p > 0) {
                    currentMonthlyAddons += p;
                    finalBreakdown.push({ name: n, price: p });
                }
            }
        }
    }

    let oneTimeTotal = 0;
    for (const id in state.addons.additional_services) {
        const count = state.addons.additional_services[id];
        if (count > 0) {
            const p = state.tariffs.additional_services[id].price * count;
            oneTimeTotal += p;
            finalBreakdown.push({ name: `Доп. услуга: ${state.tariffs.additional_services[id].name}`, price: p });
        }
    }

    if (state.period === 'year' && currentMonthlyAddons > 0) {
         finalBreakdown.push({ name: `<br><b>Дополнительные услуги за ГОД (*12)</b>`, price: currentMonthlyAddons * 12 });
    }

    const finalGrandTotal = basePrice + (currentMonthlyAddons * multiplier) + oneTimeTotal;
    
    // 3. UI UPDATE
    document.getElementById('total-price').textContent = formatPrice(finalGrandTotal);
    document.getElementById('price-notice').textContent = `за ${state.period === 'year' ? 'год' : 'месяц'}, без НДС`;
    
    const breakdownHTML = finalBreakdown.map(item => {
        if (item.name.includes('<br>')) {
           return `<div class="item" style="border-top:1px dashed rgba(255,255,255,0.2); margin-top:10px; padding-top:10px;">
                    <span class="item-name">${item.name}</span>
                    <span class="item-price">${formatPrice(item.price)} BYN</span>
                   </div>`;
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
