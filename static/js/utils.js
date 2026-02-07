/**
 * Format number as currency (ARS/USD style but general)
 * @param {number} value 
 * @returns {string}
 */
function formatCurrency(value) {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
}

/**
 * Debounce function to limit rate of execution
 * @param {Function} func 
 * @param {number} timeout 
 * @returns {Function}
 */
function debounce(func, timeout = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}

/**
 * Create an HTML element from string
 * @param {string} htmlString 
 * @returns {Element}
 */
/**
 * Get tailwind color classes based on category string
 * @param {string} category 
 * @returns {string} Tailwind classes
 */
function getCategoryColor(category) {
    if (!category) return 'bg-gray-100 text-gray-800';

    const colors = [
        'bg-blue-100 text-blue-800',
        'bg-green-100 text-green-800',
        'bg-purple-100 text-purple-800',
        'bg-orange-100 text-orange-800',
        'bg-pink-100 text-pink-800',
        'bg-teal-100 text-teal-800',
        'bg-indigo-100 text-indigo-800',
        'bg-cyan-100 text-cyan-800'
    ];

    // Simple hash function to pick color consistently
    let hash = 0;
    for (let i = 0; i < category.length; i++) {
        hash = category.charCodeAt(i) + ((hash << 5) - hash);
    }

    const index = Math.abs(hash) % colors.length;
    return colors[index];
}

