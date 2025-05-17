document.addEventListener('DOMContentLoaded', () => {
    let UPDATE_INTERVAL_MS_DYNAMIC = 60000; // Default, will be loaded from localStorage
    let mainIntervalId = null; // To store the ID of the main setInterval
    const OUNCES_TO_GRAMS = 31.1034768;
    const MAX_HISTORY_POINTS = 20; // Number of data points for sparklines

    // Constants for Trend Indicators
    const SMA_SHORT_PERIOD = 5;
    const SMA_LONG_PERIOD = 10; // Ensure SMA_LONG_PERIOD <= MAX_HISTORY_POINTS
    const ROC_PERIOD = 5;       // Ensure ROC_PERIOD < MAX_HISTORY_POINTS (needs ROC_PERIOD + 1 points)

    // Modified previousPrices to store arrays for history
    let priceHistories = {
        gold: [], usdTry: [], eurTry: [], altinTlGr: [], btcusd: [],
        ethusd: [], eurusd: [], xagusd: [] // NEW
    };
    let previousDisplayPrices = {
        gold: null, usdTry: null, eurTry: null, altinTlGr: null, btcusd: null,
        ethusd: null, eurusd: null, xagusd: null // NEW
    };

    let sparklineCharts = {}; // To store ApexCharts instances
    let flashTimeoutIds = {};

    let sessionHighLow = {
        gold: { high: null, low: null }, usdTry: { high: null, low: null }, eurTry: { high: null, low: null },
        altinTlGr: { high: null, low: null }, btcusd: { high: null, low: null },
        ethusd: { high: null, low: null }, eurusd: { high: null, low: null },
        xagusd: { high: null, low: null } // NEW
    };

    let configuredAlerts = []; // Array to store alert objects
    // Initialize notificationPermission considering if Notification API exists
    let notificationPermission = typeof Notification !== 'undefined' ? Notification.permission : "unsupported";

    // Make them accessible in console for debugging
    window.priceHistories = priceHistories;
    window.sparklineCharts = sparklineCharts;
    window.sessionHighLow = sessionHighLow; // For debugging

    // DOM Elements from Phase 1 & 2
    const htmlElement = document.documentElement;
    const mainContainer = document.getElementById('mainContainer');
    const refreshAllBtn = document.getElementById('refresh-all-btn');
    const themeSwitcherBtn = document.getElementById('theme-switcher');
    const compactViewToggleBtn = document.getElementById('compact-view-toggle');
    
    const settingsToggleBtn = document.getElementById('settings-toggle-btn');
    const settingsPanel = document.getElementById('settingsPanel');
    const settingsOverlay = document.getElementById('settingsOverlay');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const cardVisibilityToggles = document.querySelectorAll('.card-visibility-toggle');
    const updateIntervalSelect = document.getElementById('update-interval-select');

    const altinTlGrElements = {
        price: document.getElementById('altintlgr-current-price'),
        change: document.getElementById('altintlgr-price-change'),
        percentageChange: document.getElementById('altintlgr-percentage-change'),
        updated: document.getElementById('altintlgr-last-updated'),
        error: document.getElementById('altintlgr-error-message'),
        refreshBtn: document.getElementById('altintlgr-refresh-btn'),
        loader: document.getElementById('altintlgr-loader'),
        card: document.getElementById('altintlgr-card'),
        sparklineId: 'altintlgr-sparkline',
        highDisplay: document.getElementById('altintlgr-high'),
        lowDisplay: document.getElementById('altintlgr-low'),
        trendIndicatorText: document.getElementById('altintlgr-trend-indicator')?.querySelector('.indicator-text'),
        momentumIndicatorText: document.getElementById('altintlgr-momentum-indicator')?.querySelector('.indicator-text')
    };

    let currentFetchedValues = {
        gold_usd_oz: null,
        usd_try: null
    };

    const apiConfigs = [
        {
            name: 'gold',
            tickerName: 'GOLD',
            url: 'https://data-asg.goldprice.org/dbXRates/USD',
            parser: (data) => {
                if (data && data.items && data.items.length > 0 && typeof data.items[0].xauPrice !== 'undefined') {
                    return parseFloat(data.items[0].xauPrice);
                }
                throw new Error('Invalid gold data format');
            },
            elements: {
                price: document.getElementById('gold-current-price'),
                change: document.getElementById('gold-price-change'),
                percentageChange: document.getElementById('gold-percentage-change'),
                updated: document.getElementById('gold-last-updated'),
                error: document.getElementById('gold-error-message'),
                refreshBtn: document.getElementById('gold-refresh-btn'),
                loader: document.getElementById('gold-loader'),
                card: document.getElementById('gold-card'),
                sparklineId: 'gold-sparkline',
                highDisplay: document.getElementById('gold-high'),
                lowDisplay: document.getElementById('gold-low'),
                trendIndicatorText: document.getElementById('gold-trend-indicator')?.querySelector('.indicator-text'),
                momentumIndicatorText: document.getElementById('gold-momentum-indicator')?.querySelector('.indicator-text')
            },
            displayPrefix: '$',
            displaySuffix: '',
            digits: 2,
            valueKeyForCalculation: 'gold_usd_oz'
        },
        {
            name: 'usdTry',
            tickerName: 'USD/TRY',
            url: 'https://api.coinbase.com/v2/exchange-rates?currency=USD',
            parser: (data) => {
                if (data && data.data && data.data.rates && typeof data.data.rates.TRY !== 'undefined') {
                    return parseFloat(data.data.rates.TRY);
                }
                throw new Error('Invalid USD/TRY data from Coinbase API');
            },
            elements: {
                price: document.getElementById('usdtry-current-price'),
                change: document.getElementById('usdtry-price-change'),
                percentageChange: document.getElementById('usdtry-percentage-change'),
                updated: document.getElementById('usdtry-last-updated'),
                error: document.getElementById('usdtry-error-message'),
                refreshBtn: document.getElementById('usdtry-refresh-btn'),
                loader: document.getElementById('usdtry-loader'),
                card: document.getElementById('usdtry-card'),
                sparklineId: 'usdtry-sparkline',
                highDisplay: document.getElementById('usdtry-high'),
                lowDisplay: document.getElementById('usdtry-low'),
                trendIndicatorText: document.getElementById('usdtry-trend-indicator')?.querySelector('.indicator-text'),
                momentumIndicatorText: document.getElementById('usdtry-momentum-indicator')?.querySelector('.indicator-text')
            },
            displayPrefix: '₺',
            displaySuffix: '',
            digits: 4,
            valueKeyForCalculation: 'usd_try'
        },
        {
            name: 'eurTry',
            tickerName: 'EUR/TRY',
            url: 'https://api.coinbase.com/v2/exchange-rates?currency=EUR',
            parser: (data) => {
                if (data && data.data && data.data.rates && typeof data.data.rates.TRY !== 'undefined') {
                    return parseFloat(data.data.rates.TRY);
                }
                throw new Error('Invalid EUR/TRY data from Coinbase API');
            },
            elements: {
                price: document.getElementById('eurtry-current-price'),
                change: document.getElementById('eurtry-price-change'),
                percentageChange: document.getElementById('eurtry-percentage-change'),
                updated: document.getElementById('eurtry-last-updated'),
                error: document.getElementById('eurtry-error-message'),
                refreshBtn: document.getElementById('eurtry-refresh-btn'),
                loader: document.getElementById('eurtry-loader'),
                card: document.getElementById('eurtry-card'),
                sparklineId: 'eurtry-sparkline',
                highDisplay: document.getElementById('eurtry-high'),
                lowDisplay: document.getElementById('eurtry-low'),
                trendIndicatorText: document.getElementById('eurtry-trend-indicator')?.querySelector('.indicator-text'),
                momentumIndicatorText: document.getElementById('eurtry-momentum-indicator')?.querySelector('.indicator-text')
            },
            displayPrefix: '₺',
            displaySuffix: '',
            digits: 4
        },
        {
            name: 'btcusd',
            tickerName: 'BTC/USD',
            url: 'https://api.coinbase.com/v2/prices/BTC-USD/spot',
            parser: (data) => {
                if (data && data.data && typeof data.data.amount !== 'undefined') {
                    return parseFloat(data.data.amount);
                }
                throw new Error('Invalid BTC/USD data from Coinbase API');
            },
            elements: {
                price: document.getElementById('btcusd-current-price'),
                change: document.getElementById('btcusd-price-change'),
                percentageChange: document.getElementById('btcusd-percentage-change'),
                updated: document.getElementById('btcusd-last-updated'),
                error: document.getElementById('btcusd-error-message'),
                refreshBtn: document.getElementById('btcusd-refresh-btn'),
                loader: document.getElementById('btcusd-loader'),
                card: document.getElementById('btcusd-card'),
                sparklineId: 'btcusd-sparkline',
                highDisplay: document.getElementById('btcusd-high'),
                lowDisplay: document.getElementById('btcusd-low'),
                trendIndicatorText: document.getElementById('btcusd-trend-indicator')?.querySelector('.indicator-text'),
                momentumIndicatorText: document.getElementById('btcusd-momentum-indicator')?.querySelector('.indicator-text')
            },
            displayPrefix: '$',
            displaySuffix: '',
            digits: 2
        },
        {
            name: 'ethusd',
            tickerName: 'ETH/USD',
            url: 'https://api.coinbase.com/v2/exchange-rates?currency=ETH',
            parser: (data) => {
                if (data && data.data && data.data.rates && typeof data.data.rates.USD !== 'undefined') {
                    return parseFloat(data.data.rates.USD);
                }
                throw new Error('Invalid ETH/USD data from Coinbase API');
            },
            elements: {
                price: document.getElementById('ethusd-current-price'),
                change: document.getElementById('ethusd-price-change'),
                percentageChange: document.getElementById('ethusd-percentage-change'),
                updated: document.getElementById('ethusd-last-updated'),
                error: document.getElementById('ethusd-error-message'),
                refreshBtn: document.getElementById('ethusd-refresh-btn'),
                loader: document.getElementById('ethusd-loader'),
                card: document.getElementById('ethusd-card'),
                sparklineId: 'ethusd-sparkline',
                highDisplay: document.getElementById('ethusd-high'),
                lowDisplay: document.getElementById('ethusd-low'),
                trendIndicatorText: document.getElementById('ethusd-trend-indicator')?.querySelector('.indicator-text'),
                momentumIndicatorText: document.getElementById('ethusd-momentum-indicator')?.querySelector('.indicator-text')
            },
            displayPrefix: '$', 
            displaySuffix: '',
            digits: 2,
        },
        {
            name: 'eurusd',
            tickerName: 'EUR/USD',
            url: 'https://api.coinbase.com/v2/exchange-rates?currency=EUR',
            parser: (data) => {
                if (data && data.data && data.data.rates && typeof data.data.rates.USD !== 'undefined') {
                    return parseFloat(data.data.rates.USD);
                }
                throw new Error('Invalid EUR/USD data from Coinbase API');
            },
            elements: {
                price: document.getElementById('eurusd-current-price'),
                change: document.getElementById('eurusd-price-change'),
                percentageChange: document.getElementById('eurusd-percentage-change'),
                updated: document.getElementById('eurusd-last-updated'),
                error: document.getElementById('eurusd-error-message'),
                refreshBtn: document.getElementById('eurusd-refresh-btn'),
                loader: document.getElementById('eurusd-loader'),
                card: document.getElementById('eurusd-card'),
                sparklineId: 'eurusd-sparkline',
                highDisplay: document.getElementById('eurusd-high'),
                lowDisplay: document.getElementById('eurusd-low'),
                trendIndicatorText: document.getElementById('eurusd-trend-indicator')?.querySelector('.indicator-text'),
                momentumIndicatorText: document.getElementById('eurusd-momentum-indicator')?.querySelector('.indicator-text')
            },
            displayPrefix: '$',
            displaySuffix: '',
            digits: 4,
        },
        {
            name: 'xagusd',
            tickerName: 'SILVER/USD',
            url: 'https://data-asg.goldprice.org/dbXRates/USD',
            parser: (data) => {
                if (data && data.items && data.items.length > 0 && typeof data.items[0].xagPrice !== 'undefined') {
                    return parseFloat(data.items[0].xagPrice);
                }
                if (data && data.items && data.items.length > 0 && (data.items[0].xauPrice || data.items[0].xptPrice)){
                    throw new Error('Silver (XAG/USD) data specifically missing from API response.');
                }
                throw new Error('Invalid or missing data structure from goldprice.org API for Silver.');
            },
            elements: {
                price: document.getElementById('xagusd-current-price'),
                change: document.getElementById('xagusd-price-change'),
                percentageChange: document.getElementById('xagusd-percentage-change'),
                updated: document.getElementById('xagusd-last-updated'),
                error: document.getElementById('xagusd-error-message'),
                refreshBtn: document.getElementById('xagusd-refresh-btn'),
                loader: document.getElementById('xagusd-loader'),
                card: document.getElementById('xagusd-card'),
                sparklineId: 'xagusd-sparkline',
                highDisplay: document.getElementById('xagusd-high'),
                lowDisplay: document.getElementById('xagusd-low'),
                trendIndicatorText: document.getElementById('xagusd-trend-indicator')?.querySelector('.indicator-text'),
                momentumIndicatorText: document.getElementById('xagusd-momentum-indicator')?.querySelector('.indicator-text')
            },
            displayPrefix: '$', 
            displaySuffix: '',  
            digits: 2, 
        }
    ];

    // DOM Elements
    const alertItemSelect = document.getElementById('alert-item-select');
    const alertConditionSelect = document.getElementById('alert-condition-select');
    const alertValueInput = document.getElementById('alert-value-input');
    const addAlertBtn = document.getElementById('add-alert-btn');
    const activeAlertsList = document.getElementById('active-alerts-list');

    // Price Ticker Elements
    const priceTickerItemsContainer = document.getElementById('priceTickerItems');
    const priceTickerWrap = document.querySelector('.price-ticker-wrap'); // Get the wrapper
    let tickerAnimationName = 'scrollTickerAnimation'; // Base name for dynamic keyframes

    const chartModalOverlay = document.getElementById('chartModalOverlay');
    const detailedChartModal = document.getElementById('detailedChartModal');
    const modalChartTitle = document.getElementById('modalChartTitle');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const detailedChartElement = document.getElementById('detailedApexChart');
    let detailedChartInstance = null; // To store the modal's ApexCharts instance

    // --- Initialize SortableJS for Reordering Cards ---
    if (mainContainer) {
        let sortable = new Sortable(mainContainer, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            onEnd: function (evt) {
                saveCardOrder();
            },
        });
    }

    function saveCardOrder() {
        const cardOrder = [];
        if(mainContainer) {
            mainContainer.querySelectorAll('.price-card').forEach(card => {
                cardOrder.push(card.id);
            });
            localStorage.setItem('cardOrder', JSON.stringify(cardOrder));
        }
    }

    function loadCardOrder() {
        const order = JSON.parse(localStorage.getItem('cardOrderV2'));
        if (order && mainContainer) {
            // Temporarily detach elements not in the order to preserve them
            const detachedChildren = [];
            Array.from(mainContainer.children).forEach(child => {
                if (!order.includes(child.id)) {
                    detachedChildren.push(mainContainer.removeChild(child));
                }
            });

            order.forEach(cardId => {
                const cardElement = document.getElementById(cardId);
                if (cardElement) {
                    mainContainer.appendChild(cardElement);
                }
            });

            // Re-attach any detached children that were not in the order array (e.g., newly added cards)
            detachedChildren.forEach(child => mainContainer.appendChild(child));
        }
        // After reordering, re-attach listeners if necessary, though SortableJS usually preserves them.
        // However, good to call if any doubt or if elements were truly re-created.
        setupSparklineClickListeners(); 
    }

    // --- Settings Panel Logic ---
    function toggleSettingsPanel(show) {
        if (settingsPanel && settingsOverlay) {
            if (show) {
                settingsPanel.classList.add('visible');
                settingsOverlay.classList.add('visible');
            } else {
                settingsPanel.classList.remove('visible');
                settingsOverlay.classList.remove('visible');
            }
        }
    }
    if(settingsToggleBtn) settingsToggleBtn.addEventListener('click', () => toggleSettingsPanel(true));
    if(closeSettingsBtn) closeSettingsBtn.addEventListener('click', () => toggleSettingsPanel(false));
    if(settingsOverlay) settingsOverlay.addEventListener('click', () => toggleSettingsPanel(false));

    // --- Card Visibility Logic ---
    cardVisibilityToggles.forEach(toggle => {
        toggle.addEventListener('change', (event) => {
            const cardId = event.target.dataset.cardId;
            const cardElement = document.getElementById(cardId);
            const isVisible = event.target.checked;

            if (cardElement) {
                cardElement.classList.toggle('hidden-card', !isVisible);
                if (cardId === 'gold-card' || cardId === 'usdtry-card' || cardId === 'altintlgr-card') {
                    calculateAndDisplayAltinTlGr(); 
                }
                if (isVisible && cardId !== 'altintlgr-card') {
                    const config = apiConfigs.find(c => c.elements.card.id === cardId);
                    if (config) {
                        fetchApiData(config, true); 
                    }
                }
            }
            saveCardVisibility();
            updatePriceTicker(); // Update ticker when visibility changes
        });
    });

    function saveCardVisibility() {
        const visibilityState = {};
        cardVisibilityToggles.forEach(toggle => {
            visibilityState[toggle.dataset.cardId] = toggle.checked;
        });
        localStorage.setItem('cardVisibility', JSON.stringify(visibilityState));
    }

    function loadCardVisibility() {
        let anyCardStateChanged = false;
        cardVisibilityToggles.forEach(toggle => {
            const cardId = toggle.dataset.cardId;
            const cardElement = document.getElementById(cardId);
            if (cardElement) {
                const isVisible = localStorage.getItem(`cardVisible_${cardId}`);
                if (isVisible === 'false') {
                    cardElement.classList.add('hidden-card');
                    toggle.checked = false;
                    anyCardStateChanged = true;
                } else { // null or 'true'
                    cardElement.classList.remove('hidden-card');
                    toggle.checked = true;
                    // If visible, try to initialize its sparkline if not already done
                    const config = apiConfigs.find(c => c.elements && c.elements.card && c.elements.card.id === cardId) || 
                                   (cardId === 'altintlgr-card' ? { elements: { sparklineId: altinTlGrElements.sparklineId } } : null);
                    if (config && config.elements && config.elements.sparklineId && !sparklineCharts[config.elements.sparklineId]) {
                         // Ensure history exists before initializing to prevent error
                        const itemName = cardId.replace('-card', '').replace('altintlgr', 'altinTlGr'); // Convert cardId to itemName
                        if (!priceHistories[itemName]) priceHistories[itemName] = []; // Ensure array exists
                        initializeSparkline(config.elements.sparklineId, priceHistories[itemName]);
                    }
                }
            }
        });

        if (anyCardStateChanged) {
            // Potentially update layout or sparklines if visibility changed things
            // For example, if using a masonry layout library or if sparklines need re-initialization
        }
        updatePriceTicker(); // Update ticker based on visible cards
        setupSparklineClickListeners(); // Call after visibility might have changed DOM or display properties
    }

    // --- Update Interval Logic ---
    if(updateIntervalSelect) {
        updateIntervalSelect.addEventListener('change', (event) => {
            UPDATE_INTERVAL_MS_DYNAMIC = parseInt(event.target.value, 10);
            localStorage.setItem('updateInterval', UPDATE_INTERVAL_MS_DYNAMIC);
            resetMainInterval();
            console.log(`Update interval changed to: ${UPDATE_INTERVAL_MS_DYNAMIC / 1000}s`);
        });
    }

    function loadUpdateInterval() {
        const savedInterval = localStorage.getItem('updateInterval');
        if (savedInterval) {
            UPDATE_INTERVAL_MS_DYNAMIC = parseInt(savedInterval, 10);
            if(updateIntervalSelect) updateIntervalSelect.value = UPDATE_INTERVAL_MS_DYNAMIC;
        }
    }

    function startMainInterval() {
        if (mainIntervalId) clearInterval(mainIntervalId);
        console.log(`Attempting to start main interval with duration: ${UPDATE_INTERVAL_MS_DYNAMIC / 1000}s`);

        apiConfigs.forEach(config => {
            fetchApiData(config); 
        });
        
        calculateAndDisplayAltinTlGr();

        mainIntervalId = setInterval(() => {
            console.log(`Interval fetching at ${UPDATE_INTERVAL_MS_DYNAMIC / 1000}s interval (ID: ${mainIntervalId})...`);
            apiConfigs.forEach(config => {
                fetchApiData(config);
            });
        }, UPDATE_INTERVAL_MS_DYNAMIC);
        console.log(`Main interval started with ID: ${mainIntervalId}, interval: ${UPDATE_INTERVAL_MS_DYNAMIC / 1000}s`);
    }

    function resetMainInterval() {
        console.log("Resetting main interval...");
        if (mainIntervalId) {
            clearInterval(mainIntervalId);
            console.log(`Cleared interval ID: ${mainIntervalId}`);
            mainIntervalId = null;
        }
        startMainInterval();
    }

    // --- Theme Switcher Logic (from Phase 1) ---
    function setTheme(theme) {
        if(htmlElement) htmlElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        if(themeSwitcherBtn) {
            themeSwitcherBtn.innerHTML = theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
            themeSwitcherBtn.title = theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
        }
        updateAllSparklineColors(); // Call this to update chart colors
    }
    if(themeSwitcherBtn) {
        themeSwitcherBtn.addEventListener('click', () => {
            const currentTheme = htmlElement ? htmlElement.getAttribute('data-theme') || 'light' : 'light';
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            setTheme(newTheme);
        });
    }

    // --- Compact View Logic (from Phase 1) ---
    if(compactViewToggleBtn && mainContainer) {
        compactViewToggleBtn.addEventListener('click', () => {
            mainContainer.classList.toggle('compact-view');
            const isCompact = mainContainer.classList.contains('compact-view');
            localStorage.setItem('compactView', isCompact);
            compactViewToggleBtn.innerHTML = isCompact ? '<i class="fas fa-expand-alt"></i>' : '<i class="fas fa-compress-alt"></i>';
            compactViewToggleBtn.title = isCompact ? 'Switch to Normal View' : 'Switch to Compact View';
        });
    }
    
    // --- Helper Functions for Indicators ---
    function calculateSMA(pricesOnlyArray, period) {
        if (!pricesOnlyArray || pricesOnlyArray.length < period) return null;
        const relevantPrices = pricesOnlyArray.slice(-period);
        const sum = relevantPrices.reduce((acc, p) => acc + p, 0);
        return sum / period;
    }

    function calculateROC(pricesOnlyArray, period) {
        // Needs 'period' number of intervals, so 'period + 1' data points
        if (!pricesOnlyArray || pricesOnlyArray.length < period + 1) return null;
        const currentPrice = pricesOnlyArray[pricesOnlyArray.length - 1];
        const pastPrice = pricesOnlyArray[pricesOnlyArray.length - 1 - period];
        if (pastPrice === null || isNaN(pastPrice) || pastPrice === 0) return null; // Avoid division by zero or with NaN
        return ((currentPrice - pastPrice) / pastPrice) * 100; // As a percentage
    }

    // --- Function to Update Trend Indicators ---
    function updateTrendIndicators(itemName, itemConfig) {
        const history = priceHistories[itemName];
        const trendElement = itemConfig.elements.trendIndicatorText;
        const momentumElement = itemConfig.elements.momentumIndicatorText;

        if (!history || !trendElement || !momentumElement || !itemConfig.elements.card || itemConfig.elements.card.classList.contains('hidden-card')) {
            if (trendElement && (!history || history.length === 0)) trendElement.textContent = '--';
            if (momentumElement && (!history || history.length === 0)) momentumElement.textContent = '--';
            if (trendElement) trendElement.className = 'indicator-text neutral';
            if (momentumElement) momentumElement.className = 'indicator-text neutral';
            return;
        }

        const pricesOnly = history.map(dp => dp.y);

        // SMA Trend
        const smaShort = calculateSMA(pricesOnly, SMA_SHORT_PERIOD);
        const smaLong = calculateSMA(pricesOnly, SMA_LONG_PERIOD);

        if (smaShort !== null && smaLong !== null) {
            if (smaShort > smaLong) {
                trendElement.textContent = '▲';
                trendElement.className = 'indicator-text increase';
            } else if (smaShort < smaLong) {
                trendElement.textContent = '▼';
                trendElement.className = 'indicator-text decrease';
            } else {
                trendElement.textContent = '–';
                trendElement.className = 'indicator-text neutral';
            }
        } else {
            trendElement.textContent = 'N/A'; // Not enough data
            trendElement.className = 'indicator-text neutral';
        }

        // ROC Momentum
        const roc = calculateROC(pricesOnly, ROC_PERIOD);
        if (roc !== null) {
            if (roc > 0) {
                momentumElement.textContent = `+${roc.toFixed(2)}%`;
                momentumElement.className = 'indicator-text increase';
            } else if (roc < 0) {
                momentumElement.textContent = `${roc.toFixed(2)}%`;
                momentumElement.className = 'indicator-text decrease';
            } else {
                momentumElement.textContent = '0.00%';
                momentumElement.className = 'indicator-text neutral';
            }
        } else {
            momentumElement.textContent = 'N/A'; // Not enough data
            momentumElement.className = 'indicator-text neutral';
        }
    }
    
    // --- setLoadingState, fetchApiData, calculateAndDisplayAltinTlGr, updateIndividualDisplay (largely from previous, with minor adjustments if needed) ---
    function setLoadingState(elements, isLoading) {
        if (elements.card && elements.loader && elements.refreshBtn) {
            // Only manipulate refreshBtn if it exists (e.g. not for a pseudo-config for ALTIN/GR if it didn't have one)
            const refreshBtnExists = elements.refreshBtn && typeof elements.refreshBtn.disabled !== 'undefined';

            if (isLoading) {
                elements.card.classList.add('loading');
                if (refreshBtnExists) {
                    elements.refreshBtn.disabled = true;
                    elements.refreshBtn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i>';
                }
            } else {
                elements.card.classList.remove('loading');
                if (refreshBtnExists) {
                    elements.refreshBtn.disabled = false;
                    elements.refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
                }
            }
        }
    }

    // --- fetchApiData (Integrate updateTrendIndicators) ---
    async function fetchApiData(config, isManualTrigger = false) {
        // Data for all cards is fetched. updateIndividualDisplay will handle not updating DOM for hidden cards.
        if (config.elements.error && !config.elements.card.classList.contains('hidden-card')) {
            config.elements.error.textContent = ''; // Clear error only if card is visible
        }
        
        // Set loading state only if the card is visible, or if it's a manual trigger 
        // (even for a hidden card if manually triggered, e.g. by Refresh All or programmatic refresh after visibility change)
        if (!config.elements.card.classList.contains('hidden-card') || isManualTrigger) {
             setLoadingState(config.elements, true);
        }

        try {
            const response = await fetch(config.url);
            if (!response.ok) {
                let apiErrorMsg = `API Error: ${response.status} ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    if (errorData && errorData.errors && errorData.errors.length > 0 && errorData.errors[0].message) {
                        apiErrorMsg += ` - ${errorData.errors[0].message}`;
                    } else if (errorData && errorData.message) {
                        apiErrorMsg += ` - ${errorData.message}`;
                    }
                } catch (e) { /* Ignore */ }
                throw new Error(apiErrorMsg);
            }
            const data = await response.json();
            const currentPrice = config.parser(data); 
            if (isNaN(currentPrice)) { throw new Error('Parsed price is not a number.'); }
            
            const now = new Date().getTime();
            priceHistories[config.name].push({ x: now, y: currentPrice });
            if (priceHistories[config.name].length > MAX_HISTORY_POINTS) {
                priceHistories[config.name].shift();
            }

            updateIndividualDisplay(config, currentPrice, previousDisplayPrices[config.name]);
            previousDisplayPrices[config.name] = currentPrice;
            updateSessionHighLow(config.name, currentPrice, config);
            checkAlerts(config.name, currentPrice);

            if (config.elements.sparklineId) {
                updateSparkline(config.elements.sparklineId, priceHistories[config.name]);
            }

            updateTrendIndicators(config.name, config); // CALL NEW FUNCTION HERE

            if (config.valueKeyForCalculation) {
                currentFetchedValues[config.valueKeyForCalculation] = currentPrice;
            }
            // updatePriceTicker(); // This was here, ensure it's still needed or moved to finally
        } catch (error) {
            console.error(`Failed to fetch ${config.name}:`, error);
            if (!config.elements.card.classList.contains('hidden-card')) { 
                config.elements.error.textContent = `Error: ${error.message}`;
            }
            if (config.valueKeyForCalculation) {
                currentFetchedValues[config.valueKeyForCalculation] = null;
            }
            // Ensure trend indicators are reset or show error state if fetch fails
            if (config.elements && config.elements.trendIndicatorText) {
                config.elements.trendIndicatorText.textContent = 'Error';
                config.elements.trendIndicatorText.className = 'indicator-text neutral';
            }
            if (config.elements && config.elements.momentumIndicatorText) {
                config.elements.momentumIndicatorText.textContent = 'Error';
                config.elements.momentumIndicatorText.className = 'indicator-text neutral';
            }
            updatePriceTicker(); // Also update ticker if API fetch fails
        } finally {
            if (!config.elements.card.classList.contains('hidden-card') || isManualTrigger) {
                setLoadingState(config.elements, false);
            }
            if (config.valueKeyForCalculation) {
                 calculateAndDisplayAltinTlGr(); 
            }
            updatePriceTicker(); // Good place for this
        }
    }

    // --- calculateAndDisplayAltinTlGr (Integrate updateTrendIndicators) ---
    function calculateAndDisplayAltinTlGr() {
        const altinCardElement = altinTlGrElements.card;
        if (altinCardElement.classList.contains('hidden-card')) {
            setLoadingState(altinTlGrElements, false);
            altinTlGrElements.price.textContent = '₺---.--';
            altinTlGrElements.change.textContent = '–';
            altinTlGrElements.change.className = 'neutral';
            altinTlGrElements.error.textContent = 'ALTIN/GR card is hidden.';
            // Clear trend indicators if ALTIN/GR card is hidden too
            if (altinTlGrElements.trendIndicatorText) {
                altinTlGrElements.trendIndicatorText.textContent = '--';
                altinTlGrElements.trendIndicatorText.className = 'indicator-text neutral';
            }
            if (altinTlGrElements.momentumIndicatorText) {
                altinTlGrElements.momentumIndicatorText.textContent = '--';
                altinTlGrElements.momentumIndicatorText.className = 'indicator-text neutral';
            }
            return;
        }

        const { gold_usd_oz, usd_try } = currentFetchedValues;
        const isGoldDataAvailable = gold_usd_oz !== null;
        const isUsdDataAvailable = usd_try !== null;
        const isDataAvailableForCalculation = isGoldDataAvailable && isUsdDataAvailable;

        altinTlGrElements.error.textContent = '';

        if (isDataAvailableForCalculation) {
            setLoadingState(altinTlGrElements, false);
            const goldUsdPerGram = gold_usd_oz / OUNCES_TO_GRAMS;
            const goldTryPerGram = goldUsdPerGram * usd_try;

            if (isNaN(goldTryPerGram)) {
                altinTlGrElements.error.textContent = 'Calculation error.';
                altinTlGrElements.price.textContent = '₺---.--';
                altinTlGrElements.change.textContent = '–';
                altinTlGrElements.change.className = 'neutral';
                // Clear trend indicators on calculation error
                if (altinTlGrElements.trendIndicatorText) {
                    altinTlGrElements.trendIndicatorText.textContent = 'Error';
                    altinTlGrElements.trendIndicatorText.className = 'indicator-text neutral';
                }
                if (altinTlGrElements.momentumIndicatorText) {
                    altinTlGrElements.momentumIndicatorText.textContent = 'Error';
                    altinTlGrElements.momentumIndicatorText.className = 'indicator-text neutral';
                }
            } else {
                const now = new Date().getTime();
                priceHistories.altinTlGr.push({ x: now, y: goldTryPerGram });
                if (priceHistories.altinTlGr.length > MAX_HISTORY_POINTS) {
                    priceHistories.altinTlGr.shift();
                }
                updateIndividualDisplay( 
                    { 
                        name: 'altinTlGr', 
                        elements: altinTlGrElements, 
                        displayPrefix: '₺', 
                        digits: 2, 
                        card: altinTlGrElements.card
                    },
                    goldTryPerGram,
                    previousDisplayPrices.altinTlGr
                );
                previousDisplayPrices.altinTlGr = goldTryPerGram;
                updateSessionHighLow('altinTlGr', goldTryPerGram, { 
                    elements: altinTlGrElements,
                    displayPrefix: '₺',
                    digits: 2
                 });
                checkAlerts('altinTlGr', goldTryPerGram);
                if (altinTlGrElements.sparklineId) { 
                    updateSparkline(altinTlGrElements.sparklineId, priceHistories.altinTlGr);
                 }
                
                updateTrendIndicators('altinTlGr', { elements: altinTlGrElements, card: altinTlGrElements.card }); // CALL NEW FUNCTION HERE
            }
        } else {
            setLoadingState(altinTlGrElements, true);
            altinTlGrElements.price.textContent = '₺---.--';
            altinTlGrElements.change.textContent = '–';
            altinTlGrElements.change.className = 'neutral';

            if (!altinTlGrElements.refreshBtn.querySelector('i.fa-spin')) {
                if (!isGoldDataAvailable && !isUsdDataAvailable) {
                    altinTlGrElements.error.textContent = 'Waiting for Gold & USD/TRY data...';
                } else if (!isGoldDataAvailable) {
                    altinTlGrElements.error.textContent = 'Waiting for Gold data...';
                } else { 
                    altinTlGrElements.error.textContent = 'Waiting for USD/TRY data...';
                }
            } else {
                if (altinTlGrElements.error.textContent.startsWith('Refreshing')) {
                    if (!isGoldDataAvailable && isUsdDataAvailable) altinTlGrElements.error.textContent = 'Refreshing... (Waiting for Gold data)';
                    else if (isGoldDataAvailable && !isUsdDataAvailable) altinTlGrElements.error.textContent = 'Refreshing... (Waiting for USD/TRY data)';
                }
            }
            if (altinTlGrElements.sparklineId) {
                 updateSparkline(altinTlGrElements.sparklineId, []); 
            }
            // Clear trend indicators if ALTIN/GR can't be calculated
            if (altinTlGrElements.trendIndicatorText) {
                altinTlGrElements.trendIndicatorText.textContent = '--';
                altinTlGrElements.trendIndicatorText.className = 'indicator-text neutral';
            }
            if (altinTlGrElements.momentumIndicatorText) {
                altinTlGrElements.momentumIndicatorText.textContent = '--';
                altinTlGrElements.momentumIndicatorText.className = 'indicator-text neutral';
            }
        }
        updatePriceTicker(); // Good place for this
    }

    function updateIndividualDisplay(itemConfig, currentPrice, lastDisplayedPrice) {
        const { elements, displayPrefix, displaySuffix, digits, name, card } = itemConfig;
        
        const cardElementToCheck = itemConfig.card || elements.card; 
        if (cardElementToCheck.classList.contains('hidden-card')) return; 
        
        const valueElement = elements.price;
        const newValueText = `${displayPrefix}${currentPrice.toFixed(digits)}`;

        // Apply color class to valueElement before text update for smoother transition
        // (Done later after changeEffect is determined)

        if (valueElement.textContent !== `${newValueText}${displaySuffix || ''}` && lastDisplayedPrice !== null && !valueElement.classList.contains('price-updating')) {
            valueElement.classList.add('price-updating');
            setTimeout(() => {
                valueElement.textContent = `${newValueText}${displaySuffix || ''}`;
                valueElement.classList.remove('price-updating');
            }, 150); // Short delay for fade
        } else if (valueElement.textContent !== `${newValueText}${displaySuffix || ''}`){
            valueElement.textContent = `${newValueText}${displaySuffix || ''}`;
        }

        let changeEffect = 'neutral';
        let percentageChangeText = '(---%)';

        if (lastDisplayedPrice !== null) { 
            const change = currentPrice - lastDisplayedPrice;
            let changeText = '';
            let priceChangeClass = 'neutral'; // This is for the change display span, not main price
            const epsilon = 0.5 * Math.pow(10, -digits); 

            if (change > epsilon) { 
                changeText = `▲ ${displayPrefix}${change.toFixed(digits)}`; 
                priceChangeClass = 'increase'; 
                changeEffect = 'increase'; 
                if (lastDisplayedPrice !== 0) {
                    const percentage = (change / lastDisplayedPrice) * 100;
                    percentageChangeText = `(+${percentage.toFixed(2)}%)`;
                } else {
                    percentageChangeText = '(NaN%)';
                }
            }
            else if (change < -epsilon) { 
                changeText = `▼ ${displayPrefix}${Math.abs(change).toFixed(digits)}`; 
                priceChangeClass = 'decrease'; 
                changeEffect = 'decrease'; 
                if (lastDisplayedPrice !== 0) {
                    const percentage = (change / lastDisplayedPrice) * 100;
                    percentageChangeText = `(${percentage.toFixed(2)}%)`;
                } else {
                    percentageChangeText = '(NaN%)';
                }
            }
            else { 
                changeText = `– ${displayPrefix}${(0).toFixed(digits)}`;
                priceChangeClass = 'neutral';
                changeEffect = 'neutral'; // Ensure changeEffect is neutral here too
                percentageChangeText = '(0.00%)';
            }
            elements.change.textContent = changeText;
            elements.change.className = priceChangeClass; // Sets class on the change span

            const changeTooltipElement = document.getElementById(`${name}-tooltip-text`);
            if (changeTooltipElement) {
                changeTooltipElement.textContent = `Previous: ${displayPrefix}${lastDisplayedPrice.toFixed(digits)}${displaySuffix || ''}`;
            }

            const cardElement = elements.card;
            if (cardElement) {
                if (flashTimeoutIds[name]) {
                    clearTimeout(flashTimeoutIds[name]);
                }
                cardElement.classList.remove('flash-increase', 'flash-decrease');
                let flashClassName = '';
                if (changeEffect === 'increase') flashClassName = 'flash-increase';
                else if (changeEffect === 'decrease') flashClassName = 'flash-decrease';

                if (flashClassName) {
                    void cardElement.offsetWidth; 
                    cardElement.classList.add(flashClassName);
                    flashTimeoutIds[name] = setTimeout(() => {
                        cardElement.classList.remove(flashClassName);
                    }, 700);
                }
            }
        } else {
            elements.change.textContent = '–';
            elements.change.className = 'neutral';
            changeEffect = 'neutral'; // Ensure changeEffect is neutral for initial load
            const changeTooltipElement = document.getElementById(`${name}-tooltip-text`);
            if (changeTooltipElement) {
                changeTooltipElement.textContent = `Previous: N/A`;
            }
        }

        // Update main price display color
        if (valueElement) {
            valueElement.classList.remove('increase', 'decrease', 'neutral'); // Remove old classes
            valueElement.classList.add(changeEffect); // Add current effect class
        }

        // Update percentage change display
        if (elements.percentageChange) {
            elements.percentageChange.textContent = percentageChangeText;
            elements.percentageChange.className = `percentage-change ${changeEffect}`;
        }

        const now = new Date();
        elements.updated.textContent = now.toLocaleTimeString();
        // const timestampTooltipElement = ... (already commented out)
    }
    
    // --- Event Listeners for Refresh Buttons (adjusting for visibility) ---
    apiConfigs.forEach(config => {
        if (config.elements.refreshBtn) {
            config.elements.refreshBtn.addEventListener('click', () => {
                fetchApiData(config, true);
            });
        }
    });

    if (altinTlGrElements.refreshBtn) {
        altinTlGrElements.refreshBtn.addEventListener('click', () => {
            if (altinTlGrElements.card.classList.contains('hidden-card')) return;

            setLoadingState(altinTlGrElements, true);
            altinTlGrElements.error.textContent = 'Refreshing dependencies...';

            const goldConfig = apiConfigs.find(c => c.valueKeyForCalculation === 'gold_usd_oz');
            const usdTryConfig = apiConfigs.find(c => c.valueKeyForCalculation === 'usd_try');
            
            let fetches = [];
            if (goldConfig) {
                fetches.push(fetchApiData(goldConfig, true));
            }
            if (usdTryConfig) {
                fetches.push(fetchApiData(usdTryConfig, true));
            }
            
            if (fetches.length < 2) { 
                 altinTlGrElements.error.textContent = 'Core dependency configuration error.';
                 setLoadingState(altinTlGrElements, false);
                 return;
            }

            Promise.allSettled(fetches).finally(() => {
                calculateAndDisplayAltinTlGr(); 
                setLoadingState(altinTlGrElements, false); 

                if (altinTlGrElements.error.textContent === 'Refreshing dependencies...') {
                     const { gold_usd_oz, usd_try } = currentFetchedValues;
                     if (gold_usd_oz !== null && usd_try !== null) {
                        altinTlGrElements.error.textContent = '';
                    } 
                }
            });
        });
    }
    
    if (refreshAllBtn) {
        refreshAllBtn.addEventListener('click', () => {
            refreshAllBtn.disabled = true;
            refreshAllBtn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Refreshing All...';

            let promises = apiConfigs.map(config => fetchApiData(config, true)); // Will fetch all, respects individual card visibility for DOM updates
            
            if(altinTlGrElements.card && !altinTlGrElements.card.classList.contains('hidden-card')){
                setLoadingState(altinTlGrElements, true);
                altinTlGrElements.error.textContent = 'Refreshing all data...';
            }
            
            Promise.allSettled(promises).finally(() => {
                if(altinTlGrElements.card && !altinTlGrElements.card.classList.contains('hidden-card')){
                    calculateAndDisplayAltinTlGr();
                    setLoadingState(altinTlGrElements, false);
                     if (altinTlGrElements.error.textContent === 'Refreshing all data...') {
                         const { gold_usd_oz, usd_try } = currentFetchedValues;
                        if (gold_usd_oz !== null && usd_try !== null) {
                             altinTlGrElements.error.textContent = '';
                        }
                    }
                }
                refreshAllBtn.disabled = false;
                refreshAllBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh All';
            });
        });
    }

    // --- Initialize Sparkline Chart Function ---
    function initializeSparkline(chartId, initialDataXY = []) {
        const chartElement = document.querySelector(`#${chartId}`);
        if (!chartElement) {
            return null;
        }

        const options = {
            chart: {
                id: chartId,
                type: 'line',
                height: '100%', // Fill container
                sparkline: {
                    enabled: true
                },
                animations: {
                    enabled: true,
                    easing: 'linear',
                    dynamicAnimation: {
                        speed: 500 // Animation speed when data updates
                    }
                },
                toolbar: { show: false },
                zoom: { enabled: false }
            },
            series: [{
                name: 'Price', // Will not be visible in sparkline usually
                data: initialDataXY // Pass the array of {x,y} objects
            }],
            stroke: {
                curve: 'smooth',
                width: 2
            },
            colors: [getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#3498db'], // Use CSS var
            tooltip: {
                enabled: true, // Basic tooltip showing value
                theme: document.documentElement.getAttribute('data-theme') || 'light', // Match theme
                x: {
                    show: true, // Show timestamp in tooltip
                    format: 'hh:mm:ss TT', // Format for time
                },
                y: {
                    formatter: function (val, { series, seriesIndex, dataPointIndex, w }) {
                        // Determine prefix and digits based on chartId or a passed config
                        let digits = 2;
                        let prefix = '';
                        const itemName = chartId.replace('-sparkline', ''); // Extract item name
                        const itemConfig = apiConfigs.find(c => c.name === itemName) || 
                                           (itemName === 'altinTlGr' ? { displayPrefix: '₺', digits: 2 } : {});
                        
                        prefix = itemConfig.displayPrefix || (itemName.toLowerCase().includes('usd') && !itemName.toLowerCase().includes('try') ? '$' : '');
                        digits = itemConfig.digits || 2;
                        
                        return val ? `${prefix}${val.toFixed(digits)}` : '';
                    }
                }
            },
            xaxis: { // For sparklines, these are usually hidden, but ApexCharts needs it if data is {x,y}
                type: 'datetime', // IMPORTANT for {x,y} data
                labels: { show: false },
                axisBorder: { show: false },
                axisTicks: { show: false },
                tooltip: { enabled: false } // Disable x-axis part of general tooltip if not desired
            },
            yaxis: {
                labels: { show: false }
            },
            grid: { show: false }
        };

        if (sparklineCharts[chartId]) {
            sparklineCharts[chartId].destroy(); // Destroy existing if re-initializing
        }
        try {
            const chart = new ApexCharts(chartElement, options);
            chart.render();
            sparklineCharts[chartId] = chart;
            return chart;
        } catch (e) {
            console.error(`Error initializing sparkline chart ${chartId}:`, e);
        }
        return null;
    }

    // Function to update sparkline data
    function updateSparkline(chartId, newDataArray) {
        if (sparklineCharts[chartId] && sparklineCharts[chartId].updateSeries) {
            sparklineCharts[chartId].updateSeries([{
                data: newDataArray
            }]);
        }
    }
    
    // Function to update sparkline color on theme change
    function updateAllSparklineColors() {
        const newColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim();
        const newTextColor = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim();
        const newBorderColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim();
        const newTooltipTheme = document.documentElement.getAttribute('data-theme') || 'light';

        // Update sparklines on cards
        for (const chartId in sparklineCharts) {
            if (sparklineCharts[chartId] && typeof sparklineCharts[chartId].updateOptions === 'function') {
                sparklineCharts[chartId].updateOptions({
                    colors: [newColor],
                    tooltip: { theme: newTooltipTheme }
                });
            }
        }

        // Update detailed chart if it's visible/instantiated
        if (detailedChartInstance) {
            detailedChartInstance.updateOptions({
                colors: [newColor],
                tooltip: { theme: newTooltipTheme },
                xaxis: { labels: { style: { colors: newTextColor } } },
                yaxis: { labels: { style: { colors: newTextColor } } },
                grid: { borderColor: newBorderColor }
            });
        }
    }

    // --- Function to update and display session high/low ---
    function updateSessionHighLow(itemName, currentPrice, itemConfig) {
        if (currentPrice === null || isNaN(currentPrice)) return;

        const { elements, displayPrefix, digits } = itemConfig;

        // Ensure elements for high/low display exist
        if (!elements.highDisplay || !elements.lowDisplay) {
            return;
        }

        if (sessionHighLow[itemName].high === null || currentPrice > sessionHighLow[itemName].high) {
            sessionHighLow[itemName].high = currentPrice;
        }
        if (sessionHighLow[itemName].low === null || currentPrice < sessionHighLow[itemName].low) {
            sessionHighLow[itemName].low = currentPrice;
        }

        // Update display
        if (sessionHighLow[itemName].high !== null) {
            elements.highDisplay.textContent = `H: ${displayPrefix}${sessionHighLow[itemName].high.toFixed(digits)}`;
        }
        if (sessionHighLow[itemName].low !== null) {
            elements.lowDisplay.textContent = `L: ${displayPrefix}${sessionHighLow[itemName].low.toFixed(digits)}`;
        }
    }

    // --- Notification Permission ---
    function requestNotificationPermission() {
        // Check if the Notification API is supported by the browser
        if (typeof Notification === 'undefined') {
            console.warn("This browser does not support desktop notification.");
            notificationPermission = "unsupported"; // Custom state
            if (activeAlertsList) activeAlertsList.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">Notifications not supported by this browser.</p>';
            if (addAlertBtn) addAlertBtn.disabled = true;
            if (document.getElementById('alert-setup-container')) { // Check if element exists
                document.getElementById('alert-setup-container').title = "Notifications not supported by this browser.";
            }
            renderActiveAlerts(); // Update alert list display based on new permission state
            return; 
        }

        // Proceed if Notification API exists
        if (Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                notificationPermission = permission; // Update our variable
                if (permission === 'granted') {
                    console.log('Notification permission granted.');
                    // Only create a notification if API is supported and permission granted
                    if (typeof Notification !== 'undefined' && Notification.permission === "granted") {
                        try {
                            new Notification('Piyasa AI Alerts', { body: 'Notifications are now enabled!', tag: 'permission-granted' });
                        } catch (e) {
                            console.warn("Error showing initial notification.", e);
                        }
                    }
                } else {
                    notificationPermission = 'denied'; // Explicitly set if denied after request
                    console.log('Notification permission denied.');
                }
                renderActiveAlerts(); // Re-render based on new permission
            });
        } else if (Notification.permission === 'denied') {
            console.warn('Notification permission is blocked. Please enable in browser settings.');
            notificationPermission = "denied"; // Ensure our variable reflects this
            renderActiveAlerts(); // Re-render
        } else if (Notification.permission === 'granted') {
            notificationPermission = "granted"; // Ensure our variable reflects this
            // renderActiveAlerts(); // No need to re-render if already granted and rendered unless state changed
        }
    }

    // --- Alert Management Functions ---
    function addAlert() {
        if (notificationPermission === "unsupported") {
            alert('Notifications are not supported by this browser. Alerts cannot be added.');
            return;
        }
        if (notificationPermission !== 'granted') {
            alert('Please grant notification permission first to add alerts. Check browser settings if blocked.');
            requestNotificationPermission(); // Prompt again or guide user
            return;
        }

        const item = alertItemSelect.value;
        const condition = alertConditionSelect.value;
        const valueString = alertValueInput.value.trim();

        if (valueString === '') {
            alert('Please enter a value for the alert.');
            alertValueInput.focus();
            return;
        }
        const value = parseFloat(valueString);
        const itemName = alertItemSelect.options[alertItemSelect.selectedIndex].text;

        if (isNaN(value)) {
            alert('Please enter a valid numeric value for the alert.');
            alertValueInput.focus();
            return;
        }

        const newAlert = {
            id: Date.now(),
            item: item,
            itemName: itemName,
            condition: condition,
            value: value,
            triggered: false 
        };

        configuredAlerts.push(newAlert);
        saveAlerts();
        renderActiveAlerts();
        alertValueInput.value = '';
    }

    function removeAlert(alertId) {
        configuredAlerts = configuredAlerts.filter(alert => alert.id !== alertId);
        saveAlerts();
        renderActiveAlerts();
    }

    function saveAlerts() {
        localStorage.setItem('configuredAlerts', JSON.stringify(configuredAlerts));
    }

    function loadAlerts() {
        const saved = localStorage.getItem('configuredAlerts');
        if (saved) {
            try {
                configuredAlerts = JSON.parse(saved);
                // Ensure all alerts have a triggered property (for older saved alerts)
                configuredAlerts.forEach(alert => {
                    if (typeof alert.triggered === 'undefined') {
                        alert.triggered = false;
                    }
                });
            } catch (e) {
                console.error("Error parsing saved alerts:", e);
                configuredAlerts = [];
            }
        }
        renderActiveAlerts();
    }

    function renderActiveAlerts() {
        if (!activeAlertsList) return;
        activeAlertsList.innerHTML = '';

        if (notificationPermission === "unsupported") {
            activeAlertsList.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">Desktop notifications are not supported by this browser.</p>';
            if(addAlertBtn) addAlertBtn.disabled = true;
            if (document.getElementById('alert-setup-container')) {
                document.getElementById('alert-setup-container').title = "Notifications not supported by this browser.";
            }
            return;
        }

        if (configuredAlerts.length === 0 && notificationPermission === 'granted') {
            activeAlertsList.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">No active alerts. Add one above!</p>';
            if(addAlertBtn) addAlertBtn.disabled = false;
            if (document.getElementById('alert-setup-container')) {
                document.getElementById('alert-setup-container').title = ""; // Clear title
            }
            return;
        } else if (notificationPermission !== 'granted') {
            if (Notification.permission === 'denied'){
                 activeAlertsList.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">Notifications blocked by browser.</p>';
            } else { // default
                 activeAlertsList.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">Grant notification permission to use alerts.</p>';
            }
            if(addAlertBtn) addAlertBtn.disabled = false; // Allow trying to grant
            if (document.getElementById('alert-setup-container')) {
                document.getElementById('alert-setup-container').title = "Grant permission to add alerts";
            }
            return;
        }
        
        // If we reach here, permission is granted and there might be alerts
        if(addAlertBtn) addAlertBtn.disabled = false;
        if (document.getElementById('alert-setup-container')) {
             document.getElementById('alert-setup-container').title = ""; // Clear title
        }

        configuredAlerts.forEach(alert => {
            const alertDiv = document.createElement('div');
            alertDiv.className = 'active-alert';
            alertDiv.dataset.alertId = alert.id;

            const conditionText = alert.condition === 'above' ? 'Price Above >' : 'Price Below <';
            
            let tempConfig = apiConfigs.find(c => c.name === alert.item);
            if (!tempConfig && alert.item === 'altinTlGr') {
                 tempConfig = { name: 'altinTlGr', displayPrefix: '₺', digits: 2, elements: altinTlGrElements };
            } else if (!tempConfig) {
                 tempConfig = { name: 'unknown', displayPrefix: '', digits: 2, elements: {} };
            }

            const prefix = tempConfig.displayPrefix || '';
            const valueDigits = tempConfig.digits || 2;

            alertDiv.innerHTML = `
                <span>${alert.itemName} ${conditionText} ${prefix}${alert.value.toFixed(valueDigits)}</span>
                <button class="remove-alert-btn" title="Remove Alert"><i class="fas fa-times"></i></button>
            `;
            alertDiv.querySelector('.remove-alert-btn').addEventListener('click', () => removeAlert(alert.id));
            activeAlertsList.appendChild(alertDiv);
        });
    }

    // --- Check Alerts Function (called after price updates) ---
    function checkAlerts(itemName, currentPrice) {
        // Updated check to include unsupported and ensure Notification exists before checking permission
        if (notificationPermission === "unsupported" || typeof Notification === 'undefined' || Notification.permission !== 'granted' || currentPrice === null || isNaN(currentPrice)) {
            return;
        }

        let alertTriggeredThisCheck = false;
        configuredAlerts.forEach(alert => {
            if (alert.item === itemName) {
                let conditionMet = false;
                if (alert.condition === 'above' && currentPrice > alert.value) {
                    conditionMet = true;
                } else if (alert.condition === 'below' && currentPrice < alert.value) {
                    conditionMet = true;
                }

                if (conditionMet) {
                    if (!alert.triggered) {
                        let tempConfig = apiConfigs.find(c => c.name === alert.item);
                        if (!tempConfig && alert.item === 'altinTlGr') {
                            tempConfig = { name: 'altinTlGr', displayPrefix: '₺', digits: 2 };
                        } else if (!tempConfig) {
                            tempConfig = { name: 'unknown', displayPrefix: '', digits: 4 };
                        }
                        const prefix = tempConfig.displayPrefix || '';
                        const digits = tempConfig.digits || 2;

                        const notificationTitle = `${alert.itemName} Alert!`;
                        const notificationBody = `${alert.itemName} is now ${prefix}${currentPrice.toFixed(digits)} (Alert: ${alert.condition === 'above' ? '>' : '<'} ${prefix}${alert.value.toFixed(digits)})`;
                        
                        // Final check before creating the notification instance
                        if (typeof Notification !== 'undefined' && Notification.permission === "granted") {
                            try {
                                new Notification(notificationTitle, {
                                    body: notificationBody,
                                    // icon: './assets/notification-icon.png', // Optional icon path
                                    tag: `price-alert-${alert.id}` 
                                });
                                alert.triggered = true;
                                alertTriggeredThisCheck = true;
                                console.log(`Alert triggered and notification sent for ${alert.itemName}`);
                            } catch(e) {
                                console.error("Error displaying notification:", e);
                            }
                        } else {
                             // This case should ideally not be reached if the initial checkAlerts guard is correct
                             console.warn("Attempted to send notification but permission no longer granted or API unavailable.");
                        }
                    }
                } else {
                    if (alert.triggered) {
                        alert.triggered = false;
                        alertTriggeredThisCheck = true;
                        console.log(`Alert condition no longer met for ${alert.itemName}, reset triggered flag.`);
                    }
                }
            }
        });
        if (alertTriggeredThisCheck) {
            saveAlerts(); // Save changes to 'triggered' status only if something changed
        }
    }

    // --- Function to Update or Create Ticker Items ---
    function updatePriceTicker() {
        if (!priceTickerItemsContainer || !priceTickerWrap) {
            return;
        }

        let tickerHTML = '';
        const itemsToDisplay = ['gold', 'usdTry', 'eurTry', 'altinTlGr', 'btcusd', 'ethusd', 'eurusd', 'xagusd'];
        let originalContentWidth = 0;

        itemsToDisplay.forEach(itemName => {
            const config = apiConfigs.find(c => c.name === itemName) || 
                           (itemName === 'altinTlGr' ? { name: 'altinTlGr', tickerName: 'ALTIN/GR', displayPrefix: '₺', digits: 2, elements: altinTlGrElements, card: altinTlGrElements.card } : null);
            
            if (!config) return;

            const cardElement = config.card || (config.elements && config.elements.card); // Ensure config.elements exists
            if(cardElement && cardElement.classList.contains('hidden-card')) return;

            const history = priceHistories[itemName] || [];
            // MODIFICATION: Access the 'y' property for current and previous prices
            const currentPriceDataPoint = history.length > 0 ? history[history.length - 1] : null;
            const previousPriceDataPoint = history.length > 1 ? history[history.length - 2] : null;
            
            const currentPriceVal = currentPriceDataPoint ? currentPriceDataPoint.y : null;
            const previousPriceVal = previousPriceDataPoint ? previousPriceDataPoint.y : null;
            
            let priceText = '--';
            let changeText = '–';
            let changeClass = 'neutral';
            let priceArrow = '– '; 
            const displayName = config.tickerName || itemName.toUpperCase(); 

            if (currentPriceVal !== null && !isNaN(currentPriceVal)) {
                // priceText = `${config.displayPrefix}${currentPriceVal.toFixed(config.digits)}`; // Original problematic line for priceText
                
                if (previousPriceVal !== null && !isNaN(previousPriceVal) && previousPriceVal !== 0) { 
                    const change = currentPriceVal - previousPriceVal;
                    const epsilon = 0.5 * Math.pow(10, -(config.digits || 2));
                    if (change > epsilon) {
                        changeText = `▲ ${config.displayPrefix}${change.toFixed(config.digits || 2)}`;
                        changeClass = 'increase';
                        priceArrow = '▲ ';
                    } else if (change < -epsilon) {
                        changeText = `▼ ${config.displayPrefix}${Math.abs(change).toFixed(config.digits || 2)}`;
                        changeClass = 'decrease';
                        priceArrow = '▼ ';
                    } else {
                         changeText = `–`; // No significant change
                         changeClass = 'neutral';
                         priceArrow = '– '; 
                    }
                } 
                
                priceText = `${priceArrow}${config.displayPrefix}${currentPriceVal.toFixed(config.digits)}`;
            } else {
                priceArrow = '– ';
                priceText = `${priceArrow}${config.displayPrefix || ''}--.--`; 
                 if(config.name === 'usdTry' || config.name === 'eurTry') priceText = `${priceArrow}${config.displayPrefix || ''}--.----`;
                 if(config.name === 'altinTlGr') priceText = `${priceArrow}${config.displayPrefix || ''}---.--`;
            }
            
            tickerHTML += `
                <div class="ticker-item" data-ticker-item-name="${itemName}">
                    <span class="ticker-name">${displayName}</span>
                    <span class="ticker-price ${changeClass}">${priceText}</span>
                    <span class="ticker-change ${changeClass}">${changeText}</span>
                </div>
            `;
        });

        if (tickerHTML.trim() === '') {
            priceTickerItemsContainer.innerHTML = ''; 
            priceTickerWrap.style.animation = 'none'; 
            return;
        }
        
        priceTickerItemsContainer.innerHTML = tickerHTML;
        
        requestAnimationFrame(() => {
            const originalWidth = priceTickerItemsContainer.offsetWidth;
            if (originalWidth > 0) { 
                priceTickerItemsContainer.innerHTML += tickerHTML; 
                let styleSheet = document.getElementById('dynamicTickerKeyframes');
                if (!styleSheet) {
                    styleSheet = document.createElement('style');
                    styleSheet.id = 'dynamicTickerKeyframes';
                    document.head.appendChild(styleSheet);
                }
                const keyframes = `
                    @keyframes ${tickerAnimationName} {
                        0% { transform: translateX(0); }
                        100% { transform: translateX(-${originalWidth}px); }
                    }
                `;
                if (styleSheet.innerHTML !== keyframes) { 
                    styleSheet.innerHTML = keyframes;
                }
                const scrollSpeed = 40; 
                const duration = originalWidth / scrollSpeed;
                const newAnimationValue = `${tickerAnimationName} ${duration}s linear infinite`;
                if (priceTickerWrap.style.animation !== newAnimationValue) {
                    priceTickerWrap.style.animation = newAnimationValue;
                }
            } else {
                if (priceTickerWrap.style.animation !== 'none') {
                    priceTickerWrap.style.animation = 'none';
                }
            }
        });
    }

    // --- Function to Show/Hide Modal ---
    function toggleDetailedChartModal(show, itemName = null) {
        if (show && itemName) {
            const config = apiConfigs.find(c => c.name === itemName) ||
                           (itemName === 'altinTlGr' ? { name: 'altinTlGr', tickerName: 'ALTIN (TL/GR)', displayPrefix: '₺', digits: 2 } : null);
            
            if (!config || !priceHistories[itemName] || priceHistories[itemName].length === 0) {
                console.warn("No data or config to show detailed chart for", itemName);
                return;
            }

            modalChartTitle.textContent = `Detailed Chart: ${config.tickerName || itemName.toUpperCase()}`;
            renderDetailedChart(itemName, priceHistories[itemName], config);

            detailedChartModal.classList.add('visible');
            chartModalOverlay.classList.add('visible');
            document.body.style.overflow = 'hidden'; // Prevent background scroll
        } else {
            detailedChartModal.classList.remove('visible');
            chartModalOverlay.classList.remove('visible');
            document.body.style.overflow = ''; // Restore background scroll
            if (detailedChartInstance) {
                detailedChartInstance.destroy(); // Destroy chart to free resources
                detailedChartInstance = null;
            }
        }
    }

    // --- Function to Render Detailed Chart in Modal ---
    function renderDetailedChart(itemName, dataXY, itemConfig) {
        if (detailedChartInstance) {
            detailedChartInstance.destroy();
        }

        // dataXY already contains {x: timestamp, y: price}
        const seriesData = dataXY.slice(-MAX_HISTORY_POINTS); // Or use full dataXY if preferred

        const options = {
            chart: {
                type: 'line',
                height: '100%', // Fill modal body
                toolbar: {
                    show: true,
                    tools: {
                        download: true,
                        selection: true,
                        zoom: true,
                        zoomin: true,
                        zoomout: true,
                        pan: true,
                        reset: true
                    },
                },
                zoom: { enabled: true },
                animations: { enabled: true, dynamicAnimation: { speed: 300 } } // Enable smoother updates
            },
            series: [{
                name: itemConfig.tickerName || itemName.toUpperCase(),
                data: seriesData // Pass the array of {x,y} objects
            }],
            colors: [getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#3498db'],
            stroke: {
                curve: 'smooth',
                width: 2
            },
            xaxis: {
                type: 'datetime', // VERY IMPORTANT: Set x-axis type to datetime
                labels: {
                    show: true, // Show x-axis labels (timestamps)
                    datetimeUTC: false, // Display in local time
                    format: 'hh:mm:ss TT', // Format for the labels e.g., 03:30:15 PM
                    style: {
                        colors: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim(),
                    },
                },
                tooltip: { // Tooltip for x-axis can show more detail if desired
                    enabled: true,
                    formatter: function(val) {
                        return new Date(val).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
                    }
                }
            },
            yaxis: {
                labels: {
                    style: {
                        colors: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim(),
                    },
                    formatter: function (val) {
                        return `${itemConfig.displayPrefix || ''}${val.toFixed(itemConfig.digits || 2)}`;
                    }
                }
            },
            tooltip: {
                theme: document.documentElement.getAttribute('data-theme') || 'light',
                x: {
                    format: 'hh:mm:ss TT dd MMM' // More detailed format for tooltip header
                },
                y: {
                    formatter: function (val) {
                        return `${itemConfig.displayPrefix || ''}${val.toFixed(itemConfig.digits || 2)}`;
                    }
                }
            },
            grid: {
                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim(),
                row: {
                    colors: ['transparent', 'transparent'], // transparent or themed
                    opacity: 0.5
                },
            },
            dataLabels: { enabled: false }
        };

        detailedChartInstance = new ApexCharts(detailedChartElement, options);
        detailedChartInstance.render();
    }

    // --- Event Listeners for Modal ---
    if(modalCloseBtn) modalCloseBtn.addEventListener('click', () => toggleDetailedChartModal(false));
    if(chartModalOverlay) chartModalOverlay.addEventListener('click', () => toggleDetailedChartModal(false));

    // --- Function to Setup Sparkline Click Listeners ---
    function setupSparklineClickListeners() {
        const clickableSparklines = document.querySelectorAll('.clickable-sparkline');
        clickableSparklines.forEach(container => {
            // Remove old listener before adding new one, to prevent duplicates if called multiple times
            const oldListener = container._sparklineClickListener;
            if (oldListener) {
                container.removeEventListener('click', oldListener);
            }
            
            const newListener = () => {
                const itemName = container.dataset.itemName;
                toggleDetailedChartModal(true, itemName);
            };
            container.addEventListener('click', newListener);
            container._sparklineClickListener = newListener; // Store reference for potential removal
        });
    }

    // --- INITIALIZATION (`initializeApp`) ---
    function initializeApp() {
        // Reset sessionHighLow on fresh load and update placeholders
        for (const itemName in sessionHighLow) {
            sessionHighLow[itemName] = { high: null, low: null };
            
            let configForHLElements = null;
            if (apiConfigs.find(c => c.name === itemName)) {
                configForHLElements = apiConfigs.find(c => c.name === itemName).elements;
            } else if (itemName === 'altinTlGr') {
                configForHLElements = altinTlGrElements;
            }

            if (configForHLElements) {
                if (configForHLElements.highDisplay) configForHLElements.highDisplay.textContent = `H: --`;
                if (configForHLElements.lowDisplay) configForHLElements.lowDisplay.textContent = `L: --`;
            }
        }

        if (mainContainer) loadCardOrder();
        loadCardVisibility();
        loadUpdateInterval(); 

        const LSSavedTheme = localStorage.getItem('theme') || 'light';
        setTheme(LSSavedTheme);
        
        const LSSavedCompactView = localStorage.getItem('compactView') === 'true';
        if (LSSavedCompactView && mainContainer && compactViewToggleBtn) {
            mainContainer.classList.add('compact-view');
            compactViewToggleBtn.innerHTML = '<i class="fas fa-expand-alt"></i>';
            compactViewToggleBtn.title = 'Switch to Normal View';
        } else if (compactViewToggleBtn) { 
            compactViewToggleBtn.innerHTML = '<i class="fas fa-compress-alt"></i>';
            compactViewToggleBtn.title = 'Switch to Compact View';
        }

        apiConfigs.forEach(config => {
            if (config.elements.sparklineId && !config.elements.card.classList.contains('hidden-card')) {
                initializeSparkline(config.elements.sparklineId, priceHistories[config.name]);
            }
        });
        if (altinTlGrElements.sparklineId && !altinTlGrElements.card.classList.contains('hidden-card')) { 
            initializeSparkline(altinTlGrElements.sparklineId, priceHistories.altinTlGr);
        }
        
        // Initial call to set trend indicators to default/placeholder state for all cards
        apiConfigs.forEach(config => {
            if (config.elements && (config.elements.trendIndicatorText || config.elements.momentumIndicatorText)) { // Check if elements exist
                updateTrendIndicators(config.name, config);
            }
        });
        if (altinTlGrElements.trendIndicatorText || altinTlGrElements.momentumIndicatorText) { // For ALTIN/GR
             updateTrendIndicators('altinTlGr', { elements: altinTlGrElements, card: altinTlGrElements.card });
        }

        cardVisibilityToggles.forEach(toggle => {
            toggle.addEventListener('change', (event) => {
                const cardId = event.target.dataset.cardId;
                const cardElement = document.getElementById(cardId);
                const isVisible = event.target.checked;

                if (cardElement) {
                    cardElement.classList.toggle('hidden-card', !isVisible);
                    if (cardId === 'gold-card' || cardId === 'usdtry-card' || cardId === 'altintlgr-card') {
                        calculateAndDisplayAltinTlGr(); 
                    }
                    if (isVisible && cardId !== 'altintlgr-card') {
                        const config = apiConfigs.find(c => c.elements.card.id === cardId);
                        if (config) {
                            fetchApiData(config, true); 
                        }
                    }
                    // Update trend indicators when visibility changes
                    const itemConfig = apiConfigs.find(c => c.elements.card.id === cardId) || 
                                       (cardId === 'altintlgr-card' ? { name: 'altinTlGr', elements: altinTlGrElements, card: altinTlGrElements.card } : null);
                    if (itemConfig) {
                        updateTrendIndicators(itemConfig.name, itemConfig);
                    }
                }
                saveCardVisibility();
                updatePriceTicker();
            });
        });

        requestNotificationPermission();
        loadAlerts();

        if(addAlertBtn) {
            addAlertBtn.addEventListener('click', addAlert);
        } else {
            console.warn("#add-alert-btn not found.");
        }

        updatePriceTicker();
        startMainInterval();

        if (mainContainer) {
            Sortable.create(mainContainer, {
                animation: 150,
                ghostClass: 'sortable-ghost',
                chosenClass: 'sortable-chosen',
                onEnd: saveCardOrder
            });
        }
        setupCloseCardButtons();
        setupSparklineClickListeners();
    }

    initializeApp();
});