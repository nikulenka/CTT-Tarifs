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

async function initApp() {
    try {
        const response = await fetch('ctt_tariffs.json');
        if (!response.ok) throw new Error('Failed to load tariffs configuration json.');
        state.tariffs = await response.json();
        
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        document.getElementById('vat-notice').textContent = state.tariffs.meta.vat_notice;
        
        setupEventListeners();
        renderPlans();
        renderAddons();
        updateCalculations();
    } catch (err) {
        console.error(err);
        document.getElementById('loading').innerHTML = `<p style="color:red;">Ошибка загрузки конфигурации тарифов.</p>`;
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
    let pieceRate = 0;
    
    for (const bracket of brackets) {
        if (totalAmountForTier >= bracket.min && totalAmountForTier <= bracket.max) {
            pieceRate = bracket.rates[rateKey] || 0;
            break;
        }
    }
    if (pieceRate === 0 && brackets.length > 0) {
        pieceRate = brackets[brackets.length - 1].rates[rateKey] || 0;
    }

    // DP Knapsack exactly >= amount
    let maxPkgSize = packages.length > 0 ? Math.max(...packages.map(p => p.amount)) : 0;
    let limit = amount + maxPkgSize;
    let dp = new Array(limit + 1).fill(Infinity);
    let choice = new Array(limit + 1).fill(null); 
    
    dp[0] = 0;
    const items = [...packages];
    items.push({ amount: 1, price: pieceRate, isPiece: true });
    
    for (let i = 0; i <= limit; i++) {
        if (dp[i] === Infinity) continue;
        for (const item of items) {
            let nextSize = i + item.amount;
            if (nextSize > limit) nextSize = limit;
            if (dp[i] + item.price < dp[nextSize]) {
                dp[nextSize] = dp[i] + item.price;
                choice[nextSize] = { prev: i, item: item };
            }
        }
    }
    
    let minCost = Infinity;
    let bestSize = amount;
    for (let i = amount; i <= limit; i++) {
        if (dp[i] < minCost) {
            minCost = dp[i];
            bestSize = i;
        }
    }
    
    let curr = bestSize;
    let counts = {};
    let pieceCount = 0;
    
    while (curr > 0 && choice[curr]) {
        const item = choice[curr].item;
        if (item.isPiece) {
            pieceCount++;
        } else {
            counts[item.amount] = (counts[item.amount] || 0) + 1;
        }
        curr = choice[curr].prev;
    }
    
    let descParts = [];
    for (const [size, count] of Object.entries(counts)) {
        descParts.push(`${count}x${size}шт`);
    }
    if (pieceCount > 0) descParts.push(`${pieceCount}шт по ${pieceRate}`);
    
    return {
        cost: minCost,
        desc: descParts.join(' + ') || 'Включено'
    };
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

    // Calculate final value
    let grandTotal = 0;
    if (state.period === 'year') {
        // base plan is yearly + addons * 12 + one-time services
        grandTotal = totalYearly + (totalMonthly * 12);
        
        // Let's modify breakdown prices visually to reflect x12 for monthly recurring items under yearly billing?
        // Actually, users might get confused. Better to keep breakdown true to calculation: 
        // Breakdown shows Monthly items, but at the end we multiply by 12.
        // Let's explicitly add a line to breakdown if period == year
        if (totalMonthly > 0) {
             breakdown.push({ name: `<br><b>Ежемесячные услуги за ГОД (*12)</b>`, price: totalMonthly * 12 });
        }
    } else {
        grandTotal = totalMonthly + totalYearly; // totalYearly acts as one-time here
    }
    
    // UI Update
    document.getElementById('total-price').textContent = formatPrice(grandTotal);
    document.getElementById('price-notice').textContent = \`за \${state.period === 'year' ? 'год' : 'месяц'}, без НДС\`;
    
    const breakdownHTML = breakdown.map(item => {
        if (item.name.includes('<br>')) {
           return \`<div class="item" style="border-top:2px solid #e2e8f0; margin-top:10px;"><span class="item-name">\${item.name}</span><span class="item-price">\${formatPrice(item.price)} BYN</span></div>\`;
        }
        return \`<div class="item"><span class="item-name">\${item.name}</span><span class="item-price">\${formatPrice(item.price)} BYN</span></div>\`;
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
