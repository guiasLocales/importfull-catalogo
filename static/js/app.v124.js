document.addEventListener('DOMContentLoaded', function () {

    // Helper for category colors (inlined to avoid cache issues with utils.js)
    function getCategoryColor(category) {
        if (!category) return 'bg-gray-100 text-gray-800';
        const colors = [
            'bg-blue-100 text-blue-800', 'bg-green-100 text-green-800',
            'bg-purple-100 text-purple-800', 'bg-orange-100 text-orange-800',
            'bg-pink-100 text-pink-800', 'bg-teal-100 text-teal-800',
            'bg-indigo-100 text-indigo-800', 'bg-cyan-100 text-cyan-800'
        ];
        let hash = 0;
        for (let i = 0; i < category.length; i++) {
            hash = category.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    }

    // Helper for currency formatting (inlined from utils.js)
    function formatCurrency(value) {
        if (value === null || value === undefined) return '-';
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value);
    }

    const state = {
        products: [],
        page: 1,
        limit: 50,
        total: 0,
        search: '',
        sortBy: 'product_code',
        sortOrder: 'asc',
        selectedIds: new Set(),
        isLoading: false,
        filters: {
            category: '',
            brand: '',
            stock_filter: '',
            channel_filter: ''
        },
        currentView: 'inventory',
        meliPage: 1,
        meliLimit: 100,
        meliTotal: 0
    };

    let currentMeliAttrs = null;
    const elements = {
        container: document.getElementById('productsContainer'),
        loading: document.getElementById('loadingOverlay'),
        empty: document.getElementById('emptyState'),
        checkAll: document.getElementById('checkAll'),
        btnBulkPublish: document.getElementById('btnBulkPublish'),
        btnBulkPublishTN: document.getElementById('btnBulkPublishTN'),
        btnBulkUnpublish: document.getElementById('btnBulkUnpublish'),
        selectedCountPublish: document.getElementById('selectedCountPublish'),
        selectedCountTN: document.getElementById('selectedCountTN'),
        selectedCountUnpublish: document.getElementById('selectedCountUnpublish'),
        btnPrev: document.getElementById('btnPrev'),
        btnNext: document.getElementById('btnNext'),
        pageStart: document.getElementById('pageStart'),
        pageEnd: document.getElementById('pageEnd'),
        totalItems: document.getElementById('totalItems'),
        searchInput: document.getElementById('searchInput'),
        filterCategory: document.getElementById('filterCategory'),
        filterBrand: document.getElementById('filterBrand'),
        btnToggleStock: document.getElementById('btnToggleStock'),
        stockToggleLabel: document.getElementById('stockToggleLabel'),
        limitSelector: document.getElementById('limitSelector'),
        filterChannel: document.getElementById('filterChannel'),
        btnClearFilters: document.getElementById('btnClearFilters'),
        sortHeaders: document.querySelectorAll('.sortable'),
        modalBackdrop: document.getElementById('modalBackdrop'),
        modalContent: document.getElementById('modalContent'),
        modalBody: document.getElementById('modalBody'),
        pageIndicator: document.getElementById('pageIndicator'),
        btnNewProduct: document.getElementById('btnNewProduct'),
        btnConnectDrive: document.getElementById('btnConnectDrive'),
        btnMeliPrev: document.getElementById('btnMeliPrev'),
        btnMeliNext: document.getElementById('btnMeliNext'),
        meliPageStart: document.getElementById('meliPageStart'),
        meliPageEnd: document.getElementById('meliPageEnd'),
        meliTotalPagination: document.getElementById('meliTotalPagination'),
        meliLimitSelector: document.getElementById('meliLimitSelector')
    };

    // --- Check for Auth Success in URL ---
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('drive_success')) {
        showAlert('Google Drive', 'Google Drive conectado con éxito.', 'success');
    }
    if (urlParams.has('drive_error')) {
        showAlert('Google Drive', 'Error al conectar con Google Drive.', 'error');
    }

    if (elements.btnConnectDrive) {
        elements.btnConnectDrive.addEventListener('click', async () => {
            try {
                const response = await authFetch('/api/drive/auth-url');
                if (response.ok) {
                    const data = await response.json();
                    if (data.auth_url) {
                        window.location.href = data.auth_url;
                    }
                } else {
                    showAlert('Error', 'Error al obtener la URL de autenticación', 'error');
                }
            } catch (e) {
                console.error(e);
                showAlert('Error', 'Error al conectar con el servidor', 'error');
            }
        });
    }





    // --- Authenticated Fetch Helper ---
    function getAuthHeaders(extraHeaders = {}) {
        const token = localStorage.getItem('token');
        return {
            'Authorization': `Bearer ${token}`,
            ...extraHeaders
        };
    }

    async function authFetch(url, options = {}) {
        const token = localStorage.getItem('token');
        if (!token) {
            if (window.logout) window.logout();
            return new Response(null, { status: 401 });
        }

        const mergedHeaders = {
            ...(options.headers || {}),
            'Authorization': `Bearer ${token}`
        };

        const response = await fetch(url, {
            ...options,
            headers: mergedHeaders
        });

        if (response.status === 401) {
            if (window.logout) window.logout();
        }
        return response;
    }
    window.authFetch = authFetch;

    // --- API ---

    async function fetchProducts() {
        console.log('[DEBUG] fetchProducts called');
        setLoading(true);
        try {
            const skip = (state.page - 1) * state.limit;

            let url = '/api/products/';
            let params = new URLSearchParams({
                skip: skip,
                limit: state.limit
            });

            // Search & Filters
            if (state.search && state.search.trim().length > 0) {
                params.append('q', state.search);
            }
            if (state.filters.category) params.append('category', state.filters.category);
            if (state.filters.stock_filter) params.append('stock_filter', state.filters.stock_filter);
            if (state.filters.channel_filter) params.append('channel_filter', state.filters.channel_filter);

            // Sorting
            if (state.sortBy) {
                params.append('sort_by', state.sortBy);
                params.append('sort_order', state.sortOrder);
            }

            const authToken = localStorage.getItem('token');
            console.log('[DEBUG] Token exists:', !!authToken);
            if (!authToken) { setLoading(false); return; }

            const fullUrl = `${url}?${params.toString()}`;
            console.log('[DEBUG] Fetching:', fullUrl);
            const response = await fetch(fullUrl, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });

            console.log('[DEBUG] Response status:', response.status);
            if (response.status === 401) { window.logout(); return; }
            if (!response.ok) throw new Error('Error fetching products: ' + response.status);

            const data = await response.json();
            console.log('[DEBUG] Data type:', typeof data, 'isArray:', Array.isArray(data), 'length:', Array.isArray(data) ? data.length : 'N/A');


            if (Array.isArray(data)) {
                state.products = data;
                // Best guess total strictly for pagination UI feedback if backend doesn't return total
                // If less than limit returned, we know we are at end.
                if (data.length < state.limit) {
                    state.total = skip + data.length;
                } else {
                    state.total = skip + 1000; // Arbitrary "more"
                }
            } else {
                state.products = data.items || data;
                state.total = data.total || state.products.length;
            }

            console.log('[DEBUG] state.products.length:', state.products.length);
            renderProducts();
            updatePagination();
        } catch (error) {
            console.error('[DEBUG] fetchProducts ERROR:', error);
            // Show error on screen for debugging
            if (elements.container) {
                elements.container.innerHTML = `<div class="p-8 text-center text-red-600">Error: ${error.message}</div>`;
            }
        } finally {
            setLoading(false);
        }
    }

    async function loadCategories() {
        if (!elements.filterCategory) return;
        try {
            const response = await authFetch('/api/products/categories');
            if (response.ok) {
                const categories = await response.json();
                const firstOption = elements.filterCategory.options[0];
                elements.filterCategory.innerHTML = '';
                if (firstOption) elements.filterCategory.appendChild(firstOption);
                
                categories.forEach(cat => {
                    if (!cat) return;
                    const option = document.createElement('option');
                    option.value = cat;
                    option.textContent = cat;
                    elements.filterCategory.appendChild(option);
                });
            }
        } catch (e) {
            console.error('Error loading categories:', e);
        }
    }

    async function deleteProductApi(id) {
        const response = await authFetch(`/api/products/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Error deleting product');
        return true;
    }

    // --- Navigation Logic ---
    window.switchView = (viewName) => {
        console.log("Switching to view:", viewName);
        
        const views = {
            inventory: document.getElementById('inventoryView'),
            mercadolibre: document.getElementById('meliView'),
            tiendanube: document.getElementById('tiendaNubeView'),
            competence: document.getElementById('competenceView'),
            settings: document.getElementById('settingsView'),
            prompts: document.getElementById('promptsView'),
            orders: document.getElementById('ordersView')
        };
        
        const navButtons = {
            inventory: document.getElementById('navInventory'),
            mercadolibre: document.getElementById('navMeli'),
            tiendanube: document.getElementById('navTiendaNube'),
            competence: document.getElementById('navCompetence'),
            settings: document.getElementById('navSettings'),
            prompts: document.getElementById('navPrompts'),
            orders: document.getElementById('navOrders')
        };
        
        state.currentView = viewName;

        // 1. Hide ALL views and clear styles
        Object.keys(views).forEach(key => {
            const v = views[key];
            if (v) {
                v.classList.add('hidden');
                v.style.display = 'none';
                v.style.width = '0';
                v.style.height = '0';
            }
        });

        // 2. Deactivate all nav buttons
        Object.keys(navButtons).forEach(key => {
            const b = navButtons[key];
            if (b) {
                b.classList.remove('bg-blue-50', 'text-blue-700', 'bg-yellow-50', 'text-yellow-700', 'bg-purple-50', 'text-purple-700', 'bg-indigo-50', 'text-indigo-700');
                b.style.background = '';
                b.style.color = '';
                b.classList.add('text-gray-700', 'hover:bg-gray-50');
            }
        });

        // 3. Show selected view with forced layout
        const currentView = views[viewName];
        if (currentView) {
            currentView.classList.remove('hidden');
            currentView.style.display = 'flex';
            currentView.style.width = '100%';
            currentView.style.height = '100%';
            currentView.style.flexDirection = 'column';
            currentView.style.opacity = '1';
            currentView.style.visibility = 'visible';
            console.log("View ACTIVATED:", viewName);
            
            // Trigger specific loaders
            if (viewName === 'mercadolibre' && typeof loadMeliProducts === 'function') {
                loadMeliProducts();
            } else if (viewName === 'tiendanube' && typeof loadTiendaNubeProducts === 'function') {
                loadTiendaNubeProducts();
            } else if (viewName === 'competence' && typeof loadCompetenceData === 'function') {
                loadCompetenceData();
            } else if (viewName === 'inventory' && typeof renderProducts === 'function') {
                renderProducts();
            }
        } else {
            console.error("CRITICAL: View ID not found for:", viewName);
            // Fallback to inventory if error
            if (viewName !== 'inventory') window.switchView('inventory');
        }

        // 4. Highlight active nav button
        const currentBtn = navButtons[viewName];
        if (currentBtn) {
            currentBtn.classList.remove('text-gray-700', 'hover:bg-gray-50');
            if (viewName === 'mercadolibre') {
                currentBtn.classList.add('bg-yellow-50', 'text-yellow-700');
            } else if (viewName === 'competence') {
                currentBtn.classList.add('bg-purple-50', 'text-purple-700');
            } else if (viewName === 'tiendanube') {
                currentBtn.style.background = '#EEF0FF';
                currentBtn.style.color = '#1B2160';
            } else if (viewName === 'prompts') {
                currentBtn.classList.add('bg-indigo-50', 'text-indigo-700');
            } else {
                currentBtn.classList.add('bg-blue-50', 'text-blue-700');
            }
        }

        // 5. Load data with error handling per view
        try {
            if (viewName === 'orders') {
                if (typeof fetchOrdersDashboardData === 'function') fetchOrdersDashboardData();
                else console.warn("fetchOrdersDashboardData function missing");
            }
            if (viewName === 'mercadolibre') {
                if (typeof loadMeliProducts === 'function') loadMeliProducts();
                else console.warn("loadMeliProducts function missing");
            }
            if (viewName === 'competence') {
                if (typeof loadCompetenceData === 'function') loadCompetenceData();
                else console.warn("loadCompetenceData function missing");
            }
            if (viewName === 'prompts') {
                if (typeof loadPrompts === 'function') loadPrompts();
                else console.warn("loadPrompts function missing");
            }
            if (viewName === 'tiendanube') {
                if (typeof loadTiendaNubeProducts === 'function') loadTiendaNubeProducts();
                else console.warn("loadTiendaNubeProducts function missing");
            }
        } catch (e) {
            console.error("Error loading specific view data:", e);
        }

        // 6. Refresh icons
        if (typeof updateSortIndicators === 'function') updateSortIndicators();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    };



    // --- Render ---

    function renderProducts() {
        console.log("Rendering products, count:", state.products.length);
        elements.container.innerHTML = '';


        if (state.products.length === 0) {
            if (!state.isLoading) elements.empty.classList.remove('hidden');
            elements.container.innerHTML = '';
            return;
        } else {
            elements.empty.classList.add('hidden');
        }

        // Check filter active state for UI
        const hasFilters = state.search || state.filters.category || state.filters.brand || state.filters.stock_filter;
        if (hasFilters) {
            elements.btnClearFilters.classList.remove('hidden');
            elements.btnClearFilters.classList.add('flex');
        } else {
            elements.btnClearFilters.classList.add('hidden');
            elements.btnClearFilters.classList.remove('flex');
        }

        state.products.forEach(product => {
            // Desktop Row
            const isSelected = state.selectedIds.has(product.id.toString());
            const rowHtml = `
            <div class="hidden md:grid grid-cols-12 gap-4 px-6 py-4 border-b border-gray-100 hover:bg-blue-50/50 transition-colors items-center group relative bg-white">
                <div class="col-span-1 flex items-center justify-center">
                    <input type="checkbox" value="${product.id}" 
                        class="row-checkbox rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                        ${isSelected ? 'checked' : ''}>
                </div>
                <div class="col-span-1 text-sm font-medium text-gray-900 truncate" title="${product.product_code || ''}">
                    ${product.product_code || '-'}
                </div>
                <div class="col-span-2 flex items-center space-x-3 cursor-pointer" onclick="openProductDetail(${product.id})">
                    <div class="h-10 w-10 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                        <img src="${product.product_image_b_format_url || 'https://via.placeholder.com/40'}" 
                             alt="" class="h-full w-full object-cover">
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-gray-900 truncate hover:text-blue-600 transition-colors" title="${product.product_name}">${product.product_name}</p>
                        <p class="text-xs truncate mt-0.5"><span class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide inline-block ${getCategoryColor(product.product_type_path)}">${product.product_type_path || 'Sin categoría'}</span></p>
                    </div>
                </div>

                <div class="col-span-1 text-sm text-gray-600">${product.stock || 0}</div>
                <div class="col-span-1 text-sm text-gray-600 font-medium">$ ${product.cost !== null && product.cost !== undefined && product.cost !== '' ? Number(product.cost).toLocaleString('es-AR') : '-'}</div>
                
                <!-- Precio ML -->
                <div class="col-span-1 flex items-center">
                    <div class="relative w-full group/price">
                        <span class="absolute left-1 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-[10px] pointer-events-none">$</span>
                        <input type="number" 
                               value="${product.price_mercadolibre || ''}" 
                               onchange="updateProductPriceInline(${product.id}, this.value, this)"
                               onclick="event.stopPropagation()"
                               class="w-full pl-3.5 pr-1 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-transparent rounded hover:bg-gray-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors shadow-sm text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                               step="0.01">
                    </div>
                </div>

                <!-- Precio TN -->
                <div class="col-span-1 flex items-center">
                    <div class="relative w-full group/price">
                        <span class="absolute left-1 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-[10px] pointer-events-none">$</span>
                        <input type="number" 
                               value="${product.price_tienda_nube || ''}" 
                               onchange="updateTNPriceInline(${product.id}, this.value, this)"
                               onclick="event.stopPropagation()"
                               class="w-full pl-3.5 pr-1 py-1 text-xs font-semibold text-blue-700 bg-blue-50/50 border border-transparent rounded hover:bg-blue-100 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors shadow-sm text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                               step="0.01">
                    </div>
                </div>

                <!-- Precio Local -->
                <div class="col-span-1 flex items-center justify-end pr-1">
                    <span class="text-xs font-semibold text-gray-500 bg-gray-50 px-1.5 py-1 rounded border border-gray-100">$ ${product.price !== null && product.price !== undefined && product.price !== '' ? Number(product.price).toLocaleString('es-AR') : '-'}</span>
                </div>

                <!-- Publicación logos -->
                <div class="col-span-2 flex items-center justify-center gap-4">
                    ${(() => {
                        let logos = '';
                        const s = product.status ? product.status.toLowerCase() : '';
                        
                        // MercadoLibre Logo
                        if (product.meli_id) {
                             logos += `<a href="${product.permalink || '#'}" target="_blank" rel="noopener" class="flex flex-col items-center gap-0.5 group/meli" title="MeLi: ${product.meli_id}" onclick="event.stopPropagation()">
                                <img src="/static/img/meli-logo-light.png" alt="ML" class="h-6 object-contain">
                                <span class="text-[8px] font-mono text-gray-400 group-hover/meli:text-yellow-600 transition-colors">${product.meli_id}</span>
                             </a>`;
                        }
                        
                        // Tienda Nube Logo
                        if (product.tienda_nube_status === 'active') {
                             logos += `<button onclick="event.stopPropagation(); openTiendaNubeModal(${product.id})" class="flex flex-col items-center gap-0.5 group/tn" title="Tienda Nube Activo">
                                <div class="h-6 w-8 flex items-center justify-center bg-[#EEF0FF] rounded">
                                    <svg class="h-4 w-4" viewBox="0 0 56 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                                      <circle cx="18" cy="26" r="13" stroke="#1B2160" stroke-width="5" fill="none"/>
                                      <circle cx="36" cy="18" r="15" stroke="#1B2160" stroke-width="5" fill="none"/>
                                    </svg>
                                </div>
                                <span class="text-[8px] font-bold text-[#1B2160]">ACTIVO</span>
                             </button>`;
                        }

                        if (!logos) {
                            if (s === 'en proceso') return '<span class="px-2 py-1 bg-blue-100 text-blue-700 text-[10px] font-bold uppercase rounded-full animate-pulse">En Proceso</span>';
                            return '<span class="text-[10px] text-gray-400 font-medium italic">No Publicado</span>';
                        }
                        return logos;
                    })()}
                </div>

                <div class="col-span-1 flex items-center justify-end">
                    ${product.status && product.status.toLowerCase() === 'active'
                    ? `<div class="flex flex-col gap-1">
                            <button onclick="togglePublish(${product.id}, false, this)" 
                                class="px-2 py-1 text-[10px] font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 rounded transition-colors whitespace-nowrap" title="Pausar">
                                Pausar
                            </button>
                       </div>`
                    : `<div class="flex flex-col gap-1">
                            <button onclick="togglePublish(${product.id}, true, this)" 
                                class="px-2 py-1 text-[10px] font-medium text-green-600 bg-green-50 hover:bg-green-100 rounded transition-colors whitespace-nowrap" title="Publicar">
                                Publicar
                            </button>
                       </div>`}
                </div>
            </div>
        `;


            // Mobile Card
            const cardHtml = `
            <div class="md:hidden bg-white p-4 mb-3 rounded-lg shadow-sm border border-gray-200 relative">
                <div class="absolute top-4 right-4">
                    ${product.status && product.status.toLowerCase() === 'active'
                    ? `<button onclick="togglePublish(${product.id}, false, this)" class="px-2 py-1 text-xs font-medium text-red-600 bg-red-50 rounded">Pausar</button>`
                    : `<button onclick="togglePublish(${product.id}, true, this)" class="px-2 py-1 text-xs font-medium text-green-600 bg-green-50 rounded">Publicar</button>`}
                </div>
                <div class="flex items-start space-x-3 mb-3">
                    <div class="flex items-center h-5">
                       <input type="checkbox" value="${product.id}" 
                        class="row-checkbox rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                        ${isSelected ? 'checked' : ''}>
                    </div>
                    <img src="${product.product_image_b_format_url || 'https://via.placeholder.com/80'}" class="h-16 w-16 mobile-img rounded-lg border border-gray-200" onclick="openProductDetail(${product.id})">
                    <div>
                        <h4 class="font-medium text-gray-900 text-sm line-clamp-1" onclick="openProductDetail(${product.id})">${product.product_name}</h4>
                        <p class="text-xs text-gray-500 mb-1">${product.product_code}</p>
                        <div class="flex items-center gap-2 mt-1">
                            <div class="relative w-24 group/price">
                                <span class="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-sm pointer-events-none">$</span>
                                <input type="number" 
                                       value="${product.price_mercadolibre || ''}" 
                                       onchange="updateProductPriceInline(${product.id}, this.value, this)"
                                       onclick="event.stopPropagation()"
                                       class="w-full pl-6 pr-2 py-1 text-sm font-semibold text-gray-800 bg-gray-100 border border-transparent rounded hover:bg-gray-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                                       step="0.01">
                            </div>
                            <span class="text-[10px] text-gray-500 bg-gray-50 border border-gray-100 px-2 py-1 rounded font-medium truncate max-w-[80px]" title="Precio Local">L: $${product.price !== null && product.price !== undefined && product.price !== '' ? Number(product.price).toLocaleString('es-AR') : '-'}</span>
                        </div>
                    </div>
                </div>
                <div class="flex items-center justify-between border-t border-gray-100 pt-3 mt-2">
                    <div class="text-xs">
                        <span class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide inline-block ${getCategoryColor(product.product_type_path)}">${product.product_type_path || 'Sin Cat'}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        ${product.meli_id ? `<img src="/static/img/meli-logo-light.png" alt="ML" class="h-4 object-contain">` : ''}
                        ${product.tienda_nube_status === 'active' ? `
                            <svg class="h-4 w-4" viewBox="0 0 56 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="18" cy="26" r="13" stroke="#1B2160" stroke-width="3" fill="none"/>
                                <circle cx="36" cy="18" r="15" stroke="#1B2160" stroke-width="3" fill="none"/>
                            </svg>` : ''}
                    </div>
                </div>
            </div>
        `;


            elements.container.insertAdjacentHTML('beforeend', rowHtml);
            elements.container.insertAdjacentHTML('beforeend', cardHtml);
        });

        lucide.createIcons();
        attachCheckboxListeners();
    }

    function updatePagination() {
        const start = (state.page - 1) * state.limit + 1;
        let end = start + state.products.length - 1;
        if (state.products.length === 0) end = 0;

        elements.pageStart.textContent = state.products.length > 0 ? start : 0;
        elements.pageEnd.textContent = end;

        // Update total text based on filters
        const hasFilters = state.search || state.filters.category || state.filters.brand || state.filters.stock_filter;
        if (hasFilters) {
            elements.totalItems.textContent = `${state.products.length} (Filtrados)`;
        } else {
            elements.totalItems.textContent = state.total > 1000 ? "1000+" : state.total;
        }

        if (elements.btnPrev) elements.btnPrev.disabled = state.page === 1;
        // Disable next if we received fewer than limit, implying end
        if (elements.btnNext) elements.btnNext.disabled = state.products.length < state.limit;
    }

    function setLoading(isLoading) {
        state.isLoading = isLoading;
        if (isLoading) {
            elements.loading.classList.remove('hidden');
        } else {
            elements.loading.classList.add('hidden');
        }
    }

    // --- Logic ---

    function attachCheckboxListeners() {
        const checkboxes = document.querySelectorAll('.row-checkbox');
        checkboxes.forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = e.target.value;
                if (e.target.checked) {
                    state.selectedIds.add(id);
                } else {
                    state.selectedIds.delete(id);
                }
                updateSelectionUI();
            });
        });
    }

    function updateSelectionUI() {
        const count = state.selectedIds.size;
        if (elements.selectedCountPublish) elements.selectedCountPublish.textContent = count;
        if (elements.selectedCountTN) elements.selectedCountTN.textContent = count;
        if (elements.selectedCountUnpublish) elements.selectedCountUnpublish.textContent = count;

        if (count > 0) {
            if (elements.btnBulkPublish) elements.btnBulkPublish.classList.remove('hidden');
            if (elements.btnBulkPublishTN) elements.btnBulkPublishTN.classList.remove('hidden');
            if (elements.btnBulkUnpublish) elements.btnBulkUnpublish.classList.remove('hidden');

            // Determine "Select All" state based on visible products matches
            const allVisibleSelected = state.products.length > 0 && state.products.every(p => state.selectedIds.has(p.id.toString()));
            const someVisibleSelected = state.products.some(p => state.selectedIds.has(p.id.toString()));

            elements.checkAll.indeterminate = someVisibleSelected && !allVisibleSelected;
            elements.checkAll.checked = allVisibleSelected;
        } else {
            if (elements.btnBulkPublish) elements.btnBulkPublish.classList.add('hidden');
            if (elements.btnBulkPublishTN) elements.btnBulkPublishTN.classList.add('hidden');
            if (elements.btnBulkUnpublish) elements.btnBulkUnpublish.classList.add('hidden');
            elements.checkAll.indeterminate = false;
            elements.checkAll.checked = false;
        }
    }


    window.updateProductPriceInline = async (id, newPrice, inputEl) => {
        const parsedPrice = parseFloat(newPrice);
        if (isNaN(parsedPrice)) return;
        
        const originalBg = inputEl.classList.contains('bg-gray-100') ? 'bg-gray-100' : '';
        const originalHover = inputEl.classList.contains('hover:bg-gray-200') ? 'hover:bg-gray-200' : '';
        const originalText = inputEl.classList.contains('text-gray-800') ? 'text-gray-800' : '';
        
        // Show loading state by removing gray and making it orange
        inputEl.classList.remove('bg-gray-100', 'hover:bg-gray-200', 'text-gray-800');
        inputEl.classList.add('bg-orange-500', 'text-white');
        
        try {
            const response = await authFetch(`/api/products/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ price_mercadolibre: parsedPrice })
            });

            if (!response.ok) throw new Error('Error al guardar precio');

            // Success state
            inputEl.classList.remove('bg-orange-500');
            inputEl.classList.add('bg-green-600');
            
            // Update local state
            const productIndex = state.products.findIndex(p => p.id === id);
            if (productIndex >= 0) {
                state.products[productIndex].price_mercadolibre = parsedPrice;
                // If detail modal is open for this product, update it too
                const detailPrice = document.getElementById('edit_price');
                if (detailPrice && currentDetailIndex === productIndex) {
                    detailPrice.value = parsedPrice;
                }
            }
            
            // Restore colors after a second
            setTimeout(() => {
                inputEl.classList.remove('bg-green-600', 'text-white');
                if (originalText) inputEl.classList.add(originalText);
                if (originalBg) inputEl.classList.add(originalBg);
                if (originalHover) inputEl.classList.add(originalHover);
            }, 1000);

        } catch (e) {
            console.error(e);
            showAlert('Error', 'Error al guardar el precio.', 'error');
            
            // Error state
            inputEl.classList.remove('bg-orange-500');
            inputEl.classList.add('bg-red-600', 'text-white');
            setTimeout(() => {
                inputEl.classList.remove('bg-red-600', 'text-white');
                if (originalText) inputEl.classList.add(originalText);
                if (originalBg) inputEl.classList.add(originalBg);
                if (originalHover) inputEl.classList.add(originalHover);
                // Revert to old valid value? Not strictly necessary, but could be nice.
            }, 1500);
        }
    };

    window.updateTNPriceInline = async (id, newPrice, inputEl) => {
        const parsedPrice = parseFloat(newPrice);
        if (isNaN(parsedPrice)) return;
        
        const originalBg = inputEl.classList.contains('bg-blue-50/50') ? 'bg-blue-50/50' : '';
        const originalHover = inputEl.classList.contains('hover:bg-blue-100') ? 'hover:bg-blue-100' : '';
        const originalText = inputEl.classList.contains('text-blue-700') ? 'text-blue-700' : '';
        
        inputEl.classList.remove('bg-blue-50/50', 'hover:bg-blue-100', 'text-blue-700');
        inputEl.classList.add('bg-orange-500', 'text-white');
        
        try {
            const response = await authFetch(`/api/products/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ price_tienda_nube: parsedPrice })
            });

            if (!response.ok) throw new Error('Error al guardar precio TN');

            inputEl.classList.remove('bg-orange-500');
            inputEl.classList.add('bg-green-600');
            
            const productIndex = state.products.findIndex(p => p.id === id);
            if (productIndex >= 0) {
                state.products[productIndex].price_tienda_nube = parsedPrice;
            }
            
            setTimeout(() => {
                inputEl.classList.remove('bg-green-600', 'text-white');
                if (originalText) inputEl.classList.add(originalText);
                if (originalBg) inputEl.classList.add(originalBg);
                if (originalHover) inputEl.classList.add(originalHover);
            }, 1000);
        } catch (e) {
            console.error('Error updating TN price:', e);
            inputEl.classList.remove('bg-orange-500');
            inputEl.classList.add('bg-red-600');
            setTimeout(() => {
                inputEl.classList.remove('bg-red-600', 'text-white');
                if (originalText) inputEl.classList.add(originalText);
                if (originalBg) inputEl.classList.add(originalBg);
                if (originalHover) inputEl.classList.add(originalHover);
            }, 2000);
        }
    };

    // Global function for product deletion from MercadoLibre (Direct Frontend Call)
    window.deleteMeliProduct = async (id, buttonElement) => {
        showConfirm('Eliminar Publicación', '¿Estás seguro de que deseas eliminar esta publicación de MercadoLibre? Esta acción no se puede deshacer.', async () => {
            const button = buttonElement || (window.event && window.event.currentTarget);
            const originalHTML = button ? button.innerHTML : '';

            if (button) {
                button.disabled = true;
                button.innerHTML = '<i data-lucide="loader-2" class="h-4 w-4 animate-spin"></i>';
                if (window.lucide) lucide.createIcons();
            }

            try {
                const response = await authFetch(`/api/products/${id}/delete-meli`, {
                    method: 'DELETE'
                });

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.detail || 'Error al eliminar');
                }

                showAlert('Éxito', 'Solicitud de eliminación enviada con éxito.', 'success', () => closeModal());
                
                // Update local state
                const productIndex = state.products.findIndex(p => p.id === id);
                if (productIndex >= 0) {
                    state.products[productIndex].status = 'eliminando';
                }
                renderProducts();
                fetchProducts();

            } catch (e) {
                console.error('Error deleting product from ML:', e);
                showAlert('Error', 'Error al eliminar: ' + e.message, 'error');
            } finally {
                if (button) {
                    button.disabled = false;
                    button.innerHTML = originalHTML;
                    if (window.lucide) lucide.createIcons();
                }
            }
        }, 'danger');
    };

    // Global function for publish toggle
    window.togglePublish = async (id, publish, buttonElement) => {
        const action = publish ? 'publish' : 'pause';
        const loadingText = publish ? 'Publicando...' : 'Pausando...';

        // Find the button that was clicked (use event.target or passed element)
        const button = buttonElement || event?.target;
        const originalText = button ? button.textContent : '';

        // Show loading state
        if (button) {
            button.disabled = true;
            button.textContent = loadingText;
            button.classList.add('opacity-50', 'cursor-wait');
        }

        try {
            const response = await authFetch(`/api/products/${id}/publish`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: action })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'Error al actualizar');
            }

            // Success: Update local state with intermediate status and re-render
            const newStatus = publish ? 'en proceso' : 'pausando';
            const productIndex = state.products.findIndex(p => p.id === id);
            if (productIndex >= 0) {
                state.products[productIndex].status = newStatus;
            }
            renderProducts();

            // Note: We do NOT call fetchProducts() here to avoid overwriting "En Proceso" 
            // with the old DB status before the webhook finishes.

        } catch (e) {
            console.error('Error updating publish status:', e);
            showAlert('Error', 'Error al cambiar estado: ' + e.message, 'error');
        } finally {
            // Restore button state
            if (button) {
                button.disabled = false;
                button.textContent = originalText; // Or flip it? For now restore original, renderProducts will likely recreate the button anyway.
                button.classList.remove('opacity-50', 'cursor-wait');
            }
        }
    };



    // --- Product Detail View ---

    // Track current product index for navigation
    let currentDetailIndex = -1;

    // Debounced version of save for auto-save
    const debouncedSave = (id) => {
        // We use a simple timer here because the global debounce function might not be easily accessible 
        // depending on closure scope, so we implement a quick one or ensure we can call it.
        if (window._autoSaveTimer) clearTimeout(window._autoSaveTimer);

        const statusEl = document.getElementById('auto-save-status');
        if (statusEl) {
            statusEl.innerHTML = '<span class="text-gray-400 italic text-xs">Cambios pendientes...</span>';
        }

        window._autoSaveTimer = setTimeout(async () => {
            if (statusEl) {
                statusEl.innerHTML = '<span class="flex items-center gap-1.5 text-blue-600 animate-pulse text-xs font-medium"><div class="h-2 w-2 bg-blue-600 rounded-full"></div> Guardando...</span>';
            }

            const updates = {};
            const nameEl = document.getElementById('edit_product_name_meli');
            if (nameEl) updates.product_name_meli = nameEl.value;
            const linkEl = document.getElementById('edit_catalog_link');
            if (linkEl) updates.catalog_link = linkEl.value;
            const descEl = document.getElementById('edit_description');
            if (descEl) updates.description = descEl.value;
            const priceEl = document.getElementById('edit_price');
            if (priceEl && priceEl.value !== "") updates.price_mercadolibre = parseFloat(priceEl.value);

            const priceTNEl = document.getElementById('edit_price_tienda_nube');
            if (priceTNEl && priceTNEl.value !== "") updates.price_tienda_nube = parseFloat(priceTNEl.value);

            // MercadoLibre Business Fields
            const listingEl = document.getElementById('edit_listing_type_id');
            if (listingEl) updates.listing_type_id = listingEl.value;
            
            const modeEl = document.getElementById('edit_mode_shipping');
            if (modeEl) updates.mode_shipping = modeEl.value;
            
            const freeEl = document.getElementById('edit_free_shipping');
            if (freeEl) updates.free_shipping = freeEl.checked ? 1 : 0;

            // Compose dimentions from separate fields
            const dH = document.getElementById('dim_h');
            const dW = document.getElementById('dim_w');
            const dL = document.getElementById('dim_l');
            const dWt = document.getElementById('dim_weight');
            if (dH && dW && dL && dWt) {
                const h = dH.value.trim(), w = dW.value.trim(), l = dL.value.trim(), wt = dWt.value.trim();
                if (h || w || l || wt) {
                    updates.dimentions = `${h || 0}x${w || 0}x${l || 0},${wt || 0}`;
                } else {
                    updates.dimentions = '';
                }
            }
            // Cost and Precio Local are read-only, so we don't send them in auto-save updates anymore.

            try {
                const response = await authFetch(`/api/products/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updates)
                });

                if (!response.ok) throw new Error('Error al guardar');
                const updatedProduct = await response.json();

                // Update local state con el producto real devuelto por la base de datos
                const productIndex = state.products.findIndex(p => p.id === id);
                if (productIndex >= 0) {
                    state.products[productIndex] = updatedProduct;
                }

                if (statusEl) {
                    statusEl.innerHTML = '<span class="text-green-600 flex items-center gap-1 text-xs font-bold"><i data-lucide="check" class="h-3 w-3"></i> Guardado</span>';
                    if (window.lucide) lucide.createIcons();
                    setTimeout(() => {
                        if (statusEl && statusEl.innerText.includes('Guardado')) {
                            statusEl.innerHTML = '';
                        }
                    }, 2000);
                }
            } catch (e) {
                console.error(e);
                if (statusEl) {
                    statusEl.innerHTML = '<span class="text-red-600 text-xs font-medium">Error al guardar</span>';
                }
            }
        }, 800);
    };

    window.triggerAutoSave = (id) => {
        debouncedSave(id);
    };

    window.saveProductDetails = async (id) => {
        // Fallback for manual trigger if ever needed, but now redirected to auto-save logic
        debouncedSave(id);
    };

    window.triggerMeliCalculation = async (productCode) => {
        try {
            const btn = event.currentTarget;
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin text-blue-600"></i>';
            if (window.lucide) lucide.createIcons();
            
            const response = await authFetch(`/api/selling/by-code/${productCode}/calculate`, {
                method: 'POST'
            });
            
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || 'Error al iniciar cálculo');
            }
            
            const data = await response.json();
            showAlert('Cálculo Iniciado', data.message || 'Cálculo iniciado. Vuelve a abrir el modal en unos segundos.', 'success');
            
            setTimeout(() => {
                btn.innerHTML = '<i data-lucide="check" class="w-4 h-4 text-green-500"></i>';
                if (window.lucide) lucide.createIcons();
                setTimeout(() => {
                    btn.innerHTML = originalHTML;
                    if (window.lucide) lucide.createIcons();
                    // Auto refresh the modal to show the new costs after 3 seconds
                    if (currentDetailIndex !== -1) {
                         const currentProduct = state.products[currentDetailIndex];
                         if (currentProduct) refreshProductDetail(currentProduct.id);
                    }
                }, 3000);
            }, 1000);
            
        } catch (error) {
            console.error('Error calculando costos ML:', error);
            showAlert('Error de Cálculo', error.message, 'error');
            event.currentTarget.innerHTML = '<i data-lucide="calculator" class="w-4 h-4"></i>';
            if (window.lucide) lucide.createIcons();
        }
    };

    // Refresh product detail without closing the modal
    window.refreshProductDetail = async function (productId) {
        try {
            const response = await authFetch(`/api/products/${productId}`);
            if (!response.ok) throw new Error('Error al cargar producto');
            const updatedProduct = await response.json();

            // Update local state
            const idx = state.products.findIndex(p => p.id === productId);
            if (idx >= 0) state.products[idx] = updatedProduct;

            // Re-open the detail with fresh data
            await openProductDetail(productId);
        } catch (e) {
            console.error(e);
            showAlert('Error', 'Error al refrescar: ' + e.message, 'error');
        }
    };

    function requiredBadge(isRequired) {
        return isRequired ? `<span class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800/40">Requerido por MercadoLibre</span>` : '';
    }

    function showIfRequired(requiredVal, html) {
        return (requiredVal === 1 || requiredVal === true || requiredVal === '1') ? html : '';
    }

    function hasNotMappedAttributes(notMapped) {
        if (!notMapped) return false;
        try {
            const attrs = typeof notMapped === 'string' ? JSON.parse(notMapped) : notMapped;
            return Object.keys(attrs).length > 0;
        } catch(e) {
            return true;
        }
    }

    function formatNotMappedAttributes(notMapped) {
        if (!notMapped) return '<p class="text-xs text-gray-400 dark:text-gray-500 italic">No hay atributos no mapeados.</p>';
        try {
            const attrs = typeof notMapped === 'string' ? JSON.parse(notMapped) : notMapped;
            if (Object.keys(attrs).length === 0) {
                return '<p class="text-xs text-gray-400 dark:text-gray-500 italic">No hay atributos no mapeados.</p>';
            }
            return `
                <div class="space-y-2 max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50/50 dark:bg-gray-800/20">
                    ${Object.entries(attrs).map(([key, val]) => `
                        <div class="flex items-start justify-between py-1 border-b border-gray-150 dark:border-gray-800 last:border-0 text-xs">
                            <span class="font-bold text-gray-600 dark:text-gray-400 font-mono">${key}</span>
                            <span class="text-gray-900 dark:text-gray-250 bg-white dark:bg-gray-700 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-600">${typeof val === 'object' ? JSON.stringify(val) : val}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        } catch(e) {
            return `<pre class="text-xs font-mono bg-red-50 dark:bg-red-950/20 p-2 text-red-700 dark:text-red-400 rounded border border-red-100 dark:border-red-850/30 overflow-x-auto">${String(notMapped)}</pre>`;
        }
    }

    async function openProductDetail(productId) {
        setLoading(true);

        // Find current index in products list
        currentDetailIndex = state.products.findIndex(p => p.id === productId);

        try {
            // Always fetch fresh data for detail view
            const [resProduct, resFiles, resMeliAttrs] = await Promise.all([
                authFetch(`/api/products/${productId}`),
                authFetch(`/api/products/${productId}/files`).catch(() => ({ ok: false, json: () => [] })),
                authFetch(`/api/products/${productId}/mercadolibre-attributes`).catch(() => ({ ok: false, json: () => null }))
            ]);

            if (!resProduct.ok) throw new Error('Error fetching product details');
            const product = await resProduct.json();
            const files = resFiles.ok ? await resFiles.json() : [];

            // Load meli attributes
            let meliAttrs = null;
            if (resMeliAttrs && resMeliAttrs.ok) {
                meliAttrs = await resMeliAttrs.json();
            } else {
                // Check if there is a local mock
                const mock = localStorage.getItem(`mock_meli_attrs_${productId}`);
                if (mock) {
                    try {
                        meliAttrs = JSON.parse(mock);
                    } catch(e) {}
                }
            }

            if (!meliAttrs) {
                meliAttrs = {
                    currency_id: 'ARS',
                    buying_mode: 'buy_it_now',
                    condition_type: 'new',
                    category_id: '',
                    local_pick_up: true,
                    logistic_type: 'drop_off',
                    warranty_type: 'Garantía del vendedor',
                    warranty_time: '30 días',
                    volume_capacity: null,
                    volume_capacity_required: false,
                    units_per_pack: 1,
                    units_per_pack_required: false,
                    value_added_tax: '48405909',
                    value_added_tax_required: false,
                    import_duty: '49553239',
                    import_duty_required: false,
                    empty_gtin_reason: '17055160',
                    empty_gtin_reason_required: false,
                    not_mapped_attributes: null,
                    allowed_options: null,
                    category_options: null,
                    ink_color: '',
                    ink_color_required: false,
                    pot_type: '',
                    pot_type_required: false,
                    product_type: '',
                    product_type_required: false,
                    output_connectors: '',
                    output_connectors_required: false,
                    surveillance_camera_type: '',
                    surveillance_camera_type_required: false,
                    camera_locations: '',
                    camera_locations_required: false,
                    cable_and_adapter_type: '',
                    cable_and_adapter_type_required: false,
                    data_storage_capacity: '',
                    data_storage_capacity_required: false,
                    usb_port_version: '',
                    usb_port_version_required: false,
                    capacity: '',
                    capacity_required: false,
                    power_supply_type: '',
                    power_supply_type_required: false,
                    grading: '',
                    grading_required: false,
                    with_usb: '',
                    with_usb_required: false,
                    size: '',
                    size_required: false,
                    color: '',
                    color_required: false,
                    gender: '',
                    gender_required: false,
                    name: '',
                    name_required: false,
                    iron_type: '',
                    iron_type_required: false,
                    input_connector: '',
                    input_connector_required: false,
                    thermal_container_type: '',
                    thermal_container_type_required: false,
                    is_factory_kit: '',
                    is_factory_kit_required: false,
                    pieces_number: null,
                    pieces_number_required: false,
                    material: '',
                    material_required: false,
                    drinking_glass_product_type: '',
                    drinking_glass_product_type_required: false,
                    makeup_format: '',
                    makeup_format_required: false,
                    eyeliner_type: '',
                    eyeliner_type_required: false,
                    backpack_type: '',
                    backpack_type_required: false,
                    faucet_control_type: '',
                    faucet_control_type_required: false,
                    makeup_brushes_number: null,
                    makeup_brushes_number_required: false,
                    finish: '',
                    finish_required: false,
                    lip_liner_type: '',
                    lip_liner_type_required: false,
                    board_game_name: '',
                    board_game_name_required: false,
                    listing_type_id: product.listing_type_id || 'gold_special',
                    free_shipping: product.free_shipping !== undefined ? product.free_shipping : 0,
                    mode_shipping: product.mode_shipping || 'me1'
                };
            }

            currentMeliAttrs = meliAttrs;

            // Try to fetch automated ML costs
            let meliCosts = null;
            if (product.product_code) {
                try {
                    const resCosts = await authFetch(`/api/selling/by-code/${product.product_code}`);
                    if (resCosts.ok) {
                        meliCosts = await resCosts.json();
                    }
                } catch(e) {
                    console.warn("No automated meli costs found");
                }
            }

            // Determine if product is active based on MercadoLibre status
            const isActive = product.status && product.status.toLowerCase() === 'active';
            const hasPrev = currentDetailIndex > 0;
            const hasNext = currentDetailIndex < state.products.length - 1;

            // Parse category_options if present
            let categoryOptions = null;
            if (meliAttrs && meliAttrs.category_options) {
                try {
                    categoryOptions = typeof meliAttrs.category_options === 'string' ? JSON.parse(meliAttrs.category_options) : meliAttrs.category_options;
                } catch(e) {
                    console.error("Error parsing category_options:", e);
                }
            }

            // Parse allowed_options if present
            let allowedOptions = null;
            if (meliAttrs && meliAttrs.allowed_options) {
                try {
                    allowedOptions = typeof meliAttrs.allowed_options === 'string' ? JSON.parse(meliAttrs.allowed_options) : meliAttrs.allowed_options;
                } catch(e) {
                    console.error("Error parsing allowed_options:", e);
                }
            }


            const html = `
            <div class="is-product-detail max-w-5xl flex flex-col md:flex-row h-full min-h-0 relative w-full">
                <!-- Close Button (Top-Right) -->
                <button onclick="closeModal()" 
                    class="absolute right-2 top-2 z-20 p-2 bg-white/90 hover:bg-gray-100 rounded-full shadow-lg transition-all border border-gray-200"
                    title="Cerrar">
                    <i data-lucide="x" class="h-5 w-5 text-gray-600"></i>
                </button>

                <!-- Navigation Arrows -->
                <button onclick="navigateProduct(-1)" id="btnPrevProduct"
                    class="absolute left-1 top-1/2 -translate-y-1/2 z-10 p-1.5 bg-white/80 rounded-full shadow hover:bg-gray-100 transition-colors ${hasPrev ? '' : 'opacity-30 cursor-not-allowed'}"
                    ${hasPrev ? '' : 'disabled'}>
                    <i data-lucide="chevron-left" class="h-4 w-4 text-gray-600"></i>
                </button>
                <button onclick="navigateProduct(1)" id="btnNextProduct"
                    class="absolute right-1 top-1/2 -translate-y-1/2 z-10 p-1.5 bg-white/80 rounded-full shadow hover:bg-gray-100 transition-colors ${hasNext ? '' : 'opacity-30 cursor-not-allowed'}"
                    ${hasNext ? '' : 'disabled'}>
                    <i data-lucide="chevron-right" class="h-4 w-4 text-gray-600"></i>
                </button>

                <!-- Left: Huge Image -->
                <div class="w-full md:w-5/12 bg-gray-100 flex flex-col p-4 border-r border-gray-200 overflow-y-auto custom-scrollbar">
                    <div class="flex-1 flex items-center justify-center mb-4 relative min-h-[200px] md:min-h-[300px] bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <img id="main-product-image" 
                             src="${product.product_image_b_format_url || (files && files.length > 0 ? (files[0].thumbnailLink || files[0].webContentLink) : 'https://via.placeholder.com/400?text=Sin+Imagen')}" 
                             alt="${product.product_name}" 
                             referrerpolicy="no-referrer"
                             onerror="this.onerror=null;this.src='https://via.placeholder.com/400?text=Error+Carga';this.classList.add('opacity-50');"
                             class="max-h-[300px] md:max-h-[500px] max-w-full object-contain transition-opacity duration-300">
                    </div>

                    ${files && files.length > 0 ? `
                    <div class="w-full overflow-x-auto custom-scrollbar pt-2">
                        <div class="flex gap-2">
                             <!-- Main Original Image Thumbnail -->
                             ${product.product_image_b_format_url ? `
                             <button onclick="document.getElementById('main-product-image').src='${product.product_image_b_format_url}'" 
                                     class="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 border-transparent hover:border-blue-500 focus:border-blue-500 transition-all bg-white shadow-sm">
                                <img src="${product.product_image_b_format_url}" class="w-full h-full object-cover">
                             </button>
                             ` : ''}

                            ${files.map(file => `
                                <button onclick="document.getElementById('main-product-image').src='${file.largeImageLink || file.thumbnailLink}'" 
                                        class="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 border-transparent hover:border-blue-500 focus:border-blue-500 transition-all relative group bg-white shadow-sm">
                                    <img src="${file.thumbnailLink}" alt="${file.name}" class="w-full h-full object-cover" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOTA5MDkwIiBzdHJva2Utd2lkdGg9IjIiPjxwYXRoIGQ9Ik0yMSAxNXV2NGEyIDIgMCAwIDEtMiAySDVhMiAyIDAgMCAxLTItMnYtNG0xNC0ybC0tNHYxMm00LQhMNyA5Ii8+PC9zdmc+';this.style.padding='10px';">
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
                    <div class="mt-4 w-full mb-4">
                        <button onclick="syncMeliPicturesToTN(${product.id}, this)" class="w-full py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 border border-blue-200 shadow-sm">
                            <i data-lucide="image-plus" class="h-4 w-4"></i> Sincronizar Imágenes (ML ➔ TN)
                        </button>
                    </div>
                </div>

                <!-- Right: Details -->
                <div class="w-full md:w-7/12 overflow-y-auto custom-scrollbar flex flex-col min-h-0 bg-white">
                    <div class="p-6 md:p-8 mb-5 border-b border-gray-100 pb-5">
                        <div class="flex justify-between items-start mb-2">
                            <span class="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md ${getCategoryColor(product.product_type_path)}">
                                ${product.product_type_path || 'General'}
                            </span>
                            <div class="flex gap-2">
                                <button onclick="refreshProductDetail(${product.id})" 
                                        class="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                        title="Refrescar datos">
                                    <i data-lucide="refresh-cw" class="h-4 w-4"></i>
                                </button>
                            </div>
                        </div>
                        
                        <h2 class="text-xl font-bold text-gray-900 leading-tight mb-1">
                            ${product.product_name}
                        </h2>
                        
                        ${product.meli_id ? `
                        <div class="mb-4 bg-yellow-50 rounded-lg border border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-700/30 overflow-hidden">
                            <div class="p-3 flex items-center justify-between border-b border-yellow-200/50">
                                <div class="flex items-center gap-3">
                                    <img src="/static/img/meli-logo-light.png" alt="MercadoLibre" class="h-10 object-contain dark:hidden">
                                    <img src="/static/img/meli-logo-dark.png" alt="MercadoLibre" class="h-10 object-contain hidden dark:block">
                                    <div>
                                        <p class="text-[10px] text-yellow-700 dark:text-yellow-500 uppercase font-bold tracking-wider">MercadoLibre ID</p>
                                        <a href="${product.permalink || 'https://www.mercadolibre.com.ar/p/' + product.meli_id}" 
                                           target="_blank" 
                                           class="text-blue-600 font-bold hover:underline dark:text-blue-400 text-sm">
                                            ${product.meli_id}
                                        </a>
                                    </div>
                                </div>
                                <button onclick="window.openPerformanceModal('${product.meli_id}', '${product.product_name.replace(/'/g, "\\'")}')"
                                        class="px-3 py-1.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-xs font-bold shadow-sm transition-all flex items-center gap-2">
                                    <i data-lucide="target" class="h-3.5 w-3.5"></i> Ver Auditoría
                                </button>
                            </div>
                            <div id="detail-performance-summary-${product.id}" class="p-3 bg-white/50 dark:bg-black/20 flex items-center justify-between">
                                <span class="text-xs text-gray-500 italic">Cargando calidad...</span>
                            </div>
                        </div>
                        
                        <script>
                            // Small inline script to fetch score for this specific modal
                            (async () => {
                                try {
                                    const res = await fetch('/api/performance/scores/bulk?meli_ids=${product.meli_id}', {
                                        headers: {'Authorization': 'Bearer ' + localStorage.getItem('token')}
                                    });
                                    if (res.ok) {
                                        const scores = await res.json();
                                        const container = document.getElementById('detail-performance-summary-${product.id}');
                                        if (scores.length > 0 && container) {
                                            const s = scores[0];
                                            const color = s.overall_score >= 90 ? 'text-green-600' : (s.overall_score >= 70 ? 'text-blue-600' : 'text-orange-600');
                                            container.innerHTML = \`
                                                <div class="flex items-center gap-2">
                                                    <span class="text-xs font-bold text-gray-600 capitalize">\${s.quality_level || ''} \${s.level_wording || ''}</span>
                                                </div>
                                                <div class="flex items-center gap-1">
                                                    <span class="text-lg font-black \${color}">\${s.overall_score}%</span>
                                                </div>
                                            \`;
                                        } else if (container) {
                                            container.innerHTML = '<span class="text-xs text-gray-400">Sin datos de calidad publicados</span>';
                                        }
                                    }
                                } catch(e) {}
                            })();
                        </script>` : ''}

                        <div class="px-6 md:px-8 flex items-center gap-3 text-sm text-gray-500">
                             <span>ID: ${product.id}</span>
                             <span class="text-gray-300">|</span>
                             <span>SKU: ${product.product_code}</span>
                        </div>
                    </div>

                    <!-- Tabs Navigation -->
                    <div class="px-6 md:px-8 border-b border-gray-200 dark:border-gray-700 flex gap-6 mb-4">
                        <button onclick="window.switchDetailTab('general')" id="tabBtn-general" 
                                class="pb-3 border-b-2 border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400 font-bold text-sm transition-all focus:outline-none flex items-center gap-2">
                            <i data-lucide="file-text" class="h-4 w-4"></i> Datos Básicos
                        </button>
                        <button onclick="window.switchDetailTab('attributes')" id="tabBtn-attributes" 
                                class="pb-3 border-b-2 border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-medium text-sm transition-all focus:outline-none flex items-center gap-2">
                            <i data-lucide="sliders" class="h-4 w-4"></i> Atributos MercadoLibre
                        </button>
                    </div>

                    <!-- General Tab Content -->
                    <div id="detailTab-general" class="space-y-4">

                        <!-- Editable Fields Section -->
                        <div class="px-6 md:px-8 space-y-4 mb-6">
                            
                            <!-- Meli Name -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-100 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                                    Nombre en MercadoLibre
                                </label>
                                <div class="flex gap-2">
                                    <input type="text" id="edit_product_name_meli" 
                                       value="${product.product_name_meli || ''}" oninput="triggerAutoSave(${product.id})" 
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow shadow-sm placeholder-gray-400 dark:bg-gray-700 dark:text-white" 
                                       placeholder="Nombre optimizado para publicación...">
                                    <button id="btn-ai-product_name_meli" onclick="triggerAIPrePublish(${product.id}, 'product_name_meli')" 
                                        class="px-3 py-2 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg border border-purple-200 transition-colors shadow-sm dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800/50"
                                        title="Generar con AI">
                                        <i data-lucide="sparkles" class="h-4 w-4"></i>
                                    </button>
                                </div>
                            </div>

                             <!-- Catalog Link -->
                            <div>
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                                    Link de Catálogo / Proveedor
                                </label>
                                <div class="flex gap-2">
                                    <div class="relative flex-1">
                                        <input type="text" id="edit_catalog_link" 
                                               value="${product.catalog_link || ''}" oninput="triggerAutoSave(${product.id})"
                                               class="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow shadow-sm dark:bg-gray-700 dark:text-white" 
                                               placeholder="https://...">
                                        <i data-lucide="link" class="absolute left-3 top-2.5 h-4 w-4 text-gray-400"></i>
                                    </div>
                                    ${product.catalog_link ? `
                                    <a href="${product.catalog_link}" target="_blank" 
                                       class="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-400 hover:text-blue-600 text-gray-500 dark:text-gray-450 transition-colors shadow-sm"
                                       title="Abrir enlace">
                                         <i data-lucide="external-link" class="h-5 w-5"></i>
                                    </a>` : ''}
                                </div>
                            </div>

                            <!-- Dimentions (Collapsible) -->
                            ${(() => {
                                const raw = product.dimentions || '';
                                let dH = '', dW = '', dL = '', dWt = '';
                                if (raw) {
                                    const parts = raw.split(',');
                                    const dims = (parts[0] || '').split('x');
                                    dH = dims[0] || ''; dW = dims[1] || ''; dL = dims[2] || '';
                                    dWt = parts[1] || '';
                                }
                                const hasDims = dH || dW || dL || dWt;
                                return `
                            <details class="group bg-gray-50 dark:bg-gray-800/20 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden transition-all duration-300 open:shadow-sm open:bg-white dark:open:bg-gray-800/40 open:border-blue-200 dark:open:border-blue-900/60" ${hasDims ? 'open' : ''}>
                                <summary class="flex items-center justify-between p-3 cursor-pointer list-none hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors select-none">
                                    <div class="flex items-center gap-2">
                                        <div class="bg-gray-200/60 dark:bg-gray-700 p-1.5 rounded-lg text-gray-500 dark:text-gray-400 group-open:bg-blue-100 group-open:text-blue-600 dark:group-open:bg-blue-900/40 dark:group-open:text-blue-400 transition-colors">
                                            <i data-lucide="ruler" class="h-4 w-4"></i>
                                        </div>
                                        <div>
                                            <span class="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Dimensiones</span>
                                            <span class="text-[10px] text-gray-400 dark:text-gray-500 ml-2 font-normal">${hasDims ? dH+'x'+dW+'x'+dL+', '+dWt+'g' : 'Sin cargar'}</span>
                                        </div>
                                    </div>
                                    <i data-lucide="chevron-down" class="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180"></i>
                                </summary>
                                <div class="p-3 pt-1 border-t border-gray-100 dark:border-gray-700">
                                    <div class="grid grid-cols-4 gap-2">
                                        <div>
                                            <label class="block text-[10px] text-gray-500 dark:text-gray-400 mb-1 font-medium">Alto (cm)</label>
                                            <input type="number" id="dim_h" value="${dH}" oninput="triggerAutoSave(${product.id})"
                                                   onkeypress="return event.charCode >= 48 && event.charCode <= 57"
                                                   class="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                   placeholder="0" step="1">
                                        </div>
                                        <div>
                                            <label class="block text-[10px] text-gray-500 dark:text-gray-400 mb-1 font-medium">Ancho (cm)</label>
                                            <input type="number" id="dim_w" value="${dW}" oninput="triggerAutoSave(${product.id})"
                                                   onkeypress="return event.charCode >= 48 && event.charCode <= 57"
                                                   class="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                   placeholder="0" step="1">
                                        </div>
                                        <div>
                                            <label class="block text-[10px] text-gray-500 dark:text-gray-400 mb-1 font-medium">Largo (cm)</label>
                                            <input type="number" id="dim_l" value="${dL}" oninput="triggerAutoSave(${product.id})"
                                                   onkeypress="return event.charCode >= 48 && event.charCode <= 57"
                                                   class="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                   placeholder="0" step="1">
                                        </div>
                                        <div>
                                            <label class="block text-[10px] text-gray-500 dark:text-gray-400 mb-1 font-medium">Peso (g)</label>
                                            <input type="number" id="dim_weight" value="${dWt}" oninput="triggerAutoSave(${product.id})"
                                                   onkeypress="return event.charCode >= 48 && event.charCode <= 57"
                                                   class="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                   placeholder="0" step="1">
                                        </div>
                                    </div>
                                </div>
                            </details>`;
                            })()}

                        </div>

                        <!-- Key Stats Grid -->
                        <div class="px-6 md:px-8">
                            <div class="grid grid-cols-2 lg:grid-cols-5 gap-6 mb-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
                                <!-- Costo -->
                                <div class="flex flex-col">
                                    <label class="block text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-1.5 uppercase tracking-widest whitespace-nowrap">Costo ($)</label>
                                    <input type="number" id="edit_cost" value="${product.cost || ''}" readonly
                                           class="w-full h-11 px-3 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-bold text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-800/50 cursor-not-allowed shadow-inner [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" step="0.01">
                                </div>
                                
                                <!-- Precio ML (ESPANDIDO PERO LETRA NORMAL) -->
                                <div class="flex flex-col lg:col-span-2 relative">
                                    <label class="block text-[10px] font-black text-blue-600 dark:text-blue-400 mb-1.5 uppercase tracking-widest whitespace-nowrap">Precio Mercado Libre ($)</label>
                                    <div class="relative flex items-center">
                                        <input type="number" id="edit_price" value="${product.price_mercadolibre || ''}" oninput="triggerAutoSave(${product.id})"
                                               class="w-full h-11 pl-4 pr-12 border-2 border-blue-100 dark:border-blue-900/60 rounded-lg text-sm font-bold text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" step="0.01">
                                        <button type="button" onclick="triggerMeliCalculation('${product.product_code}')" title="Calcular Costos MercadoLibre" class="absolute right-1.5 w-9 h-9 flex items-center justify-center text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-md transition-colors bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm">
                                            <i data-lucide="calculator" class="w-5 h-5"></i>
                                        </button>
                                    </div>
                                </div>

                                <!-- Precio TN -->
                                <div class="flex flex-col">
                                    <label class="block text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-1.5 uppercase tracking-widest whitespace-nowrap">Precio TN ($)</label>
                                    <input type="number" id="edit_price_tienda_nube" value="${product.price_tienda_nube || ''}" oninput="triggerAutoSave(${product.id})"
                                           class="w-full h-11 px-3 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-bold text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow shadow-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" step="0.01">
                                </div>
                                
                                <!-- Precio Local -->
                                <div class="flex flex-col">
                                    <label class="block text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-1.5 uppercase tracking-widest whitespace-nowrap">Precio Local ($)</label>
                                    <input type="number" id="edit_price_local" value="${product.price || ''}" readonly
                                           class="w-full h-11 px-3 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-bold text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-800/50 cursor-not-allowed shadow-inner [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" step="0.01">
                                </div>

                                <!-- Bottom Row: Marca & Stock & Status -->
                                <div class="col-span-2 lg:col-span-5 pt-4 mt-1 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                                    <div class="flex items-center gap-6">
                                        <div class="text-sm">
                                            <span class="text-gray-400 dark:text-gray-500 text-[10px] uppercase font-bold tracking-widest">Marca:</span>
                                            <span class="font-bold text-gray-900 dark:text-white ml-1 uppercase tracking-tight">${product.brand || '-'}</span>
                                        </div>
                                        <!-- Stock moved down here -->
                                        <div class="flex items-center gap-2 border-l border-gray-200 dark:border-gray-700 pl-6">
                                            <span class="text-gray-400 dark:text-gray-500 text-[10px] uppercase font-bold tracking-widest">Stock:</span>
                                            <span class="text-lg font-black text-gray-900 dark:text-white">${product.stock || 0}</span>
                                        </div>
                                    </div>
                                    <!-- Status Badge -->
                                    <div>
                                    ${product.status
                            ? `<span id="detail-status-badge-${product.id}" class="${product.status.toLowerCase() === 'active' ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800/40' : 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800/40'} px-3 py-1.5 rounded-full text-[10px] font-black uppercase border tracking-widest">${product.status}</span>`
                            : ''
                        }
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Meli Costs (Collapsible) -->
                        ${meliCosts ? `
                        <div class="px-6 md:px-8 mb-6">
                            <details class="group bg-yellow-50 dark:bg-yellow-950/10 border border-yellow-200 dark:border-yellow-900/30 rounded-xl overflow-hidden transition-all duration-300 open:shadow-sm">
                                <summary class="flex items-center justify-between p-3 cursor-pointer list-none hover:bg-yellow-100/50 dark:hover:bg-yellow-900/20 transition-colors select-none">
                                    <div class="flex items-center gap-3">
                                        <div class="bg-yellow-200/50 dark:bg-yellow-900/40 p-1.5 rounded-lg text-yellow-700 dark:text-yellow-400">
                                            <i data-lucide="calculator" class="h-4 w-4"></i>
                                        </div>
                                        <div class="flex flex-col">
                                            <span class="text-xs font-bold text-yellow-800 dark:text-yellow-300 uppercase tracking-wider">Costo Mercado Libre</span>
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-3">
                                        <span class="font-mono font-bold text-yellow-800 dark:text-yellow-300">$ ${Number(meliCosts.total_selling_cost).toLocaleString('es-AR')}</span>
                                        <i data-lucide="chevron-down" class="h-4 w-4 text-yellow-600 dark:text-yellow-500 transition-transform group-open:rotate-180"></i>
                                    </div>
                                </summary>
                                <div class="p-4 pt-2 border-t border-yellow-200/50 dark:border-yellow-900/30">
                                    <div class="space-y-2 text-sm text-yellow-800/80 dark:text-yellow-300/80">
                                        <div class="flex justify-between">
                                            <span>Comisión por Venta:</span>
                                            <span class="font-medium">$ ${Number(meliCosts.sale_fee_amount || 0).toLocaleString('es-AR')}</span>
                                        </div>
                                        <div class="flex justify-between">
                                            <span>Costo Fijo (Meli):</span>
                                            <span class="font-medium">$ ${Number(meliCosts.listing_fixed_fee || 0).toLocaleString('es-AR')}</span>
                                        </div>
                                        <div class="flex justify-between">
                                            <span>Envío:</span>
                                            <span class="font-medium">$ ${Number(meliCosts.ship_cost_amount || 0).toLocaleString('es-AR')}</span>
                                        </div>
                                    </div>
                                </div>
                            </details>
                        </div>` : ''}
                        ${product.meli_id ? `
                        <div class="mb-6 mx-6 md:mx-8 bg-yellow-50 dark:bg-yellow-950/10 border border-yellow-300 dark:border-yellow-900/30 rounded-xl p-4 flex items-center gap-4">
                            <div class="flex-shrink-0">
                                <img src="/static/img/meli-logo-light.png" alt="MercadoLibre" class="h-14 object-contain dark:hidden">
                                <img src="/static/img/meli-logo-dark.png" alt="MercadoLibre" class="h-14 object-contain hidden dark:block">
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="text-lg font-bold font-mono text-gray-900 dark:text-white tracking-wide">${product.meli_id}</p>
                            </div>
                            ${product.permalink ? `
                            <a href="${product.permalink}" target="_blank" rel="noopener"
                               class="flex-shrink-0 p-2.5 bg-yellow-200/60 dark:bg-yellow-900/30 hover:bg-yellow-300 dark:hover:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300 rounded-lg transition-colors border border-yellow-300 dark:border-yellow-800"
                               title="${product.permalink}">
                                <i data-lucide="external-link" class="h-5 w-5"></i>
                            </a>` : ''}
                        </div>` : ''}

                        <!-- Validation Issues (Collapsible) -->
                        <div class="px-6 md:px-8 mb-6">
                            ${(() => {
                        const hasIssues = (product.reason && product.reason !== 'None') || (product.remedy && product.remedy !== 'None');
                        const bgClass = hasIssues ? 'bg-orange-50 border-orange-200 dark:bg-orange-950/10 dark:border-orange-900/30' : 'bg-gray-50 border-gray-200 dark:bg-gray-800/20 dark:border-gray-700';
                        const textClass = hasIssues ? 'text-orange-800 dark:text-orange-300' : 'text-gray-500 dark:text-gray-400';
                        const hoverClass = hasIssues ? 'hover:bg-orange-100 dark:hover:bg-orange-950/20' : 'hover:bg-gray-100 dark:hover:bg-gray-800/40';
                        const iconBgClass = hasIssues ? 'bg-orange-200/50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-gray-200/50 text-gray-400 dark:bg-gray-700 dark:text-gray-500';
                        const subtextClass = hasIssues ? 'text-orange-600/80 dark:text-orange-400/80' : 'text-gray-400 dark:text-gray-500';
                        const chevronClass = hasIssues ? 'text-orange-600 dark:text-orange-500' : 'text-gray-400 dark:text-gray-555';
                        return `
                            <details class="group ${bgClass} border rounded-xl overflow-hidden transition-all duration-300 open:shadow-sm">
                                <summary class="flex items-center justify-between p-4 cursor-pointer list-none ${textClass} ${hoverClass} transition-colors select-none">
                                    <div class="flex items-center gap-3">
                                        <div class="${iconBgClass} p-2 rounded-lg">
                                            <i data-lucide="${hasIssues ? 'alert-triangle' : 'check-circle'}" class="h-5 w-5"></i>
                                        </div>
                                        <div class="flex flex-col">
                                            <span class="font-bold text-sm">${hasIssues ? 'Revisión Requerida' : 'Sin Revisiones Pendientes'}</span>
                                            <span class="text-xs ${subtextClass}">${hasIssues ? 'Ver detalles de validación' : 'No hay problemas detectados'}</span>
                                        </div>
                                    </div>
                                    <i data-lucide="chevron-down" class="h-5 w-5 ${chevronClass} transition-transform group-open:rotate-180"></i>
                                </summary>
                                ${hasIssues ? `
                                <div class="p-4 pt-1 text-sm bg-orange-50/30 dark:bg-orange-950/5 border-t border-orange-100/50 dark:border-orange-900/20">
                                    ${product.reason ? `
                                    <div class="mb-3">
                                        <strong class="block text-xs uppercase tracking-wider text-orange-700/70 dark:text-orange-400/70 mb-1">Motivo:</strong>
                                        <div class="bg-white dark:bg-gray-800 p-3 rounded-lg border border-orange-100 dark:border-orange-900/35 text-gray-700 dark:text-gray-300 shadow-sm text-xs leading-relaxed font-mono">
                                            ${product.reason}
                                        </div>
                                    </div>` : ''}
                                    ${product.remedy ? `
                                    <div>
                                        <strong class="block text-xs uppercase tracking-wider text-orange-700/70 dark:text-orange-400/70 mb-1">Solución Sugerida:</strong>
                                        <div class="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg border border-blue-100 dark:border-blue-900/30 text-blue-900 dark:text-blue-300 shadow-sm text-xs leading-relaxed flex gap-2">
                                            <i data-lucide="lightbulb" class="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-500"></i>
                                            <span>${product.remedy}</span>
                                        </div>
                                    </div>` : ''}
                                </div>` : ''}
                            </details>`;
                    })()}
                        </div>

                        <!-- Drive Dropzone -->
                        <div class="px-6 md:px-8 mb-6">
                            <div id="drive-dropzone-${product.id}" 
                                 class="relative p-4 rounded-xl border-2 border-dashed transition-all duration-200 group
                                        ${product.drive_url ? 'bg-blue-50/50 dark:bg-blue-950/10 border-blue-200 dark:border-blue-900/30' : 'bg-gray-50 dark:bg-gray-800/10 border-gray-300 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-800 hover:bg-blue-50/30'}"
                                 ondragover="event.preventDefault(); this.classList.add('border-blue-500', 'bg-blue-100')"
                                 ondragleave="this.classList.remove('border-blue-500', 'bg-blue-100')"
                                 ondrop="handleDriveDrop(event, ${product.id})"
                                 onclick="if(!event.target.closest('a, button')) document.getElementById('file-input-${product.id}').click()">
                                
                                <input type="file" id="file-input-${product.id}" class="hidden" multiple onchange="handleDriveFileSelect(event, ${product.id})">
                                
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <div class="p-2 rounded-lg ${product.drive_url ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}">
                                            <i data-lucide="${product.drive_url ? 'folder-check' : 'folder-up'}" class="h-5 w-5"></i>
                                        </div>
                                        <div>
                                            <h4 class="text-sm font-semibold ${product.drive_url ? 'text-blue-900 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}">
                                                ${product.drive_url ? 'Carpeta de Drive' : 'Subir Fotos'}
                                            </h4>
                                            <p class="text-xs ${product.drive_url ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}">
                                                ${product.drive_url ? 'Arrastra fotos para agregar' : 'Click para subir'}
                                            </p>
                                        </div>
                                    </div>
                                    ${product.drive_url ? `
                                        <a href="${product.drive_url}" target="_blank" 
                                           class="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-950/40 rounded-lg transition-colors"
                                           title="Abrir en Drive" onclick="event.stopPropagation()">
                                            <i data-lucide="external-link" class="h-4 w-4"></i>
                                        </a>
                                    ` : ''}
                                </div>
                                
                                <!-- Upload Overlay -->
                                <div id="upload-overlay-${product.id}" class="hidden absolute inset-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-[1px] rounded-xl flex items-center justify-center">
                                    <div class="flex items-center gap-3 text-blue-600 dark:text-blue-455 font-medium text-sm">
                                        <div class="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                                        Subiendo...
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Meli Photo Tips link -->
                        <div class="mb-6 px-6 md:px-8">
                            <p class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                                <i data-lucide="help-circle" class="h-3.5 w-3.5 text-gray-400"></i>
                                Aquí te dejamos un enlace con las fotos recomendadas por Mercado Libre 
                                <a href="https://www.mercadolibre.com.ar/ayuda/Sacar-bue-nas-fotos-productos_805" target="_blank" rel="noopener" class="text-blue-600 dark:text-blue-400 hover:text-blue-800 font-semibold hover:underline flex items-center gap-0.5 transition-all">
                                    Click aquí <i data-lucide="external-link" class="h-3 w-3"></i>
                                </a>
                            </p>
                        </div>

                        <!-- Description Editor -->
                        <div class="px-6 md:px-8 mb-24 flex-1 flex flex-col min-h-[150px] relative">
                            <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex justify-between items-center">
                                <span>Descripción</span>
                                <button id="btn-ai-description" onclick="triggerAIPrePublish(${product.id}, 'description')" 
                                    class="px-2 py-1 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-md border border-purple-200 transition-colors shadow-sm flex items-center gap-1.5 text-xs font-medium dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800/40"
                                    title="Generar con AI">
                                    <i data-lucide="sparkles" class="h-3 w-3"></i>
                                    Generar con AI
                                </button>
                            </label>
                            <textarea id="edit_description" oninput="triggerAutoSave(${product.id})"
                                      class="flex-1 w-full p-4 border border-gray-300 dark:border-gray-600 rounded-xl text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 dark:bg-gray-700 dark:text-white resize-y min-h-[150px] shadow-inner"
                                      placeholder="Escribe una descripción detallada del producto...">${product.description || ''}</textarea>
                        </div>

                    </div> <!-- End detailTab-general -->

                    <!-- Attributes Tab Content -->
                    <div id="detailTab-attributes" class="hidden space-y-6 px-6 md:px-8 pb-8 flex-1 overflow-y-auto custom-scrollbar">
                        
                        <!-- Configuración de Publicación (Migrated) -->
                        <div class="bg-blue-50/50 dark:bg-blue-900/10 p-4 border border-blue-100 dark:border-blue-800/40 rounded-xl shadow-sm">
                            <label class="block text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                 <i data-lucide="settings" class="h-3.5 w-3.5"></i> Configuración de Publicación
                            </label>
                            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <!-- Listing Type -->
                                <div>
                                    <label class="block text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold mb-1.5 tracking-tight">Publicación</label>
                                    <select id="edit_listing_type_id" onchange="triggerAutoSave(${product.id})"
                                            class="w-full h-10 px-3 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white shadow-sm transition-all hover:border-blue-300">
                                        <option value="gold_special" ${meliAttrs.listing_type_id === 'gold_special' ? 'selected' : ''}>Clásica</option>
                                        <option value="gold_pro" ${meliAttrs.listing_type_id === 'gold_pro' ? 'selected' : ''}>Premium (Pro)</option>
                                    </select>
                                </div>
                                <!-- Shipping Mode -->
                                <div>
                                    <label class="block text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold mb-1.5 tracking-tight">Logística</label>
                                    <select id="edit_mode_shipping" onchange="triggerAutoSave(${product.id})"
                                            class="w-full h-10 px-3 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-white shadow-sm transition-all hover:border-blue-300">
                                        <option value="me2" ${meliAttrs.mode_shipping === 'me2' ? 'selected' : ''}>Mercado Envíos</option>
                                        <option value="me1" ${meliAttrs.mode_shipping === 'me1' ? 'selected' : ''}>Propia / Otros</option>
                                    </select>
                                </div>
                                <!-- Free Shipping -->
                                <div>
                                    <label class="block text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold mb-1.5 tracking-tight">Promoción</label>
                                    <label class="flex items-center gap-2 cursor-pointer px-3 w-full h-10 rounded-lg bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 shadow-sm hover:border-blue-300 transition-all">
                                        <input type="checkbox" id="edit_free_shipping" ${meliAttrs.free_shipping === 1 ? 'checked' : ''} onchange="triggerAutoSave(${product.id})"
                                               class="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-655 dark:bg-gray-600">
                                        <span class="text-xs font-bold text-gray-700 dark:text-gray-200">Envío Gratis</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <!-- Grid de Atributos del Modelo Nuevo -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <!-- Moneda (Deshabilitado) -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="dollar-sign" class="h-3.5 w-3.5"></i> Moneda
                                </label>
                                <input type="text" id="attr_currency_id" value="${meliAttrs.currency_id || 'ARS'}" disabled
                                       class="w-full px-3 py-2 border border-gray-200 dark:border-gray-750 rounded-lg text-sm bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed shadow-inner">
                            </div>

                            <!-- Categoría de MercadoLibre -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50 flex flex-col gap-2 relative">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <i data-lucide="tag" class="h-3.5 w-3.5"></i> Categoría MercadoLibre
                                </label>
                                ${categoryOptions && Array.isArray(categoryOptions) && categoryOptions.length > 0 ? `
                                    <div class="relative">
                                        <select id="attr_category_options_select" onchange="window.onCategoryOptionChange(this, ${product.id})"
                                                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm">
                                            <option value="">-- Seleccionar Categoría --</option>
                                            ${categoryOptions.map(opt => `
                                                <option value="${opt.category_id}" ${meliAttrs.category_id === opt.category_id ? 'selected' : ''}>
                                                    ${opt.domain_name || opt.category_name || opt.category_id} (${opt.category_name || opt.domain_id})
                                                </option>
                                            `).join('')}
                                        </select>
                                        <div id="category_options_loading" class="hidden absolute right-10 top-1/2 -translate-y-1/2">
                                            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                        </div>
                                    </div>
                                    <input type="text" id="attr_category_id" value="${meliAttrs.category_id || ''}" readonly
                                           class="w-full px-3 py-2 border border-gray-200 dark:border-gray-750 rounded-lg text-sm bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed shadow-inner"
                                           placeholder="ID de Categoría (Seleccionado arriba)">
                                ` : `
                                    <input type="text" id="attr_category_id" value="${meliAttrs.category_id || ''}" oninput="window.triggerMeliAttributesAutoSave(${product.id})"
                                           class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm placeholder-gray-400"
                                           placeholder="Ej: MLA1234">
                                `}
                            </div>

                            <!-- Método de Compra -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="shopping-cart" class="h-3.5 w-3.5"></i> Método de Compra
                                </label>
                                <select id="attr_buying_mode" onchange="window.triggerMeliAttributesAutoSave(${product.id})"
                                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm">
                                    <option value="buy_it_now" ${meliAttrs.buying_mode === 'buy_it_now' ? 'selected' : ''}>Comprar ahora (buy_it_now)</option>
                                    <option value="classified" ${meliAttrs.buying_mode === 'classified' ? 'selected' : ''}>Clasificado (classified)</option>
                                </select>
                            </div>

                            <!-- Condición -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="star" class="h-3.5 w-3.5"></i> Condición
                                </label>
                                <select id="attr_condition_type" onchange="window.triggerMeliAttributesAutoSave(${product.id})"
                                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm">
                                    <option value="new" ${meliAttrs.condition_type === 'new' ? 'selected' : ''}>Nuevo</option>
                                    <option value="used" ${meliAttrs.condition_type === 'used' ? 'selected' : ''}>Usado</option>
                                    <option value="reconditioned" ${meliAttrs.condition_type === 'reconditioned' ? 'selected' : ''}>Reacondicionado</option>
                                </select>
                            </div>

                            <!-- Logística Meli -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="truck" class="h-3.5 w-3.5"></i> Canal Logístico
                                </label>
                                <select id="attr_logistic_type" onchange="window.triggerMeliAttributesAutoSave(${product.id})"
                                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm">
                                    <option value="drop_off" ${meliAttrs.logistic_type === 'drop_off' ? 'selected' : ''}>drop_off (Correo tradicional)</option>
                                    <option value="fulfillment" ${meliAttrs.logistic_type === 'fulfillment' ? 'selected' : ''}>fulfillment (Red Full)</option>
                                    <option value="cross_docking" ${meliAttrs.logistic_type === 'cross_docking' ? 'selected' : ''}>cross_docking (Colecta / Despacho)</option>
                                    <option value="self_service" ${meliAttrs.logistic_type === 'self_service' ? 'selected' : ''}>self_service (Envíos Flex)</option>
                                    <option value="custom" ${meliAttrs.logistic_type === 'custom' ? 'selected' : ''}>custom (Logística propia)</option>
                                </select>
                            </div>

                            <!-- Retiro en Local -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50 flex items-center">
                                <label class="flex items-center gap-3 cursor-pointer w-full mt-5 px-3 py-2 bg-white dark:bg-gray-750 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm hover:border-blue-300 transition-all">
                                    <input type="checkbox" id="attr_local_pick_up" ${meliAttrs.local_pick_up ? 'checked' : ''} onchange="window.triggerMeliAttributesAutoSave(${product.id})"
                                           class="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 dark:bg-gray-600">
                                    <span class="text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
                                        <i data-lucide="map-pin" class="h-4 w-4 text-gray-500 dark:text-gray-400"></i> Retiro en Local (local_pick_up)
                                    </span>
                                </label>
                            </div>

                            ${showIfRequired(meliAttrs.value_added_tax_required, `
                            <!-- IVA -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="percent" class="h-3.5 w-3.5"></i> IVA
                                    ${requiredBadge(meliAttrs.value_added_tax_required)}
                                </label>
                                <select id="attr_value_added_tax" onchange="window.triggerMeliAttributesAutoSave(${product.id})"
                                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm">
                                    <option value="48405909" ${meliAttrs.value_added_tax === '48405909' ? 'selected' : ''}>21 % (48405909)</option>
                                    <option value="48405908" ${meliAttrs.value_added_tax === '48405908' ? 'selected' : ''}>10.5 % (48405908)</option>
                                    <option value="48405907" ${meliAttrs.value_added_tax === '48405907' ? 'selected' : ''}>0 % (48405907)</option>
                                    <option value="55043032" ${meliAttrs.value_added_tax === '55043032' ? 'selected' : ''}>Exento (55043032)</option>
                                    <option value="48405910" ${meliAttrs.value_added_tax === '48405910' ? 'selected' : ''}>27 % (48405910)</option>
                                </select>
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.import_duty_required, `
                            <!-- Impuesto Interno -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="shield-alert" class="h-3.5 w-3.5"></i> Impuesto Interno
                                    ${requiredBadge(meliAttrs.import_duty_required)}
                                </label>
                                <select id="attr_import_duty" onchange="window.triggerMeliAttributesAutoSave(${product.id})"
                                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm">
                                    <option value="49553239" ${meliAttrs.import_duty === '49553239' ? 'selected' : ''}>0 % (49553239)</option>
                                    <option value="49553240" ${meliAttrs.import_duty === '49553240' ? 'selected' : ''}>5 % (49553240)</option>
                                    <option value="49553241" ${meliAttrs.import_duty === '49553241' ? 'selected' : ''}>10 % (49553241)</option>
                                    <option value="49553242" ${meliAttrs.import_duty === '49553242' ? 'selected' : ''}>15 % (49553242)</option>
                                    <option value="49553243" ${meliAttrs.import_duty === '49553243' ? 'selected' : ''}>20 % (49553243)</option>
                                    <option value="49553244" ${meliAttrs.import_duty === '49553244' ? 'selected' : ''}>25 % (49553244)</option>
                                    <option value="49553245" ${meliAttrs.import_duty === '49553245' ? 'selected' : ''}>30 % (49553245)</option>
                                    <option value="49553246" ${meliAttrs.import_duty === '49553246' ? 'selected' : ''}>35 % (49553246)</option>
                                    <option value="49553247" ${meliAttrs.import_duty === '49553247' ? 'selected' : ''}>40 % (49553247)</option>
                                    <option value="49553248" ${meliAttrs.import_duty === '49553248' ? 'selected' : ''}>45 % (49553248)</option>
                                    <option value="49553249" ${meliAttrs.import_duty === '49553249' ? 'selected' : ''}>50 % (49553249)</option>
                                    <option value="49553250" ${meliAttrs.import_duty === '49553250' ? 'selected' : ''}>55 % (49553250)</option>
                                    <option value="49553251" ${meliAttrs.import_duty === '49553251' ? 'selected' : ''}>60 % (49553251)</option>
                                    <option value="49553252" ${meliAttrs.import_duty === '49553252' ? 'selected' : ''}>65 % (49553252)</option>
                                    <option value="49553253" ${meliAttrs.import_duty === '49553253' ? 'selected' : ''}>70 % (49553253)</option>
                                </select>
                            </div>
                            `)}

                            <!-- Tipo de Garantía -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="shield-check" class="h-3.5 w-3.5"></i> Tipo de Garantía
                                </label>
                                <select id="attr_warranty_type" onchange="window.triggerMeliAttributesAutoSave(${product.id})"
                                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm">
                                    <option value="Garantía del vendedor" ${(!meliAttrs.warranty_type || meliAttrs.warranty_type !== 'Garantía de fábrica') ? 'selected' : ''}>Garantía del vendedor</option>
                                    <option value="Garantía de fábrica" ${meliAttrs.warranty_type === 'Garantía de fábrica' ? 'selected' : ''}>Garantía de fábrica</option>
                                </select>
                            </div>

                            <!-- Tiempo de Garantía -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="shield-check" class="h-3.5 w-3.5"></i> Tiempo de Garantía
                                </label>
                                <input type="text" id="attr_warranty_time" value="${meliAttrs.warranty_time || '30 días'}" oninput="window.triggerMeliAttributesAutoSave(${product.id})"
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm placeholder-gray-400"
                                       placeholder="Ej: 30 días">
                            </div>

                            ${showIfRequired(meliAttrs.volume_capacity_required, `
                            <!-- Capacidad en volumen -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="box" class="h-3.5 w-3.5"></i> Capacidad Volumen (Ml)
                                    ${requiredBadge(meliAttrs.volume_capacity_required)}
                                </label>
                                <input type="number" id="attr_volume_capacity" value="${meliAttrs.volume_capacity !== null ? meliAttrs.volume_capacity : ''}"
                                       oninput="window.validateVolumeCapacity(this); window.triggerMeliAttributesAutoSave(${product.id})"
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm"
                                       placeholder="En mililitros. Ej: 500">
                                <span id="volume_warning" class="hidden text-[10px] text-red-500 dark:text-red-400 font-bold mt-1 block">La capacidad no debe exceder 1,000,000 Ml (1000L).</span>
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.units_per_pack_required, `
                            <!-- Unidades por pack -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="package" class="h-3.5 w-3.5"></i> Unidades por Pack
                                    ${requiredBadge(meliAttrs.units_per_pack_required)}
                                </label>
                                <input type="number" id="attr_units_per_pack" value="${meliAttrs.units_per_pack !== null ? meliAttrs.units_per_pack : 1}" oninput="window.triggerMeliAttributesAutoSave(${product.id})"
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm"
                                       placeholder="Ej: 1">
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.ink_color_required, `
                            <!-- Color de Tinta -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="droplet" class="h-3.5 w-3.5"></i> Color de Tinta
                                    ${requiredBadge(meliAttrs.ink_color_required)}
                                </label>
                                <input type="text" id="attr_ink_color" value="${meliAttrs.ink_color || ''}" oninput="window.triggerMeliAttributesAutoSave(${product.id})"
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm placeholder-gray-400"
                                       placeholder="Ej: azul, negro, rojo">
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.pot_type_required, `
                            <!-- Tipo de Olla -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="box" class="h-3.5 w-3.5"></i> Tipo de Olla
                                    ${requiredBadge(meliAttrs.pot_type_required)}
                                </label>
                                <input type="text" id="attr_pot_type" value="${meliAttrs.pot_type || ''}" maxlength="100" oninput="window.triggerMeliAttributesAutoSave(${product.id})"
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm placeholder-gray-400"
                                       placeholder="Ej: cacerola, flanero">
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.product_type_required, `
                            <!-- Tipo de Producto -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="tag" class="h-3.5 w-3.5"></i> Tipo de Producto
                                    ${requiredBadge(meliAttrs.product_type_required)}
                                </label>
                                ${(() => {
                                    let ptOptions = null;
                                    if (allowedOptions) {
                                        if (allowedOptions.product_type) {
                                            ptOptions = allowedOptions.product_type;
                                        } else if (allowedOptions.settings && allowedOptions.settings.required_attributes) {
                                            const reqAttrs = allowedOptions.settings.required_attributes;
                                            const prodTypeAttr = reqAttrs.PRODUCT_TYPE || reqAttrs.product_type;
                                            if (prodTypeAttr && prodTypeAttr.values) {
                                                ptOptions = prodTypeAttr.values;
                                            }
                                        }
                                    }
                                    if (typeof ptOptions === 'string') {
                                        try { ptOptions = JSON.parse(ptOptions); } catch(e) {}
                                    }
                                    if (ptOptions && Array.isArray(ptOptions) && ptOptions.length > 0) {
                                        return `
                                            <select id="attr_product_type" onchange="window.triggerMeliAttributesAutoSave(${product.id})" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm">
                                                <option value="">Seleccionar...</option>
                                                ${ptOptions.map(opt => {
                                                    const val = typeof opt === 'object' ? (opt.name || opt.id || '') : opt;
                                                    return `<option value="${val}" ${meliAttrs.product_type === val ? 'selected' : ''}>${val}</option>`;
                                                }).join('')}
                                            </select>
                                        `;
                                    } else {
                                        return `
                                            <input type="text" id="attr_product_type" value="${meliAttrs.product_type || ''}" maxlength="100" oninput="window.triggerMeliAttributesAutoSave(${product.id})"
                                                   class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm placeholder-gray-400"
                                                   placeholder="Ej: Tipo de producto">
                                        `;
                                    }
                                })()}
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.output_connectors_required, `
                            <!-- Puertas de Salida -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50 sm:col-span-2">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="plug" class="h-3.5 w-3.5"></i> Puertas de Salida
                                    ${requiredBadge(meliAttrs.output_connectors_required)}
                                </label>
                                <input type="text" id="attr_output_connectors" value="${meliAttrs.output_connectors || ''}" maxlength="255" oninput="window.triggerMeliAttributesAutoSave(${product.id})"
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm placeholder-gray-400 mb-2"
                                       placeholder="Ej: XLR, USB-C (se pueden combinar)">
                                <div class="flex flex-wrap gap-1.5 mt-1">
                                    ${(() => {
                                        const connectorsList = ["Jack 2.5 mm", "Jack 3.5 mm", "Jack 6.3 mm", "Micro-USB", "Mini-USB", "Mini-XLR", "USB-C", "XLR"];
                                        const currentConnectors = meliAttrs.output_connectors ? meliAttrs.output_connectors.split(',').map(s => s.trim()) : [];
                                        return connectorsList.map(opt => {
                                            const active = currentConnectors.includes(opt);
                                            return `<span onclick="window.toggleConnector(this, '${opt}', ${product.id})" 
                                                          class="cursor-pointer px-2 py-0.5 text-[11px] font-medium border rounded-md transition-all select-none hover:scale-105 active:scale-95 ${active ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800' : 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'}">
                                                        ${opt}
                                                    </span>`;
                                        }).join('');
                                    })()}
                                </div>
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.input_connector_required, `
                            <!-- Puertas de Entrada -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50 sm:col-span-2">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="plug" class="h-3.5 w-3.5"></i> Puertas de Entrada
                                    ${requiredBadge(meliAttrs.input_connector_required)}
                                </label>
                                <input type="text" id="attr_input_connector" value="${meliAttrs.input_connector || ''}" maxlength="255" oninput="window.triggerMeliAttributesAutoSave(${product.id})"
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm placeholder-gray-400 mb-2"
                                       placeholder="Ej: XLR, USB-C (se pueden combinar)">
                                <div class="flex flex-wrap gap-1.5 mt-1">
                                    ${(() => {
                                        const connectorsList = ["Jack 2.5 mm", "Jack 3.5 mm", "Jack 6.3 mm", "Micro-USB", "Mini-USB", "Mini-XLR", "USB-C", "XLR"];
                                        const currentConnectors = meliAttrs.input_connector ? meliAttrs.input_connector.split(',').map(s => s.trim()) : [];
                                        return connectorsList.map(opt => {
                                            const active = currentConnectors.includes(opt);
                                            return `<span onclick="window.toggleConnector(this, '${opt}', ${product.id}, 'attr_input_connector')" 
                                                          class="cursor-pointer px-2 py-0.5 text-[11px] font-medium border rounded-md transition-all select-none hover:scale-105 active:scale-95 ${active ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800' : 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'}">
                                                        ${opt}
                                                    </span>`;
                                        }).join('');
                                    })()}
                                </div>
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.surveillance_camera_type_required, `
                            <!-- Tipo de Cámara de Seguridad -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="camera" class="h-3.5 w-3.5"></i> Tipo de Cámara
                                    ${requiredBadge(meliAttrs.surveillance_camera_type_required)}
                                </label>
                                <input type="text" id="attr_surveillance_camera_type" value="${meliAttrs.surveillance_camera_type || ''}" maxlength="100" oninput="window.triggerMeliAttributesAutoSave(${product.id})"
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm placeholder-gray-400"
                                       placeholder="Ej: Domo, IP, Infrarroja">
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.camera_locations_required, `
                            <!-- Disposición de la Cámara de Seguridad -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="map-pin" class="h-3.5 w-3.5"></i> Disposición de la Cámara
                                    ${requiredBadge(meliAttrs.camera_locations_required)}
                                </label>
                                <select id="attr_camera_locations" onchange="window.triggerMeliAttributesAutoSave(${product.id})"
                                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm">
                                    <option value="">Seleccionar...</option>
                                    <option value="Interior" ${meliAttrs.camera_locations === 'Interior' ? 'selected' : ''}>Interior</option>
                                    <option value="Exterior" ${meliAttrs.camera_locations === 'Exterior' ? 'selected' : ''}>Exterior</option>
                                    <option value="Interior/Exterior" ${meliAttrs.camera_locations === 'Interior/Exterior' ? 'selected' : ''}>Interior/Exterior</option>
                                </select>
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.cable_and_adapter_type_required, `
                            <!-- Cable y Tipo de Adaptador -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="plug" class="h-3.5 w-3.5"></i> Cable / Tipo de Adaptador
                                    ${requiredBadge(meliAttrs.cable_and_adapter_type_required)}
                                </label>
                                <input type="text" id="attr_cable_and_adapter_type" value="${meliAttrs.cable_and_adapter_type || ''}" maxlength="255" oninput="window.triggerMeliAttributesAutoSave(${product.id})"
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm placeholder-gray-400"
                                       placeholder="Ej: RCA, VGA, XLR, HDMI, DisplayPort, USB-C">
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.data_storage_capacity_required, `
                            <!-- Capacidad de Almacenamiento Digital -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="hard-drive" class="h-3.5 w-3.5"></i> Almacenamiento Digital
                                    ${requiredBadge(meliAttrs.data_storage_capacity_required)}
                                </label>
                                <input type="text" id="attr_data_storage_capacity" value="${meliAttrs.data_storage_capacity || ''}" maxlength="25"
                                       oninput="window.validateCapacity(this, 'data_storage_capacity_warning'); window.triggerMeliAttributesAutoSave(${product.id})"
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm placeholder-gray-400"
                                       placeholder="Ej: 25 GB, 5 TB">
                                <span id="data_storage_capacity_warning" class="hidden text-[10px] text-red-500 dark:text-red-400 font-bold mt-1 block">Por favor, especifica un número y unidad válidos (Ej: 25 GB, 5 TB).</span>
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.usb_port_version_required, `
                            <!-- Tipo de Puerto USB -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="usb" class="h-3.5 w-3.5"></i> Tipo de Puerto USB
                                    ${requiredBadge(meliAttrs.usb_port_version_required)}
                                </label>
                                <input type="text" id="attr_usb_port_version" value="${meliAttrs.usb_port_version || ''}" maxlength="255" oninput="window.triggerMeliAttributesAutoSave(${product.id})"
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm placeholder-gray-400"
                                       placeholder="Ej: 3.1, 3.1 Gen 1, 3.1 Gen 2">
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.capacity_required, `
                            <!-- Capacidad de Almacenamiento Digital #2 -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="hard-drive" class="h-3.5 w-3.5"></i> Capacidad (#2)
                                    ${requiredBadge(meliAttrs.capacity_required)}
                                </label>
                                <input type="text" id="attr_capacity" value="${meliAttrs.capacity || ''}" maxlength="25"
                                       oninput="window.validateCapacity(this, 'capacity_warning'); window.triggerMeliAttributesAutoSave(${product.id})"
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm placeholder-gray-400"
                                       placeholder="Ej: 25 GB, 5 TB">
                                <span id="capacity_warning" class="hidden text-[10px] text-red-500 dark:text-red-400 font-bold mt-1 block">Por favor, especifica un número y unidad válidos (Ej: 25 GB, 5 TB).</span>
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.power_supply_type_required, `
                            <!-- Tipo de Alimentación -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="zap" class="h-3.5 w-3.5"></i> Tipo de Alimentación
                                    ${requiredBadge(meliAttrs.power_supply_type_required)}
                                </label>
                                <input type="text" id="attr_power_supply_type" value="${meliAttrs.power_supply_type || ''}" maxlength="255" oninput="window.triggerMeliAttributesAutoSave(${product.id})"
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm placeholder-gray-400"
                                       placeholder="Ej: Bateria, Corriente domestica, Energia solar">
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.grading_required, `
                            <!-- Clasificación -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="award" class="h-3.5 w-3.5"></i> Clasificación
                                    ${requiredBadge(meliAttrs.grading_required)}
                                </label>
                                <select id="attr_grading" onchange="window.triggerMeliAttributesAutoSave(${product.id})"
                                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm">
                                    <option value="">Seleccionar...</option>
                                    <option value="Excelente" ${meliAttrs.grading === 'Excelente' ? 'selected' : ''}>Excelente</option>
                                    <option value="Bueno" ${meliAttrs.grading === 'Bueno' ? 'selected' : ''}>Bueno</option>
                                    <option value="Aceptable" ${meliAttrs.grading === 'Aceptable' ? 'selected' : ''}>Aceptable</option>
                                </select>
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.with_usb_required, `
                            <!-- Posee USB -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="usb" class="h-3.5 w-3.5"></i> Posee USB
                                    ${requiredBadge(meliAttrs.with_usb_required)}
                                </label>
                                <select id="attr_with_usb" onchange="window.triggerMeliAttributesAutoSave(${product.id})"
                                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm">
                                    <option value="">Seleccionar...</option>
                                    <option value="Si" ${meliAttrs.with_usb === 'Si' ? 'selected' : ''}>Si</option>
                                    <option value="No" ${meliAttrs.with_usb === 'No' ? 'selected' : ''}>No</option>
                                </select>
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.size_required, `
                            <!-- Tamaño -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="ruler" class="h-3.5 w-3.5"></i> Tamaño
                                    ${requiredBadge(meliAttrs.size_required)}
                                </label>
                                <input type="text" id="attr_size" value="${meliAttrs.size || ''}" maxlength="255" oninput="window.triggerMeliAttributesAutoSave(${product.id})"
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm placeholder-gray-400"
                                       placeholder="Ej: L, 42, 38">
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.color_required, `
                            <!-- Color -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="palette" class="h-3.5 w-3.5"></i> Color
                                    ${requiredBadge(meliAttrs.color_required)}
                                </label>
                                <input type="text" id="attr_color" value="${meliAttrs.color || ''}" maxlength="255" oninput="window.triggerMeliAttributesAutoSave(${product.id})"
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm placeholder-gray-400"
                                       placeholder="Ej: Rojo, Azul, Verde">
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.gender_required, `
                            <!-- Género -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="users" class="h-3.5 w-3.5"></i> Género
                                    ${requiredBadge(meliAttrs.gender_required)}
                                </label>
                                <select id="attr_gender" onchange="window.triggerMeliAttributesAutoSave(${product.id})"
                                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm">
                                    <option value="">Seleccionar...</option>
                                    <option value="Mujer" ${meliAttrs.gender === 'Mujer' ? 'selected' : ''}>Mujer</option>
                                    <option value="Hombre" ${meliAttrs.gender === 'Hombre' ? 'selected' : ''}>Hombre</option>
                                    <option value="Niñas" ${meliAttrs.gender === 'Niñas' ? 'selected' : ''}>Niñas</option>
                                    <option value="Niños" ${meliAttrs.gender === 'Niños' ? 'selected' : ''}>Niños</option>
                                    <option value="Sin género infantil" ${meliAttrs.gender === 'Sin género infantil' ? 'selected' : ''}>Sin género infantil</option>
                                    <option value="Sin género" ${meliAttrs.gender === 'Sin género' ? 'selected' : ''}>Sin género</option>
                                </select>
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.name_required, `
                            <!-- Nombre (name) -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="file-text" class="h-3.5 w-3.5"></i> Nombre
                                    ${requiredBadge(meliAttrs.name_required)}
                                </label>
                                <input type="text" id="attr_name" value="${meliAttrs.name || product.product_name || ''}" maxlength="255" oninput="window.triggerMeliAttributesAutoSave(${product.id})"
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm placeholder-gray-400"
                                       placeholder="Nombre para MercadoLibre (255 caracteres)">
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.iron_type_required, `
                            <!-- Tipo de Plancha (iron_type) -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="sparkles" class="h-3.5 w-3.5"></i> Tipo de Plancha
                                    ${requiredBadge(meliAttrs.iron_type_required)}
                                </label>
                                <input type="text" id="attr_iron_type" value="${meliAttrs.iron_type || ''}" maxlength="100" oninput="window.triggerMeliAttributesAutoSave(${product.id})"
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm placeholder-gray-400"
                                       placeholder="Ej: Seca, Vapor (100 caracteres)">
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.empty_gtin_reason_required, `
                            <!-- Motivo GTIN Vacío -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50 sm:col-span-2">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="barcode" class="h-3.5 w-3.5"></i> Motivo GTIN Vacío
                                    ${requiredBadge(meliAttrs.empty_gtin_reason_required)}
                                </label>
                                <select id="attr_empty_gtin_reason" onchange="window.triggerMeliAttributesAutoSave(${product.id})"
                                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm">
                                    <option value="17055160" ${meliAttrs.empty_gtin_reason === '17055160' ? 'selected' : ''}>El producto no tiene código registrado (17055160)</option>
                                    <option value="17055158" ${meliAttrs.empty_gtin_reason === '17055158' ? 'selected' : ''}>Pieza artesanal (17055158)</option>
                                    <option value="17055159" ${meliAttrs.empty_gtin_reason === '17055159' ? 'selected' : ''}>Kit o pack (17055159)</option>
                                    <option value="17055161" ${meliAttrs.empty_gtin_reason === '17055161' ? 'selected' : ''}>Otra razón (17055161)</option>
                                </select>
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.thermal_container_type_required, `
                            <!-- Tipo de Recipiente (thermal_container_type) -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="box" class="h-3.5 w-3.5"></i> Tipo de Recipiente
                                    ${requiredBadge(meliAttrs.thermal_container_type_required)}
                                </label>
                                <select id="attr_thermal_container_type" onchange="window.triggerMeliAttributesAutoSave(${product.id})"
                                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm">
                                    <option value="">Seleccionar...</option>
                                    <option value="Taza" ${meliAttrs.thermal_container_type === 'Taza' ? 'selected' : ''}>Taza</option>
                                    <option value="Vaso" ${meliAttrs.thermal_container_type === 'Vaso' ? 'selected' : ''}>Vaso</option>
                                </select>
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.is_factory_kit_required, `
                            <!-- Es Kit de Fábrica (is_factory_kit) -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5" title="Si el kit viene armado de Fábrica elige Si, si el kit fue armado por ti elige No">
                                    <i data-lucide="help-circle" class="h-3.5 w-3.5 text-blue-500"></i> Es Kit de Fábrica
                                    ${requiredBadge(meliAttrs.is_factory_kit_required)}
                                </label>
                                <select id="attr_is_factory_kit" onchange="window.triggerMeliAttributesAutoSave(${product.id})"
                                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm">
                                    <option value="">Seleccionar...</option>
                                    <option value="Si" ${meliAttrs.is_factory_kit === 'Si' ? 'selected' : ''}>Si</option>
                                    <option value="No" ${meliAttrs.is_factory_kit === 'No' ? 'selected' : ''}>No</option>
                                </select>
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.pieces_number_required, `
                            <!-- Cantidad de Piezas (pieces_number) -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="layers" class="h-3.5 w-3.5"></i> Cantidad de Piezas
                                    ${requiredBadge(meliAttrs.pieces_number_required)}
                                </label>
                                <input type="number" id="attr_pieces_number" value="${meliAttrs.pieces_number !== null && meliAttrs.pieces_number !== undefined ? meliAttrs.pieces_number : ''}" oninput="window.triggerMeliAttributesAutoSave(${product.id})"
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm"
                                       placeholder="Ej: 12">
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.material_required, `
                            <!-- Material (material) -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="info" class="h-3.5 w-3.5"></i> Material
                                    ${requiredBadge(meliAttrs.material_required)}
                                </label>
                                <input type="text" id="attr_material" value="${meliAttrs.material || ''}" maxlength="255" oninput="window.triggerMeliAttributesAutoSave(${product.id})"
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm placeholder-gray-400"
                                       placeholder="Ej: Hierro, Teflon, Aluminio">
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.drinking_glass_product_type_required, `
                            <!-- Tipo de Producto Vasos (drinking_glass_product_type) -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="tag" class="h-3.5 w-3.5"></i> Tipo de Producto (Vasos)
                                    ${requiredBadge(meliAttrs.drinking_glass_product_type_required)}
                                </label>
                                <select id="attr_drinking_glass_product_type" onchange="window.triggerMeliAttributesAutoSave(${product.id})"
                                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm">
                                    <option value="">Seleccionar...</option>
                                    <option value="Taza" ${meliAttrs.drinking_glass_product_type === 'Taza' ? 'selected' : ''}>Taza</option>
                                    <option value="Vaso" ${meliAttrs.drinking_glass_product_type === 'Vaso' ? 'selected' : ''}>Vaso</option>
                                </select>
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.makeup_format_required, `
                            <!-- Formato de Maquillaje (makeup_format) -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="sparkles" class="h-3.5 w-3.5"></i> Formato de Maquillaje
                                    ${requiredBadge(meliAttrs.makeup_format_required)}
                                </label>
                                <input type="text" id="attr_makeup_format" value="${meliAttrs.makeup_format || ''}" maxlength="255" oninput="window.triggerMeliAttributesAutoSave(${product.id})"
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm placeholder-gray-400"
                                       placeholder="Ej: Liquido, Barra, Polvo">
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.eyeliner_type_required, `
                            <!-- Formato de Delineador (eyeliner_type) -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="edit" class="h-3.5 w-3.5"></i> Formato de Delineador
                                    ${requiredBadge(meliAttrs.eyeliner_type_required)}
                                </label>
                                <select id="attr_eyeliner_type" onchange="window.triggerMeliAttributesAutoSave(${product.id})"
                                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm">
                                    <option value="">Seleccionar...</option>
                                    <option value="Retractil" ${meliAttrs.eyeliner_type === 'Retractil' ? 'selected' : ''}>Retractil</option>
                                    <option value="Lapiz" ${meliAttrs.eyeliner_type === 'Lapiz' ? 'selected' : ''}>Lapiz</option>
                                    <option value="Gel" ${meliAttrs.eyeliner_type === 'Gel' ? 'selected' : ''}>Gel</option>
                                    <option value="Crema" ${meliAttrs.eyeliner_type === 'Crema' ? 'selected' : ''}>Crema</option>
                                    <option value="Liquido" ${meliAttrs.eyeliner_type === 'Liquido' ? 'selected' : ''}>Liquido</option>
                                    <option value="Marcador" ${meliAttrs.eyeliner_type === 'Marcador' ? 'selected' : ''}>Marcador</option>
                                </select>
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.backpack_type_required, `
                            <!-- Tipo de Mochila (backpack_type) -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="package" class="h-3.5 w-3.5"></i> Tipo de Mochila
                                    ${requiredBadge(meliAttrs.backpack_type_required)}
                                </label>
                                <select id="attr_backpack_type" onchange="window.triggerMeliAttributesAutoSave(${product.id})"
                                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm">
                                    <option value="">Seleccionar...</option>
                                    <option value="Escolar" ${meliAttrs.backpack_type === 'Escolar' ? 'selected' : ''}>Escolar</option>
                                    <option value="Viaje" ${meliAttrs.backpack_type === 'Viaje' ? 'selected' : ''}>Viaje</option>
                                    <option value="Urbana" ${meliAttrs.backpack_type === 'Urbana' ? 'selected' : ''}>Urbana</option>
                                    <option value="Deportiva" ${meliAttrs.backpack_type === 'Deportiva' ? 'selected' : ''}>Deportiva</option>
                                    <option value="Tactica" ${meliAttrs.backpack_type === 'Tactica' ? 'selected' : ''}>Tactica</option>
                                </select>
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.faucet_control_type_required, `
                            <!-- Tipo de Control de Griferia (faucet_control_type) -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="settings" class="h-3.5 w-3.5"></i> Tipo de control de grifería
                                    ${requiredBadge(meliAttrs.faucet_control_type_required)}
                                </label>
                                <input type="text" id="attr_faucet_control_type" value="${meliAttrs.faucet_control_type || ''}" maxlength="255" oninput="window.triggerMeliAttributesAutoSave(${product.id})"
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm placeholder-gray-400"
                                       placeholder="Ej: monocomando, doble comando">
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.makeup_brushes_number_required, `
                            <!-- Cantidad de Brochas (makeup_brushes_number) -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="hash" class="h-3.5 w-3.5"></i> Cantidad de brochas
                                    ${requiredBadge(meliAttrs.makeup_brushes_number_required)}
                                </label>
                                <input type="number" id="attr_makeup_brushes_number" value="${meliAttrs.makeup_brushes_number !== null && meliAttrs.makeup_brushes_number !== undefined ? meliAttrs.makeup_brushes_number : ''}" oninput="window.triggerMeliAttributesAutoSave(${product.id})"
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm placeholder-gray-400"
                                       placeholder="Ej: 12">
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.finish_required, `
                            <!-- Acabado (finish) -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="sparkles" class="h-3.5 w-3.5"></i> Acabado
                                    ${requiredBadge(meliAttrs.finish_required)}
                                </label>
                                <input type="text" id="attr_finish" value="${meliAttrs.finish || ''}" maxlength="255" oninput="window.triggerMeliAttributesAutoSave(${product.id})"
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm placeholder-gray-400"
                                       placeholder="Ej: mate, cremoso, metalizado">
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.lip_liner_type_required, `
                            <!-- Tipo de Delineador (lip_liner_type) -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="pen-tool" class="h-3.5 w-3.5"></i> Tipo de delineador
                                    ${requiredBadge(meliAttrs.lip_liner_type_required)}
                                </label>
                                <input type="text" id="attr_lip_liner_type" value="${meliAttrs.lip_liner_type || ''}" maxlength="255" oninput="window.triggerMeliAttributesAutoSave(${product.id})"
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm placeholder-gray-400"
                                       placeholder="Ej: gel, liquido, lapiz">
                            </div>
                            `)}

                            ${showIfRequired(meliAttrs.board_game_name_required, `
                            <!-- Nombre del Tablero de Juego (board_game_name) -->
                            <div class="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-150 dark:border-gray-700/50">
                                <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <i data-lucide="dices" class="h-3.5 w-3.5"></i> Nombre del tablero de juego
                                    ${requiredBadge(meliAttrs.board_game_name_required)}
                                </label>
                                <input type="text" id="attr_board_game_name" value="${meliAttrs.board_game_name || ''}" maxlength="255" oninput="window.triggerMeliAttributesAutoSave(${product.id})"
                                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow shadow-sm placeholder-gray-400"
                                       placeholder="Ej: Ajedrez, Ludo, Damas">
                            </div>
                            `)}
                        </div>

                        ${hasNotMappedAttributes(meliAttrs.not_mapped_attributes) ? `
                        <!-- Atributos No Mapeados -->
                        <div class="bg-gray-50 dark:bg-gray-800/40 p-4 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm space-y-3">
                            <label class="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                <i data-lucide="database" class="h-3.5 w-3.5"></i> Atributos No Mapeados (Meli)
                            </label>
                            ${formatNotMappedAttributes(meliAttrs.not_mapped_attributes)}
                        </div>
                        ` : ''}

                    </div>

                    <!-- Footer Actions -->
                    <div class="sticky bottom-0 px-6 md:px-8 py-4 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3 z-10 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.05)]">
                        <button onclick="closeModal()" 
                                class="px-4 py-2 text-sm bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 font-medium transition-all border border-gray-200 dark:border-gray-600 shadow-sm">
                            Cerrar
                        </button>
                        
                        <div class="flex items-center gap-2">
                            <div id="auto-save-status" class="hidden md:flex items-center px-2 mr-2"></div>

                            <!-- Tienda Nube Action -->
                            <button onclick="event.stopPropagation(); openTiendaNubeDetail(${product.id})" 
                                    class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition-all shadow-md flex items-center gap-2"
                                    title="Gestionar Tienda Nube">
                                <svg class="h-4 w-4" viewBox="0 0 56 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <circle cx="18" cy="26" r="13" stroke="currentColor" stroke-width="5" fill="none"/>
                                    <circle cx="36" cy="18" r="15" stroke="currentColor" stroke-width="5" fill="none"/>
                                </svg>
                                <span>${product.tienda_nube_status === 'active' ? 'Gestionar TN' : 'Publicar TN'}</span>
                            </button>

                            ${product.meli_id ? `
                            <button onclick="triggerProductUpdate(${product.id}, this)" 
                                    class="px-4 py-2 text-sm bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 font-medium transition-all flex items-center gap-2">
                                <i data-lucide="rotate-cw" class="h-4 w-4"></i>
                                <span>Actualizar</span>
                            </button>` : ''}

                            <div class="w-px h-6 bg-gray-200 mx-1"></div>

                            ${isActive
                                ? `<div class="flex gap-2">
                                    <button onclick="togglePublishFromDetail(${product.id}, false)" 
                                       class="px-4 py-2 text-sm bg-orange-50 text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-100 font-medium transition-all flex items-center gap-2">
                                        <i data-lucide="pause-circle" class="h-4 w-4"></i>
                                        <span>Pausar</span>
                                    </button>
                                    <button onclick="deleteMeliProduct(${product.id}, this)" 
                                       class="p-2 bg-red-50 text-red-600 border border-red-100 rounded-lg hover:bg-red-600 hover:text-white transition-all shadow-sm"
                                       title="Eliminar de MercadoLibre">
                                        <i data-lucide="trash-2" class="h-4 w-4"></i>
                                    </button>
                                   </div>`
                                : `<div class="flex gap-2">
                                    <button onclick="togglePublishFromDetail(${product.id}, true)" 
                                       class="px-5 py-2 text-sm bg-[#fff159] text-[#2d3277] border border-yellow-400 rounded-lg hover:bg-[#fdd835] font-bold transition-all flex items-center gap-2 shadow-sm">
                                        <i data-lucide="shopping-bag" class="h-4 w-4"></i>
                                        <span>Publicar</span>
                                    </button>
                                    <button onclick="deleteMeliProduct(${product.id}, this)" 
                                       class="p-2 bg-red-50 text-red-600 border border-red-100 rounded-lg hover:bg-red-600 hover:text-white transition-all shadow-sm"
                                       title="Eliminar de MercadoLibre">
                                        <i data-lucide="trash-2" class="h-4 w-4"></i>
                                    </button>
                                   </div>`
                            }
                        </div>
                    </div>

                </div>
            </div>
            `;

            openModal(``, html);
            lucide.createIcons();

            // Remove any existing keyboard handler first (prevents stacking)
            if (window._productDetailKeyHandler) {
                document.removeEventListener('keydown', window._productDetailKeyHandler);
            }

            // Add keyboard navigation
            const handleKeyNav = (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return; // Don't nav while editing

                if (e.key === 'ArrowLeft') {
                    navigateProduct(-1);
                } else if (e.key === 'ArrowRight') {
                    navigateProduct(1);
                } else if (e.key === 'Escape') {
                    closeModal();
                }
            };
            document.addEventListener('keydown', handleKeyNav);

            // Store handler to remove on close
            window._productDetailKeyHandler = handleKeyNav;


        } catch (e) {
            console.error("Error fetching product details:", e);
            showAlert('Error', 'Error al cargar los detalles del producto.', 'error');
        } finally {
            setLoading(false);
        }
    }

    // Navigate to previous/next product
    window.navigateProduct = (direction) => {
        const newIndex = currentDetailIndex + direction;
        if (newIndex >= 0 && newIndex < state.products.length) {
            const nextProduct = state.products[newIndex];
            openProductDetail(nextProduct.id);
        }
    };

    // Edit Drive URL from detail view
    window.editDriveUrl = async (productId, currentUrl) => {
        const newUrl = prompt("Ingresa la URL de la carpeta de Google Drive:", currentUrl);

        if (newUrl === null) return; // Cancelled

        try {
            const response = await authFetch(`/api/products/${productId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ drive_url: newUrl })
            });

            if (!response.ok) throw new Error('Error al actualizar la URL en el servidor');

            // Update local state
            const productIndex = state.products.findIndex(p => p.id === productId);
            if (productIndex >= 0) {
                state.products[productIndex].drive_url = newUrl;
            }

            // Refresh the detail modal
            openProductDetail(productId);

        } catch (e) {
            console.error('Error updating drive URL:', e);
            showAlert('Error', 'Error al guardar la URL de Drive: ' + e.message, 'error');
        }
    };

    // Drag and Drop Handlers
    window.handleDriveDrop = async (e, productId) => {
        e.preventDefault();
        e.stopPropagation();

        // Remove highlight styles
        const dropzone = e.currentTarget;
        dropzone.classList.remove('border-blue-500', 'bg-blue-100');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            await uploadFilesToDrive(files, productId);
        }
    };

    window.handleDriveFileSelect = async (e, productId) => {
        const files = e.target.files;
        if (files.length > 0) {
            await uploadFilesToDrive(files, productId);
        }
    };

    async function uploadFilesToDrive(fileList, productId) {
        const overlay = document.getElementById(`upload-overlay-${productId}`);
        const dropzone = document.getElementById(`drive-dropzone-${productId}`);

        if (overlay) overlay.classList.remove('hidden');
        if (dropzone) dropzone.classList.add('pointer-events-none');

        let successCount = 0;
        let errorCount = 0;
        let lastError = null;
        let driveUrl = null;

        const files = Array.from(fileList);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const formData = new FormData();
            formData.append('file', file);

            // Update overlay text if possible
            const statusText = overlay.querySelector('.font-medium');
            if (statusText) statusText.innerText = `Subiendo (${i + 1}/${files.length})...`;

            try {
                const response = await authFetch(`/api/products/${productId}/upload`, {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.detail || 'Error en la subida');
                }

                const result = await response.json();
                driveUrl = result.drive_url;
                successCount++;
            } catch (e) {
                console.error(`Upload error for file ${file.name}:`, e);
                errorCount++;
                lastError = e.message;
            }
        }

        if (overlay) overlay.classList.add('hidden');
        if (dropzone) dropzone.classList.remove('pointer-events-none');

        // Update local state if we got a drive URL
        if (driveUrl) {
            const productIndex = state.products.findIndex(p => p.id === productId);
            if (productIndex >= 0) {
                state.products[productIndex].drive_url = driveUrl;
            }
        }

        // Final feedback
        if (errorCount === 0) {
            showAlert('Carga Exitosa', successCount > 1 ? `¡${successCount} fotos subidas correctamente!` : '¡Foto subida correctamente!', 'success');
        } else if (successCount > 0) {
            showAlert('Carga Parcial', `Se subieron ${successCount} fotos, pero ${errorCount} fallaron. Último error: ${lastError}`, 'warning');
        } else {
            showAlert('Error de Carga', 'Error al subir las fotos: ' + lastError, 'error');
        }

        // Clear input
        const input = document.getElementById(`file-input-${productId}`);
        if (input) input.value = '';

        // Refresh UI
        openProductDetail(productId);
    }

    // Toggle publish from detail view and refresh the modal
    // Toggle publish from detail view and refresh the modal
    window.togglePublishFromDetail = async (productId, publish) => {
        // Automatically save the form attributes first before publishing
        if (publish) {
            const saveSuccess = await window.saveMeliAttributes(null, productId);
            if (!saveSuccess) {
                return;
            }
        }

        const loadingText = publish ? 'Publicando...' : 'Pausando...';

        const button = event?.target?.closest('button');
        const originalText = button ? button.innerHTML : ''; // use innerHTML because original might have icon

        if (button) {
            // Keep width fixed
            button.style.width = getComputedStyle(button).width;

            button.disabled = true;
            button.innerText = loadingText;
            button.classList.add('opacity-50', 'cursor-wait');
        }

        try {
            const response = await authFetch(`/api/products/${productId}/publish`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: publish ? 'publish' : 'pause' })
            });
            if (!response.ok) throw new Error('Error updating product');

            // Success: Update UI status badge only
            const statusBadge = document.getElementById(`detail-status-badge-${productId}`);
            if (statusBadge) {
                statusBadge.textContent = "EN PROCESO";
                statusBadge.className = "bg-blue-100 text-blue-700 border-blue-200 px-2.5 py-1 rounded-full text-xs font-bold uppercase border animate-pulse";
            }

            // Also update local state so if they navigate away and come back it MIGHT still be there (though full refresh will kill it)
            const productIndex = state.products.findIndex(p => p.id === productId);
            if (productIndex >= 0) {
                state.products[productIndex].status = "En Proceso";
            }

        } catch (e) {
            console.error('Error:', e);
            showAlert('Error', 'Error al cambiar el estado', 'error');
        } finally {
            // Always restore button
            if (button) {
                button.disabled = false;
                button.innerHTML = originalText;
                button.classList.remove('opacity-50', 'cursor-wait');
                button.style.width = '';
            }
        }
    };


    // Trigger manual update notification
    window.triggerProductUpdate = async (productId, btn) => {
        const icon = btn.querySelector('i');
        // Start rotation animation
        if (icon) icon.classList.add('animate-spin');
        btn.disabled = true;

        try {
            // Automatically save the form attributes first before notifying
            const saveSuccess = await window.saveMeliAttributes(null, productId);
            if (!saveSuccess) {
                if (icon) icon.classList.remove('animate-spin');
                btn.disabled = false;
                return;
            }

            const response = await authFetch(`/api/products/${productId}/notify`, {
                method: 'POST'
            });

            if (!response.ok) throw new Error('Error en la notificación');

            // Update local state to "actualizando"
            const productIndex = state.products.findIndex(p => p.id === productId);
            if (productIndex >= 0) {
                state.products[productIndex].status = 'actualizando';
                renderProducts();
            }

            setTimeout(() => {
                showAlert('Éxito', 'Actualización enviada correctamente', 'success');
            }, 500);

        } catch (e) {
            console.error(e);
            showAlert('Error', 'Error al enviar notificación de actualización', 'error');
        } finally {
            if (icon) icon.classList.remove('animate-spin');
            btn.disabled = false;
        }
    };

    window.toggleMeliStatus = (id, btn) => {
        const content = document.getElementById(`meli-status-content-${id}`);
        // Find the generic SVG icon since lucide replaces <i>
        const icon = btn.querySelector('svg') || btn.querySelector('i');

        if (content) content.classList.toggle('hidden');
        if (icon) icon.classList.toggle('rotate-180');
    };

    window.toggleStatusDetails = (id, btn) => {
        const content = document.getElementById(`status-details-${id}`);
        const icon = btn.querySelector('svg') || btn.querySelector('i');

        if (content) content.classList.toggle('hidden');
        if (icon) icon.classList.toggle('rotate-180');
    };

    window.switchDetailTab = function(tabName) {
        const generalTab = document.getElementById('detailTab-general');
        const attrsTab = document.getElementById('detailTab-attributes');
        const generalBtn = document.getElementById('tabBtn-general');
        const attrsBtn = document.getElementById('tabBtn-attributes');
        
        if (tabName === 'general') {
            if (generalTab) generalTab.classList.remove('hidden');
            if (attrsTab) attrsTab.classList.add('hidden');
            
            // Switch button styles
            if (generalBtn) {
                generalBtn.className = "pb-3 border-b-2 border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400 font-bold text-sm transition-all focus:outline-none flex items-center gap-2";
            }
            if (attrsBtn) {
                attrsBtn.className = "pb-3 border-b-2 border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-medium text-sm transition-all focus:outline-none flex items-center gap-2";
            }
        } else {
            if (generalTab) generalTab.classList.add('hidden');
            if (attrsTab) attrsTab.classList.remove('hidden');
            
            // Switch button styles
            if (generalBtn) {
                generalBtn.className = "pb-3 border-b-2 border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-medium text-sm transition-all focus:outline-none flex items-center gap-2";
            }
            if (attrsBtn) {
                attrsBtn.className = "pb-3 border-b-2 border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400 font-bold text-sm transition-all focus:outline-none flex items-center gap-2";
            }
        }
        
        // Scroll parent details pane to top
        if (generalTab) {
            const pane = generalTab.parentElement;
            if (pane) pane.scrollTop = 0;
        }
    };

    window.validateVolumeCapacity = function(inputEl) {
        const val = parseFloat(inputEl.value);
        const warning = document.getElementById('volume_warning');
        if (val > 1000000) {
            if (warning) warning.classList.remove('hidden');
        } else {
            if (warning) warning.classList.add('hidden');
        }
    };

    window.toggleConnector = function(badge, option, productId, inputId = 'attr_output_connectors') {
        const input = document.getElementById(inputId);
        if (!input) return;
        let val = input.value.trim();
        let parts = val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
        if (parts.includes(option)) {
            parts = parts.filter(p => p !== option);
            badge.classList.remove('bg-blue-100', 'text-blue-800', 'border-blue-300', 'dark:bg-blue-900/40', 'dark:text-blue-300', 'dark:border-blue-800');
            badge.classList.add('bg-gray-100', 'text-gray-600', 'border-gray-200', 'dark:bg-gray-800', 'dark:text-gray-400', 'dark:border-gray-700');
        } else {
            parts.push(option);
            badge.classList.add('bg-blue-100', 'text-blue-800', 'border-blue-300', 'dark:bg-blue-900/40', 'dark:text-blue-300', 'dark:border-blue-800');
            badge.classList.remove('bg-gray-100', 'text-gray-600', 'border-gray-200', 'dark:bg-gray-800', 'dark:text-gray-400', 'dark:border-gray-700');
        }
        input.value = parts.join(', ');
        if (productId) {
            window.triggerMeliAttributesAutoSave(productId);
        }
    };

    window.validateCapacity = function(inputEl, warningElId) {
        if (!inputEl) return true;
        const val = inputEl.value.trim();
        const warning = document.getElementById(warningElId);
        if (!val) {
            if (warning) warning.classList.add('hidden');
            return true;
        }
        const isValid = /^\d+(\.\d+)?\s*(kb|mb|gb|tb|pb)$/i.test(val);
        if (!isValid) {
            if (warning) warning.classList.remove('hidden');
            return false;
        } else {
            if (warning) warning.classList.add('hidden');
            return true;
        }
    };

    const debouncedMeliAttributesSave = (productId) => {
        if (window._meliAutoSaveTimer) clearTimeout(window._meliAutoSaveTimer);

        const statusEl = document.getElementById('auto-save-status');
        if (statusEl) {
            statusEl.innerHTML = '<span class="text-gray-400 italic text-xs">Cambios pendientes...</span>';
        }

        window._meliAutoSaveTimer = setTimeout(async () => {
            await window.saveMeliAttributes(null, productId, true);
        }, 800);
    };

    window.triggerMeliAttributesAutoSave = (productId) => {
        debouncedMeliAttributesSave(productId);
    };

    window.saveMeliAttributes = async function(event, productId, isAutoSave = false) {
        if (event) event.preventDefault();
        const btn = event ? event.currentTarget : null;
        const originalHTML = btn ? btn.innerHTML : '';
        if (btn) {
            btn.innerHTML = '<i data-lucide="loader-2" class="h-4 w-4 animate-spin text-white"></i> Guardando...';
            if (window.lucide) lucide.createIcons();
            btn.disabled = true;
        }

        const statusEl = document.getElementById('auto-save-status');
        if (isAutoSave && statusEl) {
            statusEl.innerHTML = '<span class="flex items-center gap-1.5 text-blue-600 animate-pulse text-xs font-medium"><div class="h-2 w-2 bg-blue-600 rounded-full"></div> Guardando...</span>';
        }

        try {
            const getVal = (id) => {
            const el = document.getElementById(id);
            return el ? el.value : '';
        };

        const getValOrNull = (id) => {
            const val = getVal(id).trim();
            return val === '' ? null : val;
        };

        const fullPayload = {
            currency_id: 'ARS',
            buying_mode: getValOrNull('attr_buying_mode'),
            condition_type: getValOrNull('attr_condition_type'),
            category_id: getValOrNull('attr_category_id'),
            local_pick_up: document.getElementById('attr_local_pick_up')?.checked ? 1 : 0,
            logistic_type: getValOrNull('attr_logistic_type'),
            warranty_type: getValOrNull('attr_warranty_type'),
            warranty_time: getValOrNull('attr_warranty_time'),
            volume_capacity: getVal('attr_volume_capacity') !== "" ? parseFloat(getVal('attr_volume_capacity')) : null,
            units_per_pack: getVal('attr_units_per_pack') !== "" ? parseInt(getVal('attr_units_per_pack')) : 1,
            value_added_tax: getValOrNull('attr_value_added_tax'),
            import_duty: getValOrNull('attr_import_duty'),
            empty_gtin_reason: getValOrNull('attr_empty_gtin_reason'),
            ink_color: getValOrNull('attr_ink_color'),
            pot_type: getValOrNull('attr_pot_type'),
            product_type: getValOrNull('attr_product_type'),
            output_connectors: getValOrNull('attr_output_connectors'),
            surveillance_camera_type: getValOrNull('attr_surveillance_camera_type'),
            camera_locations: getValOrNull('attr_camera_locations'),
            cable_and_adapter_type: getValOrNull('attr_cable_and_adapter_type'),
            data_storage_capacity: getValOrNull('attr_data_storage_capacity'),
            usb_port_version: getValOrNull('attr_usb_port_version'),
            capacity: getValOrNull('attr_capacity'),
            power_supply_type: getValOrNull('attr_power_supply_type'),
            grading: getValOrNull('attr_grading'),
            with_usb: getValOrNull('attr_with_usb'),
            size: getValOrNull('attr_size'),
            color: getValOrNull('attr_color'),
            gender: getValOrNull('attr_gender'),
            name: getValOrNull('attr_name'),
            iron_type: getValOrNull('attr_iron_type'),
            input_connector: getValOrNull('attr_input_connector'),
            thermal_container_type: getValOrNull('attr_thermal_container_type'),
            is_factory_kit: getValOrNull('attr_is_factory_kit'),
            pieces_number: getVal('attr_pieces_number') !== "" ? parseInt(getVal('attr_pieces_number')) : null,
            material: getValOrNull('attr_material'),
            drinking_glass_product_type: getValOrNull('attr_drinking_glass_product_type'),
            makeup_format: getValOrNull('attr_makeup_format'),
            eyeliner_type: getValOrNull('attr_eyeliner_type'),
            backpack_type: getValOrNull('attr_backpack_type'),
            faucet_control_type: getValOrNull('attr_faucet_control_type'),
            makeup_brushes_number: getVal('attr_makeup_brushes_number') !== "" ? parseInt(getVal('attr_makeup_brushes_number')) : null,
            finish: getValOrNull('attr_finish'),
            lip_liner_type: getValOrNull('attr_lip_liner_type'),
            board_game_name: getValOrNull('attr_board_game_name'),
            listing_type_id: getValOrNull('edit_listing_type_id'),
            free_shipping: document.getElementById('edit_free_shipping')?.checked ? 1 : 0,
            mode_shipping: getValOrNull('edit_mode_shipping')
        };

        const payload = {};
        for (const key in fullPayload) {
            const newVal = fullPayload[key];
            const oldVal = currentMeliAttrs ? currentMeliAttrs[key] : undefined;
            
            // Normalize comparison for null/undefined/empty string
            const isNewFalsy = (newVal === null || newVal === undefined || newVal === "");
            const isOldFalsy = (oldVal === null || oldVal === undefined || oldVal === "");
            
            if (isNewFalsy && isOldFalsy) {
                continue;
            }
            
            // Loose comparison to handle numbers vs strings
            if (String(newVal) !== String(oldVal)) {
                payload[key] = newVal;
            }
        }

        if (Object.keys(payload).length === 0) {
            if (isAutoSave) {
                if (statusEl) {
                    statusEl.innerHTML = '<span class="text-green-600 flex items-center gap-1 text-xs font-bold"><i data-lucide="check" class="h-3 w-3"></i> Guardado</span>';
                    if (window.lucide) lucide.createIcons();
                    setTimeout(() => {
                        if (statusEl && statusEl.innerText.includes('Guardado')) {
                            statusEl.innerHTML = '';
                        }
                    }, 2000);
                }
                return true;
            }
            if (btn) {
                btn.innerHTML = originalHTML;
                if (window.lucide) lucide.createIcons();
                btn.disabled = false;
            }
            return true;
        }

        // Frontend validation for volume_capacity
        if (fullPayload.volume_capacity !== null && fullPayload.volume_capacity > 1000000) {
            if (!isAutoSave) {
                showAlert('Validación', 'La capacidad no debe exceder 1,000,000 Ml (1000L).', 'error');
            }
            if (btn) {
                btn.innerHTML = originalHTML;
                if (window.lucide) lucide.createIcons();
                btn.disabled = false;
            }
            if (isAutoSave && statusEl) {
                statusEl.innerHTML = '<span class="text-red-600 text-xs font-medium">Error de validación</span>';
            }
            return false;
        }

        // Validate capacity fields
        const isDataStorageValid = window.validateCapacity(document.getElementById('attr_data_storage_capacity'), 'data_storage_capacity_warning');
        const isCapacityValid = window.validateCapacity(document.getElementById('attr_capacity'), 'capacity_warning');
        if (!isDataStorageValid || !isCapacityValid) {
            if (!isAutoSave) {
                showAlert('Validación', 'Por favor, especifica un número y unidad válidos (Ej: 25 GB, 5 TB) en los campos de capacidad.', 'error');
            }
            if (btn) {
                btn.innerHTML = originalHTML;
                if (window.lucide) lucide.createIcons();
                btn.disabled = false;
            }
            if (isAutoSave && statusEl) {
                statusEl.innerHTML = '<span class="text-red-600 text-xs font-medium">Error de validación</span>';
            }
            return false;
        }

        // try removed
        
            const response = await authFetch(`/api/products/${productId}/mercadolibre-attributes`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                if (response.status === 404) {
                    // Fallback to local mock save for offline testing
                    localStorage.setItem(`mock_meli_attrs_${productId}`, JSON.stringify(payload));
                    if (!isAutoSave) {
                        showAlert('Guardado Local (Prueba)', 'El endpoint no fue encontrado (404). Se guardaron los datos localmente en tu navegador.', 'success');
                    } else if (statusEl) {
                        statusEl.innerHTML = '<span class="text-green-600 flex items-center gap-1 text-xs font-bold"><i data-lucide="check" class="h-3 w-3"></i> Guardado Local</span>';
                        if (window.lucide) lucide.createIcons();
                    }
                    
                    // Also trigger product patch for the three migrated fields in the product table just in case backend expects it there
                    try {
                        await authFetch(`/api/products/${productId}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                listing_type_id: payload.listing_type_id,
                                free_shipping: payload.free_shipping,
                                mode_shipping: payload.mode_shipping
                            })
                        });
                    } catch(e) {}

                    // Update local currentMeliAttrs
                    if (currentMeliAttrs) {
                        for (const key in payload) {
                            currentMeliAttrs[key] = payload[key];
                        }
                    }

                    // Refresh detail modal
                    if (!isAutoSave && currentDetailIndex !== -1) {
                         const currentProduct = state.products[currentDetailIndex];
                         if (currentProduct) refreshProductDetail(currentProduct.id);
                    }
                    return true;
                }
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || 'Error al guardar los atributos');
            }

            if (!isAutoSave) {
                showAlert('Atributos Guardados', 'Los atributos de MercadoLibre fueron actualizados con éxito.', 'success');
            } else if (statusEl) {
                statusEl.innerHTML = '<span class="text-green-600 flex items-center gap-1 text-xs font-bold"><i data-lucide="check" class="h-3 w-3"></i> Guardado</span>';
                if (window.lucide) lucide.createIcons();
                setTimeout(() => {
                    if (statusEl && statusEl.innerText.includes('Guardado')) {
                        statusEl.innerHTML = '';
                    }
                }, 2000);
            }

            // Update local currentMeliAttrs
            if (currentMeliAttrs) {
                for (const key in payload) {
                    currentMeliAttrs[key] = payload[key];
                }
            }
            
            // Refresh detail modal
            if (!isAutoSave && currentDetailIndex !== -1) {
                 const currentProduct = state.products[currentDetailIndex];
                 if (currentProduct) refreshProductDetail(currentProduct.id);
            }
            return true;
        } catch (error) {
            console.error('Error saving attributes:', error);
            if (!isAutoSave) {
                showAlert('Error', error.message, 'error');
            } else if (statusEl) {
                statusEl.innerHTML = `<span class="text-red-600 text-xs font-medium" title="${error.message.replace(/"/g, '&quot;')}">Error al guardar</span>`;
            }
            return false;
        } finally {
            if (btn) {
                btn.innerHTML = originalHTML;
                if (window.lucide) lucide.createIcons();
                btn.disabled = false;
            }
        }
    };

    window.openProductDetail = openProductDetail;

    window.onCategoryOptionChange = async function(selectEl, productId) {
        const categoryId = selectEl.value;
        const inputEl = document.getElementById('attr_category_id');
        if (!categoryId) return;
        
        if (inputEl) {
            inputEl.value = categoryId;
        }
        
        const loader = document.getElementById('category_options_loading');
        if (loader) loader.classList.remove('hidden');
        selectEl.disabled = true;
        
        try {
            // Local fallback for offline/localStorage mock
            const mockKey = `mock_meli_attrs_${productId}`;
            const mockData = localStorage.getItem(mockKey);
            let meliAttrs = {};
            if (mockData) {
                try {
                    meliAttrs = JSON.parse(mockData);
                } catch(e) {}
            }
            meliAttrs.category_id = categoryId;
            localStorage.setItem(mockKey, JSON.stringify(meliAttrs));

            const saveRes = await authFetch(`/api/products/${productId}/mercadolibre-attributes`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    category_id: categoryId || null
                })
            });

            if (!saveRes.ok) {
                if (saveRes.status !== 404) {
                    const text = await saveRes.text();
                    let errorMsg = 'Error al guardar la categoría';
                    try {
                        const errData = JSON.parse(text);
                        if (errData.detail) errorMsg = errData.detail;
                    } catch (e) {}
                    throw new Error(errorMsg);
                }
            }

            // 2. Disparar evento de pre-publish sin data (webhook simplificado)
            const prePubRes = await authFetch(`/api/products/${productId}/pre-publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            
            if (!prePubRes.ok) {
                const text = await prePubRes.text();
                let errorMsg = 'Error al disparar Pre-Publish';
                try {
                    const errData = JSON.parse(text);
                    if (errData.detail) errorMsg = errData.detail;
                } catch (e) {}
                throw new Error(errorMsg);
            }
            
            showAlert('Categoría Aplicada', 'Categoría guardada y evento de Pre-Publish ejecutado con éxito.', 'success');
            
        } catch(error) {
            console.error('Error changing category options:', error);
            showAlert('Error', error.message, 'error');
        } finally {
            if (loader) loader.classList.add('hidden');
            selectEl.disabled = false;
        }
    };


    async function fetchMetadata() {

        try {
            const [catRes, brandRes] = await Promise.all([
                authFetch('/api/categories'),
                authFetch('/api/brands')
            ]);

            if (catRes.ok) {
                const categories = await catRes.json();
                const catHtml = '<option value="">Todas las categorías</option>' +
                    categories.filter(c => c).map(c => `<option value="${c}">${c}</option>`).join('');
                elements.filterCategory.innerHTML = catHtml;
            }

            if (brandRes.ok) {
                const brands = await brandRes.json();
                const brandHtml = '<option value="">Todas las marcas</option>' +
                    brands.filter(b => b).map(b => `<option value="${b}">${b}</option>`).join('');
                elements.filterBrand.innerHTML = brandHtml;
            }
        } catch (e) {
            console.error("Error fetching metadata", e);
        }
    }


    // --- Modals ---



    window.closeModal = () => {
        // Remove keyboard navigation handler if it exists
        if (window._productDetailKeyHandler) {
            document.removeEventListener('keydown', window._productDetailKeyHandler);
            window._productDetailKeyHandler = null;
        }

        elements.modalBackdrop.classList.remove('opacity-100');
        elements.modalBackdrop.classList.add('opacity-0');
        elements.modalContent.classList.remove('scale-100');
        elements.modalContent.classList.add('scale-95');
        setTimeout(() => {
            elements.modalBackdrop.classList.add('hidden');
            
            // Sincronizar el estado de la vista atras del modal
            const iv = document.getElementById('inventoryView');
            if (iv && !iv.classList.contains('hidden') && typeof renderProducts === 'function') {
                renderProducts();
            }
            const mv = document.getElementById('meliView');
            if (mv && !mv.classList.contains('hidden') && typeof loadMeliProducts === 'function') {
                loadMeliProducts();
            }
            const cv = document.getElementById('competenceView');
            if (cv && !cv.classList.contains('hidden') && typeof loadCompetenceData === 'function') {
                loadCompetenceData();
            }
        }, 300);
    };

    // --- Product Modal ---

    async function openProductModal(productId = null) {
        let product = {
            product_code: '',
            product_name: '',
            description: '',
            detail: '',
            price: '',
            stock: '',
            category: '',
            brand: '',
            dimentions: '',
            product_type_path: '',
            product_use_stock: false,
            is_validated: false,
            product_image_b_format_url: ''
        };

        let title = 'Nuevo Producto';

        if (productId) {
            title = 'Editar Producto';
            try {
                setLoading(true);
                const res = await authFetch(`/api/products/${productId}`);
                if (!res.ok) throw new Error('Error fetching product');
                product = await res.json();
                // Ensure nulls are handled for inputs
                if (product.stock === null) product.stock = '';
                if (product.price_mercadolibre === null) product.price_mercadolibre = '';
            } catch (e) {
                console.error(e);
                showAlert('Error', 'Error al cargar el producto', 'error');
                setLoading(false);
                return;
            } finally {
                setLoading(false);
            }
        }

        const html = `
        <form id="productForm" onsubmit="window.saveProduct(event, ${productId})" class="p-6">
            <div class="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                
                <!-- Code & Name -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Código *</label>
                        <input type="text" name="product_code" value="${product.product_code || ''}" 
                            ${productId ? 'disabled class="w-full rounded-lg border-gray-200 bg-gray-100 text-gray-500"' : 'required class="w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500"'}
                            maxlength="100">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                        <input type="text" name="product_name" value="${product.product_name || ''}" required 
                            class="w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500" maxlength="255">
                    </div>
                </div>

                <!-- Price & Stock -->
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <input type="number" name="price_mercadolibre" value="${product.price_mercadolibre !== '' ? product.price_mercadolibre : ''}" required min="0" step="0.01"
                            class="w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Precio Local (Ref)</label>
                        <input type="number" name="price" value="${product.price !== '' ? product.price : ''}" readonly
                            class="w-full rounded-lg border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none">
                    </div>
                    <div>
                        <div class="flex items-center justify-between mb-1">
                            <label class="block text-sm font-medium text-gray-700">Stock</label>
                            <div class="flex items-center">
                                <input type="checkbox" id="useStock" name="product_use_stock" 
                                    ${product.product_use_stock ? 'checked' : ''} onchange="window.toggleStockInput(this)"
                                    class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded">
                                <label for="useStock" class="ml-2 block text-xs text-gray-500">Controlar Stock</label>
                            </div>
                        </div>
                        <input type="number" id="stockInput" name="stock" value="${product.stock !== '' ? product.stock : ''}" 
                            min="0" ${product.product_use_stock ? 'required' : 'disabled'}
                            class="w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-400">
                    </div>
                </div>

                <!-- Category, brand & dimensions -->
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                     <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Categoría *</label>
                        <input type="text" name="category" value="${product.category || ''}" required
                            class="w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500">
                    </div>
                     <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Marca *</label>
                        <input type="text" name="brand" value="${product.brand || ''}" required
                            class="w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Dimensiones</label>
                        <input type="text" name="dimentions" value="${product.dimentions || ''}" placeholder="Ej: 2x5x10,462"
                            class="w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500">
                    </div>
                </div>

                <div>
                            <div class="flex items-center justify-between mb-1">
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Título MercadoLibre</label>
                            </div>
                            <div class="flex gap-2">
                                <input type="text" id="detail-product_name_meli" value="${product.product_name_meli || ''}" placeholder="Dejar vacío para mantener el actual"
                                class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 placeholder-gray-400">
                                
                                <button type="button" id="btn-ai-product_name_meli" onclick="window.triggerAIPrePublish(${productId}, 'product_name_meli')" 
                                    class="mt-1 px-3 py-2 bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-md border border-purple-200 transition-colors flex-shrink-0 flex items-center justify-center"
                                    title="Generar con AI">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/></svg>
                                </button>
                            </div>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Descripción</label>
                            <div class="relative mt-1">
                                <textarea id="detail-description" rows="12" placeholder="Dejar vacío para mantener la actual"
                                class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm font-mono text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 placeholder-gray-400">${product.description || ''}</textarea>
                                <button type="button" id="btn-ai-description" onclick="window.triggerAIPrePublish(${productId}, 'description')" 
                                    class="absolute top-2 right-2 p-1.5 bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-md border border-purple-200 transition-colors"
                                    title="Generar con AI">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/></svg>
                                </button>
                            </div>
                        </div>

                    <script>
                        window.triggerAIPrePublish = async function(productId, field) {
                            const btn = document.getElementById('btn-ai-' + field);
                            const input = document.getElementById('detail-' + field);
                            
                            if (!btn || !input) return;
                            
                            // Visual feedback
                            const originalHtml = btn.innerHTML;
                            btn.innerHTML = '<svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
                            btn.disabled = true;
                            
                            try {
                                const promptText = input.value.trim() || (field === 'description' ? 'Generar descripción optimizada' : 'Optimizar título para ML');
                                
                                const response = await window.authFetch('/api/products/' + productId + '/pre-publish', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        prompt: promptText,
                                        field: field
                                    })
                                });
                                
                                const data = await response.json();
                                
                                if (!response.ok) throw new Error(data.detail || 'Error en AI');
                                
                                showAlert('AI en Proceso', 'Solicitud AI enviada: ' + data.message + '\n(Los cambios se reflejarán cuando refresques la vista más tarde)', 'success');
                                
                            } catch (error) {
                                console.error('AI Error:', error);
                                showAlert('Error AI', 'Error generando contenido AI: ' + error.message, 'error');
                            } finally {
                                btn.innerHTML = originalHtml;
                                btn.disabled = false;
                            }
                        };
                    </script>

                 <!-- Path -->
                <div>
                     <label class="block text-sm font-medium text-gray-700 mb-1">Ruta Tipo Producto</label>
                     <input type="text" name="product_type_path" value="${product.product_type_path || ''}" 
                         class="w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500">
                </div>

                <!-- Description -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                    <textarea name="description" rows="2" class="w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500">${product.description || ''}</textarea>
                </div>
                
                 <!-- Detail -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Detalle</label>
                    <textarea name="detail" rows="2" class="w-full rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500">${product.detail || ''}</textarea>
                </div>

                <!-- Image URL -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">URL Imagen</label>
                    <div class="flex gap-4 items-start">
                        <input type="text" name="product_image_b_format_url" value="${product.product_image_b_format_url || ''}" id="imgUrlInput" oninput="window.updateImagePreview(this.value)"
                            class="flex-1 rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500">
                        <div class="h-16 w-16 flex-shrink-0 bg-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                            <img id="imgPreview" src="${product.product_image_b_format_url || 'https://via.placeholder.com/64?text=Img'}" class="h-full w-full object-cover">
                        </div>
                    </div>
                </div>

                 <!-- Validated Toggle -->
                <div class="flex items-center">
                    <input type="checkbox" id="isValidated" name="is_validated" ${product.is_validated ? 'checked' : ''}
                        class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded">
                    <label for="isValidated" class="ml-2 block text-sm text-gray-900">Validado</label>
                </div>

            </div>

            <!-- Actions -->
            <div class="mt-6 flex justify-end space-x-3 pt-4 border-t border-gray-100">
                <button type="button" onclick="closeModal()" class="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors">
                    Cancelar
                </button>
                <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm hover:shadow transition-all">
                    Guardar
                </button>
            </div>
        </form>
    `;

        openModal(title, html);
    }

    // Global helpers for the modal
    window.toggleStockInput = (checkbox) => {
        const stockInput = document.getElementById('stockInput');
        if (checkbox.checked) {
            stockInput.disabled = false;
            stockInput.required = true;
            stockInput.classList.remove('bg-gray-100', 'text-gray-400');
        } else {
            stockInput.disabled = true;
            stockInput.required = false;
            stockInput.value = '';
            stockInput.classList.add('bg-gray-100', 'text-gray-400');
        }
    };

    window.updateImagePreview = (url) => {
        const img = document.getElementById('imgPreview');
        if (url && url.length > 5) {
            img.src = url;
        } else {
            img.src = 'https://via.placeholder.com/64?text=Img';
        }
    }

    window.saveProduct = async (e, id) => {
        e.preventDefault();
        const form = e.target;
        // Extract data
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Fix types & Checkboxes (which are missing from FormData if unchecked)
        data.price_mercadolibre = parseFloat(data.price_mercadolibre);
        data.stock = data.stock ? parseInt(data.stock) : 0;

        // Explicitly check boolean fields
        data.product_use_stock = form.querySelector('[name="product_use_stock"]').checked;
        data.is_validated = form.querySelector('[name="is_validated"]').checked;

        // API Call
        try {
            const url = id ? `/api/products/${id}` : '/api/products/';
            const method = id ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                const errData = await response.json();
                // Try to extract useful error message
                const msg = errData.detail ? (typeof errData.detail === 'string' ? errData.detail : JSON.stringify(errData.detail)) : 'Error al guardar';
                throw new Error(msg);
            }

            // Success
            closeModal();
            fetchProducts();

        } catch (error) {
            console.error(error);
            showAlert('Error', error.message, 'error');
        }
    };

    // --- Initialisation ---

    // btnNewProduct logic removed as requested

    // Debounce utility
    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }


    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', debounce((e) => {
            state.search = e.target.value;
            state.page = 1;
            fetchProducts();
        }, 500));
    }

    if (elements.btnPrev) {
        elements.btnPrev.addEventListener('click', () => {
            if (state.page > 1) {
                state.page--;
                fetchProducts();
            }
        });
    }

    if (elements.btnNext) {
        elements.btnNext.addEventListener('click', () => {
            state.page++;
            fetchProducts();
        });
    }

    if (elements.checkAll) {
        elements.checkAll.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            const checkboxes = document.querySelectorAll('.row-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = isChecked;
                if (isChecked) state.selectedIds.add(cb.value);
                else state.selectedIds.delete(cb.value);
            });
            updateSelectionUI();
        });
    }

    // Bulk Publish button event
    if (elements.btnBulkPublish) {
        elements.btnBulkPublish.addEventListener('click', () => {
            if (state.selectedIds.size === 0) return;
            openModal('Publicar Productos', `
        <div class="p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-2">¿Publicar ${state.selectedIds.size} productos?</h3>
            <p class="text-gray-500 mb-6">Esta acción marcará todos los productos seleccionados como "Publicado".</p>
            <div class="flex justify-end space-x-3">
                <button onclick="closeModal()" class="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium">Cancelar</button>
                <button onclick="execBulkPublish(true)" class="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 font-medium shadow-sm">Publicar Todo</button>
            </div>
        </div>
    `);
        });
    }

    // Bulk Unpublish button event
    if (elements.btnBulkUnpublish) {
        elements.btnBulkUnpublish.addEventListener('click', () => {
            if (state.selectedIds.size === 0) return;
            openModal('Pausar Productos', `
        <div class="p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-2">¿Pausar ${state.selectedIds.size} productos?</h3>
            <p class="text-gray-500 mb-6">Esta acción marcará todos los productos seleccionados como "Pausado".</p>
            <div class="flex justify-end space-x-3">
                <button onclick="closeModal()" class="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium">Cancelar</button>
                <button onclick="execBulkPublish(false)" class="px-4 py-2 rounded-lg bg-orange-600 text-white hover:bg-orange-700 font-medium shadow-sm">Pausar Todo</button>
            </div>
        </div>
    `);
        });
    }

    // Bulk Publish TN button event
    if (elements.btnBulkPublishTN) {
        elements.btnBulkPublishTN.addEventListener('click', () => {
            if (state.selectedIds.size === 0) return;
            openModal('Publicar en Tienda Nube', `
        <div class="p-6">
            <div class="flex items-center gap-3 mb-4">
                <div class="p-3 rounded-lg bg-blue-100 text-blue-600">
                    <svg class="h-6 w-6" viewBox="0 0 56 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="18" cy="26" r="13" stroke="currentColor" stroke-width="5" fill="none"/>
                        <circle cx="36" cy="18" r="15" stroke="currentColor" stroke-width="5" fill="none"/>
                    </svg>
                </div>
                <div>
                    <h3 class="text-lg font-bold text-gray-900">Publicación Masiva TN</h3>
                    <p class="text-sm text-gray-500">¿Publicar ${state.selectedIds.size} productos seleccionados?</p>
                </div>
            </div>
            <p class="text-gray-500 mb-6 text-sm">Se enviará una solicitud de publicación para todos los productos seleccionados a Tienda Nube.</p>
            <div class="flex justify-end space-x-3">
                <button onclick="closeModal()" class="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium text-sm">Cancelar</button>
                <button onclick="execBulkPublishTN()" class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-bold shadow-md transition-all flex items-center gap-2 text-sm">
                    <i data-lucide="upload-cloud" class="h-4 w-4"></i> Publicar en Tienda Nube
                </button>
            </div>
        </div>
    `);
            if (window.lucide) lucide.createIcons();
        });
    }

    /**
     * Replacement for prompt() with Premium Modal design
     */
    /**
     * Replacement for prompt() with Premium Modal design (Uses Overlay Layer)
     */
    window.showPrompt = function(title, message, onAccept, defaultValue = '') {
        window._modalPromptAction = () => {
            const input = document.getElementById('modalPromptInput');
            if (input) {
                onAccept(input.value);
                closeAlertModal();
            }
        };

        openAlertModal(`
            <div class="p-6">
                <div class="flex items-center gap-3 mb-4">
                    <div class="p-3 rounded-lg text-blue-600 bg-blue-100">
                        <i data-lucide="message-square" class="h-6 w-6"></i>
                    </div>
                    <div>
                        <h3 class="text-lg font-bold text-gray-900">${title}</h3>
                    </div>
                </div>
                <p class="text-gray-600 mb-4 text-sm leading-relaxed">${message}</p>
                <div class="relative mb-6">
                    <input type="text" id="modalPromptInput" value="${defaultValue}" 
                           class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:border-transparent transition-all text-sm outline-none shadow-sm"
                           placeholder="Escribe aquí..."
                           onkeydown="if(event.key === 'Enter') window._modalPromptAction()">
                </div>
                <div class="flex justify-end space-x-3">
                    <button onclick="closeAlertModal()" class="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all">
                        Cancelar
                    </button>
                    <button onclick="window._modalPromptAction()" class="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-md transition-all transform hover:scale-[1.02] active:scale-95">
                        Aceptar
                    </button>
                </div>
            </div>
        `);
        if (window.lucide) lucide.createIcons();
        setTimeout(() => document.getElementById('modalPromptInput')?.focus(), 100);
    };

    window.execBulkPublishTN = async () => {
        try {
            const ids = Array.from(state.selectedIds).map(id => parseInt(id));
            const btn = document.querySelector('button[onclick="execBulkPublishTN()"]');
            
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i data-lucide="loader-2" class="h-4 w-4 animate-spin"></i> Procesando...';
                if (window.lucide) lucide.createIcons();
            }

            const response = await authFetch('/api/products/bulk-publish-tn', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ item_ids: ids })
            });

            if (!response.ok) throw new Error('Error en publicación masiva TN');

            state.selectedIds.clear();
            updateSelectionUI();
            
            // Show success toast or message - REMOVED immediate closeModal to allow reading
            showAlert('Publicación Masiva', `Solicitud enviada para ${ids.length} productos correctamente.`, 'success');
            fetchProducts();
        } catch (e) {
            console.error('Error en publicación masiva TN:', e);
            showAlert('Error', 'Error al procesar la publicación masiva en Tienda Nube', 'error');
        }
    };

    window.execBulkPublish = async (publish) => {
        const newStatus = publish ? 'Publicado' : 'Despublicado';
        try {
            const ids = Array.from(state.selectedIds);

            // Update database for all products
            const apiPromises = ids.map(id =>
                authFetch(`/api/products/${id}/publish`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: newStatus === 'Publicado' ? 'publish' : 'pause' })
                })
            );
            await Promise.all(apiPromises);

            state.selectedIds.clear();
            updateSelectionUI();
            closeModal();
            fetchProducts();
        } catch (e) {
            console.error('Error en publicación masiva:', e);
            showAlert('Error', 'Error al cambiar el estado de los productos seleccionados.', 'error');
        }
    };


    if (elements.filterCategory) {
        elements.filterCategory.addEventListener('change', (e) => {
            state.filters.category = e.target.value;
            state.page = 1;
            fetchProducts();
        });
    }

    if (elements.filterChannel) {
        elements.filterChannel.addEventListener('change', (e) => {
            state.filters.channel_filter = e.target.value;
            state.page = 1;
            fetchProducts();
        });
    }

    if (elements.filterBrand) {
        elements.filterBrand.addEventListener('change', (e) => {
            state.filters.brand = e.target.value;
            state.page = 1;
            fetchProducts();
        });
    }

    if (elements.filterStatus) {
        elements.filterStatus.addEventListener('change', (e) => {
            state.filters.publish_event = e.target.value;
            state.page = 1;
            fetchProducts();
        });
    }

    window.toggleStockFilter = () => {
        const btn = elements.btnToggleStock;
        const label = elements.stockToggleLabel;
        const icon = btn?.querySelector('i');

        if (state.filters.stock_filter === 'with_stock') {
            state.filters.stock_filter = '';
            if (label) label.textContent = 'Ocultar Sin Stock';
            btn?.classList.remove('bg-slate-800', 'text-white', 'border-slate-800');
            btn?.classList.add('bg-white', 'text-gray-700', 'border-gray-300');
            if (icon) icon.classList.replace('text-white', 'text-gray-400');
        } else {
            state.filters.stock_filter = 'with_stock';
            if (label) label.textContent = 'Mostrando con Stock';
            btn?.classList.add('bg-slate-800', 'text-white', 'border-slate-800');
            btn?.classList.remove('bg-white', 'text-gray-700', 'border-gray-300');
            if (icon) icon.classList.replace('text-gray-400', 'text-white');
        }
        
        state.page = 1;
        fetchProducts();
        if (window.lucide) lucide.createIcons();
    };

    if (elements.limitSelector) {
        elements.limitSelector.addEventListener('change', (e) => {
            state.limit = parseInt(e.target.value, 10);
            state.page = 1;
            fetchProducts();
        });
    }

    // Sort column headers
    if (elements.sortHeaders && elements.sortHeaders.length > 0) {
        elements.sortHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const sortField = header.getAttribute('data-sort');
                if (!sortField) return;

                // Toggle sort order if same field, otherwise reset to asc
                if (state.sortBy === sortField) {
                    state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
                } else {
                    state.sortBy = sortField;
                    state.sortOrder = 'asc';
                }

                // Update visual indicators
                updateSortIndicators();

                state.page = 1;
                
                // Dispatch to the correct fetch function based on current view
                if (state.currentView === 'inventory') {
                    fetchProducts();
                } else if (state.currentView === 'mercadolibre') {
                    if (typeof loadMeliProducts === 'function') loadMeliProducts();
                } else if (state.currentView === 'tiendanube') {
                    if (window.tnState) {
                        window.tnState.sortBy = sortField;
                        window.tnState.sortOrder = state.sortOrder;
                    }
                    if (typeof loadTiendaNubeProducts === 'function') loadTiendaNubeProducts();
                }
            });
        });
    }

    function updateSortIndicators() {
        if (!elements.sortHeaders) return;
        elements.sortHeaders.forEach(header => {
            const icon = header.querySelector('[data-lucide]');
            if (!icon) return;

            const sortField = header.getAttribute('data-sort');
            if (sortField === state.sortBy) {
                // Active sort column
                icon.classList.remove('opacity-0');
                icon.classList.add('opacity-100', 'text-blue-600');
                icon.setAttribute('data-lucide', state.sortOrder === 'asc' ? 'arrow-up' : 'arrow-down');
            } else {
                // Inactive sort column
                icon.classList.add('opacity-0');
                icon.classList.remove('opacity-100', 'text-blue-600');
                icon.setAttribute('data-lucide', 'arrow-up-down');
            }
        });
        // Re-render icons
        lucide.createIcons();
    }

    if (elements.btnClearFilters) {
        elements.btnClearFilters.addEventListener('click', () => {
            state.search = '';
            state.filters.category = '';
            state.filters.brand = '';
            state.filters.publish_event = '';
            state.filters.stock_filter = '';
            state.page = 1;
            state.selectedIds.clear();
            updateSelectionUI();

            if (elements.searchInput) elements.searchInput.value = '';
            if (elements.filterCategory) elements.filterCategory.value = '';
            if (elements.filterBrand) elements.filterBrand.value = '';
            
            // Reset stock toggle visual state
            const btn = elements.btnToggleStock;
            const label = elements.stockToggleLabel;
            if (label) label.textContent = 'Ocultar Sin Stock';
            btn?.classList.remove('bg-blue-600', 'text-white', 'border-blue-600');
            btn?.classList.add('bg-white', 'text-gray-700', 'border-gray-300');
            const icon = btn?.querySelector('i');
            if (icon) {
                icon.classList.remove('text-white');
                icon.classList.add('text-gray-400');
            }

            fetchProducts();
        });
    }


    // --- Auth Logic ---
    const loginView = document.getElementById('loginView');
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');

    function checkAuth() {
        const token = localStorage.getItem('token');
        if (!token) {
            loginView.classList.remove('hidden');
        } else {
            loginView.classList.add('hidden');
            fetchProducts();
            fetchUserMe();
        }
    }

    window.logout = () => {
        localStorage.removeItem('token');
        checkAuth();
    };

    // --- Modal Management (Global) ---
    window.openModal = function(title, content) {
        const backdrop = document.getElementById('modalBackdrop');
        const body = document.getElementById('modalBody');
        if (!backdrop || !body) {
            console.error('Modal elements not found');
            return;
        }

        body.innerHTML = content;
        backdrop.classList.remove('hidden');
        
        const contentEl = document.getElementById('modalContent');
        if (contentEl) {
            // Limpiar clases previas
            contentEl.classList.remove('max-w-lg', 'max-w-4xl', 'max-w-5xl', 'max-w-7xl', 'h-[85vh]', 'h-auto');
            
            // Determinar ancho y alto dinámicamente
            const isComplexView = content.includes('max-w-7xl') || 
                                content.includes('max-w-5xl') || 
                                content.includes('is-product-detail') || 
                                content.includes('max-w-4xl');

            if (isComplexView) {
                contentEl.classList.add('h-[85vh]');
                if (content.includes('max-w-7xl')) contentEl.classList.add('max-w-7xl');
                else if (content.includes('max-w-5xl')) contentEl.classList.add('max-w-5xl');
                else contentEl.classList.add('max-w-4xl');
            } else {
                contentEl.classList.add('max-w-lg', 'h-auto');
            }
        }

        setTimeout(() => {
            backdrop.classList.add('opacity-100');
            if (contentEl) contentEl.classList.add('scale-100');
        }, 10);
    };

    window.closeModal = function() {
        const backdrop = document.getElementById('modalBackdrop');
        const content = document.getElementById('modalContent');
        if (!backdrop || !content) return;

        backdrop.classList.remove('opacity-100');
        content.classList.remove('scale-100');
        
        setTimeout(() => {
            backdrop.classList.add('hidden');
            document.getElementById('modalBody').innerHTML = '';
            // Limpiar acciones pendientes de confirmación si existen
            delete window._modalConfirmAction;
        }, 300);
    };

    // --- Alert/Overlay Modal Management (Nested Modals) ---
    window.openAlertModal = function(content) {
        const backdrop = document.getElementById('alertModalBackdrop');
        const body = document.getElementById('alertModalBody');
        if (!backdrop || !body) return;

        body.innerHTML = content;
        backdrop.classList.remove('hidden');
        
        setTimeout(() => {
            backdrop.classList.add('opacity-100');
            document.getElementById('alertModalContent')?.classList.add('scale-100');
        }, 10);
    };

    window.closeAlertModal = function() {
        const backdrop = document.getElementById('alertModalBackdrop');
        const content = document.getElementById('alertModalContent');
        if (!backdrop || !content) return;

        backdrop.classList.remove('opacity-100');
        content.classList.remove('scale-100');
        
        setTimeout(() => {
            backdrop.classList.add('hidden');
            document.getElementById('alertModalBody').innerHTML = '';
        }, 300);
    };

    /**
     * Replacement for alert() with Premium Modal design (Uses Overlay Layer)
     */
    window.showAlert = function(title, message, type = 'info', onAccept = null) {
        const configs = {
            info: { icon: 'info', color: 'text-blue-600 bg-blue-100', btn: 'bg-blue-600 hover:bg-blue-700' },
            success: { icon: 'check-circle', color: 'text-green-600 bg-green-100', btn: 'bg-green-600 hover:bg-green-700' },
            error: { icon: 'alert-circle', color: 'text-red-600 bg-red-100', btn: 'bg-red-600 hover:bg-red-700' },
            warning: { icon: 'alert-triangle', color: 'text-orange-600 bg-orange-100', btn: 'bg-orange-600 hover:bg-orange-700' }
        };
        const config = configs[type] || configs.info;

        window._modalAlertAction = () => {
            closeAlertModal();
            if (onAccept) onAccept();
        };

        openAlertModal(`
            <div class="p-6">
                <div class="flex items-center gap-3 mb-4">
                    <div class="p-3 rounded-lg ${config.color}">
                        <i data-lucide="${config.icon}" class="h-6 w-6"></i>
                    </div>
                    <div>
                        <h3 class="text-lg font-bold text-gray-900">${title}</h3>
                    </div>
                </div>
                <p class="text-gray-600 mb-6 text-sm leading-relaxed">${message}</p>
                <div class="flex justify-end">
                    <button onclick="window._modalAlertAction()" class="px-6 py-2 ${config.btn} text-white rounded-lg text-sm font-bold shadow-md transition-all transform hover:scale-[1.02] active:scale-95">
                        Aceptar
                    </button>
                </div>
            </div>
        `);
        if (window.lucide) lucide.createIcons();
    };

    /**
     * Replacement for confirm() with Premium Modal design (Uses Overlay Layer)
     */
    window.showConfirm = function(title, message, onConfirm, type = 'warning') {
        const configs = {
            warning: { icon: 'alert-triangle', color: 'text-orange-600 bg-orange-100', btn: 'bg-orange-600 hover:bg-orange-700' },
            danger: { icon: 'trash-2', color: 'text-red-600 bg-red-100', btn: 'bg-red-600 hover:bg-red-700' },
            info: { icon: 'help-circle', color: 'text-blue-600 bg-blue-100', btn: 'bg-blue-600 hover:bg-blue-700' }
        };
        const config = configs[type] || configs.warning;

        window._modalConfirmAction = () => {
            onConfirm();
            closeAlertModal();
        };

        openAlertModal(`
            <div class="p-6">
                <div class="flex items-center gap-3 mb-4">
                    <div class="p-3 rounded-lg ${config.color}">
                        <i data-lucide="${config.icon}" class="h-6 w-6"></i>
                    </div>
                    <div>
                        <h3 class="text-lg font-bold text-gray-900">${title}</h3>
                    </div>
                </div>
                <p class="text-gray-600 mb-6 text-sm leading-relaxed">${message}</p>
                <div class="flex justify-end space-x-3">
                    <button onclick="closeAlertModal()" class="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all">
                        Cancelar
                    </button>
                    <button onclick="window._modalConfirmAction()" class="px-6 py-2 ${config.btn} text-white rounded-lg text-sm font-bold shadow-md transition-all transform hover:scale-[1.02] active:scale-95">
                        Confirmar
                    </button>
                </div>
            </div>
        `);
        if (window.lucide) lucide.createIcons();
    };

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;
            const loginBtn = loginForm.querySelector('button[type="submit"]');

            const formData = new URLSearchParams();
            formData.append('username', username);
            formData.append('password', password);

            try {
                loginBtn.disabled = true;
                loginBtn.textContent = 'Ingresando...';

                const response = await fetch('/token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: formData
                });

                if (!response.ok) {
                    throw new Error('Login failed');
                }

                const data = await response.json();
                localStorage.setItem('token', data.access_token);
                loginView.classList.add('hidden');
                loginError.classList.add('hidden');
                loginForm.reset();

                fetchProducts();
                fetchUserMe();

            } catch (error) {
                loginError.classList.remove('hidden');
            } finally {
                loginBtn.disabled = false;
                loginBtn.textContent = 'Ingresar';
            }
        });
    }

    // --- Settings Logic ---
    async function fetchUserMe() {
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            const response = await authFetch('/users/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const user = await response.json();

                const userNameEl = document.getElementById('userName');
                if (userNameEl) userNameEl.textContent = user.username;

                const avatar = document.getElementById('userAvatar');
                if (avatar) avatar.textContent = user.username.charAt(0).toUpperCase();

                // Settings inputs
                const settingsUsername = document.getElementById('settingsUsername');
                if (settingsUsername) settingsUsername.value = user.username;

                // Logo
                if (user.logo_url) {
                    updateAppLogo(user.logo_url);
                    const settingsPreview = document.getElementById('settingsLogoPreview');
                    const settingsPlaceholder = document.getElementById('settingsLogoPlaceholder');
                    if (settingsPreview) {
                        settingsPreview.src = user.logo_url;
                        settingsPreview.classList.remove('hidden');
                    }
                    if (settingsPlaceholder) settingsPlaceholder.classList.add('hidden');
                }
            }
        } catch (error) {
            console.error('Error fetching user:', error);
            if (error.status === 401) logout();
        }
    }

    function updateAppLogo(url) {
        const appLogoIcon = document.getElementById('appLogoIcon');
        if (appLogoIcon) {
            appLogoIcon.innerHTML = `<img src="${url}" class="w-full h-full object-cover">`;
            appLogoIcon.classList.remove('bg-blue-600', 'text-white'); // Remove default style
        }
    }

    const credentialsForm = document.getElementById('credentialsForm');
    if (credentialsForm) {
        credentialsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('settingsUsername').value;
            const currentPassword = document.getElementById('settingsCurrentPassword').value;
            const newPassword = document.getElementById('settingsNewPassword').value;
            const confirmPassword = document.getElementById('settingsConfirmPassword').value;
            const token = localStorage.getItem('token');

            if (!username) return showAlert('Validación', 'El usuario es requerido', 'warning');
            
            if (newPassword && newPassword !== confirmPassword) {
                return showAlert('Validación', 'Las contraseñas no coinciden', 'warning');
            }

            const payload = { username };
            if (currentPassword) payload.current_password = currentPassword; // Matching backend expectations if any
            if (newPassword) payload.password = newPassword;

            try {
                const response = await authFetch('/users/me', {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    showAlert('Éxito', 'Credenciales actualizadas correctamente', 'success');
                    credentialsForm.reset();
                    fetchUserMe();
                } else {
                    const data = await response.json();
                    showAlert('Error', 'Error al actualizar credenciales: ' + (data.detail || 'Error desconocido'), 'error');
                }
            } catch (e) {
                console.error(e);
                showAlert('Error', 'Error de conexión', 'error');
            }
        });
    }

    const settingsLogoInput = document.getElementById('settingsLogoInput');
    if (settingsLogoInput) {
        settingsLogoInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const token = localStorage.getItem('token');
            const formData = new FormData();
            formData.append('file', file);

            try {
                const response = await fetch('/upload-logo', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });

                if (response.ok) {
                    const data = await response.json();
                    updateAppLogo(data.logo_url);
                    fetchUserMe();
                    showAlert('Éxito', 'Logo actualizado correctamente', 'success');
                } else {
                    showAlert('Error', 'Error al subir el logo', 'error');
                }
            } catch (e) {
                console.error(e);
                showAlert('Error', 'Error de conexión con el servidor', 'error');
            }
        });
    }

    checkAuth();



    // --- Theme Logic ---
    const themeToggleBtn = document.getElementById('themeToggle');

    function initTheme() {
        if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark');
            updateThemeIcon(true);
        } else {
            document.documentElement.classList.remove('dark');
            updateThemeIcon(false);
        }
    }

    function toggleTheme() {
        if (document.documentElement.classList.contains('dark')) {
            document.documentElement.classList.remove('dark');
            localStorage.theme = 'light';
            updateThemeIcon(false);
        } else {
            document.documentElement.classList.add('dark');
            localStorage.theme = 'dark';
            updateThemeIcon(true);
        }
        // Update sidebar logo to match new theme
        if (typeof updateSidebarLogo === 'function') {
            setTimeout(updateSidebarLogo, 50);
        }
    }

    function updateThemeIcon(isDark) {
        if (!themeToggleBtn) return;
        themeToggleBtn.innerHTML = isDark
            ? `<i data-lucide="sun" class="h-5 w-5 mr-3"></i> Modo Claro`
            : `<i data-lucide="moon" class="h-5 w-5 mr-3"></i> Modo Oscuro`;
        lucide.createIcons();
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }

    initTheme();

    // --- Logo Management ---

    // Load saved logos from localStorage on page load
    function loadSavedLogos() {
        const lightLogo = localStorage.getItem('logoLight');
        const darkLogo = localStorage.getItem('logoDark');

        const settingsLogoLightPreview = document.getElementById('settingsLogoLightPreview');
        const settingsLogoDarkPreview = document.getElementById('settingsLogoDarkPreview');
        const settingsLogoLightPlaceholder = document.getElementById('settingsLogoLightPlaceholder');
        const settingsLogoDarkPlaceholder = document.getElementById('settingsLogoDarkPlaceholder');

        // Update settings previews
        if (lightLogo) {
            if (settingsLogoLightPreview) {
                settingsLogoLightPreview.src = lightLogo;
                settingsLogoLightPreview.classList.remove('hidden');
            }
            if (settingsLogoLightPlaceholder) {
                settingsLogoLightPlaceholder.classList.add('hidden');
            }
        }

        if (darkLogo) {
            if (settingsLogoDarkPreview) {
                settingsLogoDarkPreview.src = darkLogo;
                settingsLogoDarkPreview.classList.remove('hidden');
            }
            if (settingsLogoDarkPlaceholder) {
                settingsLogoDarkPlaceholder.classList.add('hidden');
            }
        }

        // Update sidebar logo using the centralized function
        updateSidebarLogo();

        console.log('Logos loaded - Light:', !!lightLogo, 'Dark:', !!darkLogo);
    }

    // Update sidebar logo based on current theme
    function updateSidebarLogo() {
        const lightLogo = localStorage.getItem('logoLight');
        const darkLogo = localStorage.getItem('logoDark');

        const sidebarLogoLight = document.getElementById('sidebarLogoLight');
        const sidebarLogoDark = document.getElementById('sidebarLogoDark');
        const defaultLogoArea = document.getElementById('defaultLogoArea');

        const isDarkMode = document.documentElement.classList.contains('dark');

        console.log('updateSidebarLogo called:', {
            lightLogo: !!lightLogo,
            darkLogo: !!darkLogo,
            sidebarLogoLight: !!sidebarLogoLight,
            sidebarLogoDark: !!sidebarLogoDark,
            defaultLogoArea: !!defaultLogoArea,
            isDarkMode
        });

        // Hide all first
        if (sidebarLogoLight) sidebarLogoLight.classList.add('hidden');
        if (sidebarLogoDark) sidebarLogoDark.classList.add('hidden');
        if (defaultLogoArea) defaultLogoArea.classList.remove('hidden');

        if (isDarkMode) {
            if (darkLogo && sidebarLogoDark) {
                sidebarLogoDark.src = darkLogo;
                sidebarLogoDark.classList.remove('hidden');
                if (defaultLogoArea) defaultLogoArea.classList.add('hidden');
                console.log('Showing dark logo');
            } else if (lightLogo && sidebarLogoLight) {
                sidebarLogoLight.src = lightLogo;
                sidebarLogoLight.classList.remove('hidden');
                if (defaultLogoArea) defaultLogoArea.classList.add('hidden');
                console.log('Showing light logo (dark mode fallback)');
            }
        } else {
            if (lightLogo && sidebarLogoLight) {
                sidebarLogoLight.src = lightLogo;
                sidebarLogoLight.classList.remove('hidden');
                if (defaultLogoArea) defaultLogoArea.classList.add('hidden');
                console.log('Showing light logo');
            } else if (darkLogo && sidebarLogoDark) {
                sidebarLogoDark.src = darkLogo;
                sidebarLogoDark.classList.remove('hidden');
                if (defaultLogoArea) defaultLogoArea.classList.add('hidden');
                console.log('Showing dark logo (light mode fallback)');
            }
        }
    }

    // Handle logo file upload
    function handleLogoUpload(inputId, previewId, placeholderId, storageKey) {
        const input = document.getElementById(inputId);
        const preview = document.getElementById(previewId);
        const placeholder = document.getElementById(placeholderId);

        if (!input) return;

        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const dataUrl = event.target.result;

                // Save to localStorage
                localStorage.setItem(storageKey, dataUrl);

                // Update preview
                if (preview) {
                    preview.src = dataUrl;
                    preview.classList.remove('hidden');
                }
                if (placeholder) {
                    placeholder.classList.add('hidden');
                }

                // Update sidebar
                updateSidebarLogo();
            };
            reader.readAsDataURL(file);
        });
    }

    // Initialize logo handlers
    handleLogoUpload('settingsLogoLightInput', 'settingsLogoLightPreview', 'settingsLogoLightPlaceholder', 'logoLight');
    handleLogoUpload('settingsLogoDarkInput', 'settingsLogoDarkPreview', 'settingsLogoDarkPlaceholder', 'logoDark');

    // Load saved logos on page load
    loadSavedLogos();

    // === MercadoLibre View Logic ===
    let meliDebounceTimer = null;


    async function loadMeliProducts() {
        const loading = document.getElementById('meliLoadingOverlay');
        const tableBody = document.getElementById('meliTableBody');
        const emptyState = document.getElementById('meliEmptyState');

        if (!tableBody) return;

        if (loading) loading.classList.remove('hidden');
        if (emptyState) emptyState.classList.add('hidden');

        try {
            const searchInput = document.getElementById('meliSearchInput');
            const statusFilter = document.getElementById('meliStatusFilter');

            let params = new URLSearchParams();
            if (searchInput && searchInput.value.trim()) params.append('q', searchInput.value.trim());
            if (statusFilter && statusFilter.value) params.append('status', statusFilter.value);
            
            // Add sorting
            if (state.sortBy) params.append('sort_by', state.sortBy);
            if (state.sortOrder) params.append('sort_order', state.sortOrder);

            // Add pagination params
            const skip = (state.meliPage - 1) * state.meliLimit;
            params.append('skip', skip);
            params.append('limit', state.meliLimit);

            const response = await authFetch(`/api/products/meli?${params.toString()}`);
            if (!response.ok) throw new Error('Error loading ML products');

            const data = await response.json();
            const products = data.products || [];
            state.meliTotal = data.total || 0;

            // Update counters
            const activeCount = document.getElementById('meliActiveCount');
            const pausedCount = document.getElementById('meliPausedCount');
            const totalCount = document.getElementById('meliTotalCount');

            if (activeCount) activeCount.textContent = data.active_count || 0;
            if (pausedCount) pausedCount.textContent = data.paused_count || 0;
            if (totalCount) totalCount.textContent = data.total || 0;

            // Update pagination UI
            const startIdx = products.length > 0 ? (state.meliPage - 1) * state.meliLimit + 1 : 0;
            const endIdx = startIdx + products.length - 1;

            if (elements.meliTotalPagination) elements.meliTotalPagination.textContent = state.meliTotal;
            if (elements.meliPageStart) elements.meliPageStart.textContent = startIdx;
            if (elements.meliPageEnd) elements.meliPageEnd.textContent = endIdx;

            if (elements.btnMeliPrev) elements.btnMeliPrev.disabled = state.meliPage === 1;
            if (elements.btnMeliNext) elements.btnMeliNext.disabled = products.length < state.meliLimit || endIdx >= state.meliTotal;

            // Render table
            if (products.length === 0) {
                tableBody.innerHTML = '';
                if (emptyState) emptyState.classList.remove('hidden');
            } else {
                tableBody.innerHTML = products.map(p => {
                    const statusClass = getMLStatusClass(p.status);
                    const statusLabel = getMLStatusLabel(p.status);
                    const price = p.price ? `$ ${Number(p.price).toLocaleString('es-AR')}` : '-';
                    const stockBadge = getStockBadge(p.stock);
                    const imgSrc = p.product_image_b_format_url || '';
                    const imgHtml = imgSrc
                        ? `<img src="${imgSrc}" alt="" class="w-10 h-10 rounded-lg object-cover border border-gray-200 dark:border-gray-600 flex-shrink-0" onerror="this.style.display='none'">`
                        : `<div class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0"><svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg></div>`;

                    const permalink = p.permalink;
                    const linkHtml = permalink
                        ? `<a href="${permalink}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-600 hover:text-white transition-all text-xs font-bold shadow-sm" title="Abrir en MercadoLibre">
                            Ir a ML <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                           </a>`
                        : `<span class="text-gray-400 text-xs italic">Sin link</span>`;

                    return `<tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer" onclick="openProductDetail(${p.id})">
                        <td class="px-4 py-3 text-center w-10" onclick="event.stopPropagation()">
                            <input type="checkbox" value="${p.id}" class="meli-checkbox w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" onchange="updateMeliSelectionCount()">
                        </td>
                        <td class="px-4 py-3">
                            <div class="flex items-center gap-3">
                                ${imgHtml}
                                <div class="min-w-0">
                                    <p class="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[250px]">${p.product_name || 'Sin nombre'}</p>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">${p.product_code || ''} · ${p.brand || ''}</p>
                                </div>
                            </div>
                        </td>
                        <td class="px-4 py-3">
                            <span class="text-sm font-mono text-gray-600 dark:text-gray-400">${p.meli_id || '-'}</span>
                        </td>
                        <td class="px-4 py-3">
                            <span class="${statusClass}">${statusLabel}</span>
                        </td>
                        <td class="px-4 py-3 text-right">
                            <span class="text-sm font-semibold text-gray-900 dark:text-white">${price}</span>
                        </td>
                        <td class="px-4 py-3 text-center">${stockBadge}</td>
                        <td class="px-4 py-3 text-center">
                            ${p.meli_id ? `
                                <div id="score-cell-${p.meli_id}" class="flex flex-col items-center gap-1">
                                    <button onclick="event.stopPropagation(); window.openPerformanceModal('${p.meli_id}', '${p.product_name.replace(/'/g, "\\'")}')" 
                                        class="px-2.5 py-1.5 rounded-lg text-[10px] font-black bg-gray-900 text-white hover:bg-blue-600 transition-all shadow-md flex items-center gap-1.5">
                                        <i data-lucide="target" class="h-3.5 w-3.5"></i> AUDITORÍA
                                    </button>
                                </div>
                            ` : '-'}
                        </td>
                        <td class="px-4 py-3 text-center" onclick="event.stopPropagation()">
                            <div class="flex items-center justify-center gap-2">
                                ${linkHtml}
                                <button onclick="deleteMeliProduct(${p.id}, this)" 
                                    class="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors" 
                                    title="Eliminar de MercadoLibre">
                                    <i data-lucide="trash-2" class="h-4 w-4"></i>
                                </button>
                            </div>
                        </td>
                    </tr>`;
                }).join('');

                // After rendering rows, fetch scores in bulk
                const meliIds = products.map(p => p.meli_id).filter(id => id && id.startsWith('MLA')).join(',');
                if (meliIds) {
                    fetchMeliScoresBulk(meliIds);
                }
                
                // Clear any previous selection when reloading products
                const selectAllCb = document.getElementById('selectAllMeli');
                if (selectAllCb) selectAllCb.checked = false;
                if (window.updateMeliSelectionCount) window.updateMeliSelectionCount();
                
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        } catch (e) {
            console.error('Error loading MercadoLibre products:', e);
            tableBody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">Error al cargar productos de MercadoLibre</td></tr>`;
        } finally {
            if (loading) loading.classList.add('hidden');
        }
    }

    function getMLStatusClass(status) {
        const s = (status || '').toLowerCase();
        if (s === 'active') return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400';
        if (s === 'paused') return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400';
        if (s === 'closed') return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400';
        if (s === 'under_review') return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400';
        return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
    }

    function getMLStatusLabel(status) {
        const s = (status || '').toLowerCase();
        const dot = '<span class="w-1.5 h-1.5 rounded-full"></span>';
        if (s === 'active') return `<span class="w-1.5 h-1.5 rounded-full bg-green-500"></span> Activo`;
        if (s === 'paused') return `<span class="w-1.5 h-1.5 rounded-full bg-orange-500"></span> Pausado`;
        if (s === 'closed') return `<span class="w-1.5 h-1.5 rounded-full bg-red-500"></span> Cerrado`;
        if (s === 'under_review') return `<span class="w-1.5 h-1.5 rounded-full bg-yellow-500"></span> En revisión`;
        return `<span class="w-1.5 h-1.5 rounded-full bg-gray-400"></span> ${status || 'Desconocido'}`;
    }

    function getStockBadge(stock) {
        if (stock === null || stock === undefined) return '<span class="text-gray-400 text-sm">-</span>';
        if (stock === 0) return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">Sin stock</span>';
        if (stock <= 3) return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400">${stock}</span>`;
        return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">${stock}</span>`;
    }

    // MercadoLibre Bulk Actions
    window.toggleAllMeli = function(checkbox) {
        const checkboxes = document.querySelectorAll('.meli-checkbox');
        checkboxes.forEach(cb => cb.checked = checkbox.checked);
        window.updateMeliSelectionCount();
    };

    window.updateMeliSelectionCount = function() {
        const checked = document.querySelectorAll('.meli-checkbox:checked');
        const btn = document.getElementById('btnBulkPublishMeliToTN');
        const countSpan = document.getElementById('meliSelectedCount');
        
        if (countSpan) countSpan.textContent = checked.length;
        
        if (btn) {
            if (checked.length > 0) {
                btn.classList.remove('hidden');
            } else {
                btn.classList.add('hidden');
            }
        }
        
        // Update select all checkbox state
        const selectAllCb = document.getElementById('selectAllMeli');
        const allCheckboxes = document.querySelectorAll('.meli-checkbox');
        if (selectAllCb && allCheckboxes.length > 0) {
            selectAllCb.checked = checked.length === allCheckboxes.length;
        }
    };

    window.bulkPublishMeliToTN = async function() {
        const checked = document.querySelectorAll('.meli-checkbox:checked');
        if (checked.length === 0) return;
        
        const ids = Array.from(checked).map(cb => parseInt(cb.value));
        
        showConfirm('Publicar en Tienda Nube', `¿Estás seguro que deseas solicitar la publicación de ${ids.length} producto(s) en Tienda Nube?`, async () => {
            const btn = document.getElementById('btnBulkPublishMeliToTN');
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Publicando...';
            btn.disabled = true;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            
            let successCount = 0;
            let errorCount = 0;
            
            for (const id of ids) {
                try {
                    const response = await authFetch(`/api/products/${id}/publish`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'publish', site: 'tienda-nube' })
                    });
                    
                    if (response.ok) {
                        successCount++;
                    } else {
                        errorCount++;
                    }
                } catch (e) {
                    errorCount++;
                }
            }
            
            btn.innerHTML = originalHTML;
            btn.disabled = false;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            
            // Clear selection
            const selectAllCb = document.getElementById('selectAllMeli');
            if (selectAllCb) selectAllCb.checked = false;
            const checkboxes = document.querySelectorAll('.meli-checkbox');
            checkboxes.forEach(cb => cb.checked = false);
            window.updateMeliSelectionCount();
            
            showAlert('Resultado de Publicación', `Se enviaron exitosamente ${successCount} solicitudes. ${errorCount > 0 ? `Fallaron ${errorCount}.` : ''}`, successCount > 0 ? 'success' : 'warning');
            
        }, 'info');
    };

    // MercadoLibre event listeners
    const meliSearchInput = document.getElementById('meliSearchInput');
    const meliStatusFilter = document.getElementById('meliStatusFilter');

    if (meliSearchInput) {
        meliSearchInput.addEventListener('input', () => {
            clearTimeout(meliDebounceTimer);
            state.meliPage = 1; // Reset to page 1
            meliDebounceTimer = setTimeout(loadMeliProducts, 300);
        });
    }

    if (meliStatusFilter) {
        meliStatusFilter.addEventListener('change', () => {
            state.meliPage = 1; // Reset to page 1
            loadMeliProducts();
        });
    }

    if (elements.btnMeliPrev) {
        elements.btnMeliPrev.addEventListener('click', () => {
            if (state.meliPage > 1) {
                state.meliPage--;
                loadMeliProducts();
            }
        });
    }

    if (elements.btnMeliNext) {
        elements.btnMeliNext.addEventListener('click', () => {
            const startIdx = (state.meliPage - 1) * state.meliLimit + 1;
            const endIdx = startIdx + state.meliLimit - 1;
            if (endIdx < state.meliTotal) {
                state.meliPage++;
                loadMeliProducts();
            }
        });
    }

    if (elements.meliLimitSelector) {
        elements.meliLimitSelector.addEventListener('change', (e) => {
            state.meliLimit = parseInt(e.target.value) || 100;
            state.meliPage = 1;
            loadMeliProducts();
        });
    }

    async function fetchMeliScoresBulk(meliIds) {
        try {
            const response = await authFetch(`/api/performance/scores/bulk?meli_ids=${meliIds}`);
            if (!response.ok) return;
            const scores = await response.json();
            
            scores.forEach(s => {
                const cell = document.getElementById(`score-cell-${s.meli_id}`);
                if (cell) {
                    const color = s.overall_score >= 90 ? 'text-green-600' : (s.overall_score >= 70 ? 'text-blue-600' : 'text-orange-600');
                    const bgColor = s.overall_score >= 90 ? 'bg-green-50/50' : (s.overall_score >= 70 ? 'bg-blue-50/50' : 'bg-orange-50/50');
                    
                    const scoreHtml = `
                        <span class="text-sm font-black ${color}">${s.overall_score}%</span>
                        <button onclick="event.stopPropagation(); window.openPerformanceModal('${s.meli_id}', '')" 
                            class="px-2 py-0.5 rounded-[4px] text-[9px] font-bold bg-white text-gray-400 hover:bg-blue-600 hover:text-white transition-all border border-gray-100 shadow-sm leading-none flex items-center gap-1">
                            AUDITORÍA
                        </button>
                    `;
                    cell.innerHTML = scoreHtml;
                    cell.closest('td').classList.add(bgColor);
                }
            });
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } catch(e) {
            console.error("Error bulk fetching scores", e);
        }
    }

    window.openPerformanceModal = async (meliId, productName) => {
        setLoading(true);
        try {
            const response = await authFetch(`/api/performance/${meliId}`);
            if (!response.ok) throw new Error('Error al cargar datos de performance');
            
            const data = await response.json();
            
            let summary = data.summary;
            let rows = data.rows || [];
            
            if (!summary && rows.length === 0) {
                showAlert('Sin Datos', 'No se encontraron datos de performance para esta publicación. Recuerda que solo funciona para productos activos.', 'info');
                setLoading(false);
                return;
            }

            const getScoreColor = (score) => {
                if (score >= 90) return 'text-green-600 bg-green-50 border-green-200';
                if (score >= 70) return 'text-blue-600 bg-blue-50 border-blue-200';
                if (score >= 40) return 'text-orange-600 bg-orange-50 border-orange-200';
                return 'text-red-600 bg-red-50 border-red-200';
            };

            const html = `
                <div class="p-6 relative">
                    <button onclick="closeModal()" class="absolute top-6 right-6 p-2 text-gray-400 hover:text-gray-600 transition-colors hover:bg-gray-100 rounded-full z-20" title="Cerrar">
                        <i data-lucide="x" class="h-6 w-6"></i>
                    </button>
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 border-b border-gray-100 pb-6">
                        <div>
                            <h2 class="text-xl font-bold text-gray-900">${productName || 'Auditoría de Calidad'}</h2>
                            <p class="text-sm text-gray-500 font-mono mt-1">${meliId}</p>
                        </div>
                        <div class="flex items-center gap-4">
                            <div class="text-center px-4 py-2 rounded-xl border ${getScoreColor(summary?.overall_score || 0)}">
                                <p class="text-[10px] uppercase font-bold tracking-wider opacity-70">Calidad Total</p>
                                <p class="text-2xl font-black">${summary?.overall_score || 0}%</p>
                            </div>
                            <div class="text-left">
                                <p class="text-sm font-bold text-gray-900">${summary?.level_wording || '-'}</p>
                                <p class="text-xs text-gray-500 uppercase">${summary?.quality_level || '-'}</p>
                            </div>
                        </div>
                    </div>

                    <div class="overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm">
                        <div class="max-h-[60vh] overflow-y-auto">
                            <table class="min-w-full divide-y divide-gray-200">
                                <thead class="bg-gray-50 sticky top-0">
                                    <tr>
                                        <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Sección</th>
                                        <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Estado</th>
                                        <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Sugerencia de Mejora</th>
                                        <th class="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Acción</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-200">
                                    ${rows.map(row => `
                                        <tr class="hover:bg-gray-50 transition-colors">
                                            <td class="px-4 py-4 whitespace-nowrap">
                                                <div class="text-sm font-bold text-gray-900">${row.bucket_title}</div>
                                                <div class="text-[10px] text-gray-400 uppercase tracking-tighter">${row.rule_mode || ''}</div>
                                            </td>
                                            <td class="px-4 py-4 whitespace-nowrap">
                                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase border ${
                                                    row.rule_status === 'PENDING' 
                                                    ? 'bg-amber-100 text-amber-700 border-amber-200' 
                                                    : 'bg-green-100 text-green-700 border-green-200'
                                                }">
                                                    ${row.rule_status === 'PENDING' ? 'Pendiente' : 'Completado'}
                                                </span>
                                            </td>
                                            <td class="px-4 py-4">
                                                <p class="text-sm text-gray-700 leading-tight">${row.wording_title}</p>
                                            </td>
                                            <td class="px-4 py-4 whitespace-nowrap text-right">
                                                ${row.wording_link ? `
                                                    <a href="${row.wording_link}" target="_blank" 
                                                       class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all shadow-sm">
                                                        Corregir <i data-lucide="external-link" class="h-3 w-3"></i>
                                                    </a>
                                                ` : '-'}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;

            // Adjust modal width
            const modalContent = document.getElementById('modalContent');
            if (modalContent) {
                modalContent.classList.remove('max-w-lg', 'max-w-4xl');
                modalContent.classList.add('max-w-5xl');
            }

            // Save original close function to reset width
            const originalClose = window.closeModal;
            window.closeModal = () => {
                const mc = document.getElementById('modalContent');
                if (mc) {
                    mc.classList.remove('max-w-5xl');
                    mc.classList.add('max-w-lg');
                }
                originalClose();
                window.closeModal = originalClose;
            };

            openModal('', html);
            if (typeof lucide !== 'undefined') lucide.createIcons();

        } catch (e) {
            console.error('Error opening performance modal:', e);
            showAlert('Error', e.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    // === End MercadoLibre ===

    // === Competence View Logic ===
    let compDebounceTimer = null;

    async function loadCompetenceData() {
        const loading = document.getElementById('compLoadingOverlay');
        const tableBody = document.getElementById('compTableBody');
        const emptyState = document.getElementById('compEmptyState');

        if (!tableBody) return;

        if (loading) loading.classList.remove('hidden');
        if (emptyState) emptyState.classList.add('hidden');

        try {
            const searchInput = document.getElementById('compSearchInput');
            const statusFilter = document.getElementById('compStatusFilter');

            let params = new URLSearchParams();
            if (searchInput && searchInput.value.trim()) params.append('q', searchInput.value.trim());
            if (statusFilter && statusFilter.value) params.append('status', statusFilter.value);

            const response = await authFetch(`/api/competence?${params.toString()}`);
            if (!response.ok) throw new Error('Error loading competence data');

            const data = await response.json();
            const items = data.items || [];

            // Update counters
            const pendingEl = document.getElementById('compPendingCount');
            const completedEl = document.getElementById('compCompletedCount');
            const errorEl = document.getElementById('compErrorCount');
            const totalEl = document.getElementById('compTotalCount');
            const showingEl = document.getElementById('compShowing');

            if (pendingEl) pendingEl.textContent = data.pending_count || 0;
            if (completedEl) completedEl.textContent = data.completed_count || 0;
            if (errorEl) errorEl.textContent = data.error_count || 0;
            if (totalEl) totalEl.textContent = data.total || 0;
            if (showingEl) showingEl.textContent = items.length;

            if (items.length === 0) {
                tableBody.innerHTML = '';
                if (emptyState) emptyState.classList.remove('hidden');
            } else {
                tableBody.innerHTML = items.map(item => {
                    // Financial Calculations for the list view
                    const sellPrice = Number(item.selling_price || item.internal_price || 0);
                    const prodCost = Number(item.product_cost || 0);
                    // Use automated Meli cost from JOIN if manual ones are missing
                    const costMeli = Number(item.auto_meli_cost || (Number(item.ml_commision || 0) + Number(item.shipping_cost || 0)));
                    
                    const totalExtras = Number(item.packaging_cost || 0) + 
                                       Number(item.financial_cost || 0) + 
                                       Number(item.returns_cost || 0);
                    
                    const totalCost = prodCost + costMeli + totalExtras;
                    const profit = sellPrice > 0 ? (sellPrice - totalCost) : 0;
                    const margin = sellPrice > 0 ? (profit / sellPrice) * 100 : 0;

                    const price = item.price ? `$ ${Number(item.price).toLocaleString('es-AR')}` : '-';
                    const imgHtml = item.image
                         ? `<img src="${item.image}" alt="" class="w-10 h-10 rounded-lg object-cover border border-gray-200 dark:border-gray-600" onerror="this.style.display='none'">`
                         : `<div class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center"><svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg></div>`;

                    const statusBadge = getCompStatusBadge(item.status);

                    const linkHtml = item.catalog_link
                        ? `<a href="${item.catalog_link}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors text-xs font-medium">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                            Ver
                           </a>`
                        : `<span class="text-gray-400 text-xs">-</span>`;
                    
                    const prodCode = item.product_code ? `<br><span class="text-xs text-gray-400">Cod: ${item.product_code}</span>` : '';

                    return `<tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-b border-gray-100 dark:border-gray-800">
                        <!-- COMPETENCIA (Scrapped) -->
                        <td class="px-4 py-3 border-r border-gray-100 dark:border-gray-800">${imgHtml}</td>
                        <td class="px-4 py-3 border-r border-gray-100 dark:border-gray-800 bg-purple-50/5 dark:bg-purple-900/5">
                            <span class="text-sm text-gray-700 dark:text-gray-300 font-medium">${item.competitor || '-'}</span>
                        </td>
                        <td class="px-4 py-3 border-r border-gray-100 dark:border-gray-800 bg-purple-50/5 dark:bg-purple-900/5">
                            <p class="text-sm text-gray-600 dark:text-gray-400 truncate max-w-[200px]" title="${item.title || ''}">${item.title || 'Pendiente...'}</p>
                        </td>
                        <td class="px-4 py-3 text-center border-r border-gray-100 dark:border-gray-800 bg-purple-50/5 dark:bg-purple-900/5">${linkHtml}</td>
                        <td class="px-4 py-3 text-right border-r border-gray-200 dark:border-gray-700 bg-purple-50/10 dark:bg-purple-900/10">
                            <span class="text-sm font-bold text-purple-600 dark:text-purple-400">${price}</span>
                        </td>

                        <!-- PRODUCTO INTERNO (ImportFull) -->
                        <td class="px-4 py-3 text-xs font-mono text-gray-500 border-r border-gray-100 dark:border-gray-800">${item.meli_id || '-'}</td>
                        <td class="px-4 py-3 border-r border-gray-100 dark:border-gray-800">
                            <div class="min-w-0">
                                <p class="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[200px]" title="${item.product_name || '-'}">${item.product_name || 'Sin nombre DB'}</p>
                                ${prodCode}
                            </div>
                        </td>
                        <td class="px-4 py-3 text-right border-r border-gray-200 dark:border-gray-700 bg-blue-50/5 dark:bg-blue-900/5">
                            <span class="text-sm font-bold text-blue-600 dark:text-blue-400">${item.selling_price ? '$ ' + Number(item.selling_price).toLocaleString('es-AR') : (item.internal_price ? '$ ' + Number(item.internal_price).toLocaleString('es-AR') : '-')}</span>
                        </td>

                        <!-- RESULTADOS FINANCIEROS -->
                        <td class="px-4 py-3 text-right border-r border-gray-100 dark:border-gray-800">
                            <span class="text-sm text-gray-600 dark:text-gray-400">${prodCost > 0 ? '$ ' + Number(prodCost).toLocaleString('es-AR') : '-'}</span>
                        </td>
                        <td class="px-4 py-3 text-right border-r border-gray-100 dark:border-gray-800 bg-red-50/5 dark:bg-red-900/5">
                            <span class="text-sm font-medium text-red-600 dark:text-red-400">${costMeli > 0 ? '$ ' + Number(costMeli).toLocaleString('es-AR') : '-'}</span>
                        </td>
                        <td class="px-4 py-3 text-right border-r border-gray-100 dark:border-gray-800 bg-green-50/5 dark:bg-green-900/5">
                            <span class="text-sm font-bold text-green-600 dark:text-green-400">${(sellPrice > 0 && totalCost > 0) ? '$ ' + Number(profit).toLocaleString('es-AR') : '-'}</span>
                        </td>
                        <td class="px-4 py-3 text-center border-r border-gray-200 dark:border-gray-700">
                            <span class="text-xs font-medium text-gray-600 dark:text-gray-400">${(sellPrice > 0 && totalCost > 0) ? margin.toFixed(1) + '%' : '-'}</span>
                        </td>

                        <!-- Acciones -->
                        <td class="px-4 py-3 text-center">
                            <div class="flex items-center justify-center gap-1">
                                <button onclick="openCompetenceModal(this.dataset.code)" data-code="${item.product_code}" class="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Configurar Costos">
                                    <i data-lucide="calculator" class="h-4 w-4"></i>
                                </button>
                                <button onclick="deleteCompetenceItem(this.dataset.code)" data-code="${item.product_code}" class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Eliminar">
                                    <i data-lucide="trash-2" class="h-4 w-4"></i>
                                </button>
                            </div>
                        </td>
                    </tr>`;
                }).join('');
                lucide.createIcons();
            }
        } catch (e) {
            console.error('Error loading competence data:', e);
            tableBody.innerHTML = `<tr><td colspan="8" class="px-4 py-8 text-center text-gray-500">Error al cargar datos de competencia: ${e.message}</td></tr>`;
        } finally {
            if (loading) loading.classList.add('hidden');
        }
    }

    window.fixDatabaseSchema = async function () {
        if (!confirm('Esto agregará las columnas faltantes a la tabla de competencia. ¿Continuar?')) return;

        try {
            const btn = document.querySelector('button[onclick="fixDatabaseSchema()"]');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> Reparando...';
            }

            const response = await authFetch('/api/competence/fix-db-schema');
            const result = await response.json();

            if (!response.ok) throw new Error(result.detail || 'Error desconocido');

            showAlert('Sincronización Finalizada', 'Base de datos sincronizada correctamente.', 'success');
            loadCompetenceData(); // Reload data
        } catch (e) {
            showAlert('Error al Reparar', e.message, 'error');
            console.error(e);
        } finally {
            const btn = document.querySelector('button[onclick="fixDatabaseSchema()"]');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="wrench" class="h-4 w-4"></i> Reparar Tabla Competencia';
                lucide.createIcons();
            }
        }
    };


    function getCompStatusBadge(status) {
        const s = (status || '').toLowerCase();
        if (s === 'completed') return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"><span class="w-1.5 h-1.5 rounded-full bg-green-500"></span> Completado</span>`;
        if (s === 'error') return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"><span class="w-1.5 h-1.5 rounded-full bg-red-500"></span> Error</span>`;
        if (s === 'processing') return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"><span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Procesando</span>`;
        return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Pendiente</span>`;
    }

    window.addCompetenceUrl = async function () {
        const urlInput = document.getElementById('compNewUrl');
        const btn = document.getElementById('btnAddCompUrl');
        if (!urlInput || !urlInput.value.trim()) {
            showAlert('Validación', 'Ingresa una URL válida de MercadoLibre', 'warning');
            return;
        }

        const url = urlInput.value.trim();
        btn.disabled = true;
        btn.innerHTML = '<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> Agregando...';

        try {
            const response = await authFetch('/api/competence', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ catalog_link: url })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Error al agregar');
            }

            urlInput.value = '';
            loadCompetenceData();
        } catch (e) {
            console.error('Error adding competence URL:', e);

            // Show detailed error first
            let msg = 'Error: ' + e.message;
            if (e.message.includes('denied')) msg += '\n\nParece un problema de PERMISOS.';
            if (e.message.includes('default value')) msg += '\n\nFaltan datos obligatorios en la tabla.';

            showAlert('Error', msg, 'error');

            // Offer diagnostics if relevant
            if (e.message.includes('denied') || e.message.includes('OperationalError')) {
                showConfirm('Diagnóstico', '¿Quieres ver los permisos actuales de la base de datos para diagnosticar?', () => {
                    checkPermissions();
                }, 'info');
            }
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="plus" class="h-4 w-4"></i> Agregar';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    };

    window.checkPermissions = async function () {
        try {
            const response = await authFetch('/api/competence/debug-permissions');
            const data = await response.json();
            showAlert('DIAGNÓSTICO DE PERMISOS', JSON.stringify(data, null, 2), 'info');
        } catch (err) {
            showAlert('Error de Diagnóstico', err.message, 'error');
        }
    };

    window.deleteCompetenceItem = async function (code) {
        if (!code) return;
        showConfirm('Confirmar Eliminación', '¿Eliminar este registro de competencia?', async () => {
            try {
                const encodedCode = encodeURIComponent(code);
                const response = await authFetch(`/api/competence?code=${encodedCode}`, {
                    method: 'DELETE'
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.detail || `Error ${response.status}: Ruta no encontrada o prohibida`);
                }
                loadCompetenceData();
            } catch (e) {
                console.error('Error deleting competence item:', e);
                showAlert('Error', 'Error al eliminar: ' + e.message, 'error');
            }
        }, 'danger');
    };

    window.openCompetenceModal = async function (code) {
        setLoading(true);
        try {
            const response = await authFetch(`/api/competence/item?code=${encodeURIComponent(code)}`);
            if (!response.ok) throw new Error('No se pudo obtener la información de competencia');
            const item = await response.json();

            let autoCost = null;
            try {
                const autoRes = await authFetch(`/api/selling/by-code/${encodeURIComponent(code)}`);
                if (autoRes.ok) {
                    autoCost = await autoRes.json();
                }
            } catch (e) {
                console.log("No auto selling cost found.");
            }

            // Expose globally for dynamic calculations
            window._currentAutoCost = autoCost;

            const html = `
            <div class="flex flex-col h-full max-h-[90vh]">
                <!-- Header -->
                <div class="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
                    <div class="flex items-center gap-4">
                        <div class="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                            <i data-lucide="calculator" class="h-6 w-6 text-blue-600 dark:text-blue-400"></i>
                        </div>
                        <div>
                            <h2 class="text-xl font-bold text-gray-900 dark:text-white">Calculadora de Costos y Márgenes</h2>
                            <p class="text-sm text-gray-500 dark:text-gray-400">${item.title || item.product_name || 'Sin título'}</p>
                        </div>
                    </div>
                    <button onclick="closeModal()" class="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors">
                        <i data-lucide="x" class="h-6 w-6 text-gray-500"></i>
                    </button>
                </div>

                <!-- Content -->
                <div class="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
                    
                    <!-- Section: Base & Sales -->
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-4 gap-x-8">
                        <!-- Selling Price (Calculated / Editable) -->
                        <div class="space-y-2">
                            <label class="text-[11px] font-bold text-gray-500 uppercase flex justify-between tracking-tight">Precio de Venta <span class="text-[9px] text-blue-500 font-semibold normal-case">Tu Precio</span></label>
                            <div class="relative">
                                <input type="number" id="comp_selling_price" value="${item.selling_price || ''}" oninput="calculateCompetenceCosts()"
                                    class="w-full pl-8 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-sm dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 transition-all font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none">
                                <i data-lucide="dollar-sign" class="absolute left-3 top-2.5 h-4 w-4 text-gray-400"></i>
                            </div>
                        </div>

                        <!-- Product Cost (Editable) -->
                        <div class="space-y-2">
                            <label class="text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-tight">Costo del Producto</label>
                            <div class="relative">
                                <input type="number" id="comp_product_cost" value="${item.product_cost || ''}" readonly
                                    class="w-full pl-8 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-gray-50 dark:bg-gray-800 text-gray-500 cursor-not-allowed transition-all font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none">
                                <i data-lucide="package" class="absolute left-3 top-2.5 h-4 w-4 text-gray-400"></i>
                            </div>
                        </div>

                         <!-- Listing Type -->
                        <div class="space-y-2">
                            <label class="text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-tight">Tipo de Publicación</label>
                            <select id="comp_listing_type" onchange="calculateCompetenceCosts()" class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-sm dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 transition-all font-semibold">
                                <option value="Clásica" ${item.listing_type === 'Clásica' ? 'selected' : ''}>Clásica</option>
                                <option value="Premium" ${item.listing_type === 'Premium' ? 'selected' : ''}>Premium</option>
                            </select>
                        </div>
                    </div>

                    <!-- Section: Costos Extras -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 pt-3 border-t border-gray-100 dark:border-gray-700">
                         <!-- Returns % -->
                        <div class="space-y-1.5">
                            <label class="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">% Devoluciones Estimado</label>
                            <div class="relative">
                                <input type="number" id="comp_estimated_returns_percentage" step="0.01" value="${item.estimated_returns_percentage != null ? (Number(item.estimated_returns_percentage) * 100).toString().substring(0, 5) : ''}" oninput="calculateCompetenceCosts()"
                                    class="w-full pl-8 pr-4 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700">
                                <i data-lucide="percent" class="absolute left-2.5 top-2 h-4 w-4 text-gray-400"></i>
                            </div>
                        </div>

                        <!-- Packaging -->
                        <div class="space-y-1.5">
                            <label class="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">Packaging</label>
                            <input type="number" id="comp_packaging_cost" value="${item.packaging_cost || ''}" oninput="calculateCompetenceCosts()" class="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700">
                        </div>

                        <!-- Costo Financiero -->
                        <div class="space-y-1.5">
                            <label class="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">Costo Financiero</label>
                            <input type="number" id="comp_financial_cost" value="${item.financial_cost || ''}" oninput="calculateCompetenceCosts()" class="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700">
                        </div>
                    </div>

                    <!-- Meli Auto Calculation -->
                    <div class="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-5 border border-blue-100 dark:border-blue-800">
                        <div class="flex justify-between items-center mb-3">
                            <h3 class="text-lg font-bold text-blue-900 dark:text-blue-100 flex items-center gap-2">
                                <i data-lucide="zap" class="h-5 w-5 text-blue-600"></i>
                                Costo Automático MercadoLibre
                            </h3>
                            <button type="button" onclick="window.triggerAutoSellingCalc('${item.product_code}')" class="px-4 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm font-semibold transition-colors">
                                Recalcular desde Meli
                            </button>
                        </div>
                        ${autoCost ? `
                        <div class="mb-3 bg-white/50 dark:bg-black/20 rounded-xl p-4 flex justify-between items-center border border-blue-100 dark:border-blue-800 shadow-sm">
                            <div>
                                <p class="text-[10px] uppercase font-bold text-blue-500 tracking-wider">Costo Total Meli</p>
                                <p class="text-2xl md:text-3xl font-black text-blue-700 dark:text-blue-400">${formatCurrency(autoCost.total_selling_cost)}</p>
                            </div>
                            <div class="text-right">
                                <p class="text-[10px] uppercase font-bold text-blue-800 dark:text-blue-300 tracking-wider">Comisión Total</p>
                                <p class="text-lg md:text-xl font-bold text-gray-900 dark:text-gray-100">${autoCost.percentage_fee ? autoCost.percentage_fee + '%' : '-'}</p>
                            </div>
                        </div>

                        <details class="text-xs text-gray-700 dark:text-gray-300">
                            <summary class="font-bold text-blue-600 dark:text-blue-400 cursor-pointer hover:underline mb-2 transition-colors">
                                Desplegar Detalles (Conceptos en Español)
                            </summary>
                            <div class="p-4 bg-white/60 dark:bg-gray-800/60 rounded-xl border border-blue-50 dark:border-gray-700 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                                ${Object.entries(autoCost).map(([k, v]) => {
                                    const meliDict = {
                                        'item_id': 'ID de Ítem (Bitcram)',
                                        'category_id': 'ID Categoría (Meli)',
                                        'sale_fee_amount': 'Costo por unidad vendida',
                                        'fixed_fee': 'Costo fijo por unidad',
                                        'financing_add_on_fee': '% Costo por cuotas',
                                        'meli_percentage_fee': '% Venta (aplica a MLA)',
                                        'percentage_fee': '% Comisión total',
                                        'gross_amount': 'Valor bruto comisión',
                                        'listing_fixed_fee': 'Cargo fijo por publicar',
                                        'listing_gross_amount': 'Valor bruto de comisión publicar',
                                        'ship_cost_amount': 'Costo envío (con desc)',
                                        'ship_discount': '% Descuento envío',
                                        'ship_cost_full_amount': 'Costo envío (bruto)',
                                        'total_selling_cost': 'Costo total por unidad vendida',
                                        'last_updated': 'Última actualización'
                                    };
                                    const title = meliDict[k] || k;
                                    let val = v;
                                    if (typeof v === 'number') {
                                        if (k.includes('percentage') || k === 'ship_discount' || k === 'financing_add_on_fee') {
                                            val = v + '%';
                                        } else if (k !== 'item_id' && k !== 'category_id') {
                                            val = formatCurrency(v);
                                        }
                                    }
                                    return `
                                    <div class="flex justify-between items-end border-b border-gray-200/60 dark:border-gray-700 pb-1">
                                        <span class="font-medium text-[10px] text-gray-500 uppercase flex-1 pr-2 tracking-wider" title="${title}">${title}</span>
                                        <span class="font-bold text-gray-900 dark:text-gray-100 text-sm whitespace-nowrap">${val}</span>
                                    </div>`;
                                }).join('')}
                            </div>
                        </details>
                        ` : `
                        <p class="text-sm text-gray-500">No hay cálculo automático generado para este producto aún.</p>
                        `}
                    </div>

                    <!-- Section: Final Totals (Calculated) -->
                    <div class="bg-gray-900 rounded-2xl p-5 text-white grid grid-cols-2 md:grid-cols-4 gap-6 relative overflow-hidden shadow-xl">
                        <!-- Decorator gradient -->
                        <div class="absolute -right-10 -top-10 w-32 h-32 bg-blue-500/10 blur-3xl rounded-full pointer-events-none"></div>
                        <div class="space-y-1 z-10">
                            <p class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Total Costos</p>
                            <p id="comp_display_total_costs" class="text-xl font-bold">-</p>
                        </div>
                        <div class="space-y-1 z-10">
                            <p class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Ganancia Neta</p>
                            <p id="comp_display_net_profit" class="text-xl font-bold">-</p>
                        </div>
                        <div class="space-y-1 z-10">
                            <p class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Margen Neto</p>
                            <p id="comp_display_margin" class="text-xl font-bold">-</p>
                        </div>
                        <div class="space-y-1 z-10">
                            <p class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Markup</p>
                            <p id="comp_display_markup" class="text-xl font-bold">-</p>
                        </div>
                    </div>

                </div>
                <!-- Footer -->
                <div class="p-4 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-200 dark:border-gray-700 flex gap-3">
                    <button onclick="closeModal()" class="flex-1 py-2.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-xl font-semibold hover:bg-gray-50 transition-colors">Cerrar</button>
                    <button onclick="saveCompetenceData('${item.product_code}')" id="btnSaveCompCalc" 
                        class="flex-[2] py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all active:scale-[0.98]">
                        Guardar Configuración
                    </button>
                </div>
            </div>
            `;

            elements.modalContent.classList.remove('max-w-lg');
            elements.modalContent.classList.add('max-w-4xl');

            const originalClose = window.closeModal;
            window.closeModal = () => {
                elements.modalContent.classList.remove('max-w-4xl');
                elements.modalContent.classList.add('max-w-lg');
                originalClose();
                window.closeModal = originalClose;
            };

            openModal('', html);
            lucide.createIcons();

            // Trigger math once the DOM is definitely rendered
            setTimeout(() => {
                if(typeof calculateCompetenceCosts === 'function'){
                    calculateCompetenceCosts();
                }
            }, 50);

        } catch (e) {
            console.error(e);
            showAlert('Error', 'Error al abrir calculadora: ' + e.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    window.triggerAutoSellingCalc = async function(code) {
        try {
            const btn = event.target;
            const origText = btn.innerText;
            btn.innerText = 'Calculando...';
            btn.disabled = true;
            
            const res = await authFetch(`/api/selling/by-code/${encodeURIComponent(code)}/calculate`, {
                method: 'POST'
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Error disparando el cálculo');
            
            showAlert('Cálculo Iniciado', data.message, 'success');
            // After 3s close modal to prompt user to reopen and see new data
            setTimeout(() => {
                closeModal();
            }, 3000);
            
        } catch(e) {
            showAlert('Error', e.message, 'error');
        } finally {
            if(event.target) {
                event.target.innerText = 'Recalcular desde Meli';
                event.target.disabled = false;
            }
        }
    };

    window.calculateCompetenceCosts = function () {
        const sellingPrice = parseFloat(document.getElementById('comp_selling_price').value) || 0;
        const productCost = parseFloat(document.getElementById('comp_product_cost').value) || 0;
        const listingType = document.getElementById('comp_listing_type').value;

        const estRetPct = parseFloat(document.getElementById('comp_estimated_returns_percentage').value) || 0;
        const packCost = parseFloat(document.getElementById('comp_packaging_cost').value) || 0;
        const finCost = parseFloat(document.getElementById('comp_financial_cost').value) || 0;

        let autoMeliCost = 0;
        if (window._currentAutoCost && typeof window._currentAutoCost.total_selling_cost !== 'undefined') {
            autoMeliCost = parseFloat(window._currentAutoCost.total_selling_cost) || 0;
        }

        // Calculations
        const retCost = sellingPrice * (estRetPct / 100);
        // Costo Total = Costo del producto + Costo Automático Meli (incluye comisión, envío, etc) + Devoluciones estimadas + Packaging + Financiero
        const totalCosts = productCost + autoMeliCost + retCost + packCost + finCost;
        const profit = sellingPrice - totalCosts;
        const margin = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0;
        const markup = productCost > 0 ? (profit / productCost) * 100 : 0;

        // Update UI
        const commAmtInput = document.getElementById('comp_ml_commision_amount');
        if (commAmtInput) commAmtInput.value = (autoMeliCost).toFixed(2); // Deprecated explicitly, but fallback if DOM exists

        const totalCostsEl = document.getElementById('comp_display_total_costs');
        const profitEl = document.getElementById('comp_display_net_profit');
        const marginEl = document.getElementById('comp_display_margin');
        const markupEl = document.getElementById('comp_display_markup');

        if (totalCostsEl) totalCostsEl.innerText = formatCurrency(totalCosts);
        if (profitEl) {
            profitEl.innerText = formatCurrency(profit);
            profitEl.className = `text-xl font-bold ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`;
        }
        if (marginEl) marginEl.innerText = margin.toFixed(1) + '%';
        if (markupEl) markupEl.innerText = markup.toFixed(1) + '%';
    };

    window.saveCompetenceData = async function (code) {
        const btn = document.getElementById('btnSaveCompCalc');
        const originalText = btn.innerText;

        try {
            btn.disabled = true;
            btn.innerText = 'Guardando...';

            // Identify costs to save back to DB so they show in the list view
            let autoMeliCost = 0;
            let meliCommPct = 0;
            if (window._currentAutoCost) {
                autoMeliCost = parseFloat(window._currentAutoCost.total_selling_cost) || 0;
                meliCommPct = parseFloat(window._currentAutoCost.percentage_fee) || 0;
            }

            const sellPrice = parseFloat(document.getElementById('comp_selling_price').value) || 0;
            const ml_comm_local = sellPrice * (meliCommPct / 100);

            const payload = {
                selling_price: sellPrice,
                product_cost: parseFloat(document.getElementById('comp_product_cost').value) || 0,
                listing_type: document.getElementById('comp_listing_type').value,
                ml_commision_percentage: meliCommPct,
                estimated_returns_percentage: (parseFloat(document.getElementById('comp_estimated_returns_percentage').value) || 0) / 100,
                shipping_cost: Math.max(0, autoMeliCost - ml_comm_local), // Store the remainder of Meli cost as shipping
                packaging_cost: parseFloat(document.getElementById('comp_packaging_cost').value) || 0,
                advertising_cost: 0,
                withholdings_gross_income_tax: 0,
                financial_cost: parseFloat(document.getElementById('comp_financial_cost').value) || 0
            };

            // Recalculate ml_commision to ensure total matches automation
            // The backend calculates: ml_comm = selling_price * (ml_comm_pct / 100)
            // So we send the correct meliCommPct to ensure the gain matches the modal.


            const response = await authFetch(`/api/competence/item?code=${encodeURIComponent(code)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Error al guardar los cálculos');

            btn.innerText = '¡Guardado!';
            btn.classList.remove('bg-blue-600');
            btn.classList.add('bg-green-600');

            setTimeout(() => {
                closeModal();
                loadCompetenceData();
            }, 1000);

        } catch (e) {
            showAlert('Error', e.message, 'error');
            btn.disabled = false;
            btn.innerText = originalText;
        }
    };



    window.triggerAIPrePublish = async function (productId, field) {
        const fieldName = field === 'product_name_meli' ? 'el título' : 'la descripción';
        
        showPrompt('Generar con IA', `Ingresa el prompt para generar ${fieldName}:`, async (promptText) => {
            if (!promptText) return;

            const btnId = `btn-ai-${field}`;
            const btn = document.getElementById(btnId);
            const originalContent = btn ? btn.innerHTML : '';

            try {
                if (btn) {
                    btn.disabled = true;
                    btn.innerHTML = '<div class="animate-spin rounded-full h-3 w-3 border-b-2 border-purple-600"></div>';
                }

                const response = await authFetch(`/api/products/${productId}/pre-publish`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt: promptText,
                        field: field
                    })
                });

                if (!response.ok) {
                    const text = await response.text();
                    let errorMsg = 'Error en la solicitud de AI';
                    try {
                        const errData = JSON.parse(text);
                        if (errData.detail) errorMsg = errData.detail;
                    } catch (e) {
                        if (text) errorMsg = `Server Error: ${text.substring(0, 200)}`;
                    }
                    throw new Error(errorMsg);
                }

                showAlert('IA en proceso', 'Solicitud enviada al servicio de AI. El campo se actualizará en unos momentos.', 'success');

            } catch (e) {
                console.error('AI Error:', e);
                showAlert('Error AI', 'Error al solicitar generación AI: ' + e.message, 'error');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalContent;
                    if (window.lucide) lucide.createIcons();
                }
            }
        });
    };

    window.startScraping = async function () {
        showConfirm('Scrapping Global', '¿Estás seguro de iniciar el proceso de scrapping global? Esto puede tardar varios minutos.', async () => {
            const btn = document.getElementById('btnStartScraping');
            const originalContent = btn.innerHTML;

            try {
                btn.disabled = true;
                btn.innerHTML = `
                    <div class="flex items-center justify-center w-full gap-2 font-semibold">
                        <div class="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></div>
                        <span>Iniciando...</span>
                    </div>
                `;

                const response = await authFetch('/api/competence/start-scraping', {
                    method: 'POST'
                });

                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(data.detail || 'Error al iniciar el scrapping');
                }

                showAlert('Sincronización', 'Scrapping iniciado correctamente. Los resultados aparecerán gradualmente.', 'success');
                loadCompetenceData();

            } catch (e) {
                console.error('Error starting scraping:', e);
                showAlert('Error', 'Error al iniciar scrapping: ' + e.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalContent;
                if (window.lucide) lucide.createIcons();
            }
        }, 'info');
    };



    // Competence event listeners
    const compSearchInput = document.getElementById('compSearchInput');
    const compStatusFilter = document.getElementById('compStatusFilter');

    if (compSearchInput) {
        compSearchInput.addEventListener('input', () => {
            clearTimeout(compDebounceTimer);
            compDebounceTimer = setTimeout(loadCompetenceData, 300);
        });
    }

    if (compStatusFilter) {
        compStatusFilter.addEventListener('change', loadCompetenceData);
    }

    // === End Competence ===

    // --- Prompts Logic ---
    async function loadPrompts() {
        const container = document.getElementById('promptsContainer');
        if (!container) return;

        container.innerHTML = '<div class="flex justify-center p-12"><div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>';

        try {
            const response = await authFetch('/api/prompts/');
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.detail || 'Error fetching prompts');
            }
            const prompts = await response.json();

            if (prompts.length === 0) {
                container.innerHTML = '<p class="text-center text-gray-500">No se encontraron configuraciones de prompts.</p>';
                return;
            }
            // Assume first row is the config
            renderPrompts(prompts[0]);

        } catch (error) {
            console.error(error);
            container.innerHTML = `<p class="text-center text-red-500">Error al cargar prompts: ${error.message}</p>`;
        }
    }

    function renderPrompts(promptData) {
        const container = document.getElementById('promptsContainer');
        if (!container) return;

        container.dataset.promptId = promptData.id;

        const fields = [
            { key: 'ai_general', label: 'Prompt General AI', editable: true, rows: 6 },
            { key: 'rules', label: 'Reglas de Negocio', editable: true, rows: 6 },
            { key: 'ai_improving_human_reply', label: 'Mejora de Respuesta Humana', editable: true, rows: 4 },
            { key: 'ai_auditor', label: 'Auditor AI', editable: false, rows: 3 },
            { key: 'ai_category', label: 'Categorización AI', editable: false, rows: 3 },
            { key: 'ai_inventory_search', label: 'Búsqueda Inventario', editable: false, rows: 3 }
        ];

        container.innerHTML = fields.map(field => `
            <div class="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border border-gray-100 dark:border-gray-600">
                <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">
                    ${field.label} ${field.editable ? '' : '<span class="text-xs text-gray-400 font-normal normal-case ml-2">(Solo Lectura)</span>'}
                </label>
                <textarea 
                    id="prompt_${field.key}"
                    class="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow shadow-sm font-mono text-sm leading-relaxed"
                    rows="${field.rows}"
                    ${field.editable ? '' : 'readonly disabled'}
                >${promptData[field.key] || ''}</textarea>
            </div>
        `).join('');
    }

    window.savePrompts = async () => {
        const container = document.getElementById('promptsContainer');
        const id = container.dataset.promptId;
        if (!id) return;

        const btn = document.getElementById('btnSavePrompts');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<div class="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div> Guardando...';

        try {
            const payload = {
                ai_general: document.getElementById('prompt_ai_general').value,
                rules: document.getElementById('prompt_rules').value,
                ai_improving_human_reply: document.getElementById('prompt_ai_improving_human_reply').value
            };

            const response = await authFetch(`/api/prompts/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Error saving prompts');

            btn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
            btn.classList.add('bg-green-600', 'hover:bg-green-700');
            btn.innerHTML = '<i data-lucide="check" class="h-4 w-4 mr-2"></i> Guardado';

            setTimeout(() => {
                btn.classList.add('bg-blue-600', 'hover:bg-blue-700');
                btn.classList.remove('bg-green-600', 'hover:bg-green-700');
                btn.innerHTML = originalText;
                btn.disabled = false;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }, 2000);

        } catch (error) {
            console.error(error);
            showAlert('Error al Guardar', error.message, 'error');
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };

    // --- MercadoLibre Orders Dashboard ---
    let ordersDebounceTimer = null;
    state.ordersPageLimit = 10;
    state.ordersPageOffset = 0;

    window.triggerOrderFilterChange = () => {
        if (ordersDebounceTimer) clearTimeout(ordersDebounceTimer);
        ordersDebounceTimer = setTimeout(() => {
            state.ordersPageOffset = 0;
            fetchOrdersDashboardData();
        }, 300);
    };

    window.changeOrdersPage = (direction) => {
        state.ordersPageOffset += direction * state.ordersPageLimit;
        if (state.ordersPageOffset < 0) state.ordersPageOffset = 0;
        fetchOrdersDashboardData(true);
    };

    function getFilterDates(filterType) {
        const today = new Date();
        const formatDate = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const r = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${r}`;
        };
        const todayStr = formatDate(today);
        
        if (filterType === 'today') {
            return { start: todayStr, end: todayStr };
        } else if (filterType === 'yesterday') {
            const yesterday = new Date();
            yesterday.setDate(today.getDate() - 1);
            return { start: formatDate(yesterday), end: formatDate(yesterday) };
        } else if (filterType === 'last_7_days') {
            const past = new Date();
            past.setDate(today.getDate() - 7);
            return { start: formatDate(past), end: todayStr };
        } else if (filterType === 'last_30_days') {
            const past = new Date();
            past.setDate(today.getDate() - 30);
            return { start: formatDate(past), end: todayStr };
        } else if (filterType === 'this_month') {
            const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
            return { start: formatDate(firstDay), end: todayStr };
        }
        return { start: null, end: null };
    }

    let cachedMetrics = null;
    let cachedChartData = null;
    let cachedTopStats = null;

    window.fetchOrdersDashboardData = async (paginationOnly = false) => {
        const searchVal = document.getElementById('orderSearchInput')?.value || '';
        const dateFilter = document.getElementById('orderDateFilter')?.value || 'all_time';
        const conditionFilter = document.getElementById('orderConditionFilter')?.value || '';
        
        const { start, end } = getFilterDates(dateFilter);
        
        let queryParams = `?limit=${state.ordersPageLimit}&offset=${state.ordersPageOffset}`;
        if (start) queryParams += `&start_date=${start}`;
        if (end) queryParams += `&end_date=${end}`;
        if (conditionFilter) queryParams += `&condition_item=${conditionFilter}`;
        if (searchVal) queryParams += `&search=${encodeURIComponent(searchVal)}`;
        
        try {
            const tbody = document.getElementById('ordersTableBody');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8"><i data-lucide="loader-2" class="h-6 w-6 animate-spin text-blue-600 mx-auto"></i> Cargando órdenes...</td></tr>`;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
            
            if (paginationOnly && cachedMetrics && cachedChartData && cachedTopStats) {
                const listRes = await authFetch(`/api/orders/list${queryParams}`);
                if (!listRes.ok) throw new Error('Error al cargar listado de órdenes');
                const listData = await listRes.json();
                
                renderOrdersDashboard(cachedMetrics, listData, cachedChartData, cachedTopStats);
            } else {
                let metricsParams = '';
                if (start) metricsParams += `&start_date=${start}`;
                if (end) metricsParams += `&end_date=${end}`;
                if (conditionFilter) metricsParams += `&condition_item=${conditionFilter}`;
                if (searchVal) metricsParams += `&search=${encodeURIComponent(searchVal)}`;
                if (metricsParams) metricsParams = '?' + metricsParams.substring(1);
                
                const [metricsRes, listRes, chartRes, statsRes] = await Promise.all([
                    authFetch(`/api/orders/metrics${metricsParams}`),
                    authFetch(`/api/orders/list${queryParams}`),
                    authFetch(`/api/orders/chart-data${metricsParams}`),
                    authFetch(`/api/orders/top-stats${metricsParams}`)
                ]);
                
                if (!metricsRes.ok || !listRes.ok || !chartRes.ok || !statsRes.ok) {
                    throw new Error('Error al cargar datos del dashboard');
                }
                
                cachedMetrics = await metricsRes.json();
                const listData = await listRes.json();
                cachedChartData = await chartRes.json();
                cachedTopStats = await statsRes.json();
                
                renderOrdersDashboard(cachedMetrics, listData, cachedChartData, cachedTopStats);
            }
        } catch (error) {
            console.error("Dashboard Fetch Error:", error);
            showAlert('Error', error.message, 'error');
        }
    };

    window.renderOrdersDashboard = (metrics, listData, chartData, topStats) => {
        const formatCurrency = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val);
        
        document.getElementById('metricGrossRevenue').innerText = formatCurrency(metrics.total_gross_income);
        document.getElementById('metricNetRevenue').innerText = formatCurrency(metrics.total_net_income);
        document.getElementById('metricOrdersCount').innerText = metrics.total_sales_count.toLocaleString();
        document.getElementById('metricUnitsSold').innerText = Math.round(metrics.total_units_sold).toLocaleString();
        
        const topProdList = document.getElementById('topProductsList');
        if (topProdList) {
            if (topStats.top_products && topStats.top_products.length > 0) {
                topProdList.innerHTML = topStats.top_products.map((p, idx) => `
                    <div class="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-gray-750/50 border border-gray-100 dark:border-gray-700/50">
                        <div class="flex items-center gap-2 min-w-0">
                            <span class="font-black text-gray-400 w-4">${idx + 1}</span>
                            <div class="min-w-0">
                                <p class="font-bold text-gray-800 dark:text-white truncate" title="${p.title}">${p.title}</p>
                                <p class="text-[10px] text-gray-400">ID: ${p.item_id} • ${Math.round(p.quantity)} u.</p>
                            </div>
                        </div>
                        <span class="font-extrabold text-blue-600 dark:text-blue-400 whitespace-nowrap ml-2">${formatCurrency(p.revenue)}</span>
                    </div>
                `).join('');
            } else {
                topProdList.innerHTML = `<div class="text-gray-400 italic text-center py-6">No hay datos de productos</div>`;
            }
        }

        const tbody = document.getElementById('ordersTableBody');
        if (tbody) {
            if (listData.orders && listData.orders.length > 0) {
                tbody.innerHTML = listData.orders.map(o => {
                    const dateObj = new Date(o.created_at);
                    const formattedDate = dateObj.toLocaleDateString('es-AR') + ' ' + String(dateObj.getHours()).padStart(2, '0') + ':' + String(dateObj.getMinutes()).padStart(2, '0');
                    const netIncome = o.gross_price - o.sale_fee;
                    
                    const conditionBadge = o.condition_item === 'new' 
                        ? `<span class="px-1.5 py-0.5 text-[9px] font-bold rounded bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">Nuevo</span>` 
                        : `<span class="px-1.5 py-0.5 text-[9px] font-bold rounded bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300">Usado</span>`;
                    
                    return `
                        <tr class="hover:bg-slate-50 dark:hover:bg-gray-750/30 transition-colors">
                            <td class="py-3 px-5 font-mono text-xs font-bold text-gray-500">${o.venta_id}</td>
                            <td class="py-3 px-5 text-xs text-gray-500 whitespace-nowrap">${formattedDate}</td>
                            <td class="py-3 px-5 min-w-[200px]">
                                <div class="font-bold text-gray-800 dark:text-white">${o.title}</div>
                                <div class="text-[10px] text-gray-400 flex items-center gap-1.5 mt-0.5">
                                    ID: ${o.item_id} • ${conditionBadge}
                                </div>
                            </td>
                            <td class="py-3 px-5 text-center font-bold">${Math.round(o.quantity)}</td>
                            <td class="py-3 px-5 text-right font-medium">${formatCurrency(o.unit_price)}</td>
                            <td class="py-3 px-5 text-right font-extrabold text-gray-900 dark:text-white">${formatCurrency(o.gross_price)}</td>
                            <td class="py-3 px-5 text-right text-orange-600 dark:text-orange-400 font-semibold">${formatCurrency(o.sale_fee)}</td>
                            <td class="py-3 px-5 text-right text-green-600 dark:text-green-400 font-extrabold">${formatCurrency(netIncome)}</td>
                        </tr>
                    `;
                }).join('');
            } else {
                tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-gray-400 italic">No hay órdenes para mostrar</td></tr>`;
            }
        }

        const badgeCount = document.getElementById('ordersTotalCountBadge');
        if (badgeCount) badgeCount.innerText = `${listData.total} órdenes`;
        
        const prevBtn = document.getElementById('btnOrdersPrev');
        const nextBtn = document.getElementById('btnOrdersNext');
        const pagText = document.getElementById('ordersPaginationText');
        
        if (prevBtn && nextBtn && pagText) {
            const startIdx = listData.total === 0 ? 0 : state.ordersPageOffset + 1;
            const endIdx = Math.min(state.ordersPageOffset + state.ordersPageLimit, listData.total);
            pagText.innerText = `Mostrando ${startIdx}-${endIdx} de ${listData.total} órdenes`;
            
            prevBtn.disabled = state.ordersPageOffset === 0;
            nextBtn.disabled = endIdx >= listData.total;
        }

        initSalesChart(chartData);

        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    window.initSalesChart = (chartData) => {
        const isDark = document.documentElement.classList.contains('dark');
        const textColor = isDark ? '#9ca3af' : '#4b5563';
        const gridColor = isDark ? '#374151' : '#e5e7eb';
        
        const canvas = document.getElementById('salesChartCanvas');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        if (window.mySalesChart) {
            window.mySalesChart.destroy();
        }
        
        if (!chartData || chartData.length === 0) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '14px sans-serif';
            ctx.fillStyle = textColor;
            ctx.textAlign = 'center';
            ctx.fillText('No hay datos disponibles para el periodo seleccionado', canvas.width / 2, canvas.height / 2);
            return;
        }
        
        const labels = chartData.map(d => {
            const parts = d.date.split('-');
            if (parts.length === 3) {
                return `${parts[2]}/${parts[1]}`;
            }
            return d.date;
        });
        const revenues = chartData.map(d => d.revenue);
        
        let gradient = ctx.createLinearGradient(0, 0, 0, 160);
        gradient.addColorStop(0, 'rgba(59, 130, 246, 0.35)');
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
        
        if (typeof Chart === 'undefined') {
            console.error("Chart.js is not loaded!");
            return;
        }
        
        window.mySalesChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Ventas ($)',
                    data: revenues,
                    borderColor: '#3b82f6',
                    borderWidth: 2.5,
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.35,
                    pointBackgroundColor: '#3b82f6',
                    pointBorderColor: isDark ? '#1f2937' : '#ffffff',
                    pointHoverRadius: 6,
                    pointRadius: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: isDark ? '#1f2937' : '#ffffff',
                        titleColor: isDark ? '#ffffff' : '#111827',
                        bodyColor: isDark ? '#e5e7eb' : '#374151',
                        borderColor: isDark ? '#374151' : '#e5e7eb',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                return ' Ventas: ' + new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(context.parsed.y);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: textColor,
                            font: { size: 10 }
                        }
                    },
                    y: {
                        grid: {
                            color: gridColor
                        },
                        ticks: {
                            color: textColor,
                            font: { size: 10 },
                            callback: function(value) {
                                return '$' + value.toLocaleString('es-AR');
                            }
                        }
                    }
                }
            }
        });
    };

    // Initial load - check auth FIRST, only load data if authenticated
    checkAuth();

    const token = localStorage.getItem('token');
    if (token) {
        fetchProducts();
        loadCategories();
    }

}); // End DOMContentLoaded

// Global Mobile Menu Logic
window.toggleMobileMenu = () => {
    const sidebar = document.getElementById('mainSidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (sidebar.classList.contains('-translate-x-full')) {
        // Open
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
    } else {
        // Close
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
    }
};

window.closeMobileMenu = () => {
    const sidebar = document.getElementById('mainSidebar');
    const overlay = document.getElementById('sidebarOverlay');

    sidebar.classList.add('-translate-x-full');
    overlay.classList.add('hidden');
};


